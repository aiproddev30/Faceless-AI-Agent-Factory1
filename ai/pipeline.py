import os
import uuid
import json
import asyncio
import subprocess
from ai.agents.script_writer import ScriptWriterAgent
from ai.agents.voiceover_agent import VoiceoverAgent
from ai.utils.logger import logger

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
STORAGE_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "storage"))
OUTPUT_DIR  = os.path.join(STORAGE_DIR, "output")
AUDIO_DIR   = os.path.join(OUTPUT_DIR, "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)


def run_ffmpeg(cmd: list):
    process = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if process.returncode != 0:
        logger.error("FFmpeg error:\n" + process.stderr)
        raise RuntimeError("FFmpeg failed.")
    return process


async def run_pipeline(
    title:            str,
    tone:             str,
    length:           int,
    voice:            str,
    style_mode:       str = "timeline",
    research_context: str = "",
    previously_covered: list = [],
    script_model:     str = "openai",
):
    run_id = str(uuid.uuid4())
    logger.info(f"[{run_id}] Pipeline start: '{title}'")

    # ── 1. Generate structured scene script ───────────────────────
    script_agent  = ScriptWriterAgent()
    script_result = await script_agent.execute({
        "title":            title,
        "tone":             tone,
        "length":           length,
        "style_mode":       style_mode,
        "research_context": research_context,
        "previously_covered": previously_covered,
        "script_model":     script_model,
    })

    scene_data  = script_result.get("scene_data")
    script_path = script_result["script_path"]

    # Build sections list from scene_data
    if scene_data and scene_data.get("scenes"):
        sections = [
            {
                "vo":                 s["voText"],
                "broll":              s["visualPrompt"],
                "visual_prompt":      s["visualPrompt"],
                "scene_number":       s["sceneNumber"],
                "title":              s["title"],
                "estimated_duration": s.get("estimatedDuration", 10.0),
                "visual_style":       s.get("suggestedVisualStyle", "cinematic"),
            }
            for s in scene_data["scenes"]
        ]
    else:
        # Fallback: parse the saved text file
        with open(script_path, "r", encoding="utf-8") as f:
            content = f.read()
        sections = _parse_sections(content)

    if not sections:
        raise ValueError("No sections found in script output.")

    logger.info(f"[{run_id}] {len(sections)} scenes ready")

    # ── 2. Generate audio per section ─────────────────────────────
    voice_agent       = VoiceoverAgent()
    enriched_sections = []

    for idx, section in enumerate(sections):
        audio_path = await voice_agent.execute({
            "text":   section["vo"],
            "voice":  voice,
            "index":  idx,
            "run_id": run_id,
        })
            # Get actual audio duration for accurate slide timing
        actual_duration = section.get("estimated_duration", 10.0)
        if audio_path and os.path.exists(str(audio_path)):
            try:
                probe = subprocess.run([
                    "ffprobe", "-v", "quiet",
                    "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1",
                    str(audio_path)
                ], capture_output=True, text=True)
                dur = float(probe.stdout.strip().split("=")[-1])
                if dur > 0:
                    actual_duration = dur
            except Exception:
                pass
        enriched_sections.append({**section, "audio_path": audio_path, "actual_duration": actual_duration})

    # ── 3. Stitch all section audio into one MP3 ──────────────────
    final_audio = os.path.join(AUDIO_DIR, f"{run_id}.mp3")
    list_file   = os.path.join(AUDIO_DIR, f"{run_id}_list.txt")

    with open(list_file, "w", encoding="utf-8") as f:
        for sec in enriched_sections:
            if sec.get('audio_path') is not None:
                f.write(f"file '{os.path.abspath(sec['audio_path'])}'\n")

    run_ffmpeg(["ffmpeg", "-y", "-f", "concat", "-safe", "0",
                "-i", list_file, "-c:a", "libmp3lame", "-q:a", "2", final_audio])
    os.remove(list_file)

    logger.info(f"[{run_id}] Audio complete: {final_audio}")

    return {
        "status":           "complete",
        "run_id":           run_id,
        "script_path":      script_path,
        "final_audio_path": final_audio,
        "scene_data":       scene_data,
        "sections":         enriched_sections,
        "chapters":         scene_data.get("chapters", []) if scene_data else [],
    }


def _parse_sections(text: str) -> list:
    """Legacy fallback: parse VO/BROLL text format."""
    import re
    pattern = r"VO:\s*(.*?)\s*BROLL:\s*(.*?)(?=VO:|\Z)"
    matches = re.findall(pattern, text, re.DOTALL)
    return [
        {"vo": vo.strip(), "broll": broll.strip(),
         "visual_prompt": broll.strip(), "estimated_duration": 10.0}
        for vo, broll in matches
    ]