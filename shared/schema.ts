import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const series = pgTable("series", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

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
  seriesId: integer("series_id"),
  episodeNumber: integer("episode_number"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSeriesSchema = createInsertSchema(series).pick({
  name: true,
  description: true,
});

export const insertScriptSchema = createInsertSchema(scripts).pick({
  topic: true,
  tone: true,
  length: true,
  voice: true,
  seriesId: true,
  episodeNumber: true,
});

export type InsertSeries = z.infer<typeof insertSeriesSchema>;
export type Series = typeof series.$inferSelect;

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
  seriesId: number | null;
  episodeNumber: number | null;
}>;

export type ScriptResponse = Script;
export type ScriptsListResponse = Script[];
export type SeriesResponse = Series;
export type SeriesListResponse = Series[];
