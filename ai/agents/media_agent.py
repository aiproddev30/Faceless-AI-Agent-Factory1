import os
import uuid
import httpx
from ai.agents.base_agent import BaseAgent
from ai.services.pexels_client import search_video
from ai.utils.logger import logger


MEDIA_DIR = "storage/media"
os.makedirs(MEDIA_DIR, exist_ok=True)


class MediaAgent(BaseAgent):
    async def _run(self, data: dict) -> dict:
        sections = data["sections"]

        for section in sections:
            query = section.get("broll")

            if not query:
                continue

            try:
                video_url = await search_video(query)

                file_path = os.path.join(
                    MEDIA_DIR,
                    f"{uuid.uuid4()}.mp4"
                )

                async with httpx.AsyncClient(timeout=60.0) as client:
                    r = await client.get(video_url)
                    with open(file_path, "wb") as f:
                        f.write(r.content)

                section["media_path"] = file_path

            except Exception as e:
                logger.exception(f"Failed fetching media for query: {query}")
                section["media_path"] = None

        return data
