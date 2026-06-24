import { pgTable, serial, text, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { categoriesTable } from "./categories";

export const categoryRulesTable = pgTable("category_rules", {
  id: serial("id").primaryKey(),
  ruleType: text("rule_type", { enum: ["EXACT_VPA", "EXACT_MERCHANT", "REGEX"] }).notNull(),
  matchValue: text("match_value").notNull(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categoriesTable.id),
  priority: integer("priority").notNull().default(100),
  isActive: boolean("is_active").notNull().default(true),
});

export const insertCategoryRuleSchema = createInsertSchema(categoryRulesTable).omit({ id: true });
export type InsertCategoryRule = z.infer<typeof insertCategoryRuleSchema>;
export type CategoryRule = typeof categoryRulesTable.$inferSelect;
