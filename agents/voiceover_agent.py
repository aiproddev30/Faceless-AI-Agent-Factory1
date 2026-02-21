from loguru import logger
from agents.base_agent import BaseAgent
from services.tts_client import TTSClient
import os

class VoiceoverAgent(BaseAgent):

    def __init__(self):
        super().__init__(name="VoiceoverAgent")


    async def _run(self, input_data: dict) -> dict:
        script_path = input_data.get("script_path")

        if not script_path:
            raise ValueError("No script path provided to VoiceoverAgent")

        with open(script_path, "r", encoding="utf-8") as f:
            script_text = f.read()

        os.makedirs("storage/output/audio", exist_ok=True)

        filename = os.path.basename(script_path).replace(".txt", ".mp3")
        output_path = f"storage/output/audio/{filename}"

        tts = TTSClient()
        await tts.generate_audio(script_text, output_path)

        logger.info(f"Voiceover saved to: {output_path}")

        return {"audio_path": output_path}
