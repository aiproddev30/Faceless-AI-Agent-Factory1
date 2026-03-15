import os
import httpx
from ai.utils.logger import logger

VIDEO_URL = "https://pixabay.com/api/videos/"
IMAGE_URL = "https://pixabay.com/api/"

def _get_key() -> str:
    key = os.getenv("PIXABAY_API_KEY")
    if not key:
        raise RuntimeError("PIXABAY_API_KEY is not set in Replit Secrets.")
    return key

def _orientation(video_format: str) -> str:
    return "horizontal" if video_format == "youtube" else "vertical"

async def search_video(query: str, per_page: int = 5, count: int = 1, video_format: str = "youtube"):
    params = {
        "key":        _get_key(),
        "q":          query,
        "per_page":   per_page,
        "video_type": "film",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(VIDEO_URL, params=params)
    if r.status_code != 200:
        raise RuntimeError(f"Pixabay video API error {r.status_code} for: '{query}'")
    hits = r.json().get("hits", [])
    if not hits:
        raise RuntimeError(f"No Pixabay videos found for: '{query}'")
    urls = []
    for hit in hits:
        url = _best_mp4(hit.get("videos", {}), video_format)
        if url:
            urls.append(url)
        if len(urls) >= count:
            break
    if not urls:
        raise RuntimeError(f"No MP4 files found for: '{query}'")
    logger.info(f"Pixabay video: {len(urls)} clip(s) for '{query}' [{_orientation(video_format)}]")
    return urls[0] if count == 1 else urls

async def search_image(query: str, count: int = 1, video_format: str = "youtube"):
    params = {
        "key":         _get_key(),
        "q":           query,
        "per_page":    max(count, 5),
        "image_type":  "photo",
        "orientation": _orientation(video_format),
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(IMAGE_URL, params=params)
    if r.status_code != 200:
        raise RuntimeError(f"Pixabay image API error {r.status_code} for: '{query}'")
    hits = r.json().get("hits", [])
    if not hits:
        raise RuntimeError(f"No Pixabay images found for: '{query}'")
    urls = [h.get("largeImageURL") for h in hits[:count] if h.get("largeImageURL")]
    logger.info(f"Pixabay image: {len(urls)} image(s) for '{query}' [{_orientation(video_format)}]")
    return urls[0] if count == 1 else urls

def _best_mp4(videos: dict, video_format: str = "youtube") -> str | None:
    priority = ["large", "medium", "small", "tiny"]
    best_url = None
    best_score = -1
    for size in priority:
        v = videos.get(size, {})
        url = v.get("url")
        if not url:
            continue
        w, h = v.get("width", 0), v.get("height", 0)
        is_landscape = w > h
        orientation_match = (video_format == "youtube") == is_landscape
        score = (1000 if orientation_match else 0) + w
        if score > best_score:
            best_score = score
            best_url = url
            logger.info(f"Pixabay selected: {w}x{h} ({size})")
    return best_url