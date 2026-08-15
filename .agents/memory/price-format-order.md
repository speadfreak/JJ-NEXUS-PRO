---
name: formatPriceForSymbol argument order
description: The utility function's argument order is easy to confuse — symbol first, price second
---

**Rule:** `formatPriceForSymbol(symbol: string, price: number)` — symbol is FIRST, price is SECOND.

**Why:** Multiple places in the codebase have historically called this as `(price, pair)` which passes a number as `symbol` and causes `symbol.toUpperCase is not a function` runtime crashes.

**How to apply:** When calling `formatPriceForSymbol`, always check: first arg is the string ticker (e.g. `'XAUUSD'`, `pair`, `sym`), second arg is the numeric price (e.g. `prices[pair]`, `livePrice`).
