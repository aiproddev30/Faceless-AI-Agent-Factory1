import os
from openai import AsyncOpenAI
from utils.logger import logger

# Initialize client using environment variable
client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

async def generate_script(prompt: str) -> str:
    """Calls OpenAI API to generate a script based on the prompt."""
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a professional YouTube script writer specializing in high-retention faceless content."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"OpenAI API Error: {str(e)}")
        raise e
