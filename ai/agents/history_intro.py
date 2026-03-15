"""
History While You Sleep — Branded Intro Generator
"""
import os, math, random, subprocess, tempfile, shutil
from PIL import Image, ImageDraw, ImageFont, ImageFilter

BASE_DIR  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONTS_DIR = os.path.join(BASE_DIR, "storage", "fonts")
LOGO_PATH = os.path.join(BASE_DIR, "storage", "History_While_You_Sleep_Logo.png")
AUDIO     = os.path.join(BASE_DIR, "storage", "music", "fire_crackling.wav")
OUT_DIR   = os.path.join(BASE_DIR, "storage", "output", "intro")
os.makedirs(OUT_DIR, exist_ok=True)

CHARCOAL   = (14, 10, 6)
EMBER_GOLD = (200, 120, 32)
PARCHMENT  = (245, 225, 184)
W, H       = 1920, 1080
FPS        = 30
DURATION   = 10.0
TOTAL_FRAMES = int(DURATION * FPS)
T_LOGO_START = 0.5; T_LOGO_FULL = 2.5
T_TITLE_START = 3.0; T_TITLE_FULL = 4.5
T_TAG_START = 5.2; T_TAG_FULL = 6.5
T_HOLD = 8.5; T_END = 10.0

def load_font(name, size):
    for fname in [name, "PlayfairDisplay-Bold.ttf", "BigShoulders-Bold.ttf"]:
        try: return ImageFont.truetype(os.path.join(FONTS_DIR, fname), size)
        except: pass
    return ImageFont.load_default()

def ease(t): return t * t * (3 - 2 * t)

def get_alpha(frame, t0, t1, tf=None, te=None):
    t = frame / FPS
    if t < t0: return 0
    elif t < t1: return int(255 * ease(min(1.0, (t-t0)/(t1-t0))))
    elif tf and t >= tf and te: return int(255 * (1.0 - ease(min(1.0, (t-tf)/(te-tf)))))
    else: return 255

EMBERS = [(random.Random(i).randint(0,1920), random.Random(i+1).randint(0,1080),
           random.Random(i+2).randint(2,6), random.Random(i+3).uniform(0.3,1.2),
           random.Random(i+4).uniform(-0.3,0.3), random.Random(i+5).uniform(0,6.28),
           random.Random(i+6).uniform(0.5,1.0)) for i in range(0,840,7)]

def draw_embers(draw, frame, af=1.0):
    t = frame / FPS
    for (ox,oy,sz,sp,dr,ph,br) in EMBERS:
        x = int((ox + dr*30*math.sin(t*0.8+ph)) % 1920)
        y = int((oy - sp*60*t) % 1080)
        fl = 0.6 + 0.4*math.sin(t*8+ph)
        a = max(0, min(255, int(180*br*fl*af)))
        r2 = int(220+35*br); g2 = int(80+100*br*fl)
        draw.ellipse([x-sz,y-sz,x+sz,y+sz], fill=(r2,g2,10,a))

