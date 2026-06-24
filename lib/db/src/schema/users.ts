import { pgTable, serial, text, numeric, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    fullName: text("full_name").notNull(),
    monthlyIncome: numeric("monthly_income", { precision: 12, scale: 2 }).notNull(),
    safeLimitPct: numeric("safe_limit_pct", { precision: 5, scale: 2 }).notNull().default("40.00"),
    dataSourceMode: text("data_source_mode"),
  },
  (t) => [
    check("data_source_mode_check", sql`${t.dataSourceMode} IN ('AA_MOCK', 'CSV_UPLOAD') OR ${t.dataSourceMode} IS NULL`),
  ],
);

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type DataSourceMode = "AA_MOCK" | "CSV_UPLOAD";
