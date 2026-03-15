import os
import re
from ai.agents.base_agent import BaseAgent
from ai.services.pexels_client import search_video, search_image
from ai.services.pixabay_client import search_video as pixabay_video, search_image as pixabay_image
from ai.services.pollinations_client import generate_image
from ai.utils.logger import logger
from ai.agents.slide_generator import generate_slide, _infer_tag


def _extract_keywords(prompt: str, title: str, topic: str = "") -> str:
    filler = [
        "footage of", "image of", "images of", "photo of", "close-up of",
        "featuring", "showcasing", "including", "showing", "vibrant colors",
        "warm lighting", "bright lighting", "nostalgic atmosphere",
        "lively atmosphere", "inviting atmosphere", "cinematic", "slow-zoom",
        "sepia tones", "black and white", "aerial", "animation", "diagram",
    ]
    stopwords = {
        "with", "that", "this", "from", "into", "have", "been", "were",
        "they", "them", "their", "also", "more", "most", "some", "such",
        "era", "age", "time", "period", "century", "modern", "ancient",
        "early", "late", "first", "last", "next", "each", "many", "much",
        "production", "faster", "efficient", "making", "brings", "brought",
        "setting", "style", "look", "feel", "tone", "vibe", "scene",
    }
    source = prompt if (prompt and prompt != title) else f"{topic} {title}"
    base = source.lower()
    for f in filler:
        base = base.replace(f, " ")
    words = [w for w in re.split(r"[,\s]+", base) if len(w) > 3 and w not in stopwords]
    seen = set()
    unique = []
    for w in words:
        if w not in seen:
            seen.add(w)
            unique.append(w)
    return " ".join(unique[:4]).strip() or title


class MediaAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="MediaAgent")
        self.output_dir = "storage/output/media"
        os.makedirs(self.output_dir, exist_ok=True)

    async def _run(self, data: dict) -> dict:
        sections     = data.get("sections", data.get("scenes", []))
        topic        = data.get("topic", "")
        visual_style = data.get("visualStyle", "realistic")
        video_format = data.get("video_format", "youtube")
        results = []

        for scene in sections:
            prompt    = scene.get("visualPrompt", scene.get("broll", scene.get("title", "nature")))
            scene_num = scene.get("sceneNumber", scene.get("scene_number", 0))
            duration  = scene.get("estimatedDuration", scene.get("estimated_duration", 10))
            title     = scene.get("title", "")
            vo        = scene.get("voText", scene.get("vo", ""))
            style     = scene.get("suggestedVisualStyle", "cinematic")

            search_query = _extract_keywords(prompt, title, topic)
            logger.info(f"Fetching media for scene {scene_num}: {title} | style: {visual_style} | format: {video_format} | query: '{search_query}'")

            raw_clips = []
            clip_type = "image"
            source    = "pollinations"

            # --- Morse intro scene ---
            if vo and "[MORSE_INTRO]" in vo:
                morse_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "storage", "output", "intro", "morse_intro.mp4")
                if os.path.exists(morse_path):
                    raw_clips = [morse_path]
                    clip_type = "video"
                    source    = "morse"
                else:
                    logger.warning("morse_intro.mp4 not found — skipping intro scene")

            # --- News: branded slide generator ---
            elif visual_style == "news":
                try:
                    episode     = data.get("episode", 1)
                    week        = data.get("week", "")
                    if not week:
                        from datetime import date
                        week = date.today().strftime("%B %-d, %Y")
                    # Use category from scene data if available, else infer
                    raw_category = scene.get("category", "")
                    if raw_category and raw_category.lower() != "story of the week":
                        tag = raw_category.upper()
                    elif raw_category.lower() == "story of the week":
                        tag = "STORY OF THE WEEK"
                    else:
                        tag = _infer_tag(title)
                    total       = len(sections)
                    # Map internal scene labels to display titles
                    if title.lower() in ["hook", "intro", "opening", "morse intro"]:
                        display_title = "THIS WEEK IN AI"
                    elif title.lower() in ["outro", "closing", "wrap up", "wrap-up", "call to action"]:
                        display_title = "THAT'S YOUR SIGNAL"
                    elif title.lower() in ["bridge", "transition"]:
                        display_title = "AND ANOTHER THING..."
                    else:
                        display_title = title
                    slide_path  = generate_slide(
                        scene_number = scene_num,
                        total_scenes = total,
                        scene_title  = display_title,
                        pull_quote   = vo[:200] if vo else "",
                        source_url   = scene.get("source", ""),
                        tag          = tag,
                        episode      = episode,
                        week         = week,
                        video_format = video_format,
                    )
                    raw_clips = [slide_path]
                    clip_type = "image"
                    source    = "slide"
                except Exception as e:
                    logger.warning(f"Slide generation failed for scene {scene_num}: {e}")

            # --- Cartoon: AI generation via Pollinations ---
            elif visual_style == "cartoon":
                try:
                    images = await generate_image(prompt, count=2)
                    raw_clips = images if isinstance(images, list) else [images]
                    clip_type = "image"
                    source = "pollinations"
                except Exception as e:
                    logger.warning(f"Pollinations failed for scene {scene_num}: {e}")

            # --- Realistic / Cinematic: stock footage ---
            else:
                clip_type = "video"

                # 1. Pexels video
                try:
                    videos = await search_video(search_query, per_page=15, count=2, video_format=video_format)
                    raw_clips = videos if isinstance(videos, list) else [videos]
                    source = "pexels"
                except Exception as e:
                    logger.warning(f"Pexels video failed for scene {scene_num}: {e}")

                # 2. Pixabay video
                if not raw_clips:
                    try:
                        videos = await pixabay_video(search_query, count=2, video_format=video_format)
                        raw_clips = videos if isinstance(videos, list) else [videos]
                        source = "pixabay"
                    except Exception as e:
                        logger.warning(f"Pixabay video failed for scene {scene_num}: {e}")

                # 3. Pexels image fallback
                if not raw_clips:
                    clip_type = "image"
                    try:
                        images = await search_image(search_query, count=2, video_format=video_format)
                        raw_clips = images if isinstance(images, list) else [images]
                        source = "pexels"
                    except Exception as e:
                        logger.warning(f"Pexels image failed for scene {scene_num}: {e}")

                # 4. Pixabay image fallback
                if not raw_clips:
                    try:
                        images = await pixabay_image(search_query, count=2, video_format=video_format)
                        raw_clips = images if isinstance(images, list) else [images]
                        source = "pixabay"
                    except Exception as e:
                        logger.warning(f"Pixabay image failed for scene {scene_num}: {e}")

            assets = [{"type": clip_type, "source": source, "path": url} for url in raw_clips]
            results.append({
                "scene_number":       scene_num,
                "title":              title,
                "estimated_duration": duration,
                "visual_style":       style,
                "vo":                 vo,
                "assets":             assets,
            })

        return {"sections": results}