def make_frame(frame_num, logo_img):
    img = Image.new("RGBA", (W,H), (*CHARCOAL,255))
    glow = Image.new("RGBA", (W,H), (0,0,0,0))
    gd = ImageDraw.Draw(glow)
    la = get_alpha(frame_num, T_LOGO_START, T_LOGO_FULL, T_HOLD, T_END)
    if la > 0:
        for i in range(15,0,-1):
            r = int(350*i/15); a = int(40*(la/255)*(15-i+1)/15)
            gd.ellipse([W//2-r,H//2-60-r,W//2+r,H//2-60+r], fill=(*EMBER_GOLD,a))
    from PIL import ImageFilter
    glow = glow.filter(ImageFilter.GaussianBlur(radius=60))
    img = Image.alpha_composite(img, glow)
    el = Image.new("RGBA", (W,H), (0,0,0,0))
    ed = ImageDraw.Draw(el)
    ea = min(1.0, max(0.0, (frame_num/FPS - T_LOGO_START)/2.0))
    draw_embers(ed, frame_num, af=ea)
    img = Image.alpha_composite(img, el)
    draw = ImageDraw.Draw(img)
    if la > 0 and logo_img:
        sz = 480
        lr = logo_img.resize((sz,sz), Image.LANCZOS).convert("RGBA")
        r2,g2,b2,a2 = lr.split()
        a2 = a2.point(lambda x: int(x*la/255))
        lr.putalpha(a2)
        img.paste(lr, (W//2-sz//2, H//2-60-sz//2), lr)
        draw = ImageDraw.Draw(img)
    ta = get_alpha(frame_num, T_TITLE_START, T_TITLE_FULL, T_HOLD, T_END)
    if ta > 0:
        ft = load_font("PlayfairDisplay-Bold.ttf", 108)
        ty = H//2 + 310
        for r in range(16,0,-4):
            a = int(50*(ta/255)*(16-r+1)/16)
            draw.text((W//2,ty-8), "HISTORY WHILE YOU SLEEP", font=ft, fill=(*EMBER_GOLD,a), anchor="mm")
        draw.text((W//2+2,ty+2), "HISTORY WHILE YOU SLEEP", font=ft, fill=(20,14,8,ta), anchor="mm")
        draw.text((W//2,ty), "HISTORY WHILE YOU SLEEP", font=ft, fill=(*PARCHMENT,ta), anchor="mm")
        lp = ease(min(1.0,(frame_num/FPS-T_TITLE_START)/1.5))
        lw = int(700*lp)
        draw.rectangle([W//2-lw//2,ty+66,W//2+lw//2,ty+69], fill=(*EMBER_GOLD,ta))
    ga = get_alpha(frame_num, T_TAG_START, T_TAG_FULL, T_HOLD, T_END)
    if ga > 0:
        fg = load_font("Lora-Regular.ttf", 40)
        draw.text((W//2,H//2+420), "Lie back.  Close your eyes.  Let history carry you.",
                 font=fg, fill=(*PARCHMENT,int(ga*0.85)), anchor="mm")
    t = frame_num/FPS
    if t > T_HOLD:
        fp = ease(min(1.0,(t-T_HOLD)/(T_END-T_HOLD)))
        fl = Image.new("RGBA",(W,H),(0,0,0,int(255*fp)))
        img = Image.alpha_composite(img, fl)
    return img.convert("RGB")

def generate_history_intro():
    logo_img = Image.open(LOGO_PATH).convert("RGBA") if os.path.exists(LOGO_PATH) else None
    if not logo_img: print(f"WARNING: Logo not found at {LOGO_PATH}")
    tmp_dir = tempfile.mkdtemp()
    print(f"Rendering {TOTAL_FRAMES} frames ({DURATION}s)...")
    for f in range(TOTAL_FRAMES):
        make_frame(f, logo_img).save(os.path.join(tmp_dir, f"frame_{f:04d}.png"))
        if f % 30 == 0: print(f"  frame {f}/{TOTAL_FRAMES} ({f/FPS:.1f}s)")
    out_path = os.path.join(OUT_DIR, "history_intro.mp4")
    if os.path.exists(AUDIO):
        cmd = ["ffmpeg","-y","-framerate",str(FPS),"-i",os.path.join(tmp_dir,"frame_%04d.png"),
               "-i",AUDIO,"-c:v","libx264","-crf","18","-pix_fmt","yuv420p",
               "-c:a","aac","-b:a","192k","-t",str(DURATION),"-shortest",out_path]
    else:
        cmd = ["ffmpeg","-y","-framerate",str(FPS),"-i",os.path.join(tmp_dir,"frame_%04d.png"),
               "-c:v","libx264","-crf","18","-pix_fmt","yuv420p","-t",str(DURATION),out_path]
    subprocess.run(cmd, check=True)
    shutil.rmtree(tmp_dir)
    print(f"Done: {out_path}")
    return out_path

if __name__ == "__main__":
    generate_history_intro()
