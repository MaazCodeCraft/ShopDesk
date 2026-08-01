import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  amount: integer("amount").notNull(),
  receiver: text("receiver").notNull(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull(),
});
