import type { Express } from "express";
import type { Server } from "http";
import { spawn } from "child_process";
import path from "path";
import { storage } from "./storage";

/*
|--------------------------------------------------------------------------
| PYTHON PIPELINE BRIDGE
|--------------------------------------------------------------------------
*/

function runPythonPipeline(input: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const python = spawn("python3", ["api.py"]);

    let stdout = "";
    let stderr = "";

    python.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    python.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    python.on("close", (code) => {
      if (code !== 0) {
        console.error("Python stderr:\n", stderr);
        return reject(new Error(stderr || "Python process failed"));
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (err) {
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
| REGISTER ROUTES
|--------------------------------------------------------------------------
*/

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<void> {

  /*
  |--------------------------------------------------------------------------
  | LIST SCRIPTS
  |--------------------------------------------------------------------------
  */

  app.get("/api/scripts", async (_req, res) => {
    try {
      const scripts = await storage.getScripts();
      res.json(scripts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  /*
  |--------------------------------------------------------------------------
  | GET SCRIPT BY ID
  |--------------------------------------------------------------------------
  */

  app.get("/api/scripts/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid script ID" });
      }

      const script = await storage.getScript(id);

      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }

      res.json(script);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | CREATE SCRIPT
  |--------------------------------------------------------------------------
  */

  app.post("/api/scripts", async (req, res) => {
    try {
      const { topic, tone, length, voice } = req.body;

      if (!topic) {
        return res.status(400).json({ message: "Topic is required" });
      }

      const script = await storage.createScript({
        topic,
        tone,
        length,
        voice,
        content: "",
        status: "generating",
        audioStatus: "processing",
        videoStatus: null,
      });

      const result = await runPythonPipeline({
        mode: "script",
        title: topic,
        tone,
        length,
        voice,
      });

      if (result.status === "error") {
        throw new Error(result.error);
      }

      const fullScript =
        result.data?.sections?.map((s: any) => s.vo).join("\n\n") || "";

      const wordCount = fullScript
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;

      // 🔥 Store ONLY filename if full path returned
      let audioPath = result.data?.final_audio_path || null;

      if (audioPath && audioPath.includes("/")) {
        audioPath = path.basename(audioPath);
      }

      const updated = await storage.updateScript(script.id, {
        content: fullScript,
        wordCount,
        status: "complete",
        audioStatus: "complete",
        audioPath,
      });

      res.json(updated);

    } catch (error: any) {
      console.error("Script generation error:", error);

      res.status(500).json({
        message: "Failed to generate script",
        error: error.message,
      });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | GENERATE VIDEO
  |--------------------------------------------------------------------------
  */

  app.post("/api/scripts/:id/generate-video", async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid script ID" });
      }

      const script = await storage.getScript(id);

      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }

      if (!script.audioPath) {
        return res.status(400).json({ message: "Audio not generated yet" });
      }

      await storage.updateScript(id, {
        videoStatus: "processing",
        videoError: null,
      });

      // 🔥 Always rebuild clean absolute path
      const fullAudioPath = path.join(
        process.cwd(),
        "storage",
        "output",
        "audio",
        path.basename(script.audioPath)
      );

      console.log("Using audio file:", fullAudioPath);

      const result = await runPythonPipeline({
        mode: "video",
        scriptId: id,
        scriptText: script.content,
        audioPath: fullAudioPath,
      });

      if (result.status === "error") {
        throw new Error(result.error);
      }

      const updated = await storage.updateScript(id, {
        videoStatus: "complete",
        videoPath: result.data?.video_path || null,
      });

      res.json(updated);

    } catch (error: any) {
      console.error("Video generation error:", error);

      if (req.params.id) {
        await storage.updateScript(Number(req.params.id), {
          videoStatus: "failed",
          videoError: error.message,
        });
      }

      res.status(500).json({
        message: "Failed to generate video",
        error: error.message,
      });
    }
  });

}
