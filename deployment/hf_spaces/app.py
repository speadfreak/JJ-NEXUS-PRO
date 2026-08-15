import asyncio
import os
import time
from collections import deque
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

MODEL_VERSION = os.getenv("MODEL_VERSION", "alchemist-ai-v1")
MODEL_ID = os.getenv("MODEL_PATH") or os.getenv("MODEL_ID", "alchemist-ai-merged")
MAX_REQUESTS_PER_MINUTE = 30
GENERATION_TIMEOUT_SECONDS = 30
_model: Any = None
_tokenizer: Any = None
_model_lock = asyncio.Semaphore(1)
_request_times_by_client: dict[str, deque[float]] = {}
_rate_limit_lock = asyncio.Lock()
_load_error: str | None = None


class Message(BaseModel):
    role: str
    content: str = Field(min_length=1, max_length=20_000)

    @field_validator("role")
    @classmethod
    def valid_role(cls, value: str) -> str:
        if value not in {"system", "user", "assistant"}:
            raise ValueError("role must be system, user, or assistant")
        return value


class GenerateRequest(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=40)
    temperature: float = Field(default=0.7, ge=0.0, le=1.5)
    max_tokens: int = Field(default=1024, ge=32, le=4096)


def load_model() -> None:
    global _model, _tokenizer, _load_error
    if _model is not None:
        return
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

        hf_token = os.getenv("HF_TOKEN")
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, token=hf_token)
        quantization = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
        )
        _model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            token=hf_token,
            quantization_config=quantization,
            device_map="auto",
            torch_dtype=torch.float16,
        )
        _tokenizer.pad_token = _tokenizer.eos_token
        _load_error = None
    except Exception as exc:
        _load_error = str(exc)
        raise


async def check_rate_limit(client_ip: str) -> None:
    now = time.monotonic()
    async with _rate_limit_lock:
        request_times = _request_times_by_client.setdefault(client_ip, deque())
        while request_times and now - request_times[0] > 60:
            request_times.popleft()
        if len(request_times) >= MAX_REQUESTS_PER_MINUTE:
            raise HTTPException(status_code=429, detail={"code": "rate_limited", "message": "30 requests per rolling minute"})
        request_times.append(now)


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(title="JJ Nexus Alchemist AI", version=MODEL_VERSION, lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, Any]:
    try:
        import torch
        gpu_available = bool(torch.cuda.is_available())
    except Exception:
        gpu_available = False

    return {
        "status": "ok",
        "model_loaded": _model is not None,
        "model_name": MODEL_ID,
        "model_version": MODEL_VERSION,
        "modelVersion": MODEL_VERSION,
        "gpu_available": gpu_available,
        "queue_depth": max(0, 1 - _model_lock._value),
        "load_error": _load_error,
    }


@app.post("/generate")
async def generate(payload: GenerateRequest, request: Request) -> dict[str, Any]:
    forwarded_for = request.headers.get("x-forwarded-for")
    client_ip = (forwarded_for.split(",", 1)[0].strip() if forwarded_for else None) or (request.client.host if request.client else "unknown")
    await check_rate_limit(client_ip)
    try:
        load_model()
        prompt = _tokenizer.apply_chat_template(
            [message.model_dump() for message in payload.messages],
            tokenize=False,
            add_generation_prompt=True,
        )
        async with _model_lock:
            import torch

            inputs = _tokenizer(prompt, return_tensors="pt").to(_model.device)
            with torch.inference_mode():
                output = await asyncio.wait_for(
                    asyncio.to_thread(
                        _model.generate,
                        **inputs,
                        max_new_tokens=payload.max_tokens,
                        temperature=payload.temperature,
                        do_sample=payload.temperature > 0,
                        pad_token_id=_tokenizer.eos_token_id,
                    ),
                    timeout=GENERATION_TIMEOUT_SECONDS,
                )
        text = _tokenizer.decode(output[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()
        return {"response": text, "model": "alchemist", "model_version": MODEL_VERSION}
    except HTTPException:
        raise
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail={"code": "generation_timeout", "message": "Generation exceeded 30 seconds"}) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail={"code": "model_unavailable", "message": "The Alchemist model is unavailable"}) from exc