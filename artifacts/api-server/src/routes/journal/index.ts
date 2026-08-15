import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, trades } from "@workspace/db";
import Anthropic from "@anthropic-ai/sdk";
import {
  CreateTradeBody,
  UpdateTradeParams,
  UpdateTradeBody,
  DeleteTradeParams,
} from "@workspace/api-zod";
import { calculateRiskReward, calculateTradePips } from "./pipCalculation";

const router: IRouter = Router();

function getClient(): Anthropic | null {
  const directKey = process.env.ANTHROPIC_API_KEY;
  if (directKey) return new Anthropic({ apiKey: directKey });
  const integrationKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const integrationBaseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  if (integrationKey && integrationBaseUrl) return new Anthropic({ apiKey: integrationKey, baseURL: integrationBaseUrl });
  return null;
}

router.get("/trades", async (_req, res) => {
  try {
    const all = await db.select().from(trades).orderBy(trades.createdAt);
    res.json(all);
  } catch (err: any) {
    // Keep dashboard consumers usable while a fresh Replit import is waiting
    // for PostgreSQL/schema provisioning. Stats already use this behavior.
    console.warn("[Journal] GET /trades unavailable:", err?.message || err);
    res.json([]);
  }
});

// /entries — field-mapped alias used by Mission Control (FundedAccountPage).
// Maps: createdAt → date, pips → pnl (numeric), result → lowercase string.
router.get("/entries", async (_req, res) => {
  try {
    const all = await db.select().from(trades).orderBy(trades.createdAt);
    const mapped = all.map((t) => ({
      id: String(t.id),
      pair: t.pair,
      direction: t.direction,
      result: t.result ?? "",
      pips: t.pips != null ? Number(t.pips) : null,
      pnl: t.pips != null ? Number(t.pips) : null,
      actualExit: t.actualExit != null ? Number(t.actualExit) : null,
      riskReward: t.riskReward,
      lotSize: t.lotSize != null ? Number(t.lotSize) : null,
      strategy: t.strategy,
      notes: t.notes,
      status: t.status,
      date: t.createdAt.toISOString(),
      grade: (t as any).grade ?? null,
      session: (t as any).session ?? null,
    }));
    res.json(mapped);
  } catch (err: any) {
    console.warn("[Journal] GET /entries unavailable:", err?.message || err);
    res.json([]);
  }
});

router.post("/trades", async (req, res) => {
  let body: ReturnType<typeof CreateTradeBody.parse>;
  try {
    body = CreateTradeBody.parse(req.body);
  } catch (err: any) {
    res.status(422).json({ error: "Validation failed", details: err.errors ?? err.message });
    return;
  }
  try {
    const raw = req.body as Record<string, any>;
    const riskReward: string | null = raw.riskReward || raw.rr || null;
    const pipsRaw = raw.pips != null ? Number(raw.pips) : null;
    const pipsVal = pipsRaw != null && !isNaN(pipsRaw) ? String(pipsRaw) : null;
    const resultRaw: string | null = raw.result ? String(raw.result).toLowerCase().replace("win", "win").replace("loss", "loss").replace("be", "be") : null;
    const direction = body.direction ? body.direction.toLowerCase() : body.direction;
    // Coerce numeric fields — empty strings from form inputs must become valid numeric strings
    const toNumStr = (v: unknown): string => {
      // Browser forms and older clients may send either strings or numbers.
      // Never call string methods before normalising the value.
      if (v == null || (typeof v === "string" && v.trim() === "")) return "0";
      const n = Number(v);
      return isNaN(n) ? "0" : String(n);
    };
    const [inserted] = await db.insert(trades).values({
      pair: body.pair,
      direction,
      entryPrice: toNumStr(body.entryPrice),
      stopLoss: toNumStr(body.stopLoss),
      takeProfit: toNumStr(body.takeProfit),
      actualExit: raw.actualExit != null && raw.actualExit !== "" ? toNumStr(raw.actualExit) : null,
      lotSize: raw.lotSize != null && raw.lotSize !== "" ? toNumStr(raw.lotSize) : null,
      strategy: body.strategy || raw.strategy || null,
      notes: body.notes || raw.notes || null,
      status: body.status ?? "closed",
      result: resultRaw as any,
       pips: [body.entryPrice, body.stopLoss, body.takeProfit].every(Boolean) && resultRaw
         ? String(calculateTradePips(body.pair, resultRaw, Number(body.entryPrice), Number(body.stopLoss), Number(body.takeProfit), direction, raw.actualExit))
         : pipsVal,
      riskReward,
      session: raw.session ? String(raw.session) : null,
      grade: raw.grade ? String(raw.grade) : null,
      timeframe: raw.timeframe ? String(raw.timeframe) : null,
    }).returning();
    res.status(201).json(inserted);
  } catch (err: any) {
    console.error("[Journal] POST /trades error:", err);
    res.status(500).json({ error: "Failed to create trade", details: err.message });
  }
});

