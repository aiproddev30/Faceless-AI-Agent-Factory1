import os
import json
from ai.utils.logger import logger

OUTPUT_DIR      = "storage/output"
TRANSITION_SECS = 0.5   # crossfade length between scenes in seconds
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Resolution presets
FORMATS = {
    "youtube": {"w": 1920, "h": 1080},  # 16:9 landscape
    "shorts":  {"w": 1080, "h": 1920},  # 9:16 portrait
}


class TimelineBuilder:
    """
    Converts your scenes + downloaded media into a timed clip list
    and an FFmpeg filter string that creates crossfade transitions
    and Ken Burns zoom effects on images.

    You don't call this directly — VideoAssemblerAgent uses it.
    """

    def build(self, data: dict) -> dict:
        sections    = data["sections"]
        fmt         = data.get("video_format", "youtube")
        resolution  = FORMATS.get(fmt, FORMATS["youtube"])
        W, H        = resolution["w"], resolution["h"]

        clips = self._expand_clips(sections)
        if not clips:
            raise RuntimeError("No media clips found — cannot build timeline.")

        filter_script = self._build_filter(clips, W, H)

        # Save for debugging — check storage/output/timeline.json after a run
        timeline_path = os.path.join(OUTPUT_DIR, "timeline.json")
        with open(timeline_path, "w") as f:
            json.dump({
                "clip_count":     len(clips),
                "total_duration": round(sum(c["duration"] for c in clips), 1),
                "format":         fmt,
                "resolution":     f"{W}x{H}",
                "clips":          clips,
            }, f, indent=2)

        logger.info(
            f"Timeline built: {len(clips)} clips, "
            f"{sum(c['duration'] for c in clips):.1f}s total, "
            f"{W}x{H} ({fmt})"
        )

        data["timeline_clips"] = clips
        data["filter_script"]  = filter_script
        data["timeline_path"]  = timeline_path
        return data

    def _expand_clips(self, sections: list) -> list:
        """
        Each scene may have 1-2 assets (video clips or images).
        This splits the scene's duration evenly across its assets
        so visuals rotate within the scene.
        """
        clips = []
        for section in sections:
            scene_dur    = float(section.get("estimated_duration", 10.0))
            assets       = section.get("assets", [])
            visual_style = section.get("visual_style", "cinematic")

            # Backward compat: old pipeline stored single media_path
            if not assets and section.get("media_path"):
                assets = [{"type": "video", "source": "legacy",
                           "path": section["media_path"]}]
            if not assets:
                logger.warning(f"Scene {section.get('scene_number','?')}: no assets, skipping")
                continue

            n        = len(assets)
            base_dur = scene_dur / n

            for i, asset in enumerate(assets):
                dur = (scene_dur - base_dur * (n - 1)) if i == n - 1 else base_dur
                clips.append({
                    "scene_number": section.get("scene_number", 0),
                    "scene_title":  section.get("title", ""),
                    "asset_index":  i,
                    "type":         asset["type"],
                    "path":         asset["path"],
                    "duration":     round(dur, 2),
                    "visual_style": visual_style,
                    "vo_text": section.get("vo", "") if i == 0 else "",
                })

        return clips

    def _build_filter(self, clips: list, W: int, H: int) -> str:
        """
        Builds the FFmpeg filter_complex string:
        - All clips: scale + crop to target resolution (W x H)
        - All clips: chained crossfade transitions
        """
        n     = len(clips)
        parts = []

        for i, clip in enumerate(clips):
            parts.append(
                f"[{i}:v]scale={W}:{H}:"
                f"force_original_aspect_ratio=increase,"
                f"crop={W}:{H},fps=30,settb=1/30[v{i}]"
            )

        # Chain crossfades between all clips
        if n == 1:
            parts.append("[v0]copy[vout]")
        else:
            offset = round(clips[0]["duration"] - TRANSITION_SECS, 3)
            parts.append(
                f"[v0][v1]xfade=transition=fade:"
                f"duration={TRANSITION_SECS}:offset={offset}[xf1]"
            )
            cumulative = clips[0]["duration"]
            for i in range(2, n):
                cumulative += clips[i - 1]["duration"] - TRANSITION_SECS
                offset      = round(cumulative - TRANSITION_SECS, 3)
                prev        = f"xf{i-1}"
                out         = "vout" if i == n - 1 else f"xf{i}"
                parts.append(
                    f"[{prev}][v{i}]xfade=transition=fade:"
                    f"duration={TRANSITION_SECS}:offset={offset}[{out}]"
                )

        return "; ".join(parts)