import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const scripts = pgTable("scripts", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  tone: text("tone").notNull(),
  length: integer("length").notNull(),
  voice: text("voice").notNull().default("alloy"),
  content: text("content"),
  wordCount: integer("word_count"),
  status: text("status").notNull().default("pending"),
  audioStatus: text("audio_status").notNull().default("pending"),
  audioPath: text("audio_path"),
  audioError: text("audio_error"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertScriptSchema = createInsertSchema(scripts).pick({
  topic: true,
  tone: true,
  length: true,
  voice: true,
});

export type InsertScript = z.infer<typeof insertScriptSchema>;
export type Script = typeof scripts.$inferSelect;

export type CreateScriptRequest = InsertScript;
export type UpdateScriptRequest = Partial<{
  topic: string;
  tone: string;
  length: number;
  voice: string;
  content: string | null;
  wordCount: number | null;
  status: string;
  audioStatus: string;
  audioPath: string | null;
  audioError: string | null;
  error: string | null;
}>;

export type ScriptResponse = Script;
export type ScriptsListResponse = Script[];
