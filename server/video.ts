import { Router } from "express";
import { db } from "../db";
import { scripts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { buildVideoForScript } from "../services/videoPipeline";

const router = Router();

/**
 * POST /api/scripts/:id/generate-video
 */
router.post("/scripts/:id/generate-video", async (req, res) => {
  const scriptId = Number(req.params.id);

  try {
    // 1️⃣ Get script
    const script = await db.query.scripts.findFirst({
      where: eq(scripts.id, scriptId),
    });

    if (!script) {
      return res.status(404).json({ error: "Script not found" });
    }

    // 2️⃣ Update status → rendering
    await db
      .update(scripts)
      .set({ videoStatus: "rendering", videoError: null })
      .where(eq(scripts.id, scriptId));

    // 3️⃣ Build video
    const videoPath = await buildVideoForScript(script);

    // 4️⃣ Update status → completed
    await db
      .update(scripts)
      .set({
        videoStatus: "completed",
        videoPath,
      })
      .where(eq(scripts.id, scriptId));

    res.json({ success: true, videoPath });
  } catch (error: any) {
    console.error("Video generation failed:", error);

    await db
      .update(scripts)
      .set({
        videoStatus: "failed",
        videoError: error.message,
      })
      .where(eq(scripts.id, scriptId));

    res.status(500).json({ error: "Video generation failed" });
  }
});

export default router;
