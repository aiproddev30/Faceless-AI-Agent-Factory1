import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  json,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* =========================
   SERIES
========================= */

export const series = pgTable("series", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

/* =========================
   SCRIPTS
========================= */

export const scripts = pgTable("scripts", {
  id: serial("id").primaryKey(),

  topic: text("topic").notNull(),
  tone: text("tone").notNull(),
  length: integer("length").notNull(),
  voice: text("voice").notNull().default("alloy"),

  /* ---- SCRIPT CONTENT ---- */
  content: text("content"),
  wordCount: integer("word_count"),

  // Structured sections for agents
  sections: json("sections")
    .$type<{ vo: string; broll: string }[]>()
    .default([]),

  /* ---- SCRIPT STATUS ---- */
  status: text("status").notNull().default("pending"),
  error: text("error"),

  /* ---- AUDIO AGENT ---- */
  audioStatus: text("audio_status").notNull().default("pending"),
  audioPath: text("audio_path"),
  audioError: text("audio_error"),

  /* ---- IMAGE AGENT ---- */
  imageStatus: text("image_status").notNull().default("pending"),
  imageError: text("image_error"),

  // One image filename per section
  images: json("images").$type<string[]>().default([]),

  /* ---- VIDEO AGENT ---- */
  videoStatus: text("video_status").notNull().default("pending"),
  videoPath: text("video_path"),
  videoError: text("video_error"),

  /* ---- SERIES ---- */
  seriesId: integer("series_id"),
  episodeNumber: integer("episode_number"),

  createdAt: timestamp("created_at").defaultNow(),
});

/* =========================
   INSERT SCHEMAS
========================= */

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

/* =========================
   TYPES
========================= */

export type InsertSeries = z.infer<typeof insertSeriesSchema>;
export type Series = typeof series.$inferSelect;

export type InsertScript = z.infer<typeof insertScriptSchema>;
export type Script = typeof scripts.$inferSelect;

/* =========================
   UPDATE TYPES
========================= */

export type UpdateScriptRequest = Partial<{
  topic: string;
  tone: string;
  length: number;
  voice: string;

  content: string | null;
  wordCount: number | null;

  sections: { vo: string; broll: string }[];

  status: string;
  error: string | null;

  audioStatus: string;
  audioPath: string | null;
  audioError: string | null;

  imageStatus: string;
  imageError: string | null;
  images: string[];

  videoStatus: string;
  videoPath: string | null;
  videoError: string | null;

  seriesId: number | null;
  episodeNumber: number | null;
}>;

/* =========================
   API RESPONSE TYPES
========================= */

export type ScriptResponse = Script;
export type ScriptsListResponse = Script[];

export type SeriesResponse = Series;
export type SeriesListResponse = Series[];
