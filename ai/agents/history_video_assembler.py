"""
History While You Sleep — Video Assembler
Renders a full episode: static banner loop + narration + fire ambience.

KEY CHANGE: Replaced PIL frame-by-frame rendering with FFmpeg -loop 1 approach.
This drops render time from 30+ minutes to 3-5 minutes and uses ~zero disk space
for frames (was 8-10GB for a 60-min episode).

The ember animation is removed in this version — the banner image is static.
The fire crackling audio and intro swoosh are unchanged.
Title overlay is handled by chapter_title_card.py for chapter transitions.
"""
import os, math, subprocess, tempfile, shutil, logging
from ai.agents.chapter_segment_builder import build_full_chapter_video

logger = logging.getLogger(__name__)

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BANNER_PATH = os.path.join(BASE_DIR, "storage", "Sleeping_History_Dreams_Banner.png")
FIRE_PATH   = os.path.join(BASE_DIR, "storage", "music", "fire_crackling.wav")
FONTS_DIR   = os.path.join(BASE_DIR, "storage", "fonts")
OUT_DIR     = os.path.join(BASE_DIR, "storage", "output", "video")
os.makedirs(OUT_DIR, exist_ok=True)

FIRE_VOLUME    = 0.45
INTRO_SOUND    = os.path.join(BASE_DIR, "storage", "music", "history_intro_sound.wav")
INTRO_DURATION = 10.0


def get_audio_duration(path: str) -> float:
    import json
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", path],
            capture_output=True, text=True)
        for s in json.loads(r.stdout).get("streams", []):
            if s.get("codec_type") == "audio":
                return float(s.get("duration", 0))
    except:
        pass
    return 0.0



