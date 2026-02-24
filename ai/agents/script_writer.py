import os
import re
from ai.agents.base_agent import BaseAgent
from ai.services.openai_client import generate_script
from ai.utils.logger import logger


class ScriptWriterAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="ScriptWriter")
        self.output_dir = "storage/output/scripts"
        os.makedirs(self.output_dir, exist_ok=True)

    async def _run(self, topic_dict: dict) -> dict:
        title = topic_dict["title"]
        tone = topic_dict["tone"]
        length = topic_dict["length"]

        prompt = f"""
You are an expert viral YouTube scriptwriter.

Write a faceless YouTube script about: "{title}"
Length: approximately {length} words.
Tone: {tone}

STRICT FORMAT RULES:

For EVERY section output EXACTLY:

VO:
<voice narration paragraph>

BROLL:
<visual scene description for stock footage search>

Repeat this structure for each section.

Do NOT add commentary.
Do NOT use markdown.
Do NOT add headers.
Do NOT add numbering.
Do NOT deviate from this format.
"""

        raw_script = await generate_script(prompt)

        # Save raw script
        safe_title = re.sub(r"[^\w\s-]", "", title).strip().lower()
        safe_title = re.sub(r"[-\s]+", "-", safe_title)
        filepath = os.path.join(self.output_dir, f"{safe_title}.txt")

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(raw_script)

        # Parse structured sections
        sections = self._parse_sections(raw_script)

        return {
            "script_path": filepath,
            "raw_script": raw_script,
            "sections": sections
        }

    def _parse_sections(self, text: str):
        pattern = r"VO:\s*(.*?)\s*BROLL:\s*(.*?)(?=VO:|\Z)"
        matches = re.findall(pattern, text, re.DOTALL)

        sections = []
        for vo, broll in matches:
            sections.append({
                "vo": vo.strip(),
                "broll": broll.strip()
            })

        return sections