router.put("/trades/:id", async (req, res) => {
  let parsed: { id: number; body: ReturnType<typeof UpdateTradeBody.parse> };
  try {
    parsed = { id: UpdateTradeParams.parse(req.params).id, body: UpdateTradeBody.parse(req.body) };
  } catch (err: any) {
    res.status(422).json({ error: "Validation failed", details: err.errors ?? err.message });
    return;
  }
  const { id, body } = parsed;
  const raw2 = req.body as Record<string, any>;
  try {
    const toNumStr = (v: any): string => {
      if (v == null || v === '') return "0";
      const n = Number(v); return isNaN(n) ? "0" : String(n);
    };
    const updateData: Partial<typeof trades.$inferInsert> = {};
    if (body.result !== undefined) updateData.result = body.result;
    if (body.pips !== undefined) updateData.pips = String(body.pips);
    if (body.riskReward !== undefined) updateData.riskReward = body.riskReward;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.notes !== undefined) updateData.notes = body.notes;
    // Extended fields for full-trade edit
    if (raw2.pair !== undefined) updateData.pair = String(raw2.pair);
    if (raw2.direction !== undefined) updateData.direction = String(raw2.direction).toLowerCase();
    if (raw2.entryPrice !== undefined) updateData.entryPrice = toNumStr(raw2.entryPrice);
    if (raw2.stopLoss !== undefined) updateData.stopLoss = toNumStr(raw2.stopLoss);
    if (raw2.takeProfit !== undefined) updateData.takeProfit = toNumStr(raw2.takeProfit);
    if (raw2.actualExit !== undefined) updateData.actualExit = raw2.actualExit === "" || raw2.actualExit == null ? null : toNumStr(raw2.actualExit);
    if (raw2.lotSize !== undefined) {
      updateData.lotSize = raw2.lotSize === "" || raw2.lotSize == null ? null : toNumStr(raw2.lotSize);
    }
    if (raw2.actualExit !== undefined || raw2.entryPrice !== undefined || raw2.stopLoss !== undefined || raw2.takeProfit !== undefined || raw2.direction !== undefined || raw2.result !== undefined) {
      const current = await db.select().from(trades).where(eq(trades.id, id));
      const existing = current[0];
      const pair = String(raw2.pair ?? existing?.pair ?? "");
      const direction = String(raw2.direction ?? existing?.direction ?? "");
      const result = String(raw2.result ?? existing?.result ?? "");
      const entry = Number(raw2.entryPrice ?? existing?.entryPrice);
      const sl = Number(raw2.stopLoss ?? existing?.stopLoss);
      const tp = Number(raw2.takeProfit ?? existing?.takeProfit);
      const exit = raw2.actualExit !== undefined ? raw2.actualExit : existing?.actualExit;
      if (existing && result && [entry, sl, tp].every(Number.isFinite)) {
        updateData.pips = String(calculateTradePips(pair, result, entry, sl, tp, direction, exit == null ? undefined : Number(exit)));
      }
    }
    if (raw2.strategy !== undefined) updateData.strategy = raw2.strategy ? String(raw2.strategy) : null;
    if (raw2.session !== undefined) updateData.session = raw2.session ? String(raw2.session) : null;
    if (raw2.grade !== undefined) updateData.grade = raw2.grade ? String(raw2.grade) : null;
    if (raw2.timeframe !== undefined) updateData.timeframe = raw2.timeframe ? String(raw2.timeframe) : null;
    const [updated] = await db.update(trades).set(updateData).where(eq(trades.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: "Trade not found" });
      return;
    }
    res.json(updated);
  } catch (err: any) {
    console.error("[Journal] PUT /trades error:", err);
    res.status(500).json({ error: "Failed to update trade", details: err.message });
  }
});

