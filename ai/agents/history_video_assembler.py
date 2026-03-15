"""
History While You Sleep — Video Assembler
Renders a full episode: animated ember banner + narration + fire ambience.
"""
import os, math, random, subprocess, tempfile, shutil, logging
from PIL import Image, ImageDraw, ImageFont, ImageFilter

logger = logging.getLogger(__name__)

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BANNER_PATH = os.path.join(BASE_DIR, "storage", "History_While_You_Sleep_Banner.png")
FIRE_PATH   = os.path.join(BASE_DIR, "storage", "music", "fire_crackling.wav")
FONTS_DIR   = os.path.join(BASE_DIR, "storage", "fonts")
OUT_DIR     = os.path.join(BASE_DIR, "storage", "output", "video")
os.makedirs(OUT_DIR, exist_ok=True)

FIRE_VOLUME = 0.45
INTRO_SOUND = os.path.join(BASE_DIR, "storage", "music", "history_intro_sound.wav")
INTRO_DURATION = 10.0
FPS         = 8   # low fps — static ember background, saves disk space significantly
W, H        = 1920, 1080
RENDER_W, RENDER_H = 960, 540  # render at half res PNG, ffmpeg scales up to 1080p

EMBER_GOLD = (200, 120, 32)
PARCHMENT  = (245, 225, 184)

# Pre-generate ember particle definitions
EMBERS = [
    (
        random.Random(i).randint(0, W),
        random.Random(i+1).randint(0, H),
        random.Random(i+2).randint(2, 5),
        random.Random(i+3).uniform(0.4, 1.4),
        random.Random(i+4).uniform(-0.4, 0.4),
        random.Random(i+5).uniform(0, 6.28),
        random.Random(i+6).uniform(0.4, 1.0),
    )
    for i in range(0, 840, 7)
]

def load_font(name, size):
    for fname in [name, "PlayfairDisplay-Bold.ttf", "Lora-Regular.ttf"]:
        try: return ImageFont.truetype(os.path.join(FONTS_DIR, fname), size)
        except: pass
    return ImageFont.load_default()

def get_audio_duration(path: str) -> float:
    import json
    try:
        r = subprocess.run(
            ["ffprobe","-v","quiet","-print_format","json","-show_streams", path],
            capture_output=True, text=True)
        for s in json.loads(r.stdout).get("streams",[]):
            if s.get("codec_type") == "audio":
                return float(s.get("duration", 0))
    except: pass
    return 0.0

def make_banner_frame(banner_img, frame_num, title_text=""):
    """Render one frame: banner + embers + title overlay."""
    img = banner_img.copy().convert("RGBA")
    iw, ih = img.size

    # Ember layer
    t = frame_num / FPS
    el = Image.new("RGBA", (iw, ih), (0,0,0,0))
    ed = ImageDraw.Draw(el)
    scale_x = iw / W
    scale_y = ih / H
    min_sz = max(3, int(4 * scale_x))  # ensure embers visible after upscale
    for (ox, oy, sz, sp, dr, ph, br) in EMBERS:
        x = int((ox * scale_x + dr * 40 * math.sin(t * 0.6 + ph)) % iw)
        y = int((oy * scale_y - sp * 50 * t) % ih)
        fl = 0.55 + 0.45 * math.sin(t * 7 + ph)
        a  = max(0, min(255, int(150 * br * fl)))
        r2 = int(215 + 40 * br)
        g2 = int(55 + 110 * br * fl)
        esz = max(min_sz, int(sz * scale_x))
        ed.ellipse([x-esz, y-esz, x+esz, y+esz], fill=(r2, g2, 8, a))
    img = Image.alpha_composite(img, el)

    # Title overlay (bottom right where tagline was)
    if title_text:
        draw = ImageDraw.Draw(img)
        # FINAL LOCKED box position — DO NOT CHANGE
        # Left: under W in "While You Sleep" | Right: at S in "Sleep"
        # Top: locked | Bottom: expands down for wrapped text
        box_cx = int(iw * 0.60)
        patch_x1_fixed = int(iw * 0.34)  # locked under W in While
        patch_x2_fixed = int(iw * 0.88)  # locked at S in Sleep
        patch_y1 = int(ih * 0.55)  # top locked
        # patch_y2 calculated after wrapping below
        box_inner_w = patch_x2_fixed - patch_x1_fixed - 20

        # Word-wrap title to fit inside fixed box
        def wrap_title(text, font, max_w):
            words = text.split()
            lines, current = [], ""
            for word in words:
                test = (current + " " + word).strip()
                bb = draw.textbbox((0,0), test, font=font, anchor="mm")
                if bb[2] - bb[0] <= max_w:
                    current = test
                else:
                    if current: lines.append(current)
                    current = word
            if current: lines.append(current)
            return lines

        # Shrink font until lines fit in box height
        ft = None
        title_lines = []
        for font_size in [32, 28, 24, 20, 16]:
            ft = load_font("PlayfairDisplay-Bold.ttf", font_size)
            title_lines = wrap_title(title_text, ft, box_inner_w)
            line_h = int(font_size * 1.4)
            if len(title_lines) <= 2:
                break

        # Dynamic bottom — expands down for wrapped text
        line_h = int(font_size * 1.45)
        total_text_h = len(title_lines) * line_h
        patch_y2 = patch_y1 + total_text_h + 24
        patch = Image.new("RGBA", (patch_x2_fixed - patch_x1_fixed, patch_y2 - patch_y1), (3,1,0,245))
        img.paste(patch, (patch_x1_fixed, patch_y1), patch)
        draw = ImageDraw.Draw(img)

        total_text_h = len(title_lines) * line_h
        text_y = patch_y1 + (patch_y2 - patch_y1 - total_text_h) // 2
        for line in title_lines:
            draw.text((box_cx+1, text_y+1), line, font=ft, fill=(8,4,0,220), anchor="mt")
            draw.text((box_cx, text_y), line, font=ft, fill=(*PARCHMENT, 240), anchor="mt")
            text_y += line_h

    return img.convert("RGB")

