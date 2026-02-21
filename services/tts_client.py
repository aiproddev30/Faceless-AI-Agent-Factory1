import os
from openai import AsyncOpenAI

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

class TTSClient:
    async def generate_audio(self, text: str, output_path: str):
        response = await client.audio.speech.create(
            model="gpt-4o-mini-tts",
            voice="alloy",  # We'll adjust voice in a moment
            input=text,
        )

        audio_bytes = response.read()

        with open(output_path, "wb") as f:
            f.write(audio_bytes)

        return output_path
