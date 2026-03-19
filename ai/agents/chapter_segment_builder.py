"""
chapter_segment_builder.py
Builds per-chapter video segments and stitches them into the final episode.

This slots into history_video_assembler.py as a pre-processing step.
The assembler's existing ember animation + fire audio logic is unchanged —
it receives a single pre-built video file exactly as before.

Flow per chapter:
  1. make_title_card()  →  ch_N_card.jpg          (PIL, ~instant)
  2. card_to_video()    →  ch_N_card.mp4           (FFmpeg, holds image CARD_HOLD_SECONDS)
  3. narration already exists as ch_N_audio.mp3
  4. narration_to_video() → ch_N_narration.mp4     (FFmpeg, ember bg + audio)
  5. concat all segments  → chapters_combined.mp4  (FFmpeg concat)

The history_video_assembler then wraps chapters_combined.mp4 with the
intro swoosh, fire crackling mix, and title overlay — all unchanged.
"""

import os
import subprocess
import tempfile
from ai.agents.chapter_title_card import make_title_card, CARD_HOLD_SECONDS

# ── Config ────────────────────────────────────────────────────────────────────

EMBER_BANNER       = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "storage", "History_While_You_Sleep_Banner.png")
TRANSITION_IMAGE   = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "storage", "History_While_You_Sleep_Transition_Image.png")
OUTPUT_DIR         = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "storage", "output")
VIDEO_WIDTH        = 1920
VIDEO_HEIGHT       = 1080
FPS                = 8          # matches existing pipeline
CARD_FADE_DURATION = 1.0        # seconds for fade in/out on title card


def _ffmpeg(args: list[str], label: str = "") -> None:
    """Run an FFmpeg command, raise on failure."""
    cmd = ["ffmpeg", "-y"] + args
    print(f"[ffmpeg] {label}: {' '.join(cmd[:8])}...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg failed [{label}]:\n{result.stderr[-1000:]}")


def make_card_segment(
    chapter_title: str,
    chapter_index: int,
    tmp_dir: str,
) -> str:
    """
    Generate a title card video segment for one chapter.
    Returns path to the .mp4 segment file.
    """
    card_jpg  = os.path.join(tmp_dir, f"ch{chapter_index:02d}_card.jpg")
    card_mp4  = os.path.join(tmp_dir, f"ch{chapter_index:02d}_card.mp4")

    # 1. PIL: composite title text onto transition image
    make_title_card(chapter_title, card_jpg)

    # 2. FFmpeg: still image → video with fade in + fade out
    #    -loop 1          : loop the single image
    #    -t CARD_HOLD     : hold for N seconds
    #    fade in 1s at t=0, fade out 1s at end
    fade_out_start = CARD_HOLD_SECONDS - CARD_FADE_DURATION
    _ffmpeg([
        "-loop", "1",
        "-i", card_jpg,
        "-vf", (
            f"scale={VIDEO_WIDTH}:{VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,"
            f"pad={VIDEO_WIDTH}:{VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2,"
            f"fps={FPS},"
            f"fade=t=in:st=0:d={CARD_FADE_DURATION},"
            f"fade=t=out:st={fade_out_start}:d={CARD_FADE_DURATION}"
        ),
        "-t", str(CARD_HOLD_SECONDS),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-an",   # no audio — fire is added at the end across the whole video
        card_mp4
    ], label=f"card_segment ch{chapter_index}")

    return card_mp4


