import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const scripts = pgTable("scripts", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  tone: text("tone").notNull(),
  length: integer("length").notNull(),
  content: text("content"),
  wordCount: integer("word_count"),
  status: text("status").notNull().default("pending"), // pending, processing, complete, failed
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertScriptSchema = createInsertSchema(scripts).pick({
  topic: true,
  tone: true,
  length: true,
});

export type InsertScript = z.infer<typeof insertScriptSchema>;
export type Script = typeof scripts.$inferSelect;

export type CreateScriptRequest = InsertScript;
export type UpdateScriptRequest = Partial<InsertScript>;

export type ScriptResponse = Script;
export type ScriptsListResponse = Script[];
