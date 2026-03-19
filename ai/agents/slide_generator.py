"""
AI Weekly Buzz — Slide Generator
Generates one branded slide per scene for news-style videos.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, os, uuid

BASE_DIR  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONTS_DIR = os.path.join(BASE_DIR, "storage", "fonts")
LOGO_PATH = os.path.join(BASE_DIR, "storage", "AI_Weekly_Buzz_Logo.png")
OUT_DIR   = os.path.join(BASE_DIR, "storage", "output", "slides")
os.makedirs(OUT_DIR, exist_ok=True)

BLACK       = (10, 10, 15)
GOLD        = (245, 196, 0)
PURPLE      = (155, 48, 255)
PURPLE_DIM  = (80, 20, 140)
DARK_PURPLE = (20, 10, 40)
WHITE       = (255, 255, 255)
W, H        = 1920, 1080
SHORTS_W, SHORTS_H = 1080, 1920

def load_font(name, size):
    path = os.path.join(FONTS_DIR, name)
    try:
        return ImageFont.truetype(path, size)
    except:
        return ImageFont.load_default()

def draw_honeycomb(draw, w, h, alpha=14):
    hex_size = 55
    hex_h    = int(hex_size * math.sqrt(3))
    hex_w    = hex_size * 2
    for row in range(-1, h // hex_h + 3):
        for col in range(-1, w // hex_w + 3):
            cx = col * hex_w + (hex_w // 2 if row % 2 else 0)
            cy = row * hex_h
            pts = [(cx + hex_size * math.cos(math.pi / 180 * (60 * i - 30)),
                    cy + hex_size * math.sin(math.pi / 180 * (60 * i - 30))) for i in range(6)]
            draw.polygon(pts, outline=(*GOLD, alpha))

def draw_scan_lines(draw, w, h):
    for y in range(0, h, 4):
        draw.line([(0, y), (w, y)], fill=(0, 0, 0, 15))

def wrap_text(draw, text, font, max_width):
    words, lines, current = text.split(), [], ""
    for word in words:
        test = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines

def make_base(w, h):
    img  = Image.new("RGBA", (w, h), (*BLACK, 255))
    draw = ImageDraw.Draw(img)
    for x in range(w):
        t   = x / w
        col = tuple(int(BLACK[i] + (DARK_PURPLE[i] - BLACK[i]) * t) for i in range(3))
        draw.line([(x, 0), (x, h)], fill=(*col, 255))
    draw_honeycomb(draw, w, h)
    return img

def paste_ghost_logo(img, w, h, opacity=0.52):
    try:
        logo      = Image.open(LOGO_PATH).convert("RGBA")
        logo_size = int(min(w, h) * 0.58)
        logo      = logo.resize((logo_size, logo_size), Image.LANCZOS)
        glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
        gd   = ImageDraw.Draw(glow)
        cx, cy = w // 2, h // 2
        for i in range(15, 0, -1):
            r = int(logo_size * 0.65 * i / 15)
            a = int(60 * (15 - i + 1) / 15)
            gd.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(*PURPLE, a))
        for i in range(10, 0, -1):
            r = int(logo_size * 0.35 * i / 10)
            a = int(40 * (10 - i + 1) / 10)
            gd.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(*GOLD, a))
        glow = glow.filter(ImageFilter.GaussianBlur(radius=50))
        img  = Image.alpha_composite(img, glow)
        r2, g2, b2, a2 = logo.split()
        a2 = a2.point(lambda x: int(x * opacity))
        logo.putalpha(a2)
        lx = (w - logo_size) // 2
        ly = (h - logo_size) // 2
        img.paste(logo, (lx, ly), logo)
    except Exception as e:
        pass
    return img

def generate_slide(scene_number=1, total_scenes=7, scene_title="Scene Title",
                   pull_quote="", source_url="", tag="AI NEWS",
                   episode=1, week="March 8, 2026", video_format="youtube"):
    is_shorts = video_format == "shorts"
    w = SHORTS_W if is_shorts else W
    h = SHORTS_H if is_shorts else H

    img  = make_base(w, h)
    img  = paste_ghost_logo(img, w, h)
    draw = ImageDraw.Draw(img)

    draw.rectangle([0, 0, w, 8],   fill=GOLD)
    draw.rectangle([0, h-8, w, h], fill=GOLD)
    draw.rectangle([0, 0, 12, h],  fill=GOLD)
    draw.rectangle([w-12, 0, w, h], fill=GOLD)

    font_channel = load_font("GeistMono-Bold.ttf", 22)
    draw.text((25, 18), "AI WEEKLY BUZZ", font=font_channel, fill=(*GOLD, 220))

    font_meta = load_font("GeistMono-Regular.ttf", 20)
    meta = f"EP {episode:02d}  ·  WEEK OF {week.upper()}"
    mb   = draw.textbbox((0,0), meta, font=font_meta)
    draw.text((w - (mb[2]-mb[0]) - 25, 18), meta, font=font_meta, fill=(*WHITE, 110))

    dot_y, dot_r, dot_gap = 55, 5, 20
    dot_start = (w - total_scenes * dot_gap) // 2
    for i in range(total_scenes):
        cx   = dot_start + i * dot_gap
        fill = GOLD if i + 1 == scene_number else (*WHITE, 35)
        draw.ellipse([cx-dot_r, dot_y-dot_r, cx+dot_r, dot_y+dot_r], fill=fill)

    font_tag = load_font("GeistMono-Bold.ttf", 24)
    tb       = draw.textbbox((0,0), tag, font=font_tag)
    tag_w    = tb[2] - tb[0] + 24
    draw.rectangle([20, 82, 20 + tag_w, 122], fill=(*PURPLE, 210))
    draw.text((32, 91), tag, font=font_tag, fill=WHITE)

    font_title  = load_font("BigShoulders-Bold.ttf", 96 if not is_shorts else 72)
    title_lines = wrap_text(draw, scene_title.upper(), font_title, w - 120)
    title_y     = 150 if not is_shorts else 220
    for line in title_lines[:2]:
        draw.text((w//2 + 2, title_y + 3), line, font=font_title, fill=(*PURPLE_DIM, 180), anchor="mm")
        draw.text((w//2,     title_y),     line, font=font_title, fill=WHITE,               anchor="mm")
        title_y += 105

    div_y = title_y + 12
    draw.rectangle([(w//2 - 280, div_y), (w//2 + 280, div_y + 4)], fill=GOLD)

    if pull_quote:
        font_quote  = load_font("DMMono-Regular.ttf", 36 if not is_shorts else 30)
        quote_lines = wrap_text(draw, pull_quote, font_quote, w - 400)
        total_quote_h = min(len(quote_lines), 3) * 52
        quote_y = h - 120 - total_quote_h
        for line in quote_lines[:3]:
            draw.text((w//2, quote_y), line, font=font_quote, fill=(*GOLD, 210), anchor="mm")
            quote_y += 52

    if source_url:
        font_source = load_font("GeistMono-Regular.ttf", 20)
        draw.text((25, h - 42), f"SOURCE: {source_url}", font=font_source, fill=(*GOLD, 130))

    draw_scan_lines(draw, w, h)

    path = os.path.join(OUT_DIR, f"slide_{uuid.uuid4().hex[:8]}.png")
    img.convert("RGB").save(path, quality=95)
    return path

def generate_slides_for_script(scenes, episode=1, week="March 8, 2026", video_format="youtube"):
    total = len(scenes)
    paths = []
    for scene in scenes:
        raw_title = scene.get("title", "")
        if raw_title.lower() in ["hook", "intro", "opening", "morse intro"]:
            scene_title = "THIS WEEK IN AI"
        elif raw_title.lower() in ["outro", "closing", "wrap up", "wrap-up", "call to action"]:
            scene_title = "THAT'S YOUR SIGNAL"
        elif raw_title.lower() in ["bridge", "transition"]:
            scene_title = "AND ANOTHER THING..."
        elif raw_title.lower() in ["quick hits", "quick hit", "rapid fire"]:
            scene_title = "QUICK HITS"
        elif "story of the week" in raw_title.lower():
            scene_title = raw_title.replace("Story of the Week — ", "").replace("Story of the Week: ", "").upper()
        elif raw_title.lower().startswith("story one") or raw_title.lower().startswith("story two") or raw_title.lower().startswith("story three"):
            # Extract just the headline after the dash
            parts = raw_title.split("—")
            scene_title = parts[1].strip() if len(parts) > 1 else raw_title
        else:
            scene_title = raw_title
        path = generate_slide(
            scene_number = scene.get("sceneNumber", 1),
            total_scenes = total,
            scene_title  = scene_title,
            pull_quote   = scene.get("voText", "")[:200],
            source_url   = scene.get("source", ""),
            tag          = _infer_tag(scene.get("title", "")),
            episode      = episode,
            week         = week,
            video_format = video_format,
        )
        paths.append(path)
    return paths

def _infer_tag(title):
    t = title.lower()
    if any(w in t for w in ["openai","google","meta","apple","microsoft","oracle","amazon"]): return "CORPORATE AI"
    if any(w in t for w in ["law","regul","govern","eu ","act","ban","policy"]): return "AI REGULATION"
    if any(w in t for w in ["model","gpt","gemini","claude","llm","release","launch"]): return "NEW MODELS"
    if any(w in t for w in ["robot","hardware","chip","nvidia","compute"]): return "AI HARDWARE"
    if any(w in t for w in ["job","work","employ","automat"]): return "FUTURE OF WORK"
    if any(w in t for w in ["intro","welcome","hook","opening","morse"]): return "THIS WEEK"
    if any(w in t for w in ["quick hit","rapid","also this"]): return "QUICK HITS"
    if "story of the week" in t: return "STORY OF THE WEEK"
    return "AI NEWS"