def render_history_video(narration_path: str, episode_title: str, output_path: str = None) -> str:
    """
    Render full history episode video.
    narration_path: path to narration WAV/MP3
    episode_title: shown on screen replacing tagline
    output_path: optional custom output path
    """
    if not output_path:
        safe = episode_title.replace(" ", "_").replace("/","_")[:40]
        output_path = os.path.join(OUT_DIR, f"history_{safe}.mp4")

    # Get narration duration
    narr_dur = get_audio_duration(narration_path)
    if narr_dur <= 0:
        raise ValueError(f"Could not read duration from {narration_path}")
    logger.info(f"Narration duration: {narr_dur:.1f}s ({narr_dur/60:.1f} min)")

    # Load banner
    if not os.path.exists(BANNER_PATH):
        raise FileNotFoundError(f"Banner not found: {BANNER_PATH}")
    banner = Image.open(BANNER_PATH).convert("RGBA").resize((RENDER_W, RENDER_H), Image.LANCZOS)

    total_dur = narr_dur + INTRO_DURATION
    total_frames = int(total_dur * FPS)
    tmp_dir = tempfile.mkdtemp(dir="/home/runner/workspace/storage/output")
    logger.info(f"Rendering {total_frames} frames at {FPS}fps...")

    for f in range(total_frames):
        frame = make_banner_frame(banner, f, title_text=episode_title)
        frame.save(os.path.join(tmp_dir, f"frame_{f:06d}.png"))
        if f % (FPS * 60) == 0:
            logger.info(f"  frame {f}/{total_frames} ({f/FPS/60:.1f} min)")

    # Loop fire audio to match narration duration
    fire_looped = os.path.join(tmp_dir, "fire_loop.wav")
    if os.path.exists(FIRE_PATH):
        fire_dur = get_audio_duration(FIRE_PATH)
        loops = math.ceil(narr_dur / fire_dur) + 1
        subprocess.run([
            "ffmpeg", "-y",
            "-stream_loop", str(loops),
            "-i", FIRE_PATH,
            "-t", str(narr_dur),
            "-c", "copy",
            fire_looped
        ], check=True, capture_output=True)
        logger.info(f"Fire audio looped to {narr_dur:.1f}s")
    else:
        fire_looped = None
        logger.warning("Fire audio not found — rendering without ambience")

    # Build FFmpeg command
    # Audio layout:
    # input 0: video frames
    # input 1: narration (delayed by INTRO_DURATION)
    # input 2: fire loop (full duration ambient)
    # input 3: intro sound (plays first 10s at full volume)
    delay_ms = int(INTRO_DURATION * 1000)

    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(FPS),
        "-i", os.path.join(tmp_dir, "frame_%06d.png"),
        "-i", narration_path,
    ]

    if fire_looped and os.path.exists(INTRO_SOUND):
        cmd += ["-i", fire_looped, "-i", INTRO_SOUND]
        cmd += [
            "-filter_complex",
            f"[1:a]adelay={delay_ms}|{delay_ms},volume=1.0[narr];"
            f"[2:a]volume={FIRE_VOLUME}[fire];"
            f"[3:a]volume=2.5[intro];"
            f"[narr][fire][intro]amix=inputs=3:duration=first:dropout_transition=3[afinal]",
            "-map", "0:v",
            "-map", "[afinal]",
        ]
    elif fire_looped:
        cmd += ["-i", fire_looped]
        cmd += [
            "-filter_complex",
            f"[1:a]adelay={delay_ms}|{delay_ms},volume=1.0[narr];"
            f"[2:a]volume={FIRE_VOLUME}[fire];"
            f"[narr][fire]amix=inputs=2:duration=first:dropout_transition=3[afinal]",
            "-map", "0:v",
            "-map", "[afinal]",
        ]
    else:
        cmd += ["-map", "0:v", "-map", "1:a"]

    cmd += [
        "-vf", "scale=1920:1080:flags=lanczos",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        "-shortest",
        output_path,
    ]

    logger.info("Running FFmpeg final render...")
    subprocess.run(cmd, check=True)
    shutil.rmtree(tmp_dir)
    logger.info(f"Done: {output_path}")
    return output_path

if __name__ == "__main__":
    # Quick test with a short dummy audio
    import wave, struct
    test_audio = "/tmp/test_narr.wav"
    with wave.open(test_audio, "w") as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(22050)
        for i in range(22050 * 15):  # 15 seconds
            wf.writeframes(struct.pack("<h", int(1000 * math.sin(i * 0.01))))
    out = render_history_video(test_audio, "The Fall of Rome")
    print(f"Test render: {out}")
