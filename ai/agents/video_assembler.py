import os
import uuid
import subprocess
from ai.agents.base_agent import BaseAgent
from ai.utils.timeline_builder import TimelineBuilder
from ai.utils.logger import logger

def _get_audio_duration(path: str) -> float:
    import subprocess, json
    try:
        result = subprocess.run([
            'ffprobe', '-v', 'quiet', '-print_format', 'json',
            '-show_streams', path
        ], capture_output=True, text=True)
        data = json.loads(result.stdout)
        for stream in data.get('streams', []):
            if stream.get('codec_type') == 'audio':
                return float(stream.get('duration', 0))
    except Exception:
        pass
    return 0.0

OUTPUT_DIR   = "storage/output/video"
MUSIC_DIR    = "storage/music"
MUSIC_VOLUME = 0.15

os.makedirs(OUTPUT_DIR, exist_ok=True)


class VideoAssemblerAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="VideoAssemblerAgent")
    """
    Assembles the final video from downloaded clips + audio.
    Subtitles are NOT burned in here — use the Polish step to add
    styled subtitles via post_processor.py.
    """

    async def _run(self, data: dict) -> dict:
        audio_path = data["audio_path"]
        morse_path = data.get("morse_intro_path")

        # Inject morse asset into scene 1 BEFORE building timeline
        if morse_path and os.path.exists(morse_path):
            sections = data.get("sections", [])
            if sections and "[MORSE_INTRO]" in (sections[0].get("vo") or ""):
                sections[0]["assets"] = [{"type": "video", "source": "morse", "path": morse_path}]
                sections[0]["estimated_duration"] = 5.17
                data["sections"] = sections
                logger.info("Injected morse intro into scene 1 before timeline build")

        # ── 1. Build timeline ──────────────────────────────────────
        data     = TimelineBuilder().build(data)
        clips    = data["timeline_clips"]
        filter_s = data["filter_script"]

        # Extend last clip to match audio duration
        audio_dur = _get_audio_duration(audio_path)
        if audio_dur > 0:
            video_dur = sum(c["duration"] for c in clips)
            if audio_dur > video_dur:
                extra = audio_dur - video_dur
                clips[-1]["duration"] = round(clips[-1]["duration"] + extra, 2)
                logger.info(f"Extended last clip by {extra:.1f}s to match audio ({audio_dur:.1f}s)")
                data["timeline_clips"] = clips
        if not clips:
            raise RuntimeError("No clips in timeline — cannot assemble video.")

        # ── 2. Find background music ───────────────────────────────
        music_path = self._find_music()

        # ── 3. Build + run FFmpeg ──────────────────────────────────
        output_path = os.path.join(OUTPUT_DIR, f"video_{uuid.uuid4().hex[:8]}.mp4")
        morse_delay = 5.17 if data.get("morse_intro_path") and os.path.exists(data.get("morse_intro_path","")) else 0.0
        cmd = self._build_command(clips, audio_path, music_path, filter_s, output_path, morse_delay=morse_delay)

        logger.info(f"FFmpeg rendering {len(clips)} clips → {output_path}")
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            logger.error(f"FFmpeg stderr:\n{result.stderr[-1500:]}")
            raise RuntimeError("FFmpeg failed. Check logs for details.")

        logger.info(f"Video complete: {output_path}")
        data["final_video"] = output_path
        return data

    # ── MUSIC FINDER ───────────────────────────────────────────────
    def _find_music(self) -> str | None:
        if not os.path.isdir(MUSIC_DIR):
            return None
        for fname in os.listdir(MUSIC_DIR):
            if fname.lower().endswith((".mp3", ".m4a", ".wav")):
                path = os.path.join(MUSIC_DIR, fname)
                logger.info(f"Background music: {fname}")
                return path
        logger.info("No background music found — rendering without.")
        return None

    # ── FFMPEG COMMAND BUILDER ─────────────────────────────────────
    def _build_command(
        self,
        clips:    list,
        audio:    str,
        music:    str | None,
        filter_s: str,
        output:   str,
        morse_delay: float = 0.0,
    ) -> list:
        n   = len(clips)
        cmd = ["ffmpeg", "-y"]

        for clip in clips:
            if clip["type"] == "image":
                cmd += ["-loop", "1", "-t", str(clip["duration"]), "-i", clip["path"]]
            else:
                cmd += ["-stream_loop", "-1", "-t", str(clip["duration"]), "-i", clip["path"]]

        # Narration audio
        cmd       += ["-i", audio]
        narr_idx   = n

        # Music (optional)
        if music:
            cmd      += ["-i", music]
            music_idx = n + 1

        # Video filter — no subtitles, just the crossfade chain
        full_filter = filter_s + "; [vout]copy[vfinal]"

        delay_ms = int(morse_delay * 1000)
        if music:
            if delay_ms > 0:
                narr_filter = f"[{narr_idx}:a]adelay={delay_ms}|{delay_ms},volume=1.0[narr]"
            else:
                narr_filter = f"[{narr_idx}:a]volume=1.0[narr]"
            audio_filter = (
                f"{narr_filter};"
                f"[{music_idx}:a]volume={MUSIC_VOLUME}[music];"
                f"[narr][music]amix=inputs=2:duration=first:"
                f"dropout_transition=2[afinal]"
            )
            full_filter = filter_s + "; [vout]copy[vfinal]; " + audio_filter
            audio_map   = "[afinal]"
        else:
            if delay_ms > 0:
                audio_filter = f"[{narr_idx}:a]adelay={delay_ms}|{delay_ms}[afinal]"
                full_filter = filter_s + "; [vout]copy[vfinal]; " + audio_filter
                audio_map = "[afinal]"
            else:
                full_filter = filter_s + "; [vout]copy[vfinal]"
                audio_map   = f"{narr_idx}:a"

        cmd += ["-filter_complex", full_filter]
        cmd += [
            "-map", "[vfinal]",
            "-map", audio_map,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            output,
        ]

        return cmd