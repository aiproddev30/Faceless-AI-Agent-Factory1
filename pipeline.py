import asyncio
from loguru import logger
from agents.script_writer import ScriptWriterAgent
from agents.voiceover_agent import VoiceoverAgent


async def run():
    try:
        topic_data = {
            "title": "The Future of AI Automation in 2026",
            "tone": "Professional news documentary",
            "length": 900
        }

        logger.info(f"Starting pipeline for topic: {topic_data['title']}")

        # 1️⃣ Generate Script
        script_agent = ScriptWriterAgent()
        script_result = await script_agent.execute(topic_data)

        script_path = script_result.get("script_path")

        if not script_path:
            raise ValueError("Script generation failed. No script_path returned.")

        logger.info(f"Script generated successfully: {script_path}")

        # 2️⃣ Generate Voiceover
        voice_agent = VoiceoverAgent()
        voice_result = await voice_agent.execute({
            "script_path": script_path
        })

        audio_path = voice_result.get("audio_path")

        if not audio_path:
            raise ValueError("Voiceover generation failed. No audio_path returned.")

        logger.info(f"Voiceover generated successfully: {audio_path}")

        print("\n--- PIPELINE SUCCESS ---")
        print(f"Script Path: {script_path}")
        print(f"Audio Path: {audio_path}")

    except Exception as e:
        logger.error(f"Pipeline failed: {e}")
        print("\n--- PIPELINE FAILED ---")
        print(f"Error: {e}")


async def run_pipeline(topic_dict: dict):

    script_agent = ScriptWriterAgent()
    voice_agent = VoiceoverAgent()

    script_result = await script_agent.execute(topic_dict)

    voice_result = await voice_agent.execute({
     "script_path": script_result["script_path"],
     "voice": topic_dict.get("voice", "verse")
})

return {
    "script_path": script_result["script_path"],
    "audio_path": voice_result["audio_path"]
}

