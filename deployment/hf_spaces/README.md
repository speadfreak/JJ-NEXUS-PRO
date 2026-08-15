# JJ Nexus Pro — Alchemist AI deployment

This directory is a portable FastAPI inference service for the fine-tuned
Alchemist model. It exposes:

- `GET /health` — model version, GPU availability, queue depth, and load state
- `POST /generate` — `{ "messages": [...], "temperature": 0.7, "max_tokens": 1024 }`
- 30 requests per rolling minute per process
- a single GPU generation semaphore with a 30-second request timeout
- structured JSON errors instead of process crashes

## Deploy to Hugging Face Spaces

1. Create a new **Docker Space** and choose a GPU runtime (T4 or better).
2. Upload this directory and the merged `alchemist-ai-merged` model from the
   Colab notebook, or set `MODEL_PATH` to a model repository on the Hub.
3. Add Space secrets:

   - `HF_TOKEN` if the model repository is private
    - `MODEL_PATH` with the Hub repository or mounted model directory
   - `MODEL_VERSION`, for example `alchemist-ai-v1`

4. The included Dockerfile starts Uvicorn on port 7860. Wait for `/health` to
   report `status: ok`.
5. Set `ALCHEMIST_API_URL` in JJ Nexus Pro to the Space base URL. The Express
   API appends `/generate`; set `ALCHEMIST_API_KEY` only when an authenticated
   proxy is in front of the Space.

## Local smoke test

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
MODEL_PATH=./alchemist-ai-merged uvicorn app:app --host 0.0.0.0 --port 7860
curl http://localhost:7860/health
```

## Operations and safety

The service returns scenario analysis only. The JJ Nexus system prompt
prohibits financial advice, and the frontend labels the output as analysis.
The in-memory rate limiter is per client IP and per process; use an API gateway
for multiple replicas. Expect a cold start when a free Space sleeps. Keep the endpoint
private or protect it with an authenticated reverse proxy in production.