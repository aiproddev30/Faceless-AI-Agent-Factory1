import random
import os
import httpx
from ai.utils.logger import logger

VIDEO_URL = "https://api.pexels.com/videos/search"
IMAGE_URL = "https://api.pexels.com/v1/search"

def _get_key() -> str:
    key = os.getenv("PEXELS_API_KEY")
    if not key:
        raise RuntimeError("PEXELS_API_KEY is not set in Replit Secrets.")
    return key

def _orientation(video_format: str) -> str:
    """Map video format to Pexels orientation parameter."""
    return "landscape" if video_format == "youtube" else "portrait"

async def search_video(query: str, per_page: int = 15, count: int = 1, video_format: str = "youtube"):
    """
    Search Pexels for video clips.
    count=1  returns a single URL string  (backward compatible)
    count>1  returns a list of URL strings
    """
    headers = {"Authorization": _get_key()}
    params  = {
        "query":       query,
        "per_page":    per_page,
        "orientation": _orientation(video_format),
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(VIDEO_URL, headers=headers, params=params)
    if r.status_code != 200:
        raise RuntimeError(f"Pexels video API error {r.status_code} for: '{query}'")
    videos = r.json().get("videos", [])
    random.shuffle(videos)
    if not videos:
        raise RuntimeError(f"No Pexels videos found for: '{query}'")
    urls = []
    for video in videos:
        url = _best_mp4(video.get("video_files", []), video_format)
        if url:
            urls.append(url)
        if len(urls) >= count:
            break
    if not urls:
        raise RuntimeError(f"No MP4 files found for: '{query}'")
    logger.info(f"Pexels video: {len(urls)} clip(s) for '{query}' [{_orientation(video_format)}]")
    return urls[0] if count == 1 else urls

async def search_image(query: str, count: int = 1, video_format: str = "youtube"):
    """
    Fallback: search Pexels photos when no video is found.
    count=1 returns string, count>1 returns list.
    """
    headers = {"Authorization": _get_key()}
    params  = {
        "query":       query,
        "per_page":    max(count, 5),
        "orientation": _orientation(video_format),
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(IMAGE_URL, headers=headers, params=params)
    if r.status_code != 200:
        raise RuntimeError(f"Pexels image API error {r.status_code} for: '{query}'")
    photos = r.json().get("photos", [])
    if not photos:
        raise RuntimeError(f"No Pexels images found for: '{query}'")
    if video_format == "youtube":
        urls = [p["src"].get("landscape") or p["src"]["large"] for p in photos[:count]]
    else:
        urls = [p["src"].get("portrait") or p["src"]["large"] for p in photos[:count]]
    logger.info(f"Pexels image: {len(urls)} image(s) for '{query}' [{_orientation(video_format)}]")
    return urls[0] if count == 1 else urls

def _best_mp4(video_files: list, video_format: str = "youtube") -> str | None:
    """Pick best MP4 matching the target orientation."""
    mp4s = [f for f in video_files if f.get("file_type") == "video/mp4"]
    if not mp4s:
        return None
    if video_format == "youtube":
        # Prefer landscape (width > height)
        oriented = [f for f in mp4s if f.get("width", 0) > f.get("height", 0)]
    else:
        # Prefer portrait (height > width)
        oriented = [f for f in mp4s if f.get("height", 0) > f.get("width", 0)]
    candidates = oriented or mp4s
    best = max(candidates, key=lambda x: x.get("width", 0))
    logger.info(f"Pexels selected: {best.get('width')}x{best.get('height')}")
    return best.get("link")