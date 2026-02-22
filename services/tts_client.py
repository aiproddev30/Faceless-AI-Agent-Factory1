from openai import AsyncOpenAI
import os

class TTSClient:

    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            base_url="https://api.openai.com/v1"
        )

    async def generate_audio(self, text: str, output_path: str):

        response = await self.client.audio.speech.create(
            model="gpt-4o-mini-tts",
            voice="verse",
            input=text,
        )

        with open(output_path, "wb") as f:
            f.write(response.content)
