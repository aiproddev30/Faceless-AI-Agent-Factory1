import os
import subprocess
import uuid
from ai.agents.base_agent import BaseAgent


OUTPUT_DIR = "storage/output"
os.makedirs(OUTPUT_DIR, exist_ok=True)


class VideoAssemblerAgent(BaseAgent):
    async def _run(self, data: dict) -> dict:
        sections = data["sections"]
        audio_path = data["audio_path"]

        concat_file = os.path.join(OUTPUT_DIR, "concat.txt")

        with open(concat_file, "w") as f:
            for section in sections:
                if section.get("media_path"):
                    f.write(f"file '{section['media_path']}'\n")

        output_path = os.path.join(
            OUTPUT_DIR,
            f"{uuid.uuid4()}.mp4"
        )

        command = [
            "ffmpeg",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file,
            "-i", audio_path,
            "-c:v", "libx264",
            "-vf", "scale=1080:1920",
            "-c:a", "aac",
            "-shortest",
            output_path
        ]

        subprocess.run(command, check=True)

        data["final_video"] = output_path
        return data
