import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function generateYoutubeScript(scriptId: number, topic: string, tone: string, length: number) {
  try {
    await storage.updateScript(scriptId, { status: "processing" });

    const prompt = `Write a faceless YouTube video script for: ${topic}
Format: Hook (0-30s) -> Story -> Main Content -> CTA
Tone: ${tone}
Length: ${length} words
Include B-roll cues and pacing markers.
No filler. High retention.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 8192,
    });

    const content = response.choices[0]?.message?.content || "";
    const wordCount = content.split(/\s+/).length;

    await storage.updateScript(scriptId, {
      content,
      wordCount,
      status: "complete",
    });
  } catch (error: any) {
    console.error("Error generating script:", error);
    await storage.updateScript(scriptId, {
      status: "failed",
      error: error.message || "Failed to generate script",
    });
  }
}

async function seedDatabase() {
  const existingScripts = await storage.getScripts();
  if (existingScripts.length === 0) {
    const script = await storage.createScript({
      topic: "Top 10 AI Automation Tools for 2026",
      tone: "educational",
      length: 800,
    });
    
    await storage.updateScript(script.id, {
      status: "complete",
      content: "[HOOK 0-15s]\nEver wonder how top faceless channels pump out 3 videos a day? It's not magic. It's AI. Here are the top 10 tools...\n\n[B-ROLL: Fast-paced montage of servers blinking]\n\n[STORY]\nI used to spend 15 hours editing one video. Now I spend 15 minutes...\n\n[MAIN CONTENT]\nTool 1: Replit AI. This changed the game for building agents...\n\n[CTA]\nSubscribe for more AI secrets!",
      wordCount: 75,
    });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Seed the database with some example data
  seedDatabase().catch(console.error);

  app.get(api.scripts.list.path, async (req, res) => {
    const scripts = await storage.getScripts();
    res.json(scripts);
  });

  app.get(api.scripts.get.path, async (req, res) => {
    const script = await storage.getScript(Number(req.params.id));
    if (!script) {
      return res.status(404).json({ message: "Script not found" });
    }
    res.json(script);
  });

  app.post(api.scripts.create.path, async (req, res) => {
    try {
      const input = api.scripts.create.input.parse(req.body);
      const script = await storage.createScript(input);
      
      // Kick off background processing
      generateYoutubeScript(script.id, script.topic, script.tone, script.length).catch(console.error);

      res.status(201).json(script);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.scripts.delete.path, async (req, res) => {
    await storage.deleteScript(Number(req.params.id));
    res.status(204).send();
  });

  return httpServer;
}
