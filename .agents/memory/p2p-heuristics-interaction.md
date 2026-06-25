---
name: P2P heuristics interaction order
description: Why heuristic #2 (odd-amount) must run before velocity clustering, and what breaks if demo amounts are wrong.
---

## Rule
Heuristic #2 (odd-amount auto-categorize to TRAVEL_COMMUTE) must be checked **first** among all four heuristics and is the only one that changes the category. If it fires, the transaction exits UNCATEGORIZED and is no longer a velocity-cluster candidate.

Velocity cluster (heuristic #3) only considers transactions that are **still P2P + UNCATEGORIZED** after the per-transaction pass. Any amount that triggers #2 (non-round, non-5-multiple, < ₹300) will be consumed by #2 and excluded from clustering.

**Why:** The spec explicitly states "check heuristic #2 FIRST since it's the only one that changes the actual category — if it fires, skip evaluating heuristics #1 and #4".

**How to apply:** When designing demo/mock transactions for the cluster heuristic, use amounts that are round multiples of 5 (e.g. ₹50, ₹60, ₹40) so they pass through #2 unchecked and remain as cluster candidates.

## Mock data ref stability
Mock `bankTxnRef` values must be **static strings** (e.g. `"MOCK-TXN-001"`), never derived from `Date.now()` or random values. Non-deterministic refs generate new values on every server restart, causing `ON CONFLICT (bank_txn_ref) DO NOTHING` to treat every restart as new transactions and insert duplicates.
