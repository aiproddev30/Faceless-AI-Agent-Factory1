import type { Express } from "express";
import type { Server } from "http";
import { spawn } from "child_process";
import path from "path";
import { storage } from "./storage";

/*
|--------------------------------------------------------------------------
| PYTHON BRIDGE
| Sends JSON to api.py via stdin, receives JSON via stdout
|--------------------------------------------------------------------------
*/
function runPythonPipeline(input: any, timeoutMs = 1_500_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const python = spawn("python3", [path.join(process.cwd(), "api.py")]);
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      python.kill();
      reject(new Error("Python pipeline timed out after " + timeoutMs / 1000 + "s"));
    }, timeoutMs);

    python.stdout.on("data", (d) => { stdout += d.toString(); });
    python.stderr.on("data", (d) => { process.stderr.write(d); stderr += d.toString().slice(-2000); }); // stream stderr, keep only last 2000 chars

    python.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.error("Python stderr:\n", stderr);
        return reject(new Error(stderr || "Python process failed"));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        console.error("Raw Python output:\n", stdout);
        reject(new Error("Invalid JSON returned from Python"));
      }
    });

    python.stdin.write(JSON.stringify(input));
    python.stdin.end();
  });
}

/*
|--------------------------------------------------------------------------
| ROUTES
|--------------------------------------------------------------------------
*/
export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<void> {

  // ── GET all scripts ──────────────────────────────────────────
  app.get("/api/scripts", async (_req, res) => {
    try {
      res.json(await storage.getScripts());
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── GET one script ───────────────────────────────────────────
  app.get("/api/scripts/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const script = await storage.getScript(id);
      if (!script) return res.status(404).json({ message: "Script not found" });
      res.json(script);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── GET scenes for a script ──────────────────────────────────
  app.get("/api/scripts/:id/scenes", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const script = await storage.getScript(id);
      if (!script) return res.status(404).json({ message: "Script not found" });
      res.json({ scriptId: id, sceneData: (script as any).sceneData ?? null });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });



  // ── Series routes ─────────────────────────────────────────────
  app.get("/api/series", async (req, res) => {
    try {
      const series = await storage.getSeries();
      res.json(series);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/series", async (req, res) => {
    try {
      const { name, description } = req.body;
      if (!name) return res.status(400).json({ message: "Name is required" });
      const series = await storage.createSeries({ name, description });
      res.json(series);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/series/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const series = await storage.getSeriesById(id);
      if (!series) return res.status(404).json({ message: "Series not found" });
      res.json(series);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/series/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const series = await storage.updateSeries(id, req.body);
      res.json(series);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/series/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteSeries(id);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/series/:id/scripts", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const scripts = await storage.getScriptsBySeries(id);
      res.json(scripts);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });


  // ── Generate series cards ─────────────────────────────────────
  app.post("/api/series/:id/generate-cards", async (req, res) => {
    try {
      const id      = Number(req.params.id);
      const episode = req.body?.episode ?? 1;
      const week    = req.body?.week    ?? "";
      const result  = await runPythonPipeline({ mode: "generate_cards", episode, week }, 60_000);
      if (result.status === "error") throw new Error(result.error);
      res.json(result.data);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── POST research topic ───────────────────────────────────────
  app.post("/api/research", async (req, res) => {
    try {
      const { topic, style_mode } = req.body;
      if (!topic) return res.status(400).json({ message: "Topic is required" });
      const result = await runPythonPipeline({
        mode:  "research",
        topic,
        style_mode: style_mode || "timeline",
      }, 60_000);
      if (result.status === "error") throw new Error(result.error);
      res.json(result.data);
    } catch (e: any) {
      console.error("Research error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  // ── POST create script + generate audio ──────────────────────
  app.post("/api/scripts", async (req, res) => {
    try {
      const { topic, tone, length, voice, style_mode, styleMode, seriesId, episodeNumber } = req.body;
      const effectiveStyleMode = styleMode || style_mode || "timeline";
      if (!topic) return res.status(400).json({ message: "Topic is required" });

      const script = await storage.createScript({
        topic,
        tone:        tone       || "educational",
        length:      length     || 300,
        voice:       voice      || "onyx",
        styleMode:    effectiveStyleMode,
        content:      "",
        status:       "generating",
        audioStatus:  "processing",
        videoStatus:  "pending",
        seriesId:     seriesId || null,
        episodeNumber: episodeNumber || null,
      } as any);

      const researchContext = req.body?.researchContext || "";
      const scriptModel = req.body?.scriptModel || "openai";
      const result = await runPythonPipeline({
        mode:             "script",
        title:            topic,
        tone,
        length,
        voice:            voice || "onyx",
        style_mode:       effectiveStyleMode,
        series_id:        seriesId || null,
        research_context: researchContext,
        script_model:     scriptModel,
      });

      if (result.status === "error") throw new Error(result.error);

      const data = result.data;
      // sections use 'vo' for news/timeline, 'voText' for history chunker
      const fullScript = data?.sections?.map((s: any) => s.vo || s.voText || "").join("\n\n") || "";
      const wordCount = fullScript.trim().split(/\s+/).filter(Boolean).length;

      let audioPath = data?.final_audio_path || null;
      if (audioPath?.includes("/") || audioPath?.includes("\\")) {
        audioPath = path.basename(audioPath);
      }

      const updated = await storage.updateScript(script.id, {
        content:     fullScript,
        wordCount,
        status:      "complete",
        audioStatus: "complete",
        audioPath,
        sections:    data?.sections?.map((s: any) => ({
          vo: s.vo, broll: s.broll || s.visual_prompt,
        })) || [],
        sceneData: (() => {
          const sd = data?.scene_data;
          if (!sd || !data?.sections) return sd || null;
          // Merge actual audio durations from sections into sceneData.scenes
          const scenes = (sd.scenes || []).map((scene: any, i: number) => {
            const sec = data.sections[i];
            const actualDur = sec?.actual_duration;
            return actualDur ? { ...scene, actualDuration: actualDur } : scene;
          });
          return { ...sd, scenes };
        })(),
        youtubeHooks: data?.scene_data?.youtubeHooks || [],
        tweetHooks: data?.scene_data?.tweetHooks || [],
        episodeSummary: data?.scene_data?.episodeSummary || null,
      } as any);

      res.json(updated);
    } catch (e: any) {
      console.error("Script generation error:", e);
      res.status(500).json({ message: "Failed to generate script", error: e.message });
    }
  });

  // ── PATCH update script content ──────────────────────────────
  app.delete("/api/scripts/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      await storage.deleteScript(id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: "Failed to delete script", error: e.message });
    }
  });

  app.patch("/api/scripts/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const script = await storage.getScript(id);
      if (!script) return res.status(404).json({ message: "Script not found" });
      const { content, sceneData, seriesId, episodeNumber } = req.body;
      const updated = await storage.updateScript(id, { content, sceneData, seriesId, episodeNumber } as any);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── POST preview clips ──────────────────────────────────────
  app.post('/api/scripts/:id/preview-clips', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });
      const script = await storage.getScript(id);
      const result = await runPythonPipeline({
        mode:        'preview_clips',
        scriptId:    id,
        sceneData:   (script as any).sceneData ?? null,
        topic:       script.topic,
        visualStyle: req.body?.visualStyle ?? 'realistic',
        videoFormat: req.body?.videoFormat ?? 'youtube',
        episode:     (script as any).episodeNumber ?? 1,
        week:        req.body?.week ?? "",
      }, 60_000);
      if (result.status === 'error') throw new Error(result.error);
      res.json(result.data);
    } catch (e: any) {
      res.status(500).json({ message: 'Failed to fetch clips', error: e.message });
    }
  });

  // ── POST swap clip ────────────────────────────────────────────
  app.post('/api/scripts/:id/swap-clip', async (req, res) => {
    try {
      const { query, count = 4 } = req.body;
      const result = await runPythonPipeline({ mode: 'search_clips', query, count }, 30_000);
      if (result.status === 'error') throw new Error(result.error);
      res.json(result.data);
    } catch (e: any) {
      res.status(500).json({ message: 'Search failed', error: e.message });
    }
  });

  // ── POST generate video ──────────────────────────────────────
  app.post("/api/scripts/:id/generate-video", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

      const script = await storage.getScript(id);
      if (!script) return res.status(404).json({ message: "Script not found" });
      if (!script.audioPath) {
        return res.status(400).json({ message: "Audio not ready yet — generate script first" });
      }

      await storage.updateScript(id, { videoStatus: "processing", videoError: null } as any);

      const fullAudioPath = path.join(
        process.cwd(), "storage", "output", "audio",
        path.basename(script.audioPath)
      );

      const selectedScenes = req.body?.scenes ?? null;
      const result = await runPythonPipeline({
        mode:           "video",
        scriptId:       id,
        scriptText:     script.content || "",
        audioPath:      fullAudioPath,
        sceneData:      (script as any).sceneData ?? null,
        chapters:       (script as any).sceneData?.chapters ?? [],
        selectedScenes,
        visualStyle:    req.body?.visualStyle ?? 'realistic',
        videoFormat:    req.body?.videoFormat ?? 'youtube',
        episode:        req.body?.episode ?? (script as any).episodeNumber ?? 1,
        week:           req.body?.week ?? "",
      }, req.body?.visualStyle === "history" ? 1_800_000 : 600_000);

      if (result.status === "error") throw new Error(result.error);
      let videoPath = result.data?.video_path || null;
      if (videoPath) videoPath = videoPath.replace(/^\/home\/runner\/workspace\//g, "");


      const updated = await storage.updateScript(id, {
        videoStatus: "complete",
        videoPath:   videoPath,
      } as any);

      await storage.createVideo({
        scriptId:    id,
        videoPath:   videoPath,
        format:      req.body?.videoFormat ?? "youtube",
        visualStyle: req.body?.visualStyle ?? "realistic",
        label:       "Full Video",
      });

      res.json(updated);
    } catch (e: any) {
      console.error("Video generation error:", e);
      if (req.params.id) {
        await storage.updateScript(Number(req.params.id), {
          videoStatus: "failed",
          videoError:  e.message,
        } as any);
      }
      res.status(500).json({ message: "Failed to generate video", error: e.message });
    }
  });

  // ── POST generate audio (first time) ─────────────────────────
  app.post("/api/scripts/:id/generate-audio", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const script = await storage.getScript(id);
      if (!script) return res.status(404).json({ message: "Script not found" });
      if (script.status !== "complete") {
        return res.status(400).json({ message: "Script not ready yet" });
      }

      const voice = req.body?.voice || script.voice;
      await storage.updateScript(id, { audioStatus: "processing", audioError: null } as any);

      const styleMode = (script as any).styleMode || "timeline";
      const regenTimeout = styleMode === "history" ? 1_800_000 : 300_000;
      const result = await runPythonPipeline({
        mode:  "regenerate_audio",
        id,
        voice,
        text:  script.content || "",
      }, regenTimeout);

      if (result.status === "error") throw new Error(result.error);

      let audioPath = result.data?.audio_path || null;
      if (audioPath?.includes("/") || audioPath?.includes("\\")) {
        audioPath = path.basename(audioPath);
      }

      const updated = await storage.updateScript(id, {
        audioStatus: "complete",
        audioPath,
        voice,
      } as any);

      res.json(updated);
    } catch (e: any) {
      await storage.updateScript(Number(req.params.id), {
        audioStatus: "failed",
        audioError:  e.message,
      } as any);
      res.status(500).json({ message: e.message });
    }
  });

  // ── GET voice preview ─────────────────────────────────────────
  app.get("/api/voices/:voice/preview", async (req, res) => {
    try {
      const { voice } = req.params;
      const result = await runPythonPipeline({
        mode:  "regenerate_audio",
        voice,
        text:  "Hi there! This is a preview of what my voice sounds like. I hope you enjoy it.",
      }, 30_000);

      if (result.status === "error") throw new Error(result.error);

      const audioPath = result.data?.audio_path;
      if (!audioPath) throw new Error("No audio generated");

      const fullPath = path.isAbsolute(audioPath)
        ? audioPath
        : path.join(process.cwd(), "storage", "output", "audio", path.basename(audioPath));

      res.setHeader("Content-Type", "audio/mpeg");
      res.sendFile(fullPath, { root: "/" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── GET videos for a script ───────────────────────────────────
  app.get("/api/scripts/:id/videos", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const scriptVideos = await storage.getVideosByScript(id);
      res.json(scriptVideos);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── DELETE a video version ────────────────────────────────────
  app.delete("/api/videos/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      await storage.deleteVideo(id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
// ── POST polish video ─────────────────────────────────────────
app.post("/api/videos/:id/polish", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

    // Load the source video record
    const [sourceVideo] = await storage.getVideosByScript(0).then(() =>
      storage["db"]
        ? (storage as any).db.select().from((storage as any).videos).where(
            (storage as any).eq((storage as any).videos.id, id)
          )
        : []
    );

    // Simpler: just trust client sends the videoPath
    const inputVideoPath = req.body?.videoPath;
    if (!inputVideoPath) return res.status(400).json({ message: "videoPath required" });

    const fullInputPath = path.isAbsolute(inputVideoPath)
      ? inputVideoPath
      : path.join(process.cwd(), inputVideoPath);

    const result = await runPythonPipeline({
      mode:          "polish_video",
      inputPath:     fullInputPath,
      introImage:    req.body?.introImage    ?? null,
      introDuration: req.body?.introDuration ?? 3.0,
      outroImage:    req.body?.outroImage    ?? null,
      outroDuration: req.body?.outroDuration ?? 5.0,
      trimStart:     req.body?.trimStart     ?? 0.0,
      trimEnd:       req.body?.trimEnd       ?? 0.0,
      burnSubtitles:  req.body?.burnSubtitles  ?? false,
      scriptSections: req.body?.scriptSections ?? null,
      subtitleStyle:  req.body?.subtitleStyle  ?? null,
    }, 300_000);

    if (result.status === "error") throw new Error(result.error);

    const polishedPath = result.data?.video_path;
    if (!polishedPath) throw new Error("No video path returned");

    // Save as a new video version
    const scriptId = req.body?.scriptId;
    const newVideo = await storage.createVideo({
      scriptId:    scriptId || 0,
      videoPath:   path.relative(process.cwd(), polishedPath),
      format:      req.body?.format      ?? "youtube",
      visualStyle: req.body?.visualStyle ?? "realistic",
      label:       "Polished",
    });

    res.json(newVideo);
  } catch (e: any) {
    console.error("Polish error:", e);
    res.status(500).json({ message: e.message });
  }
});
}