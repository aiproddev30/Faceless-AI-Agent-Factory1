import os
import uuid
import subprocess
from pathlib import Path
import httpx
from ai.services.pexels_client import search_video

OUTPUT_DIR = Path("storage/output/videos")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


async def download_video(url: str, save_path: Path):
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        save_path.write_bytes(response.content)


async def run_video_pipeline(script_id: str, script_text: str, audio_path: str):
    """
    Builds vertical short-form video using:
    - Script text (from DB)
    - Existing audio file
    - Pexels stock footage
    """

    if not os.path.exists(audio_path):
        raise RuntimeError(f"Audio file not found: {audio_path}")

    # =========================
    # 1️⃣ Generate Search Query
    # =========================
    first_words = " ".join(script_text.split()[:6])
    video_url = await search_video(first_words)

    # =========================
    # 2️⃣ Download Clip
    # =========================
    clip_path = OUTPUT_DIR / f"{uuid.uuid4()}.mp4"
    await download_video(video_url, clip_path)

    # =========================
    # 3️⃣ Combine With Audio
    # =========================
    final_video = OUTPUT_DIR / f"{script_id}_final.mp4"

    subprocess.run([
        "ffmpeg",
        "-y",
        "-stream_loop", "-1",
        "-i", str(clip_path),
        "-i", audio_path,
        "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-shortest",
        "-pix_fmt", "yuv420p",
        str(final_video)
    ], check=True)


    return {
        "status": "complete",
        "video_path": str(final_video)
    }
