import asyncio
import sys
import json
from loguru import logger

from agents.script_writer import ScriptWriterAgent
from agents.voiceover_agent import VoiceoverAgent


# ---------------------------------------------------
# Core Pipeline Logic (Used by API / CLI)
# ---------------------------------------------------

async def run_pipeline(topic_dict: dict):
    try:
        logger.info(f"Starting pipeline for topic: {topic_dict.get('title')}")

        # 1️⃣ Generate Script
        script_agent = ScriptWriterAgent()
        script_result = await script_agent.execute(topic_dict)

        script_path = script_result.get("script_path")

        if not script_path:
            raise ValueError("Script generation failed. No script_path returned.")

        logger.info(f"Script generated successfully: {script_path}")

        # 2️⃣ Generate Voiceover
        voice_agent = VoiceoverAgent()
        voice_result = await voice_agent.execute({
            "script_path": script_path,
            "voice": topic_dict.get("voice", "verse")
        })

        audio_path = voice_result.get("audio_path")

        if not audio_path:
            raise ValueError("Voiceover generation failed. No audio_path returned.")

        logger.info(f"Voiceover generated successfully: {audio_path}")

        return {
            "script_path": script_path,
            "audio_path": audio_path
        }

    except Exception as e:
        logger.error(f"Pipeline failed: {e}")
        raise


# ---------------------------------------------------
# CLI ENTRY (Used by Node Backend)
# Example:
# python pipeline.py "Title" "Tone" 900 "verse"
# ---------------------------------------------------

if __name__ == "__main__":

    if len(sys.argv) < 5:
        print(json.dumps({
            "error": "Usage: python pipeline.py <title> <tone> <length> <voice>"
        }))
        sys.exit(1)

    title = sys.argv[1]
    tone = sys.argv[2]
    length = int(sys.argv[3])
    voice = sys.argv[4]

    async def main():
        result = await run_pipeline({
            "title": title,
            "tone": tone,
            "length": length,
            "voice": voice
        })

        # IMPORTANT: Clean JSON output for Node to parse
        print(json.dumps(result))

    asyncio.run(main())
