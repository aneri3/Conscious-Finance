/**
 * Three-tier Categorization Engine + Indian P2P Behavioral Heuristics
 *
 * Tier 1+2:  Rule engine (exact VPA match → regex match against narration)
 * Tier 2.5:  Structural P2P detector (heuristic — skips LLM for personal transfers)
 * Tier 2.6:  Behavioral heuristics on P2P transactions (#1, #2, #4 per-txn; #3 batch-level)
 * Tier 3:    LLM fallback (mocked — swap callModel to use Claude/GPT in production)
 */
import { createHash } from "crypto";
import { db } from "@workspace/db";
import { categoriesTable, categoryRulesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { type RawAATransaction } from "./mockAATransactions";
import { logger } from "./logger";
import type { TransactionMetadata } from "@workspace/db";

export type CategorizationSource =
  | "RULE_EXACT"
  | "RULE_REGEX"
  | "LLM"
  | "USER_TAGGED"
  | "P2P_UNCATEGORIZED"
  | "PENDING"
  | "HEURISTIC_ODD_AMOUNT"
  | "HEURISTIC_VELOCITY_CLUSTER";

export interface CategorizationResult {
  categoryCode: string;
  source: CategorizationSource;
  confidence: number | null;
  isP2p: boolean;
  metadata: TransactionMetadata;
  clusterId: string | null;
}

// ---- Structural P2P Detector ----

const PERSONAL_VPA_SUFFIXES = /^[a-z0-9.]+@(ybl|paytm|apl|axl|oksbi|okaxis|okicici|okhdfcbank)$/i;
const PHONE_UPI_NARRATION = /^UPI\/\d{10}\//i;

function isPersonalVpa(vpa: string): boolean {
  return PERSONAL_VPA_SUFFIXES.test(vpa) && /^\d{10}@/.test(vpa);
}

function isP2pTransfer(txn: RawAATransaction): boolean {
  let signals = 0;
  if (!txn.mccCode) signals++;
  if (txn.counterpartyVpa && isPersonalVpa(txn.counterpartyVpa)) signals++;
  if (PHONE_UPI_NARRATION.test(txn.rawNarration)) signals++;
  return signals >= 2;
}

// ---- Behavioral Heuristics (#1, #2, #4 — per-transaction) ----

/**
 * Heuristic #2 — Ride-hailing odd-amount pivot (AUTO-CATEGORIZE)
 *
 * Small (<₹300) DEBIT with a non-round, non-5-multiple amount is strongly
 * indicative of a ride-hailing auto-fare (Rapido, Ola, auto, etc.).
 * This is the ONLY heuristic that actually changes the category assignment.
 *
 * NOTE: This bypasses the quick-tag inbox entirely for matching transactions.
 * That is an intentional tuning decision — revisit once real usage data is
 * available, since even a handful of wrong auto-categorizations will erode
 * user trust on a product whose pitch is trustworthy awareness.
 *
 * Boundary conditions: amount must be strictly > 0, < 300, AND NOT divisible
 * by 5 (which also covers not divisible by 10). e.g. ₹150 → divisible by 5
 * → does NOT trigger. ₹83 → triggers. ₹299 → triggers. ₹300 → does NOT.
 */
function applyOddAmountHeuristic(
  txn: RawAATransaction,
): { fires: true; categoryCode: string; source: CategorizationSource } | { fires: false } {
  if (
    txn.txnType === "DEBIT" &&
    txn.amount > 0 &&
    txn.amount < 300 &&
    txn.amount % 5 !== 0
  ) {
    return { fires: true, categoryCode: "TRAVEL_COMMUTE", source: "HEURISTIC_ODD_AMOUNT" };
  }
  return { fires: false };
}

/**
 * Heuristic #1 — Staff & Services calendar anchor (SUGGESTION ONLY, never auto-applied)
 *
 * P2P DEBIT ≥ ₹1,500 in first 7 days of month. Fires for maid, staff, and
 * regular service payments — but also for flight splits, deposits, and any
 * large early-month transfer, so we MUST NOT auto-assign. Attach suggestion
 * metadata only; the user still has to tap a category in the inbox.
 */
function applyCalendarAnchorHeuristic(
  txn: RawAATransaction,
): Partial<TransactionMetadata> {
  if (txn.txnType !== "DEBIT" || txn.amount < 1500) return {};
  const dayOfMonth = txn.txnTimestamp.getDate();
  if (dayOfMonth >= 1 && dayOfMonth <= 7) {
    return {
      isRecurringServiceSuggestion: true,
      suggestedCategoryOnDateHeuristic: "RENT_BILLS",
    };
  }
  return {};
}

/**
 * Heuristic #4 — Scanner-down weekend cash swap (UI FLAG ONLY, never auto-applied)
 *
 * Round ≥ ₹1,000 DEBIT on Friday evening through Sunday night. Common pattern
 * for UPI cash swaps when a merchant's POS is down. Only a visual priority flag
 * in the inbox — never drives category assignment.
 */
function applyWeekendCashSwapHeuristic(
  txn: RawAATransaction,
): Partial<TransactionMetadata> {
  if (txn.txnType !== "DEBIT" || txn.amount < 1000 || txn.amount % 100 !== 0) return {};
  const day = txn.txnTimestamp.getDay(); // 0=Sun, 5=Fri, 6=Sat
  const hour = txn.txnTimestamp.getHours();

  const isFridayEvening = day === 5 && hour >= 18;
  const isSaturday = day === 6;
  const isSundayBeforeMidnight = day === 0 && hour <= 23;

  if (isFridayEvening || isSaturday || isSundayBeforeMidnight) {
    return { isLikelyWeekendCashSwap: true };
  }
  return {};
}

// ---- LLM Stub ----

interface LLMClassification {
  categoryCode: string;
  confidence: number;
}

/**
 * Mocked LLM classifier. Replace callModel to wire in a real Claude / GPT API call.
 * The outer function signature is the stable interface — only callModel changes.
 */
async function classifyWithLLM(
  txn: RawAATransaction,
  callModel: (narration: string, vpa: string | null, mcc: string | null) => Promise<LLMClassification | null> = defaultCallModel,
): Promise<LLMClassification | null> {
  return callModel(txn.rawNarration, txn.counterpartyVpa, txn.mccCode);
}

async function defaultCallModel(
  narration: string,
  vpa: string | null,
  mcc: string | null,
): Promise<LLMClassification | null> {
  const text = (narration + " " + (vpa ?? "")).toLowerCase();

  if (/myntra|ajio|nykaa|lenskart|croma|flipkart|amazon|westside|zara|h&m/.test(text) || mcc === "5691" || mcc === "5999" || mcc === "5732" || mcc === "5977" || mcc === "5995") {
    return { categoryCode: "SHOPPING", confidence: 0.85 };
  }
  if (/bigbasket|zepto|blinkit|dunzo|reliance fresh|more supermarket|dmart|supermarket|grocery|kirana/.test(text) || mcc === "5411" || mcc === "5912") {
    return { categoryCode: "FOOD_GROCERIES", confidence: 0.82 };
  }
  if (/bookmyshow|inox|pvr|hotstar|spotify|netflix|prime|zee5|youtube|gaming|steam/.test(text) || mcc === "7832" || mcc === "7994" || mcc === "7929") {
    return { categoryCode: "OUTINGS_LEISURE", confidence: 0.80 };
  }
  if (/uber|ola|metro|irctc|makemytrip|goibibo|redbus|rapido|auto|cab|taxi|bus|train|flight|airport/.test(text) || mcc === "4121" || mcc === "4722" || mcc === "7011") {
    return { categoryCode: "TRAVEL_COMMUTE", confidence: 0.83 };
  }
  if (/pharmeasy|1mg|apollo|medplus|netmeds|medicine|pharmacy|hospital|doctor|clinic|health/.test(text)) {
    return { categoryCode: "OUTINGS_LEISURE", confidence: 0.65 };
  }
  if (/rent|broadband|electricity|wifi|internet|gas|water|maintenance|society|cable|dth/.test(text)) {
    return { categoryCode: "RENT_BILLS", confidence: 0.88 };
  }
  if (/restaurant|cafe|coffee|starbucks|chai|snack|lunch|dinner|breakfast|food|eat/.test(text) || mcc === "5812" || mcc === "5814") {
    return { categoryCode: "FOOD_GROCERIES", confidence: 0.78 };
  }
  if (/cure.fit|gym|yoga|fitness|sports|decathlon/.test(text)) {
    return { categoryCode: "OUTINGS_LEISURE", confidence: 0.72 };
  }

  return { categoryCode: "UNCATEGORIZED", confidence: 0.3 };
}

// ---- Rule Cache ----

interface CachedRules {
  exactVpa: Map<string, string>;
  exactMerchant: Map<string, string>;
  regexRules: Array<{ pattern: RegExp; categoryCode: string }>;
}

let cachedRules: CachedRules | null = null;

async function loadRules(): Promise<CachedRules> {
  if (cachedRules) return cachedRules;

  const rules = await db
    .select({
      ruleType: categoryRulesTable.ruleType,
      matchValue: categoryRulesTable.matchValue,
      code: categoriesTable.code,
      priority: categoryRulesTable.priority,
    })
    .from(categoryRulesTable)
    .innerJoin(categoriesTable, eq(categoryRulesTable.categoryId, categoriesTable.id))
    .where(and(eq(categoryRulesTable.isActive, true)))
    .orderBy(asc(categoryRulesTable.priority));

  const result: CachedRules = {
    exactVpa: new Map(),
    exactMerchant: new Map(),
    regexRules: [],
  };

  for (const rule of rules) {
    if (rule.ruleType === "EXACT_VPA") {
      result.exactVpa.set(rule.matchValue.toLowerCase(), rule.code);
    } else if (rule.ruleType === "EXACT_MERCHANT") {
      result.exactMerchant.set(rule.matchValue.toLowerCase(), rule.code);
    } else if (rule.ruleType === "REGEX") {
      try {
        result.regexRules.push({
          pattern: new RegExp(rule.matchValue, "i"),
          categoryCode: rule.code,
        });
      } catch {
        logger.warn({ matchValue: rule.matchValue }, "Invalid regex rule, skipping");
      }
    }
  }

  cachedRules = result;
  return result;
}

export function invalidateRuleCache(): void {
  cachedRules = null;
}

// ---- Per-transaction categorization (tiers 1–3 + heuristics #1, #2, #4) ----

export async function categorizeTransaction(
  txn: RawAATransaction,
): Promise<CategorizationResult> {
  // CREDIT: skip everything, mark PENDING for display only
  if (txn.txnType === "CREDIT") {
    return { categoryCode: "UNCATEGORIZED", source: "PENDING", confidence: null, isP2p: false, metadata: {}, clusterId: null };
  }

  const rules = await loadRules();

  // Tier 1: Exact VPA match
  if (txn.counterpartyVpa) {
    const vpaMatch = rules.exactVpa.get(txn.counterpartyVpa.toLowerCase());
    if (vpaMatch) {
      return { categoryCode: vpaMatch, source: "RULE_EXACT", confidence: null, isP2p: false, metadata: {}, clusterId: null };
    }
  }

  // Tier 2: Regex match against narration
  for (const { pattern, categoryCode } of rules.regexRules) {
    if (pattern.test(txn.rawNarration)) {
      return { categoryCode, source: "RULE_REGEX", confidence: null, isP2p: false, metadata: {}, clusterId: null };
    }
  }

  // Tier 2.5: Structural P2P detector
  const isP2p = isP2pTransfer(txn);

  if (isP2p) {
    // Heuristic #2 — Check FIRST since it's the only one that changes the category.
    // If it fires, skip #1 and #4 (they only apply to still-UNCATEGORIZED P2P txns).
    const oddAmount = applyOddAmountHeuristic(txn);
    if (oddAmount.fires) {
      return {
        categoryCode: oddAmount.categoryCode,
        source: oddAmount.source,
        confidence: null,
        isP2p: true,
        metadata: {},
        clusterId: null,
      };
    }

    // Heuristics #1 and #4 — suggestion/flag metadata only, category stays UNCATEGORIZED
    const meta: TransactionMetadata = {
      ...applyCalendarAnchorHeuristic(txn),
      ...applyWeekendCashSwapHeuristic(txn),
    };

    return {
      categoryCode: "UNCATEGORIZED",
      source: "P2P_UNCATEGORIZED",
      confidence: null,
      isP2p: true,
      metadata: meta,
      clusterId: null,
    };
  }

  // Tier 3: LLM fallback (non-P2P transactions only)
  const llmResult = await classifyWithLLM(txn);
  if (llmResult && llmResult.confidence >= 0.6 && llmResult.categoryCode !== "UNCATEGORIZED") {
    return { categoryCode: llmResult.categoryCode, source: "LLM", confidence: llmResult.confidence, isP2p: false, metadata: {}, clusterId: null };
  }

  return { categoryCode: "UNCATEGORIZED", source: "PENDING", confidence: null, isP2p: false, metadata: {}, clusterId: null };
}

// ---- Heuristic #3: Velocity clustering (batch-level pass) ----

const CLUSTER_WINDOW_MS = 90 * 60 * 1000; // 90 minutes in milliseconds
const CLUSTER_MAX_AMOUNT = 100; // micro-debits only

/**
 * Generates a DETERMINISTIC cluster_id by hashing the sorted bankTxnRefs of cluster members.
 * Running the same batch twice MUST produce identical cluster_ids — verified by design
 * since we sort refs before hashing, making the result independent of input order.
 */
function deriveClusterId(memberRefs: string[]): string {
  const sorted = [...memberRefs].sort();
  return "CLU_" + createHash("sha256").update(sorted.join("|")).digest("hex").slice(0, 24);
}

export interface BatchCategorizationItem {
  txn: RawAATransaction;
  result: CategorizationResult;
}

/**
 * Velocity-clustering pass (Heuristic #3 — "Chai-Tapri" cluster).
 *
 * Operates ONLY on transactions that are still P2P + UNCATEGORIZED after
 * per-transaction categorization. Groups micro-debits (amount < ₹100) that
 * all fall within 90 minutes of the FIRST transaction in an open cluster
 * (anchor-based window, not sliding — prevents unbounded drift).
 *
 * A group of 1 is NOT a cluster. Minimum 2 members required.
 * cluster_id is derived deterministically from sorted bankTxnRefs.
 */
export function applyVelocityClustering(items: BatchCategorizationItem[]): BatchCategorizationItem[] {
  // Candidates: P2P, UNCATEGORIZED, DEBIT, amount < 100
  const candidates = items
    .filter(
      (item) =>
        item.result.isP2p &&
        item.result.categoryCode === "UNCATEGORIZED" &&
        item.txn.txnType === "DEBIT" &&
        item.txn.amount < CLUSTER_MAX_AMOUNT,
    )
    .sort((a, b) => a.txn.txnTimestamp.getTime() - b.txn.txnTimestamp.getTime());

  if (candidates.length < 2) return items;

  // Walk through candidates, building clusters anchored to first member's timestamp
  const clusters: Array<BatchCategorizationItem[]> = [];
  let currentCluster: BatchCategorizationItem[] = [candidates[0]];
  let anchorTime = candidates[0].txn.txnTimestamp.getTime();

  for (let i = 1; i < candidates.length; i++) {
    const elapsed = candidates[i].txn.txnTimestamp.getTime() - anchorTime;
    if (elapsed <= CLUSTER_WINDOW_MS) {
      currentCluster.push(candidates[i]);
    } else {
      clusters.push(currentCluster);
      currentCluster = [candidates[i]];
      anchorTime = candidates[i].txn.txnTimestamp.getTime();
    }
  }
  clusters.push(currentCluster);

  // Build a map from bankTxnRef → clusterId for qualifying clusters (≥2 members)
  const refToClusterId = new Map<string, string>();
  for (const cluster of clusters) {
    if (cluster.length >= 2) {
      const clusterId = deriveClusterId(cluster.map((c) => c.txn.bankTxnRef));
      for (const member of cluster) {
        refToClusterId.set(member.txn.bankTxnRef, clusterId);
      }
    }
  }

  if (refToClusterId.size === 0) return items;

  // Apply cluster assignments back to the full items array
  return items.map((item) => {
    const clusterId = refToClusterId.get(item.txn.bankTxnRef);
    if (!clusterId) return item;
    return {
      ...item,
      result: {
        ...item.result,
        clusterId,
        source: "HEURISTIC_VELOCITY_CLUSTER" as const,
      },
    };
  });
}

// ---- Shared batch entrypoint (called by both sync and CSV upload routes) ----

/**
 * Categorizes a batch of raw transactions through the full pipeline:
 * 1. Per-transaction: rules → P2P detection → heuristics #1/#2/#4 → LLM fallback
 * 2. Batch-level: velocity clustering (heuristic #3) across remaining P2P+UNCATEGORIZED
 *
 * Both AA mock sync and CSV upload must call THIS function — never duplicate the logic.
 */
export async function categorizeBatch(
  txns: RawAATransaction[],
): Promise<BatchCategorizationItem[]> {
  // Step 1: per-transaction categorization
  const items: BatchCategorizationItem[] = [];
  for (const txn of txns) {
    const result = await categorizeTransaction(txn);
    items.push({ txn, result });
  }

  // Step 2: velocity clustering on remaining P2P+UNCATEGORIZED candidates
  return applyVelocityClustering(items);
}
