import { db } from "./db";
import {
  scripts,
  series,
  videos,
  type InsertScript,
  type InsertSeries,
  type InsertVideo,
  type UpdateScriptRequest,
  type ScriptResponse,
  type SeriesResponse,
  type VideoResponse,
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getScripts(): Promise<ScriptResponse[]>;
  getScript(id: number): Promise<ScriptResponse | undefined>;
  getScriptsBySeries(seriesId: number): Promise<ScriptResponse[]>;
  createScript(script: InsertScript): Promise<ScriptResponse>;
  updateScript(id: number, updates: UpdateScriptRequest): Promise<ScriptResponse>;
  deleteScript(id: number): Promise<void>;
  getSeries(): Promise<SeriesResponse[]>;
  getSeriesById(id: number): Promise<SeriesResponse | undefined>;
  createSeries(data: InsertSeries): Promise<SeriesResponse>;
  updateSeries(id: number, data: Partial<InsertSeries>): Promise<SeriesResponse>;
  deleteSeries(id: number): Promise<void>;
  getVideosByScript(scriptId: number): Promise<VideoResponse[]>;
  createVideo(data: InsertVideo): Promise<VideoResponse>;
  deleteVideo(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getScripts(): Promise<ScriptResponse[]> {
    return await db.select().from(scripts).orderBy(desc(scripts.createdAt));
  }
  async getScript(id: number): Promise<ScriptResponse | undefined> {
    const [script] = await db.select().from(scripts).where(eq(scripts.id, id));
    return script;
  }
  async getScriptsBySeries(seriesId: number): Promise<ScriptResponse[]> {
    return await db.select().from(scripts).where(eq(scripts.seriesId, seriesId)).orderBy(scripts.episodeNumber);
  }
  async createScript(insertScript: InsertScript): Promise<ScriptResponse> {
    const [script] = await db.insert(scripts).values(insertScript).returning();
    return script;
  }
  async updateScript(id: number, updates: UpdateScriptRequest): Promise<ScriptResponse> {
    const [updated] = await db.update(scripts)
      .set(updates)
      .where(eq(scripts.id, id))
      .returning();
    return updated;
  }
  async deleteScript(id: number): Promise<void> {
    await db.delete(scripts).where(eq(scripts.id, id));
  }
  async getSeries(): Promise<SeriesResponse[]> {
    return await db.select().from(series).orderBy(desc(series.createdAt));
  }
  async getSeriesById(id: number): Promise<SeriesResponse | undefined> {
    const [s] = await db.select().from(series).where(eq(series.id, id));
    return s;
  }
  async createSeries(data: InsertSeries): Promise<SeriesResponse> {
    const [s] = await db.insert(series).values(data).returning();
    return s;
  }
  async updateSeries(id: number, data: Partial<InsertSeries>): Promise<SeriesResponse> {
    const [s] = await db.update(series).set(data).where(eq(series.id, id)).returning();
    return s;
  }
  async deleteSeries(id: number): Promise<void> {
    await db.update(scripts).set({ seriesId: null, episodeNumber: null }).where(eq(scripts.seriesId, id));
    await db.delete(series).where(eq(series.id, id));
  }

  // ── Videos ──────────────────────────────────────────────────
  async getVideosByScript(scriptId: number): Promise<VideoResponse[]> {
    return await db.select().from(videos)
      .where(eq(videos.scriptId, scriptId))
      .orderBy(desc(videos.createdAt));
  }
  async createVideo(data: InsertVideo): Promise<VideoResponse> {
    const [video] = await db.insert(videos).values(data).returning();
    return video;
  }
  async deleteVideo(id: number): Promise<void> {
    await db.delete(videos).where(eq(videos.id, id));
  }
}

export const storage = new DatabaseStorage();