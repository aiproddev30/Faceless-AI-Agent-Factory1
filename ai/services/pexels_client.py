import os
import httpx
from ai.utils.logger import logger

BASE_URL = "https://api.pexels.com/videos/search"


async def search_video(query: str, per_page: int = 5) -> str:
    """
    Search Pexels for a portrait-friendly video.
    Returns direct MP4 download URL.
    """

    api_key = os.getenv("PEXELS_API_KEY")

    if not api_key:
        raise RuntimeError("PEXELS_API_KEY is not set.")

    headers = {
        "Authorization": api_key
    }

    params = {
        "query": query,
        "per_page": per_page,
        "orientation": "portrait"
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(BASE_URL, headers=headers, params=params)

    if response.status_code != 200:
        logger.error(f"Pexels API error: {response.text}")
        raise RuntimeError("Pexels API request failed.")

    data = response.json()
    videos = data.get("videos", [])

    if not videos:
        raise RuntimeError(f"No videos found for query: {query}")

    # -----------------------------------------
    # 1️⃣ Flatten all available files
    # -----------------------------------------
    all_files = []
    for video in videos:
        for vf in video.get("video_files", []):
            all_files.append(vf)

    # -----------------------------------------
    # 2️⃣ Filter MP4 only
    # -----------------------------------------
    mp4_files = [
        f for f in all_files
        if f.get("file_type") == "video/mp4"
    ]

    if not mp4_files:
        raise RuntimeError("No MP4 video files found.")

    # -----------------------------------------
    # 3️⃣ Prefer vertical clips
    # -----------------------------------------
    vertical_files = [
        f for f in mp4_files
        if f.get("height", 0) > f.get("width", 0)
    ]

    candidates = vertical_files if vertical_files else mp4_files

    # -----------------------------------------
    # 4️⃣ Choose highest resolution
    # -----------------------------------------
    best_file = max(
        candidates,
        key=lambda x: x.get("height", 0)
    )

    logger.info(
        f"Pexels selected video {best_file.get('width')}x{best_file.get('height')}"
    )

    return best_file["link"]
