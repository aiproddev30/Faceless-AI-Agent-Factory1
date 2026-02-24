import os
from openai import AsyncOpenAI
from ai.utils.logger import logger

# -------------------------------------------------------------------
# Configuration
# -------------------------------------------------------------------

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY environment variable is not set.")

client = AsyncOpenAI(
    api_key=OPENAI_API_KEY,
    timeout=60.0,  # Prevent hanging calls
)

# -------------------------------------------------------------------
# Script Generation
# -------------------------------------------------------------------

async def generate_script(prompt: str) -> str:
    """
    Generates a YouTube script using OpenAI.
    Returns raw string content.
    """

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )

        content = response.choices[0].message.content

        if not content:
            raise ValueError("OpenAI returned empty script content.")

        return content.strip()

    except Exception as e:
        logger.exception("OpenAI script generation failed.")
        raise


# -------------------------------------------------------------------
# Audio Generation (TTS)
# -------------------------------------------------------------------

async def generate_audio(text: str, voice: str = "alloy") -> bytes:
    """
    Generates MP3 audio from text using OpenAI TTS.
    Returns raw bytes.
    """

    if not text or not text.strip():
        raise ValueError("Cannot generate audio from empty text.")

    try:
        response = await client.audio.speech.create(
            model="gpt-4o-mini-tts",
            voice=voice,
            input=text.strip(),
        )

        if not response.content:
            raise ValueError("OpenAI returned empty audio content.")

        return response.content

    except Exception as e:
        logger.exception("OpenAI audio generation failed.")
        raise
