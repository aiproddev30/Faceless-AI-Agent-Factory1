import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const AUDIO_DIR = path.join(process.cwd(), "storage", "output", "audio");
const PREVIEW_DIR = path.join(process.cwd(), "storage", "output", "previews");
fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(PREVIEW_DIR, { recursive: true });

const ALLOWED_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
const PREVIEW_TEXT = "Here's a quick preview of this voice. Imagine it narrating your next viral YouTube video with energy and confidence.";
const previewGenerating = new Set<string>();

const MAX_CHUNK_WORDS = 300;

function extractNarration(content: string): string {
  const lines = content.split("\n");
  const narrationLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("##") || trimmed.startsWith("###")) continue;
    if (trimmed.startsWith("---")) continue;
    if (/^\*\*\[.*\]\*\*$/.test(trimmed)) continue;
    if (/^\*\*B-ROLL.*\*\*/.test(trimmed) || trimmed.startsWith("**B-ROLL")) continue;
    if (/^B-ROLL:/.test(trimmed)) continue;
    if (/^\[.*\]$/.test(trimmed)) continue;

    let cleaned = trimmed;
    cleaned = cleaned.replace(/^(NARRATOR|VO|VOICEOVER)\s*:\s*/i, "");
    cleaned = cleaned.replace(/\*\*/g, "");
    cleaned = cleaned.replace(/\*\*B-ROLL:.*$/i, "").trim();

    if (cleaned.length > 5) {
      narrationLines.push(cleaned);
    }
  }

  return narrationLines.join("\n\n");
}

function splitTextIntoChunks(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= MAX_CHUNK_WORDS) {
    return [text];
  }

  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const para of paragraphs) {
    const currentWords = currentChunk.split(/\s+/).filter(Boolean).length;
    const paraWords = para.split(/\s+/).filter(Boolean).length;

    if (currentChunk && currentWords + paraWords > MAX_CHUNK_WORDS) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk = currentChunk ? currentChunk + "\n\n" + para : para;
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}

async function generateAudioForChunk(text: string, voice: string): Promise<Buffer> {
  const response = await openai.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice: voice as any, format: "mp3" },
    messages: [
      { role: "system", content: "You are a professional voice actor narrating a YouTube video. Read the following text exactly as written with natural pacing and energy. Do not add any commentary, greetings, or extra words." },
      { role: "user", content: text },
    ],
  });

  const audioData = (response.choices[0]?.message as any)?.audio?.data ?? "";
  if (!audioData) {
    throw new Error("No audio data returned from API");
  }
  return Buffer.from(audioData, "base64");
}

async function generateVoiceover(scriptId: number, content: string, voice: string) {
  try {
    await storage.updateScript(scriptId, { audioStatus: "processing" });

    const narration = extractNarration(content);
    if (!narration || narration.trim().length < 10) {
      console.log(`Voiceover for script ${scriptId}: narration extraction returned too little text, falling back to full content`);
    }
    const textForAudio = narration && narration.trim().length >= 10 ? narration : content;
    const chunks = splitTextIntoChunks(textForAudio);
    console.log(`Voiceover for script ${scriptId}: ${textForAudio === narration ? 'extracted' : 'using full'} ${textForAudio.split(/\s+/).length} words -> ${chunks.length} chunk(s), voice=${voice}`);

    const audioBuffers: Buffer[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const wordCount = chunks[i].split(/\s+/).filter(Boolean).length;
      console.log(`  Chunk ${i + 1}/${chunks.length}: ${wordCount} words`);
      const buffer = await generateAudioForChunk(chunks[i], voice);
      console.log(`  Chunk ${i + 1} done: ${(buffer.length / 1024).toFixed(1)}KB`);
      audioBuffers.push(buffer);
    }

    const combinedBuffer = Buffer.concat(audioBuffers);
    const filename = `script-${scriptId}.mp3`;
    const filePath = path.join(AUDIO_DIR, filename);
    fs.writeFileSync(filePath, combinedBuffer);

    await storage.updateScript(scriptId, {
      audioStatus: "complete",
      audioPath: filename,
    });

    console.log(`Voiceover complete for script ${scriptId}: ${(combinedBuffer.length / 1024).toFixed(1)}KB total`);
  } catch (error: any) {
    console.error("Error generating voiceover:", error);
    await storage.updateScript(scriptId, {
      audioStatus: "failed",
      audioError: error.message || "Failed to generate voiceover",
    });
  }
}

