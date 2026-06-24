/**
 * Three-tier Categorization Engine
 *
 * Tier 1+2: Rule engine (exact VPA match, then regex match against narration)
 * Tier 2.5: P2P detector (heuristic — skips LLM for personal transfers)
 * Tier 3:   LLM fallback (mocked — swap callModel to use Claude/GPT in production)
 */
import { db } from "@workspace/db";
import { categoriesTable, categoryRulesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { type RawAATransaction } from "./mockAATransactions";
import { logger } from "./logger";

export type CategorizationSource =
  | "RULE_EXACT"
  | "RULE_REGEX"
  | "LLM"
  | "USER_TAGGED"
  | "P2P_UNCATEGORIZED"
  | "PENDING";

export interface CategorizationResult {
  categoryCode: string;
  source: CategorizationSource;
  confidence: number | null;
  isP2p: boolean;
}

// ---- P2P Detector ----

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
  if (/bookmyshow|inox|pvr|hotstar|spotify|netflix|prime|zee5|youtube|netflix|gaming|steam/.test(text) || mcc === "7832" || mcc === "7994" || mcc === "7929") {
    return { categoryCode: "OUTINGS_LEISURE", confidence: 0.80 };
  }
  if (/uber|ola|metro|irctc|makemytrip|goibibo|redbus|rapido|auto|cab|taxi|bus|train|flight|airport/.test(text) || mcc === "4121" || mcc === "4722" || mcc === "7011") {
    return { categoryCode: "TRAVEL_COMMUTE", confidence: 0.83 };
  }
  if (/pharmeasy|1mg|apollo|medplus|netmeds|medicine|pharmacy|hospital|doctor|clinic|health/.test(text) || mcc === "5912") {
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

  // Low confidence → caller should use PENDING
  return { categoryCode: "UNCATEGORIZED", confidence: 0.3 };
}

// ---- Main Engine ----

interface CachedRules {
  exactVpa: Map<string, string>; // vpa → categoryCode
  exactMerchant: Map<string, string>; // merchant → categoryCode
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

export async function categorizeTransaction(
  txn: RawAATransaction,
): Promise<CategorizationResult> {
  // CREDIT transactions: skip LLM, return PENDING/UNCATEGORIZED
  if (txn.txnType === "CREDIT") {
    return { categoryCode: "UNCATEGORIZED", source: "PENDING", confidence: null, isP2p: false };
  }

  const rules = await loadRules();

  // Tier 1: Exact VPA match
  if (txn.counterpartyVpa) {
    const vpaMatch = rules.exactVpa.get(txn.counterpartyVpa.toLowerCase());
    if (vpaMatch) {
      return { categoryCode: vpaMatch, source: "RULE_EXACT", confidence: null, isP2p: false };
    }
  }

  // Tier 2: Regex match against narration
  for (const { pattern, categoryCode } of rules.regexRules) {
    if (pattern.test(txn.rawNarration)) {
      return { categoryCode, source: "RULE_REGEX", confidence: null, isP2p: false };
    }
  }

  // Tier 2.5: P2P detector
  if (isP2pTransfer(txn)) {
    return { categoryCode: "UNCATEGORIZED", source: "P2P_UNCATEGORIZED", confidence: null, isP2p: true };
  }

  // Tier 3: LLM fallback
  const llmResult = await classifyWithLLM(txn);
  if (llmResult && llmResult.confidence >= 0.6 && llmResult.categoryCode !== "UNCATEGORIZED") {
    return { categoryCode: llmResult.categoryCode, source: "LLM", confidence: llmResult.confidence, isP2p: false };
  }

  // Low confidence → PENDING
  return { categoryCode: "UNCATEGORIZED", source: "PENDING", confidence: null, isP2p: false };
}
