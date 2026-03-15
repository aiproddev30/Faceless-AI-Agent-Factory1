import os
import re
from openai import AsyncOpenAI
from ai.utils.logger import logger

# ================================================================
# COST SUMMARY FOR YOUR SCALE (3-5 videos/week, avg 1hr each)
#
#   Scripts  (gpt-4o-mini): ~$0.50/month  ← already optimal
#   Audio    (tts-1):       ~$13/month    ← switched from mini-tts
#   TOTAL:                  ~$14/month
#
# VOICES available on tts-1:
#   onyx    = deep, authoritative  ← best for documentary (DEFAULT)
#   fable   = warm, storytelling
#   nova    = clear, professional
#   alloy   = neutral
#   echo    = light, energetic
#   shimmer = bright, friendly
#
# NOTE: 'verse' only works on gpt-4o-mini-tts (expensive).
#       It is automatically remapped to 'onyx' below.
#
# UPGRADE PATH: If you ever want better voice quality, add these
# two lines to Replit Secrets and nothing else needs to change:
#   TTS_PROVIDER=elevenlabs
#   ELEVENLABS_API_KEY=your_key_here
# ================================================================

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY is not set in Replit Secrets.")

openai_client = AsyncOpenAI(
    api_key=OPENAI_API_KEY,
    base_url="https://api.openai.com/v1",  # bypass Replit's proxy for audio support
    timeout=120.0,
)
TTS_PROVIDER        = os.getenv("TTS_PROVIDER", "openai").lower()
ELEVENLABS_API_KEY  = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB")
ELEVENLABS_MODEL    = "eleven_turbo_v2_5"

logger.info(f"TTS provider: {TTS_PROVIDER}")

# Groq client
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
groq_client = AsyncOpenAI(api_key=GROQ_API_KEY, base_url="https://api.groq.com/openai/v1", timeout=120.0) if GROQ_API_KEY else None
SCRIPT_PROVIDER = os.getenv("SCRIPT_PROVIDER", "openai").lower()
logger.info(f"Script provider: {SCRIPT_PROVIDER}")



# ----------------------------------------------------------------
# SCRIPT GENERATION
# gpt-4o-mini with JSON mode = reliable structured output
# ----------------------------------------------------------------

async def generate_script(prompt: str, model: str = None) -> str:
    try:
        use_groq = (model and model.startswith("groq:")) or (SCRIPT_PROVIDER == "groq" and not model)

        if use_groq and groq_client:
            groq_model = model.replace("groq:", "") if model else "llama-3.3-70b-versatile"
            response = await groq_client.chat.completions.create(
                model=groq_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=8000,
            )
            return response.choices[0].message.content or ""

        # OpenAI — use gpt-4o for long history scripts, gpt-4o-mini for short ones
        use_model = "gpt-4o" if len(prompt) > 3000 else "gpt-4o-mini"
        response = await openai_client.chat.completions.create(
            model=use_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=16000,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        if not content:
            raise ValueError("OpenAI returned empty script content.")
        return content.strip()
    except Exception:
        logger.exception("Script generation failed.")
        raise


# ----------------------------------------------------------------
# AUDIO GENERATION
# Automatically chunks long text — a 1hr script needs ~14 API calls.
# This is invisible to the rest of your code.
# ----------------------------------------------------------------

async def generate_audio(text: str, voice: str = "onyx", speed: float = 1.0) -> bytes:
    if not text or not text.strip():
        raise ValueError("Cannot generate audio from empty text.")

    if TTS_PROVIDER == "elevenlabs":
        return await _elevenlabs_audio(text)
    else:
        return await _openai_audio(text, voice, speed=speed)


async def _openai_audio(text: str, voice: str, speed: float = 1.0) -> bytes:
    # Remap voices that only exist on the expensive gpt-4o-mini-tts model
    voice_map = {"verse": "onyx", "marin": "nova", "cedar": "echo"}
    voice     = voice_map.get(voice.lower(), voice)

    chunks = _split_text(text, max_chars=4000)
    logger.info(f"OpenAI TTS: {len(chunks)} chunk(s), {len(text):,} chars total")

    audio = b""
    for i, chunk in enumerate(chunks):
        response = await openai_client.audio.speech.create(
            model="tts-1",
            voice=voice,
            input=chunk.strip(),
            response_format="mp3",
            speed=speed,
        )
        if not response.content:
            raise ValueError(f"Empty audio for chunk {i+1}/{len(chunks)}")
        audio += response.content
        logger.info(f"TTS chunk {i+1}/{len(chunks)} complete")

    return audio


async def _elevenlabs_audio(text: str) -> bytes:
    if not ELEVENLABS_API_KEY:
        raise RuntimeError(
            "ELEVENLABS_API_KEY not set in Replit Secrets. "
            "Either add it or change TTS_PROVIDER=openai."
        )
    import httpx

    chunks  = _split_text(text, max_chars=4000)
    url     = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
    headers = {"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"}

    logger.info(f"ElevenLabs TTS: {len(chunks)} chunk(s), {len(text):,} chars total")

    audio = b""
    async with httpx.AsyncClient(timeout=120.0) as client:
        for i, chunk in enumerate(chunks):
            r = await client.post(url, headers=headers, json={
                "text":     chunk.strip(),
                "model_id": ELEVENLABS_MODEL,
                "voice_settings": {
                    "stability": 0.5, "similarity_boost": 0.75,
                    "style": 0.0,     "use_speaker_boost": True,
                },
            })
            if r.status_code != 200:
                raise RuntimeError(f"ElevenLabs error {r.status_code}: {r.text[:200]}")
            audio += r.content
            logger.info(f"ElevenLabs chunk {i+1}/{len(chunks)} complete")

    return audio


# ----------------------------------------------------------------
# TEXT CHUNKER
# Splits at sentence boundaries so audio sounds natural
# ----------------------------------------------------------------

def _split_text(text: str, max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]

    chunks    = []
    current   = ""
    sentences = re.split(r'(?<=[.!?])\s+', text)

    for sentence in sentences:
        if len(current) + len(sentence) + 1 <= max_chars:
            current += (" " if current else "") + sentence
        else:
            if current:
                chunks.append(current.strip())
            if len(sentence) > max_chars:
                for part in re.split(r'(?<=,)\s+', sentence):
                    if len(current) + len(part) + 1 <= max_chars:
                        current += (" " if current else "") + part
                    else:
                        if current:
                            chunks.append(current.strip())
                        current = part
            else:
                current = sentence

    if current:
        chunks.append(current.strip())

    return [c for c in chunks if c]