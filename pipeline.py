import asyncio
import os
from agents.script_writer import ScriptWriterAgent
from utils.logger import logger

class FacelessPipeline:
    def __init__(self):
        self.script_writer = ScriptWriterAgent()

    async def run(self, topic_dict: dict):
        logger.info(f"Starting pipeline for topic: {topic_dict.get('title')}")
        try:
            result = await self.script_writer.execute(topic_dict)
            logger.info(f"Pipeline completed successfully. Script saved to: {result['script_path']}")
            print(f"\n--- PIPELINE SUCCESS ---")
            print(f"Final Script Path: {result['script_path']}")
            print(f"Word Count: {result['word_count']}")
        except Exception as e:
            logger.error(f"Pipeline failed: {str(e)}")
            print(f"\n--- PIPELINE FAILED ---")
            print(f"Error: {str(e)}")

if __name__ == "__main__":
    # Manual topic configuration
    manual_topic = {
        "title": "The Future of AI Automation in 2026",
        "tone": "educational and futuristic",
        "length": 500
    }

    pipeline = FacelessPipeline()
    asyncio.run(pipeline.run(manual_topic))
