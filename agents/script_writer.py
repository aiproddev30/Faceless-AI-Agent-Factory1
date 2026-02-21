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

        prompt = f"""
        You are a viral YouTube scriptwriter.

        Write a faceless YouTube script about: "{title}"

        Target length:
        Approximately {length} words.

        Audience:
        Tech-curious adults who want to understand where AI is heading.

        Tone:
        {tone}

        Style Requirements:
        - Strong curiosity-driven hook in first 20 seconds
        - Clear narrative flow
        - Specific predictions and examples
        - Bold but realistic claims
        - Avoid generic filler language
        - No vague statements like "AI will change everything"
        - Use real-world scenarios
        - Sound confident and intelligent
        - Maintain high retention pacing
        
        Critical Requirements:
        - Include at least 3 specific real-world companies or technologies
        - Include at least 1 surprising statistic or projection
        - Include 1 bold claim that could spark debate
        - Avoid generic phrases like "AI will change everything"
        - Use vivid, concrete examples


        Structure:
        1. Hook
        2. Context / Setup
        3. 3 Clear Insights or Predictions
        4. Risks / Controversy
        5. Forward-looking conclusion
        6. Strong Call-To-Action

        Do NOT label timestamps.
        Do NOT exaggerate runtime.
        Keep the total length close to the requested word count.
        """




        logger.info(f"Generating script for: {title}")
        script_content = await generate_script(prompt)

        if len(script_content.split()) < 200:
            raise ValueError("Generated script too short. Likely failure.")

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
