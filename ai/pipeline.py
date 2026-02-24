import os
import uuid
import json
import asyncio
import subprocess

from ai.agents.script_writer import ScriptWriterAgent
from ai.agents.voiceover_agent import VoiceoverAgent
from ai.utils.logger import logger


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STORAGE_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "storage"))
OUTPUT_DIR = os.path.join(STORAGE_DIR, "output")
AUDIO_DIR = os.path.join(OUTPUT_DIR, "audio")

os.makedirs(AUDIO_DIR, exist_ok=True)


def run_ffmpeg(cmd: list):
    process = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    if process.returncode != 0:
        logger.error("FFMPEG ERROR:")
        logger.error(process.stderr)
        raise RuntimeError("FFmpeg failed.")

    return process


async def run_pipeline(title: str, tone: str, length: int, voice: str):

    run_id = str(uuid.uuid4())
    logger.info(f"[{run_id}] Starting SCRIPT + AUDIO pipeline")

    try:
        # ---------------------------------------------------
        # 1️⃣ Generate Script
        # ---------------------------------------------------
        script_agent = ScriptWriterAgent()
        script_result = await script_agent.execute({
            "title": title,
            "tone": tone,
            "length": length
        })

        script_path = script_result["script_path"]

        with open(script_path, "r", encoding="utf-8") as f:
            script_content = f.read()

        sections = parse_script_sections(script_content)

        if not sections:
            raise ValueError("No structured sections found.")

        logger.info(f"[{run_id}] Parsed {len(sections)} sections.")

        # ---------------------------------------------------
        # 2️⃣ Generate Section Audio
        # ---------------------------------------------------
        voice_agent = VoiceoverAgent()
        enriched_sections = []

        for idx, section in enumerate(sections):

            audio_path = await voice_agent.execute({
                "text": section["vo"],
                "voice": voice,
                "index": idx,
                "run_id": run_id
            })

            enriched_sections.append({
                "vo": section["vo"],
                "broll": section.get("broll"),
                "audio_path": audio_path
            })

        # ---------------------------------------------------
        # 3️⃣ Stitch Audio
        # ---------------------------------------------------
        final_audio_path = os.path.join(AUDIO_DIR, f"{run_id}.mp3")
        list_file_path = os.path.join(AUDIO_DIR, f"{run_id}_audio.txt")

        with open(list_file_path, "w", encoding="utf-8") as f:
            for sec in enriched_sections:
                abs_path = os.path.abspath(sec["audio_path"])
                f.write(f"file '{abs_path}'\n")

        run_ffmpeg([
            "ffmpeg",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", list_file_path,
            "-c", "copy",
            final_audio_path
        ])

        os.remove(list_file_path)

        logger.info(f"[{run_id}] Final audio created.")

        return {
            "status": "complete",
            "run_id": run_id,
            "script_path": script_path,
            "final_audio_path": final_audio_path,
            "sections": enriched_sections
        }

    except Exception:
        logger.exception(f"[{run_id}] Script pipeline failed.")
        raise


if __name__ == "__main__":

    async def main():
        result = await run_pipeline(
            title="The Rise of AI Agents",
            tone="engaging",
            length=60,
            voice="alloy"
        )

        print(json.dumps(result, indent=2))

    asyncio.run(main())
