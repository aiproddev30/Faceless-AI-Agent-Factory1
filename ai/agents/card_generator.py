"""
AI Weekly Buzz — Card Generator (integrated)
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
import math, os

BASE_DIR  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONTS_DIR = os.path.join(BASE_DIR, "storage", "fonts")
LOGO_PATH = os.path.join(BASE_DIR, "storage", "AI_Weekly_Buzz_Logo.png")
OUT_DIR   = os.path.join(BASE_DIR, "storage", "output", "cards")
os.makedirs(OUT_DIR, exist_ok=True)

BLACK       = (10, 10, 15)
GOLD        = (245, 196, 0)
PURPLE      = (155, 48, 255)
PURPLE_DIM  = (80, 20, 140)
DARK_PURPLE = (20, 10, 40)
WHITE       = (255, 255, 255)
W, H        = 1920, 1080

def load_font(name, size):
    path = os.path.join(FONTS_DIR, name)
    try:
        return ImageFont.truetype(path, size)
    except:
        return ImageFont.load_default()

def draw_glow_layer(draw, cx, cy, radius, color, alpha, steps=10):
    for i in range(steps, 0, -1):
        r = int(radius * i / steps)
        a = int(alpha * (steps - i + 1) / steps)
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(*color, a))

def add_logo_glow(base, lx, ly, size):
    glow = Image.new("RGBA", base.size, (0,0,0,0))
    gd   = ImageDraw.Draw(glow)
    cx, cy = lx + size//2, ly + size//2
    draw_glow_layer(gd, cx, cy, int(size*1.1), PURPLE, 90, steps=15)
    draw_glow_layer(gd, cx, cy, int(size*0.6), GOLD,   70, steps=10)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=40))
    return Image.alpha_composite(base, glow)

def draw_honeycomb(draw, w, h, alpha=22):
    hex_size = 55
    hex_h    = int(hex_size * math.sqrt(3))
    hex_w    = hex_size * 2
    for row in range(-1, h // hex_h + 3):
        for col in range(-1, w // hex_w + 3):
            cx = col * hex_w + (hex_w//2 if row % 2 else 0)
            cy = row * hex_h
            pts = [(cx + hex_size * math.cos(math.pi/180*(60*i-30)),
                    cy + hex_size * math.sin(math.pi/180*(60*i-30))) for i in range(6)]
            draw.polygon(pts, outline=(*GOLD, alpha))

def draw_scan_lines(draw, w, h):
    for y in range(0, h, 4):
        draw.line([(0, y), (w, y)], fill=(0, 0, 0, 18))

def make_base():
    img  = Image.new("RGBA", (W, H), (*BLACK, 255))
    draw = ImageDraw.Draw(img)
    for x in range(W):
        t   = x / W
        col = tuple(int(BLACK[i] + (DARK_PURPLE[i] - BLACK[i]) * t) for i in range(3))
        draw.line([(x, 0), (x, H)], fill=(*col, 255))
    draw_honeycomb(draw, W, H)
    return img

def paste_logo(img, lx, ly, size):
    logo = Image.open(LOGO_PATH).convert("RGBA")
    logo = logo.resize((size, size), Image.LANCZOS)
    logo = ImageEnhance.Brightness(logo).enhance(1.15)
    img  = add_logo_glow(img, lx, ly, size)
    img.paste(logo, (lx, ly), logo)
    return img

def draw_common_left(img, episode):
    logo_size = 620
    lx = 80
    ly = (H - logo_size) // 2
    img  = paste_logo(img, lx, ly, logo_size)
    draw = ImageDraw.Draw(img)
    for i in range(8):
        off = i * 40
        draw.line([(W-500+off, 0), (W+off, 500)], fill=(*PURPLE, 25), width=2)
    div_x = lx + logo_size + 60
    draw.rectangle([div_x, 80, div_x+3, H-80], fill=(*GOLD, 180))
    return img, draw, div_x

def make_intro(episode=1, week="March 8, 2026"):
    img  = make_base()
    img, draw, div_x = draw_common_left(img, episode)
    text_x = div_x + 70
    font_ep   = load_font("GeistMono-Bold.ttf", 30)
    font_big  = load_font("BigShoulders-Bold.ttf", 130)
    font_buzz = load_font("BigShoulders-Bold.ttf", 160)
    font_tag  = load_font("DMMono-Regular.ttf", 26)
    font_date = load_font("GeistMono-Regular.ttf", 30)
    draw.text((text_x, 200), f"— EPISODE {episode:02d} —", font=font_ep, fill=(*PURPLE, 220))
    draw.text((text_x-4, 244), "AI WEEKLY", font=font_big, fill=(*PURPLE_DIM, 180))
    draw.text((text_x,   240), "AI WEEKLY", font=font_big, fill=WHITE)
    draw.text((text_x-4, 374), "BUZZ",      font=font_buzz, fill=(*PURPLE_DIM, 180))
    draw.text((text_x,   370), "BUZZ",      font=font_buzz, fill=GOLD)
    draw.rectangle([text_x, 545, text_x+520, 549], fill=GOLD)
    draw.text((text_x, 568), "ONE WEEK · ONE SIGNAL · ALL THE AI THAT MATTERS", font=font_tag, fill=(*WHITE, 140))
    draw.text((text_x, 630), f"WEEK OF {week.upper()}", font=font_date, fill=(*GOLD, 200))
    draw.rectangle([0, 0, W, 6], fill=GOLD)
    draw.rectangle([0, H-8, W, H], fill=GOLD)
    draw_scan_lines(draw, W, H)
    path = os.path.join(OUT_DIR, f"aiwb_intro_ep{episode:02d}.png")
    img.convert("RGB").save(path, quality=97)
    return path

def make_outro(episode=1, week="March 8, 2026"):
    img  = make_base()
    img, draw, div_x = draw_common_left(img, episode)
    text_x = div_x + 70
    font_ep    = load_font("GeistMono-Bold.ttf", 30)
    font_big   = load_font("BigShoulders-Bold.ttf", 130)
    font_buzz  = load_font("BigShoulders-Bold.ttf", 160)
    font_date  = load_font("GeistMono-Regular.ttf", 30)
    font_cta   = load_font("BigShoulders-Bold.ttf", 72)
    font_small = load_font("DMMono-Regular.ttf", 22)
    draw.text((text_x, 200), f"— EPISODE {episode:02d} —", font=font_ep, fill=(*PURPLE, 220))
    draw.text((text_x-4, 244), "AI WEEKLY", font=font_big, fill=(*PURPLE_DIM, 180))
    draw.text((text_x,   240), "AI WEEKLY", font=font_big, fill=WHITE)
    draw.text((text_x-4, 374), "BUZZ",      font=font_buzz, fill=(*PURPLE_DIM, 180))
    draw.text((text_x,   370), "BUZZ",      font=font_buzz, fill=GOLD)
    draw.rectangle([text_x, 545, text_x+520, 549], fill=GOLD)
    draw.text((text_x, 568), f"WEEK OF {week.upper()}", font=font_date, fill=(*GOLD, 200))
    cta_y = 622
    draw.text((text_x-3, cta_y+3), "LIKE", font=font_cta, fill=(*PURPLE_DIM, 180))
    draw.text((text_x,   cta_y),   "LIKE", font=font_cta, fill=GOLD)
    like_w = draw.textbbox((0,0), "LIKE", font=font_cta)[2]
    dot1_x = text_x + like_w + 18
    draw.text((dot1_x, cta_y), "·", font=font_cta, fill=(*WHITE, 120))
    sub_x = dot1_x + 36
    draw.text((sub_x-3, cta_y+3), "SUBSCRIBE", font=font_cta, fill=(*PURPLE_DIM, 180))
    draw.text((sub_x,   cta_y),   "SUBSCRIBE", font=font_cta, fill=WHITE)
    sub_w  = draw.textbbox((0,0), "SUBSCRIBE", font=font_cta)[2]
    dot2_x = sub_x + sub_w + 18
    draw.text((dot2_x, cta_y), "·", font=font_cta, fill=(*WHITE, 120))
    share_x = dot2_x + 36
    draw.text((share_x-3, cta_y+3), "SHARE", font=font_cta, fill=(*PURPLE_DIM, 180))
    draw.text((share_x,   cta_y),   "SHARE",   font=font_cta, fill=PURPLE)
    draw.text((text_x-3, cta_y+78), "COMMENT", font=font_cta, fill=(*PURPLE_DIM, 180))
    draw.text((text_x,   cta_y+75), "COMMENT", font=font_cta, fill=WHITE)
    draw.text((text_x, H-55), "NEW EPISODES EVERY WEEK  ·  PRODUCED ENTIRELY BY AI", font=font_small, fill=(*WHITE, 80))
    draw.rectangle([0, 0, W, 6], fill=GOLD)
    draw.rectangle([0, H-8, W, H], fill=GOLD)
    draw_scan_lines(draw, W, H)
    path = os.path.join(OUT_DIR, f"aiwb_outro_ep{episode:02d}.png")
    img.convert("RGB").save(path, quality=97)
    return path

def generate_cards(episode=1, week="March 8, 2026"):
    intro_path = make_intro(episode=episode, week=week)
    outro_path = make_outro(episode=episode, week=week)
    return {
        "intro_path": os.path.relpath(intro_path, BASE_DIR),
        "outro_path": os.path.relpath(outro_path, BASE_DIR),
    }