def make_narration_segment(
    audio_path: str,
    chapter_index: int,
    tmp_dir: str,
) -> str:
    """
    Generate the narration video segment for one chapter.
    Uses the ember banner as the visual (same as current single-chapter approach).
    Returns path to the .mp4 segment file.
    """
    narration_mp4 = os.path.join(tmp_dir, f"ch{chapter_index:02d}_narration.mp4")

    # Get audio duration
    probe = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", audio_path],
        capture_output=True, text=True
    )
    duration = float(probe.stdout.strip())

    _ffmpeg([
        "-loop", "1",
        "-i", EMBER_BANNER,
        "-i", audio_path,
        "-vf", (
            f"scale={VIDEO_WIDTH}:{VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,"
            f"pad={VIDEO_WIDTH}:{VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2,"
            f"fps={FPS}"
        ),
        "-c:v", "libx264",
        "-c:a", "aac",
        "-pix_fmt", "yuv420p",
        "-shortest",
        "-t", str(duration),
        narration_mp4
    ], label=f"narration_segment ch{chapter_index}")

    return narration_mp4


def build_chapter_segments(chapters: list[dict], tmp_dir: str) -> list[str]:
    """
    Build all segments for all chapters in order.

    Args:
        chapters: list of dicts with keys:
                    - title (str)      chapter title for the card
                    - audio (str)      path to chapter narration .mp3
                    - index (int)      chapter number (1-based)
        tmp_dir:  temp directory for intermediate files

    Returns:
        Ordered list of .mp4 segment paths:
        [card_ch1, narration_ch1, card_ch2, narration_ch2, ...]
    """
    segments = []
    for ch in chapters:
        i = ch["index"]
        # Title card first, then narration
        card_seg  = make_card_segment(ch["title"], i, tmp_dir)
        narr_seg  = make_narration_segment(ch["audio"], i, tmp_dir)
        segments.extend([card_seg, narr_seg])
        print(f"[builder] Chapter {i} complete: card + narration segments ready")
    return segments


def concat_segments(segments: list[str], output_path: str) -> str:
    """
    Concatenate all chapter segments into a single video file.
    This output is handed to history_video_assembler for the final
    fire audio mix + intro swoosh + title overlay — all unchanged.

    Returns output_path.
    """
    # Write concat list file
    list_path = output_path.replace(".mp4", "_concat_list.txt")
    with open(list_path, "w") as f:
        for seg in segments:
            f.write(f"file '{os.path.abspath(seg)}'\n")

    _ffmpeg([
        "-f", "concat",
        "-safe", "0",
        "-i", list_path,
        "-c", "copy",
        output_path
    ], label="concat_all_chapters")

    # Clean up list file
    os.remove(list_path)
    print(f"[builder] All chapters concatenated → {output_path}")
    return output_path


def build_full_chapter_video(chapters: list[dict], output_path: str) -> str:
    """
    Convenience wrapper: builds all segments and concatenates them.

    Example usage in history_video_assembler.py:
        from chapter_segment_builder import build_full_chapter_video
        combined = build_full_chapter_video(chapters, "storage/output/tmp_chapters.mp4")
        # ... existing assembler wraps combined with intro + fire audio

    Args:
        chapters: [{"index": 1, "title": "Morning in Rome", "audio": "path/ch1.mp3"}, ...]
        output_path: where to write the combined chapter video

    Returns:
        output_path
    """
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    tmp_dir = tempfile.mkdtemp(dir=OUTPUT_DIR, prefix="tmp_chapters_")

    try:
        segments = build_chapter_segments(chapters, tmp_dir)
        concat_segments(segments, output_path)
    finally:
        # Clean up temp segment files (not the output)
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)
        print(f"[builder] Temp segments cleaned up")

    return output_path


# ── Standalone test ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Minimal smoke test — requires real audio files to fully run
    test_chapters = [
        {"index": 1, "title": "Setting the Scene",      "audio": "storage/output/test_ch1.mp3"},
        {"index": 2, "title": "Morning in Ancient Rome","audio": "storage/output/test_ch2.mp3"},
    ]
    # Just test PIL card generation without FFmpeg
    import tempfile, os
    with tempfile.TemporaryDirectory() as d:
        for ch in test_chapters:
            out = os.path.join(d, f"ch{ch['index']}_card.jpg")
            make_title_card(ch["title"], out)
            print(f"  Card generated: {out}  exists={os.path.exists(out)}")
    print("PIL card test complete.")