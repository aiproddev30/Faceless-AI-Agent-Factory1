import os
import re
from agents.base_agent import BaseAgent
from services.openai_client import generate_script
from utils.logger import logger

class ScriptWriterAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="ScriptWriter")
        self.output_dir = "storage/output/scripts"
        os.makedirs(self.output_dir, exist_ok=True)

    async def _run(self, topic_dict: dict) -> dict:
        title = topic_dict.get("title")
        tone = topic_dict.get("tone")
        length = topic_dict.get("length")

        prompt = f"""Write a faceless YouTube video script for: {title}
Format: Hook (0-30s) → Story → Main Content → CTA
Tone: {tone}
Length: {length} words
Include B-roll cues and pacing markers.
No filler. High retention."""

        logger.info(f"Generating script for: {title}")
        script_content = await generate_script(prompt)
        
        # Create a safe filename
        safe_title = re.sub(r'[^\w\s-]', '', title).strip().lower()
        safe_title = re.sub(r'[-\s]+', '-', safe_title)
        filename = f"{safe_title}.txt"
        filepath = os.path.join(self.output_dir, filename)

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(script_content)

        word_count = len(script_content.split())
        
        return {
            "script_path": filepath,
            "word_count": word_count
        }
