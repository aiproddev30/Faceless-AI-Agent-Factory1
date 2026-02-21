import { db } from "./db";
import {
  scripts,
  type InsertScript,
  type UpdateScriptRequest,
  type ScriptResponse
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  getScripts(): Promise<ScriptResponse[]>;
  getScript(id: number): Promise<ScriptResponse | undefined>;
  createScript(script: InsertScript): Promise<ScriptResponse>;
  updateScript(id: number, updates: UpdateScriptRequest): Promise<ScriptResponse>;
  deleteScript(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getScripts(): Promise<ScriptResponse[]> {
    return await db.select().from(scripts);
  }

  async getScript(id: number): Promise<ScriptResponse | undefined> {
    const [script] = await db.select().from(scripts).where(eq(scripts.id, id));
    return script;
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
}

export const storage = new DatabaseStorage();
