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
  voice: text("voice").notNull().default("onyx"),
  styleMode: text("style_mode").notNull().default("timeline"),
  content: text("content"),
  wordCount: integer("word_count"),
  sections: json("sections")
    .$type<{ vo: string; broll: string }[]>()
    .default([]),
  sceneData: json("scene_data")
    .$type<{
      title: string;
      styleMode: string;
      totalEstimatedDuration: number;
      scenes: {
        sceneNumber: number;
        title: string;
        voText: string;
        visualPrompt: string;
        suggestedVisualStyle: string;
        estimatedDuration: number;
      }[];
    } | null>()
    .default(null),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  audioStatus: text("audio_status").notNull().default("pending"),
  audioPath: text("audio_path"),
  audioError: text("audio_error"),
  imageStatus: text("image_status").notNull().default("pending"),
  imageError: text("image_error"),
  images: json("images").$type<string[]>().default([]),
  videoStatus: text("video_status").notNull().default("pending"),
  videoPath: text("video_path"),
  videoError: text("video_error"),
  seriesId: integer("series_id"),
  episodeNumber: integer("episode_number"),
  youtubeHooks: json("youtube_hooks").$type<string[]>().default([]),
  tweetHooks: json("tweet_hooks").$type<string[]>().default([]),
  episodeSummary: text("episode_summary"),
  createdAt: timestamp("created_at").defaultNow(),
});

/* =========================
   VIDEOS
========================= */
export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  scriptId: integer("script_id").notNull(),
  videoPath: text("video_path").notNull(),
  format: text("format").notNull().default("youtube"),       // youtube | shorts
  visualStyle: text("visual_style").notNull().default("realistic"), // realistic | cinematic | cartoon
  label: text("label").notNull().default("Full Video"),      // Full Video | Short Clip | Trailer
  duration: integer("duration"),                             // seconds
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
  styleMode: true,
  seriesId: true,
  episodeNumber: true,
});

export const insertVideoSchema = createInsertSchema(videos).pick({
  scriptId: true,
  videoPath: true,
  format: true,
  visualStyle: true,
  label: true,
  duration: true,
});

/* =========================
   TYPES
========================= */
export type InsertSeries = z.infer<typeof insertSeriesSchema>;
export type Series = typeof series.$inferSelect;
export type InsertScript = z.infer<typeof insertScriptSchema>;
export type Script = typeof scripts.$inferSelect;
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type Video = typeof videos.$inferSelect;

/* =========================
   UPDATE TYPES
========================= */
export type UpdateScriptRequest = Partial<{
  topic: string;
  tone: string;
  length: number;
  voice: string;
  styleMode: string;
  content: string | null;
  wordCount: number | null;
  sections: { vo: string; broll: string }[];
  sceneData: object | null;
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
   RESPONSE TYPES
========================= */
export type ScriptResponse = Script;
export type ScriptsListResponse = Script[];
export type SeriesResponse = Series;
export type SeriesListResponse = Series[];
export type VideoResponse = Video;
export type VideosListResponse = Video[];