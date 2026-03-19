import os
import base64
from ai.agents.base_agent import BaseAgent
from ai.services.openai_client import generate_audio
from ai.utils.logger import logger


class VoiceoverAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="VoiceoverAgent")
        self.output_dir = "storage/output/audio"
        os.makedirs(self.output_dir, exist_ok=True)

    async def _run(self, input_dict: dict) -> str:
        text = input_dict["text"]

        # Skip TTS for placeholder scenes
        if text.strip().startswith("[") and text.strip().endswith("]"):
            return None
        voice = input_dict["voice"]
        index = input_dict["index"]

        style_mode = input_dict.get("style_mode", "timeline")
        speed = 0.88 if style_mode == "history" else 1.0
        audio_bytes = await generate_audio(text, voice, speed=speed)

        file_path = os.path.join(self.output_dir, f"section_{index}.mp3")

        with open(file_path, "wb") as f:
            f.write(audio_bytes)

        logger.info(f"Saved section {index} audio.")

        return file_path
