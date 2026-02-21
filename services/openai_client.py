import os
from openai import AsyncOpenAI
from utils.logger import logger

def get_client() -> AsyncOpenAI:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is not set in environment.")
    return AsyncOpenAI(api_key=api_key)


async def generate_script(prompt: str) -> str:
    """
    Generate a YouTube script using OpenAI GPT-4o.
    Includes cost control safeguards.
    """
    client = get_client()

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a professional YouTube script writer "
                        "specializing in high-retention faceless content."
                    )
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.6,
            max_tokens=1200,  # COST CONTROL
        )

        content = response.choices[0].message.content

        if not content:
            raise ValueError("Empty response from OpenAI")

        return content.strip()

    except Exception as e:
        logger.error(f"OpenAI API Error: {str(e)}")
        raise
