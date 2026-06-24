import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
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
    enum: ["RULE_EXACT", "RULE_REGEX", "LLM", "USER_TAGGED", "P2P_UNCATEGORIZED", "PENDING"],
  }).notNull().default("PENDING"),
  categorizationConfidence: numeric("categorization_confidence", { precision: 4, scale: 3 }),
  isP2p: boolean("is_p2p").notNull().default(false),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
