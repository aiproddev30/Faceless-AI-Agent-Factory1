import os
import uuid
import json
import asyncio
from ai.agents.media_agent import MediaAgent
from ai.agents.video_assembler import VideoAssemblerAgent
from ai.utils.logger import logger

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
STORAGE_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "storage"))
OUTPUT_DIR  = os.path.join(STORAGE_DIR, "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)


async def run_video_pipeline(
    script_id:       int,
    script_text:     str,
    audio_path:      str,
    scene_data:      dict | None = None,
    selected_scenes: list | None = None,
    visual_style:    str = "realistic",
    video_format:    str = "youtube",
) -> dict:
    """
    Runs the video generation pipeline:
      1. Builds sections from scene_data (or parses script_text as fallback)
      2. MediaAgent fetches clips / generates images for each scene
      3. VideoAssemblerAgent renders with transitions + subtitles + music
    """
    run_id = str(uuid.uuid4())[:8]
    logger.info(f"[{run_id}] Video pipeline start for script {script_id} | style={visual_style} | format={video_format}")

    # Build sections from scene_data if available
    if scene_data and scene_data.get("scenes"):
        sections = _scenes_to_sections(scene_data)
        logger.info(f"[{run_id}] Using scene_data: {len(sections)} scenes")
    elif script_text:
        sections = _parse_script_fallback(script_text)
        logger.warning(f"[{run_id}] No scene_data — parsed {len(sections)} sections from text")
    else:
        raise ValueError("Either scene_data or script_text is required.")

    pipeline_data = {
        "sections":     sections,
        "audio_path":   audio_path,
        "script_id":    script_id,
        "topic":        scene_data.get("title", "") if scene_data else "",
        "visualStyle":  visual_style,
        "video_format": video_format,
    }

    # Use pre-selected clips from UI or fetch fresh
    if selected_scenes:
        logger.info(f"[{run_id}] Using {len(selected_scenes)} pre-selected scenes from UI")
        pipeline_data["sections"] = selected_scenes
    else:
        media_agent  = MediaAgent()
        media_result = await media_agent.execute(pipeline_data)
        pipeline_data.update(media_result)

    # ── Prepend morse intro if styleMode is news ─────────────────
    morse_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "storage", "output", "intro", "morse_intro.mp4")
    sections = pipeline_data.get("sections", [])
    if sections and "[MORSE_INTRO]" in (sections[0].get("vo", "") or ""):
        if os.path.exists(morse_path):
            logger.info("Prepending morse intro clip to timeline")
            pipeline_data["morse_intro_path"] = morse_path
        else:
            logger.warning("morse_intro.mp4 not found — skipping")

    # ── History While You Sleep: use history assembler ────────────
    if sections and "[HISTORY_INTRO]" in (sections[0].get("vo", "") or ""):
        logger.info("History styleMode detected — using history_video_assembler")
        from ai.agents.history_video_assembler import render_history_video
        import re
        title = scene_data.get("title", "History Episode") if scene_data else "History Episode"
        safe_title = re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_")
        out_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                               "storage", "output", "video", f"history_{safe_title}.mp4")
        video_path = render_history_video(audio_path, title, output_path=out_path)
        logger.info(f"History video rendered: {video_path}")
        return {
            "status":    "complete",
            "run_id":    run_id,
            "script_id": script_id,
            "video_path": video_path,
        }

    # Ensure format settings survive the media_agent update
    pipeline_data["visualStyle"]  = visual_style
    pipeline_data["video_format"] = video_format

    # Render video
    assembler     = VideoAssemblerAgent()
    pipeline_data = await assembler.execute(pipeline_data)

    video_path = pipeline_data.get("final_video")
    logger.info(f"[{run_id}] Video pipeline complete: {video_path}")

    return {
        "status":     "complete",
        "run_id":     run_id,
        "script_id":  script_id,
        "video_path": video_path,
    }


def _build_pipeline_data(scene_data: dict, audio_path: str, script_id: int, topic: str = "") -> dict:
    """Build the shared pipeline_data dict used by MediaAgent and VideoAssemblerAgent."""
    if scene_data and scene_data.get("scenes"):
        sections = _scenes_to_sections(scene_data)
    else:
        sections = []
    return {
        "sections":     sections,
        "audio_path":   audio_path,
        "script_id":    script_id,
        "topic":        topic,
    }


def _scenes_to_sections(scene_data: dict) -> list:
    """Convert scene_data JSON → sections list format used by agents."""
    return [
        {
            "vo":                 s["voText"],
            "broll":              s["visualPrompt"],
            "visual_prompt":      s["visualPrompt"],
            "scene_number":       s["sceneNumber"],
            "title":              s["title"],
            "estimated_duration": s.get("estimatedDuration", 10.0),
            "visual_style":       s.get("suggestedVisualStyle", "cinematic"),
        }
        for s in scene_data.get("scenes", [])
    ]


def _parse_script_fallback(text: str) -> list:
    """Parse old VO/BROLL text format as last resort."""
    import re
    pattern = r"VO:\s*(.*?)\s*BROLL:\s*(.*?)(?=VO:|\Z)"
    matches = re.findall(pattern, text, re.DOTALL)
    if matches:
        return [
            {
                "vo": vo.strip(), "broll": broll.strip(),
                "visual_prompt": broll.strip(),
                "estimated_duration": 10.0, "visual_style": "cinematic",
            }
            for vo, broll in matches
        ]
    # Last resort: treat whole script as one scene
    return [{
        "vo": text, "broll": "documentary footage",
        "visual_prompt": "documentary footage",
        "estimated_duration": 30.0, "visual_style": "cinematic",
    }]