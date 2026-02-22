from fastapi import FastAPI
from pydantic import BaseModel
import asyncio

from pipeline import run_pipeline   # we will adjust this

app = FastAPI()

class ScriptRequest(BaseModel):
    title: str
    tone: str = "educational"
    length: int = 300
    voice: str = "verse"


@app.post("/generate")
async def generate_script(request: ScriptRequest):

    result = await run_pipeline({
        "title": request.title,
        "tone": request.tone,
        "length": request.length,
        "voice": request.voice
    })

    return result