// Recalculate historical journal pips from the saved price levels. This is
// intentionally explicit so old records are repaired once, not rewritten on
// every read.
router.post("/repair-pips", async (_req, res) => {
  try {
    const all = await db.select().from(trades);
    let updated = 0;
    for (const trade of all) {
      if (!trade.result) continue;
      const entry = Number(trade.entryPrice);
      const sl = Number(trade.stopLoss);
      const tp = Number(trade.takeProfit);
      if (![entry, sl, tp].every(Number.isFinite)) continue;
       const pips = calculateTradePips(trade.pair, trade.result, entry, sl, tp, trade.direction, trade.actualExit ? Number(trade.actualExit) : undefined);
      const rr = calculateRiskReward(entry, sl, tp);
      await db.update(trades).set({
        pips: String(Number(pips.toFixed(2))),
        riskReward: rr > 0 ? `1:${rr.toFixed(1)}` : trade.riskReward,
      }).where(eq(trades.id, trade.id));
      updated++;
    }
    res.json({ updated });
  } catch (err: any) {
    console.error("[Journal] POST /repair-pips error:", err);
    res.status(500).json({ error: "Failed to repair historical pips", details: err.message });
  }
});

router.delete("/trades/:id", async (req, res) => {
  let tradeId: number;
  try {
    tradeId = DeleteTradeParams.parse(req.params).id;
  } catch (err: any) {
    res.status(422).json({ error: "Validation failed", details: err.errors ?? err.message });
    return;
  }
  const id = tradeId;
  try {
    const deleted = await db.delete(trades).where(eq(trades.id, id)).returning();
    if (!deleted.length) {
      res.status(404).json({ error: "Trade not found" });
      return;
    }
    res.status(204).send();
  } catch (err: any) {
    console.error("[Journal] DELETE /trades error:", err);
    res.status(500).json({ error: "Failed to delete trade", details: err.message });
  }
});

router.get("/stats", async (_req, res) => {
  let all: typeof trades.$inferSelect[] = [];
  try {
    all = await db.select().from(trades);
  } catch {
    res.json({ totalTrades: 0, winRate: 0, averageRR: 0, netPips: 0, winCount: 0, lossCount: 0, breakEvenCount: 0 });
    return;
  }
  const closed = all.filter((t) => t.status === "closed" || t.result);

  const wins = closed.filter((t) => t.result === "win" || (t.pips !== null && Number(t.pips) > 0));
  const losses = closed.filter((t) => t.result === "loss" || (t.pips !== null && Number(t.pips) < 0));
  const breakEvens = closed.filter((t) => t.result === "be" || (t.pips !== null && Number(t.pips) === 0));

  const totalTrades = closed.length;
  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
  const netPips = closed.reduce((sum, t) => sum + (t.pips !== null ? Number(t.pips) : 0), 0);

  const rrValues = closed
    .filter((t) => t.riskReward)
    .map((t) => {
      const parts = t.riskReward!.split(":");
      return parts.length === 2 ? Number(parts[1]) : 0;
    })
    .filter((v) => v > 0);

  const averageRR = rrValues.length > 0 ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : 0;

  res.json({
    totalTrades,
    winRate: Math.round(winRate * 10) / 10,
    averageRR: Math.round(averageRR * 10) / 10,
    netPips: Math.round(netPips * 10) / 10,
    winCount: wins.length,
    lossCount: losses.length,
    breakEvenCount: breakEvens.length,
  });
});

