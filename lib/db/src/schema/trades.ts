import { pgTable, serial, text, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  pair: text("pair").notNull(),
  direction: text("direction").notNull(),
  entryPrice: numeric("entry_price", { precision: 10, scale: 5 }).notNull(),
  stopLoss: numeric("stop_loss", { precision: 10, scale: 5 }).notNull(),
  takeProfit: numeric("take_profit", { precision: 10, scale: 5 }).notNull(),
  actualExit: numeric("actual_exit", { precision: 10, scale: 5 }),
  lotSize: numeric("lot_size", { precision: 10, scale: 4 }),
  result: text("result"),
  pips: numeric("pips", { precision: 10, scale: 2 }),
  riskReward: text("risk_reward"),
  strategy: text("strategy"),
  notes: text("notes"),
  status: text("status").notNull().default("open"),
  session: text("session"),
  grade: text("grade"),
  timeframe: text("timeframe"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertTradeSchema = createInsertSchema(trades).omit({
  id: true,
  createdAt: true,
});

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = z.infer<typeof insertTradeSchema>;
