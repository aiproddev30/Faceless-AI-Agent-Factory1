"""
chapter_title_card.py
Generates chapter transition title cards for History While You Sleep.

Usage:
    from chapter_title_card import make_title_card
    output_path = make_title_card(
        chapter_title="Morning in Rome",
        output_path="storage/output/chapter_1_card.jpg"
    )

The card is a static JPEG (1536x1024) — the same dimensions as the transition
image — with the chapter title composited into the naturally dark lower-right zone.
FFmpeg then holds this image for CARD_HOLD_SECONDS before the chapter narration begins.
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

# ── Config ────────────────────────────────────────────────────────────────────

TRANSITION_IMAGE   = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "storage", "History_While_You_Sleep_Transition_Image.png")
FONT_TITLE         = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "storage", "fonts", "PlayfairDisplay-Bold.ttf")
FONT_SUBTITLE      = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "storage", "fonts", "Lora-Regular.ttf")
CARD_HOLD_SECONDS  = 8        # how long FFmpeg holds the card
OUTPUT_QUALITY     = 92       # JPEG quality — matches rest of pipeline

# Text zone: lower-right dark area of the image
# Image is 1536x1024. Text sits in the bottom 28% of height, right 55% of width.
TEXT_ZONE_X        = 0.42     # left edge of text zone (fraction of width)
TEXT_ZONE_Y        = 0.68     # top edge of text zone (fraction of height)
TEXT_ZONE_W        = 0.52     # width of text zone (fraction of width)

# Typography
TITLE_COLOR        = (255, 220, 140)   # warm gold — matches brand
SUBTITLE_COLOR     = (200, 170, 100)   # slightly muted gold for "History While You Sleep"
DIVIDER_COLOR      = (180, 130, 60)    # amber line above title
TITLE_FONT_SIZE    = 62
SUBTITLE_FONT_SIZE = 28
DIVIDER_THICKNESS  = 2
DIVIDER_WIDTH_PX   = 220              # short decorative line

# Soft glow behind text (subtle dark vignette to guarantee legibility)
GLOW_OPACITY       = 100              # 0–255, kept low since bg is already dark


def _load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    """Load font with fallback to default if file missing."""
    if os.path.exists(path):
        return ImageFont.truetype(path, size)
    print(f"[WARN] Font not found: {path} — using default")
    return ImageFont.load_default()


def _wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width_px: int) -> list[str]:
    """Word-wrap text to fit within max_width_px."""
    words = text.split()
    lines = []
    current = []
    for word in words:
        test = " ".join(current + [word])
        bbox = font.getbbox(test)
        if bbox[2] - bbox[0] <= max_width_px:
            current.append(word)
        else:
            if current:
                lines.append(" ".join(current))
            current = [word]
    if current:
        lines.append(" ".join(current))
    return lines


def make_title_card(
    chapter_title: str,
    output_path: str,
    show_channel_name: bool = True,
) -> str:
    """
    Composite chapter_title onto the transition image and save to output_path.

    Args:
        chapter_title:    The chapter title text, e.g. "Morning in Rome"
        output_path:      Where to save the JPEG, e.g. "storage/output/ch1_card.jpg"
        show_channel_name: Whether to show "History While You Sleep" as a subtitle line

    Returns:
        output_path (for chaining)
    """
    # ── Load base image ──────────────────────────────────────────────────────
    if not os.path.exists(TRANSITION_IMAGE):
        raise FileNotFoundError(f"Transition image not found: {TRANSITION_IMAGE}")

    img = Image.open(TRANSITION_IMAGE).convert("RGB")
    W, H = img.size   # expected 1536 x 1024

    # ── Load fonts ───────────────────────────────────────────────────────────
    title_font    = _load_font(FONT_TITLE,    TITLE_FONT_SIZE)
    subtitle_font = _load_font(FONT_SUBTITLE, SUBTITLE_FONT_SIZE)

    # ── Compute text zone in pixels ──────────────────────────────────────────
    zone_x  = int(TEXT_ZONE_X * W)
    zone_y  = int(TEXT_ZONE_Y * H)
    zone_w  = int(TEXT_ZONE_W * W)

    # ── Wrap title to fit zone width ─────────────────────────────────────────
    title_lines = _wrap_text(chapter_title, title_font, zone_w)

    # ── Measure total text block height ─────────────────────────────────────
    line_h       = title_font.getbbox("Ag")[3] + 8     # line height + leading
    block_h      = len(title_lines) * line_h
    divider_gap  = 18
    subtitle_h   = subtitle_font.getbbox("Ag")[3] + 6 if show_channel_name else 0
    total_h      = DIVIDER_THICKNESS + divider_gap + block_h + (20 + subtitle_h if show_channel_name else 0)

    # Vertically center the block within the lower third
    lower_third_top = zone_y
    lower_third_h   = H - lower_third_top - 40   # 40px bottom padding
    text_start_y    = lower_third_top + (lower_third_h - total_h) // 2
    text_start_y    = max(text_start_y, lower_third_top + 20)

    # ── Optional: subtle dark vignette behind text for safety ────────────────
    # Only applied if the computed zone risks readability on lighter images
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ov_draw = ImageDraw.Draw(overlay)
    ov_draw.rectangle(
        [zone_x - 20, text_start_y - 20, W - 10, H - 10],
        fill=(0, 0, 0, GLOW_OPACITY)
    )
    img = img.convert("RGBA")
    img = Image.alpha_composite(img, overlay).convert("RGB")

    # ── Draw ─────────────────────────────────────────────────────────────────
    draw = ImageDraw.Draw(img)
    cursor_y = text_start_y

    # Decorative divider line above title
    draw.rectangle(
        [zone_x, cursor_y, zone_x + DIVIDER_WIDTH_PX, cursor_y + DIVIDER_THICKNESS],
        fill=DIVIDER_COLOR
    )
    cursor_y += DIVIDER_THICKNESS + divider_gap

    # Title lines
    for line in title_lines:
        draw.text((zone_x, cursor_y), line, font=title_font, fill=TITLE_COLOR)
        cursor_y += line_h

    # Channel subtitle
    if show_channel_name:
        cursor_y += 20
        draw.text(
            (zone_x, cursor_y),
            "History While You Sleep",
            font=subtitle_font,
            fill=SUBTITLE_COLOR
        )

    # ── Save ─────────────────────────────────────────────────────────────────
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    img.save(output_path, "JPEG", quality=OUTPUT_QUALITY)
    print(f"[chapter_title_card] Saved: {output_path}  ({W}x{H})")
    return output_path


# ── Standalone test ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    title = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "Morning in Ancient Rome"
    out   = make_title_card(title, "storage/output/test_title_card.jpg")
    print(f"Test card written to: {out}")