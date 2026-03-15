"""
AI Weekly Buzz — Morse Code Intro Generator
Generates a 5.2-second branded intro video synced to morse audio.
"""
import os, math, subprocess, tempfile, shutil
from PIL import Image, ImageDraw, ImageFont, ImageFilter

BASE_DIR  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONTS_DIR = os.path.join(BASE_DIR, "storage", "fonts")
AUDIO     = os.path.join(BASE_DIR, "storage", "music", "morse_ai_buzz.wav")
OUT_DIR   = os.path.join(BASE_DIR, "storage", "output", "intro")
os.makedirs(OUT_DIR, exist_ok=True)

GOLD   = (245, 196, 0)
PURPLE = (155, 48, 255)
BLACK  = (10, 10, 15)
WHITE  = (255, 255, 255)
W, H   = 1920, 1080
FPS    = 30
TOTAL_FRAMES = int(5.17 * FPS)  # 155 frames

MORSE = {
    'A':'.-','I':'..','W':'.--','E':'.','K':'-.-',
    'L':'.-..','Y':'-.--','B':'-...','U':'..-','Z':'--..', ' ': ' '
}

TEXT = "AI WEEKLY BUZZ"

# Build character reveal timeline
# Total audio ~5.17s, distribute character reveals evenly
# Each character gets roughly equal time
chars = [c for c in TEXT]
total_chars = len([c for c in TEXT if c != ' '])
reveal_times = []  # (frame, char, morse_str)

# Manually tuned timing based on actual morse rhythm
# A=0.3s, I=0.5s, space=0.7s, W=0.9s, E=1.4s, E=1.6s, K=1.8s, L=2.2s, Y=2.6s, space=3.0s, B=3.2s, U=3.6s, Z=3.9s, Z=4.5s
timings = [0.25, 0.55, 0.85, 1.05, 1.35, 1.6, 1.9, 2.25, 2.65, 3.0, 3.25, 3.6, 3.95, 4.4]
t_idx = 0
for ch in TEXT:
    if ch == ' ':
        reveal_times.append((None, ' ', ''))
    else:
        frame = int(timings[t_idx] * FPS)
        reveal_times.append((frame, ch, MORSE.get(ch, '')))
        t_idx += 1

def load_font(name, size):
    path = os.path.join(FONTS_DIR, name)
    try:
        return ImageFont.truetype(path, size)
    except:
        return ImageFont.load_default()

def draw_glow_text(draw, x, y, text, font, color, glow_color, glow_radius=18, anchor="mm"):
    # Draw glow layers
    for r in range(glow_radius, 0, -3):
        a = int(120 * (glow_radius - r + 1) / glow_radius)
        draw.text((x, y), text, font=font, fill=(*glow_color, a), anchor=anchor)
    draw.text((x, y), text, font=font, fill=color, anchor=anchor)

def make_frame(frame_num, revealed_count):
    img  = Image.new("RGBA", (W, H), (*BLACK, 255))
    draw = ImageDraw.Draw(img)

    # Subtle scanlines
    for y in range(0, H, 6):
        draw.line([(0, y), (W, y)], fill=(0, 0, 0, 25))

    # Subtle radial glow in center
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd   = ImageDraw.Draw(glow)
    for i in range(20, 0, -1):
        r = int(400 * i / 20)
        a = int(30 * (20 - i + 1) / 20)
        gd.ellipse([W//2-r, H//2-r, W//2+r, H//2+r], fill=(*PURPLE, a))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=40))
    img  = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img)

    font_morse  = load_font("GeistMono-Bold.ttf", 52)
    font_letter = load_font("BigShoulders-Bold.ttf", 96)
    font_label  = load_font("GeistMono-Regular.ttf", 22)

    # Layout: center the whole thing
    # Calculate total width needed
    char_width  = 90   # px per character slot
    space_width = 45   # px per space
    total_width = 0
    for _, ch, _ in reveal_times:
        total_width += space_width if ch == ' ' else char_width
    
    start_x = (W - total_width) // 2
    cx = start_x

    revealed_so_far = 0
    for i, (fr, ch, morse_str) in enumerate(reveal_times):
        if ch == ' ':
            cx += space_width
            continue

        is_revealed = (fr is not None and frame_num >= fr)
        slot_cx = cx + char_width // 2

        if is_revealed:
            revealed_so_far += 1
            # Bloom effect — bright on reveal frame, settles after
            frames_since = frame_num - fr
            bloom = max(0, 1.0 - frames_since / 8.0)

            # Morse code above
            morse_y = H//2 - 80
            glow_r  = int(12 + bloom * 20)
            draw_glow_text(draw, slot_cx, morse_y, morse_str, font_morse,
                          (*GOLD, 255), PURPLE, glow_radius=glow_r, anchor="mm")

            # Letter below
            letter_y = H//2 + 30
            bright   = tuple(min(255, int(c + bloom * 80)) for c in GOLD)
            draw_glow_text(draw, slot_cx, letter_y, ch, font_letter,
                          bright, PURPLE, glow_radius=int(15 + bloom * 25), anchor="mm")
        else:
            # Dim placeholder
            draw.text((slot_cx, H//2 - 80), "·", font=font_morse,
                     fill=(*GOLD, 25), anchor="mm")

        cx += char_width

    # Gold divider line that grows as letters reveal
    if revealed_so_far > 0:
        progress = revealed_so_far / total_chars
        line_w   = int(total_width * progress)
        line_x   = (W - total_width) // 2
        div_y    = H//2 + 100
        draw.rectangle([line_x, div_y, line_x + line_w, div_y + 3], fill=(*GOLD, 180))

    # Bottom label — fades in at end
    if frame_num > TOTAL_FRAMES - 20:
        alpha = min(255, int(255 * (frame_num - (TOTAL_FRAMES - 20)) / 20))
        draw.text((W//2, H//2 + 150), "AI WEEKLY BUZZ", font=font_label,
                 fill=(*GOLD, alpha), anchor="mm")

    return img.convert("RGB")

def generate_morse_intro():
    tmp_dir = tempfile.mkdtemp()
    print(f"Rendering {TOTAL_FRAMES} frames...")

    revealed = 0
    for f in range(TOTAL_FRAMES):
        # Count how many chars should be revealed at this frame
        rev = sum(1 for fr, ch, _ in reveal_times if fr is not None and f >= fr)
        frame_img = make_frame(f, rev)
        frame_img.save(os.path.join(tmp_dir, f"frame_{f:04d}.png"))
        if f % 30 == 0:
            print(f"  frame {f}/{TOTAL_FRAMES}")

    out_path = os.path.join(OUT_DIR, "morse_intro.mp4")
    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(FPS),
        "-i", os.path.join(tmp_dir, "frame_%04d.png"),
        "-i", AUDIO,
        "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-shortest",
        out_path
    ]
    subprocess.run(cmd, check=True)
    shutil.rmtree(tmp_dir)
    print(f"Done: {out_path}")
    return out_path

if __name__ == "__main__":
    generate_morse_intro()
