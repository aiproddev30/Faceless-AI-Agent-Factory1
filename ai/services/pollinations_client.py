import httpx
from ai.utils.logger import logger

IMAGE_URL = "https://image.pollinations.ai/prompt"

async def generate_image(prompt: str, count: int = 1) -> list[str] | str:
    """
    Generate cartoon-style images via Pollinations.ai.
    No API key required.
    count=1 returns a single URL string (backward compatible)
    count>1 returns a list of URL strings
    """
    styled_prompt = f"cartoon illustration style, vibrant colors, clean lines: {prompt}"

    urls = []
    for i in range(count):
        # Pollinations returns an image directly from a GET request to a URL
        # Each request with a unique seed produces a different image
        seed = abs(hash(prompt + str(i))) % 1_000_000
        params = {
            "width": 576,
            "height": 1024,
            "seed": seed,
            "nologo": "true",
            "model": "flux",
        }
        encoded_prompt = styled_prompt.replace(" ", "%20")
        url = f"{IMAGE_URL}/{encoded_prompt}"

        # Verify the URL is reachable before returning it
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.get(url, params=params, follow_redirects=True)
            if r.status_code == 200:
                # Return the final resolved URL so the frontend can display it directly
                urls.append(str(r.url))
                logger.info(f"Pollinations generated image {i+1} for: '{prompt[:50]}'")
            else:
                logger.warning(f"Pollinations returned {r.status_code} for seed {seed}")
        except Exception as e:
            logger.warning(f"Pollinations request failed for seed {seed}: {e}")

    if not urls:
        raise RuntimeError(f"Pollinations failed to generate any images for: '{prompt}'")

    return urls[0] if count == 1 else urls