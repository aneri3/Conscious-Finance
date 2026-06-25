import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { categoriesTable } from "./categories";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  bankTxnRef: text("bank_txn_ref").notNull().unique(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  txnType: text("txn_type", { enum: ["DEBIT", "CREDIT"] }).notNull(),
  txnTimestamp: timestamp("txn_timestamp", { withTimezone: true }).notNull(),
  rawNarration: text("raw_narration").notNull(),
  counterpartyVpa: text("counterparty_vpa"),
  mccCode: text("mcc_code"),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categoriesTable.id),
  categorizationSource: text("categorization_source", {
    enum: [
      "RULE_EXACT",
      "RULE_REGEX",
      "LLM",
      "USER_TAGGED",
      "P2P_UNCATEGORIZED",
      "PENDING",
      "HEURISTIC_ODD_AMOUNT",
      "HEURISTIC_VELOCITY_CLUSTER",
    ],
  })
    .notNull()
    .default("PENDING"),
  categorizationConfidence: numeric("categorization_confidence", { precision: 4, scale: 3 }),
  isP2p: boolean("is_p2p").notNull().default(false),
  clusterId: text("cluster_id"),
  metadata: jsonb("metadata").notNull().default({}),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;

/** Metadata attached by behavioral heuristics (never drives hard categorization, only UI hints) */
export interface TransactionMetadata {
  /** Heuristic #1: early-month large P2P → suggest RENT_BILLS but never auto-apply */
  isRecurringServiceSuggestion?: boolean;
  suggestedCategoryOnDateHeuristic?: string;
  /** Heuristic #4: weekend round-number transfer → elevated priority in inbox */
  isLikelyWeekendCashSwap?: boolean;
}
