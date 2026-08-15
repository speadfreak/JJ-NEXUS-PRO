---
name: Journal /entries alias route
description: FundedAccountPage (Mission Control) fetches /api/journal/entries but the real route is /trades; also field names differ.
---

## The Rule
The journal router has `/trades` as its primary route. `FundedAccountPage` (`/funded`) fetches `/api/journal/entries`. These must be kept in sync by maintaining a `/entries` alias route in `artifacts/api-server/src/routes/journal/index.ts`.

## Field Mapping
The DB `trades` table returns: `pips` (numeric string), `createdAt` (timestamp), `result` (string|null).
FundedAccountPage expects: `pnl` (number), `date` (ISO string), `result` (string).

The `/entries` route maps: `createdAt → date`, `pips → pnl` (both as Number), `id → String(id)`.

**Why:** The DB schema was designed for the Journal page which uses pips. FundedAccountPage was designed around $P&L. Since pips ≈ dollar units in this app's context, mapping pips→pnl is correct.

**How to apply:** If you add a `pnl` column to the trades table in the future, update the `/entries` route to use that column directly instead of pips. Never remove the `/entries` alias — FundedAccountPage depends on it.