async function researchTopic(topic: string): Promise<string> {
  try {
    const response = await openai.responses.create({
      model: "gpt-5.2",
      tools: [{ type: "web_search_preview" as any }],
      input: `Search the web for the latest information about: "${topic}"

Find current news, recent events, key facts, and trending angles related to this topic. Focus on what's happening RIGHT NOW - recent developments, viral moments, breaking news.

Provide a concise research summary (200-300 words) with specific facts, names, dates, and details that a scriptwriter can reference.`,
    });
    return (response as any).output_text || "";
  } catch (error) {
    console.error("Web research failed, proceeding without:", error);
    return "";
  }
}

async function generateYoutubeScript(scriptId: number, topic: string, tone: string, length: number, voice: string, researchContext?: string) {
  try {
    await storage.updateScript(scriptId, { status: "processing" });

    let research = researchContext || "";
    if (!research) {
      research = await researchTopic(topic);
    }

    const researchSection = research
      ? `\n\nIMPORTANT - Use this real-world research to make the script accurate and current:\n---\n${research}\n---\nReference specific facts, names, dates, and details from this research in the script. Make the content feel timely and well-researched.`
      : "";

    const prompt = `Write a faceless YouTube video script for: ${topic}
Format: Hook (0-30s) -> Story -> Main Content -> CTA
Tone: ${tone}
Length: ${length} words
Include B-roll cues and pacing markers.
No filler. High retention.${researchSection}`;

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

    generateVoiceover(scriptId, content, voice).catch(console.error);
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
      voice: "alloy",
    });

    await storage.updateScript(script.id, {
      status: "complete",
      audioStatus: "complete",
      content: "[HOOK 0-15s]\nEver wonder how top faceless channels pump out 3 videos a day? It's not magic. It's AI. Here are the top 10 tools...\n\n[B-ROLL: Fast-paced montage of servers blinking]\n\n[STORY]\nI used to spend 15 hours editing one video. Now I spend 15 minutes...\n\n[MAIN CONTENT]\nTool 1: Replit AI. This changed the game for building agents...\n\n[CTA]\nSubscribe for more AI secrets!",
      wordCount: 75,
    });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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
      const { researchContext, ...rest } = req.body;
      const input = api.scripts.create.input.parse(rest);
      const script = await storage.createScript(input);

      generateYoutubeScript(script.id, script.topic, script.tone, script.length, script.voice, researchContext).catch(console.error);

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

  app.post(api.scripts.regenerateAudio.path, async (req, res) => {
    try {
      const script = await storage.getScript(Number(req.params.id));
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }
      if (script.status !== "complete" || !script.content) {
        return res.status(400).json({ message: "Script must be complete before regenerating audio" });
      }
      if (script.audioStatus === "processing") {
        return res.status(400).json({ message: "Audio is currently being generated" });
      }

      const { voice } = api.scripts.regenerateAudio.input.parse(req.body);

      await storage.updateScript(script.id, {
        voice,
        audioStatus: "pending",
        audioPath: null,
        audioError: null,
      });

      generateVoiceover(script.id, script.content, voice).catch(console.error);

      const updated = await storage.getScript(script.id);
      res.json(updated);
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

  app.get(api.scripts.audio.path, async (req, res) => {
    const script = await storage.getScript(Number(req.params.id));
    if (!script || !script.audioPath) {
      return res.status(404).json({ message: "Audio not found" });
    }

    const fullPath = path.join(AUDIO_DIR, script.audioPath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ message: "Audio file not found on disk" });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `inline; filename="${script.audioPath}"`);
    const stream = fs.createReadStream(fullPath);
    stream.pipe(res);
  });

  app.get(api.series.list.path, async (req, res) => {
    const allSeries = await storage.getSeries();
    res.json(allSeries);
  });

  app.get(api.series.get.path, async (req, res) => {
    const s = await storage.getSeriesById(Number(req.params.id));
    if (!s) {
      return res.status(404).json({ message: "Series not found" });
    }
    res.json(s);
  });

  app.post(api.series.create.path, async (req, res) => {
    try {
      const input = api.series.create.input.parse(req.body);
      const s = await storage.createSeries(input);
      res.status(201).json(s);
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

  app.patch(api.series.update.path, async (req, res) => {
    try {
      const s = await storage.getSeriesById(Number(req.params.id));
      if (!s) {
        return res.status(404).json({ message: "Series not found" });
      }
      const input = api.series.update.input.parse(req.body);
      const updated = await storage.updateSeries(s.id, input);
      res.json(updated);
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

  app.delete(api.series.delete.path, async (req, res) => {
    const s = await storage.getSeriesById(Number(req.params.id));
    if (!s) {
      return res.status(404).json({ message: "Series not found" });
    }
    await storage.deleteSeries(s.id);
    res.status(204).send();
  });

  app.get(api.series.scripts.path, async (req, res) => {
    const seriesScripts = await storage.getScriptsBySeries(Number(req.params.id));
    res.json(seriesScripts);
  });

  let cachedTrends: { data: any[]; fetchedAt: number } | null = null;
  const TRENDS_CACHE_MS = 15 * 60 * 1000;

  app.get(api.trends.list.path, async (req, res) => {
    try {
      if (cachedTrends && Date.now() - cachedTrends.fetchedAt < TRENDS_CACHE_MS) {
        return res.json(cachedTrends.data);
      }

      const response = await openai.responses.create({
        model: "gpt-5.2",
        tools: [{ type: "web_search_preview" as any }],
        input: `Search the web for today's most viral and trending stories that would make great YouTube video topics. Focus on:
- Trending news stories (human interest, science, technology, pop culture, animals)
- Viral moments and events happening right now
- Topics people are searching for today

Return EXACTLY 8 trending topics as a JSON array. Each item must have:
- "title": A catchy, YouTube-ready topic title (keep it concise, 5-10 words)
- "summary": One sentence describing what's happening and why it's trending
- "category": One of: "News", "Science", "Tech", "Culture", "Animals", "Sports", "Business", "Entertainment"

Return ONLY the JSON array, no other text.`,
      });

      const outputText = (response as any).output_text || "";
      let trends: any[] = [];
      try {
        const jsonMatch = outputText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          trends = JSON.parse(jsonMatch[0]);
        }
      } catch (parseErr) {
        console.error("Failed to parse trends JSON:", parseErr);
        trends = [];
      }

      if (trends.length > 0) {
        cachedTrends = { data: trends, fetchedAt: Date.now() };
      }

      res.json(trends);
    } catch (error: any) {
      console.error("Error fetching trends:", error);
      res.status(500).json({ message: "Failed to fetch trending topics" });
    }
  });

  app.post(api.trends.research.path, async (req, res) => {
    try {
      const { topic } = api.trends.research.input.parse(req.body);

      const response = await openai.responses.create({
        model: "gpt-5.2",
        tools: [{ type: "web_search_preview" as any }],
        input: `Research this topic thoroughly using web search: "${topic}"

Find the most recent and relevant information including:
- What is happening right now related to this topic
- Key facts, dates, names, and details
- Why this is interesting or trending
- Any controversy or multiple perspectives

Provide a comprehensive research summary (300-500 words) that a YouTube scriptwriter could use to create an accurate, engaging video. Include specific details, quotes, and facts from your research.

Format the response as a clear, well-organized research brief.`,
      });

      const research = (response as any).output_text || "";

      let sources: { title?: string; url: string }[] = [];
      try {
        const output = (response as any).output;
        if (Array.isArray(output)) {
          for (const item of output) {
            if (item.type === "web_search_call" && item.action?.sources) {
              sources = item.action.sources.map((s: any) => ({
                title: s.title,
                url: s.url,
              }));
            }
          }
        }
      } catch {}

      res.json({ research, sources });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("Error researching topic:", err);
      res.status(500).json({ message: "Failed to research topic" });
    }
  });

  app.get(api.voices.preview.path, async (req, res) => {
    const voice = req.params.voice;
    if (!ALLOWED_VOICES.includes(voice)) {
      return res.status(400).json({ message: "Invalid voice. Allowed: " + ALLOWED_VOICES.join(", ") });
    }

    const filename = `preview-${voice}.mp3`;
    const filePath = path.join(PREVIEW_DIR, filename);

    if (fs.existsSync(filePath)) {
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return fs.createReadStream(filePath).pipe(res);
    }

    if (previewGenerating.has(voice)) {
      return res.status(202).json({ message: "Preview is being generated, try again shortly" });
    }

    previewGenerating.add(voice);
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-audio",
        modalities: ["text", "audio"],
        audio: { voice: voice as any, format: "mp3" },
        messages: [
          { role: "system", content: "You are a professional voice actor. Read the text naturally with warmth and energy." },
          { role: "user", content: PREVIEW_TEXT },
        ],
      });

      const audioData = (response.choices[0]?.message as any)?.audio?.data ?? "";
      if (!audioData) {
        throw new Error("No audio data returned");
      }

      const audioBuffer = Buffer.from(audioData, "base64");
      fs.writeFileSync(filePath, audioBuffer);

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      fs.createReadStream(filePath).pipe(res);
    } catch (error: any) {
      console.error("Error generating voice preview:", error);
      res.status(500).json({ message: "Failed to generate voice preview" });
    } finally {
      previewGenerating.delete(voice);
    }
  });

  return httpServer;
}