def _prepare_banner(episode_title: str) -> str:
    from PIL import Image, ImageDraw, ImageFont
    import tempfile
    img = Image.open(BANNER_PATH).convert('RGB')
    W, H = img.size
    strip_h = 180  # taller strip to cover channel name + episode title
    overlay = Image.new('RGBA', (W, strip_h), (0, 0, 0, 0))
    draw_o = ImageDraw.Draw(overlay)
    for y in range(strip_h):
        alpha = int(220 * (y / strip_h))
        draw_o.line([(0, y), (W, y)], fill=(0, 0, 0, alpha))
    img_rgba = img.convert('RGBA')
    img_rgba.paste(overlay, (0, H - strip_h), overlay)
    img = img_rgba.convert('RGB')
    draw = ImageDraw.Draw(img)
    title = episode_title[:60]
    font = ImageFont.load_default()
    font_path = os.path.join(FONTS_DIR, 'PlayfairDisplay-Bold.ttf')
    # Smaller font sizes — episode title is a subtitle under the channel name
    for size in [42, 36, 32, 28, 24]:
        try:
            candidate = ImageFont.truetype(font_path, size)
            bbox = draw.textbbox((0, 0), title, font=candidate)
            if (bbox[2] - bbox[0]) < int(W * 0.75):
                font = candidate
                break
        except:
            pass
    bbox = draw.textbbox((0, 0), title, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (W - tw) // 2
    ty = int(H * 0.92) - th // 2  # moved lower — sits below channel name
    draw.text((tx + 2, ty + 2), title, font=font, fill=(0, 0, 0))
    draw.text((tx + 1, ty + 1), title, font=font, fill=(0, 0, 0))
    draw.text((tx, ty), title, font=font, fill=(245, 225, 184))
    tmp = tempfile.NamedTemporaryFile(
        suffix='.jpg', delete=False,
        dir=os.path.join(BASE_DIR, 'storage', 'output')
    )
    img.save(tmp.name, 'JPEG', quality=95)
    tmp.close()
    logger.info(f'[assembler] Banner prepared: {tmp.name}')
    return tmp.name

def render_history_video(
    narration_path: str,
    episode_title:  str,
    output_path:    str = None,
    chapters:       list = None,
) -> str:
    """
    Render full history episode video using FFmpeg image loop.

    narration_path : path to full narration WAV/MP3
    episode_title  : episode title (used for output filename)
    output_path    : optional custom output path
    chapters       : list of chapter dicts with 'audio' paths for title cards
                     if audio paths present, builds chapter segments with title cards
                     if no audio paths, renders single banner loop over full narration
    """
    if not output_path:
        safe = episode_title.replace(" ", "_").replace("/", "_")[:40]
        output_path = os.path.join(OUT_DIR, f"history_{safe}.mp4")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # ── Chapter title cards (only if audio paths are wired in) ───────────────
    chapters_with_audio = [c for c in (chapters or []) if c.get("audio")]
    if chapters_with_audio:
        logger.info(f"[assembler] Building {len(chapters_with_audio)} chapter segments with title cards")
        combined_audio = os.path.join(OUT_DIR, f"tmp_chapters_audio_{os.getpid()}.mp3")
        narration_path = build_full_chapter_video(chapters_with_audio, combined_audio)
    else:
        if chapters:
            logger.info("[assembler] Chapters provided but no audio paths — rendering without title cards")

    # ── Get narration duration ────────────────────────────────────────────────
    narr_dur = get_audio_duration(narration_path)
    if narr_dur <= 0:
        raise ValueError(f"Could not read duration from {narration_path}")
    logger.info(f"Narration duration: {narr_dur:.1f}s ({narr_dur/60:.1f} min)")

    if not os.path.exists(BANNER_PATH):
        raise FileNotFoundError(f"Banner not found: {BANNER_PATH}")

    # Prepare banner with episode title strip at bottom
    prepared_banner = _prepare_banner(episode_title)

    total_dur = narr_dur + INTRO_DURATION
    tmp_dir   = tempfile.mkdtemp(dir=os.path.join(BASE_DIR, "storage", "output"))

    try:
        # ── Loop fire audio to match full duration ────────────────────────────
        has_fire = os.path.exists(FIRE_PATH)
        if not has_fire:
            logger.warning("Fire audio not found — rendering without ambience")

        # ── Build FFmpeg command ──────────────────────────────────────────────
        # Video: -loop 1 on banner image, duration = total_dur
        # Audio inputs:
        #   0: video (banner loop)
        #   1: narration (delayed by INTRO_DURATION)
        #   2: fire loop
        #   3: intro swoosh (optional)
        delay_ms = int(INTRO_DURATION * 1000)

        cmd = [
            "ffmpeg", "-y",
            "-loop", "1",
            "-framerate", "8",
            "-i", prepared_banner,
        ]

        # Mix audio: delay narration first, then mix with fire
        # Proven approach: adelay on narration input, then amix
        if has_fire and os.path.exists(INTRO_SOUND):
            cmd += ["-i", narration_path,
                    "-stream_loop", "-1", "-i", FIRE_PATH,
                    "-i", INTRO_SOUND]
            audio_filter = (
                f"[1:a]adelay={delay_ms}|{delay_ms},volume=1.0[narr];"
                f"[2:a]volume={FIRE_VOLUME}[fire];"
                f"[3:a]volume=2.5[intro];"
                f"[narr][fire][intro]amix=inputs=3:normalize=0[afinal]"
            )
            cmd += [
                "-filter_complex", audio_filter,
                "-map", "0:v",
                "-map", "[afinal]",
            ]
        elif has_fire:
            cmd += ["-i", narration_path,
                    "-stream_loop", "-1", "-i", FIRE_PATH]
            audio_filter = (
                f"[1:a]adelay={delay_ms}|{delay_ms},volume=1.0[narr];"
                f"[2:a]volume={FIRE_VOLUME}[fire];"
                f"[narr][fire]amix=inputs=2:normalize=0[afinal]"
            )
            cmd += [
                "-filter_complex", audio_filter,
                "-map", "0:v",
                "-map", "[afinal]",
            ]
        else:
            cmd += ["-i", narration_path]
            cmd += [
                "-map", "0:v",
                "-map", "1:a",
            ]

        cmd += [
            "-vf", "scale=1920:1080:flags=lanczos",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            "-t", str(total_dur),
            output_path,
        ]

        logger.info("Running FFmpeg render (image loop — no frame pre-rendering)...")
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg failed:\n{result.stderr[-2000:]}")

        logger.info(f"Done: {output_path}")
        return output_path

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    import wave, struct
    test_audio = "/tmp/test_narr.wav"
    with wave.open(test_audio, "w") as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(22050)
        for i in range(22050 * 15):
            wf.writeframes(struct.pack("<h", int(1000 * math.sin(i * 0.01))))
    out = render_history_video(test_audio, "The Fall of Rome")
    print(f"Test render: {out}")