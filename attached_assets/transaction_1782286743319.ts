// ============================================================================
// Core domain types
// ============================================================================

/**
 * Shape of a single transaction as it arrives from the TSP, after the TSP
 * has already normalized the raw ReBIT FI payload for us. Field names here
 * follow common TSP normalization (e.g. Setu-style); adjust to your actual
 * TSP's response schema before wiring this up for real.
 *
 * This same shape is also the *canonical* internal representation that CSV
 * uploads get mapped into before entering the categorization pipeline —
 * see csv-parser.ts. Both ingestion paths converge here so the
 * categorization engine never needs to know which source a transaction
 * came from.
 */
export interface RawAATransaction {
  accountId: string;          // maps to linked_accounts.fip_id + masked_account_no
  txnRef: string;             // bank-issued reference (UTR / FIP txnId), or a
                               // deterministic hash for CSV-sourced rows — used for dedup
  amount: number;
  type: "DEBIT" | "CREDIT";
  timestamp: string;          // ISO 8601
  narration: string;          // raw description string from the bank statement
  mode?: string;               // e.g. "UPI", "NEFT", "IMPS", "CARD"
  counterpartyVpa?: string;   // present for UPI transactions
  mccCode?: string;           // merchant category code, if FIP supplies it
  ingestionSource?: "AA_MOCK" | "CSV_UPLOAD"; // which pipeline produced this row
}

export type CategoryCode =
  | "RENT_BILLS"
  | "FOOD_GROCERIES"
  | "TRAVEL_COMMUTE"
  | "OUTINGS_LEISURE"
  | "SHOPPING"
  | "UNCATEGORIZED";

export type CategorizationSource =
  | "RULE_EXACT"
  | "RULE_REGEX"
  | "LLM"
  | "P2P_UNCATEGORIZED"
  | "PENDING";

export interface CategorizationResult {
  categoryCode: CategoryCode;
  source: CategorizationSource;
  confidence: number | null;  // null for deterministic rule matches
  isP2P: boolean;
  matchedRuleId?: number;     // for audit/debugging, if a rule fired
}

/** A rule row as stored in category_rules, loaded into memory for matching. */
export interface CategoryRule {
  id: number;
  ruleType: "EXACT_VPA" | "EXACT_MERCHANT" | "REGEX" | "MCC";
  matchValue: string;
  categoryCode: CategoryCode;
  priority: number;
}

// ============================================================================
// Onboarding / user profile
// ============================================================================

export type DataSourceMode = "AA_MOCK" | "CSV_UPLOAD";

export interface UserSetupRequest {
  monthlyIncome: number;
  safeLimitPct: number;       // e.g. 40 for 40%
  dataSourceMode: DataSourceMode;
}

export interface UserProfile {
  id: string;
  fullName: string | null;
  monthlyIncome: number | null;
  safeLimitPct: number;
  dataSourceMode: DataSourceMode | null;
  isOnboarded: boolean;       // derived: true once income + mode are both set
}

// ============================================================================
// CSV ingestion
// ============================================================================

/** One raw row as parsed directly out of an uploaded bank statement CSV,
 * before any normalization. Column names vary a lot between Indian banks —
 * see csv-parser.ts for the header-matching strategy. */
export interface RawCSVRow {
  date: string;
  narration: string;
  debitAmount?: string;
  creditAmount?: string;
  rowIndex: number;           // position in the file, used as a hash tiebreaker
}

export interface CSVUploadResult {
  totalRowsParsed: number;
  totalRowsIngested: number;
  duplicatesSkipped: number;
  errors: { rowIndex: number; reason: string }[];
}