router.get("/session-stats", async (_req, res) => {
  let all: typeof trades.$inferSelect[] = [];
  try {
    all = await db.select().from(trades).orderBy(trades.createdAt);
  } catch {
    res.json({ sessionWinRates: {}, strategyBreakdown: {}, equityCurve: [], totalTrades: 0 });
    return;
  }

  const closed = all.filter((t) => t.status === "closed" || !!t.result);

  function getSession(date: Date): string {
    const h = date.getUTCHours();
    if (h >= 13 && h < 21) return "New York";
    if (h >= 7 && h < 13) return "London";
    return "Asia";
  }

  const sessions: Record<string, { wins: number; losses: number; be: number; pips: number }> = {
    London: { wins: 0, losses: 0, be: 0, pips: 0 },
    "New York": { wins: 0, losses: 0, be: 0, pips: 0 },
    Asia: { wins: 0, losses: 0, be: 0, pips: 0 },
  };

  for (const t of closed) {
    const session = getSession(new Date(t.createdAt));
    const result = t.result?.toLowerCase();
    const pips = t.pips ? Number(t.pips) : 0;
    sessions[session].pips += pips;
    if (result === "win" || (result !== "loss" && result !== "be" && pips > 0)) sessions[session].wins++;
    else if (result === "loss" || (result !== "win" && result !== "be" && pips < 0)) sessions[session].losses++;
    else sessions[session].be++;
  }

  const sessionWinRates = Object.fromEntries(
    Object.entries(sessions).map(([s, d]) => {
      const total = d.wins + d.losses + d.be;
      return [s, { ...d, total, winRate: total > 0 ? Math.round((d.wins / total) * 1000) / 10 : 0 }];
    })
  );

  const stratMap: Record<string, { rrSum: number; count: number; wins: number; losses: number; be: number; pips: number }> = {};
  for (const t of closed) {
    const strat = t.strategy?.trim() || "Untagged";
    if (!stratMap[strat]) stratMap[strat] = { rrSum: 0, count: 0, wins: 0, losses: 0, be: 0, pips: 0 };
    stratMap[strat].count++;
    stratMap[strat].pips += t.pips ? Number(t.pips) : 0;
    const result = t.result?.toLowerCase();
    const pips = t.pips ? Number(t.pips) : 0;
    if (result === "win" || (result !== "loss" && result !== "be" && pips > 0)) stratMap[strat].wins++;
    else if (result === "loss" || (result !== "win" && result !== "be" && pips < 0)) stratMap[strat].losses++;
    else stratMap[strat].be++;
    if (t.riskReward) {
      const parts = t.riskReward.split(":");
      const rr = parts.length === 2 ? Number(parts[1]) : 0;
      if (rr > 0) stratMap[strat].rrSum += rr;
    }
  }

  const strategyBreakdown = Object.fromEntries(
    Object.entries(stratMap)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([s, d]) => {
        const avgRR = d.count > 0 && d.rrSum > 0 ? Math.round((d.rrSum / d.count) * 10) / 10 : 0;
        const winRate = d.count > 0 ? Math.round((d.wins / d.count) * 1000) / 10 : 0;
        return [s, { ...d, avgRR, winRate }];
      })
  );

  let cumPips = 0;
  const equityCurve = closed.map((t, i) => {
    const pips = t.pips ? Number(t.pips) : 0;
    cumPips += pips;
    return {
      index: i + 1,
      date: new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      pips: Math.round(pips * 10) / 10,
      cumulative: Math.round(cumPips * 10) / 10,
      pair: t.pair || "—",
      result: t.result || "open",
      strategy: t.strategy || "—",
    };
  });

  res.json({ sessionWinRates, strategyBreakdown, equityCurve, totalTrades: closed.length });
});

router.get("/insights", async (req, res) => {
  const all = await db.select().from(trades);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const tradesSummary = all.map((t) => ({
    pair: t.pair,
    direction: t.direction,
    strategy: t.strategy,
    result: t.result,
    pips: t.pips,
    rr: t.riskReward,
    date: t.createdAt,
  }));

  const prompt = `You are an elite trading coach and performance analyst. Analyze this trader's journal data and provide 4-5 specific, actionable insights about their trading patterns, strengths, and areas for improvement.

Trade data: ${JSON.stringify(tradesSummary)}

Focus on:
- Win rate patterns by pair, strategy, and direction
- Risk management consistency
- Best and worst performing setups
- Time-based patterns if visible
- Specific recommendations to improve profitability

Be specific, professional, and encouraging. Use trader language.`;

  const client = getClient();

  if (!client) {
    res.write(`data: ${JSON.stringify({ content: "⚠️ Add your Anthropic API key in **Settings → API & Keys** to get AI-powered journal insights." })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    return;
  }

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
    }
  }

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

export default router;
