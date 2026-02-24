import sys
import json
import asyncio
import traceback


async def handle_script_mode(input_data):
    from ai.pipeline import run_pipeline

    title = input_data.get("title")
    tone = input_data.get("tone", "educational")
    length = input_data.get("length", 300)
    voice = input_data.get("voice", "verse")

    if not title:
        raise ValueError("title is required for script mode")

    result = await run_pipeline(
        title=title,
        tone=tone,
        length=length,
        voice=voice,
    )

    return result


async def handle_video_mode(input_data):
    from ai.video_pipeline import run_video_pipeline

    script_id = input_data.get("scriptId")
    script_text = input_data.get("scriptText")
    audio_path = input_data.get("audioPath")

    if not script_id:
        raise ValueError("scriptId is required for video mode")

    if not script_text:
        raise ValueError("scriptText is required for video mode")

    if not audio_path:
        raise ValueError("audioPath is required for video mode")

    result = await run_video_pipeline(
        script_id=script_id,
        script_text=script_text,
        audio_path=audio_path,
    )

    return result


async def main():
    try:
        # =========================
        # Read JSON from stdin
        # =========================
        try:
            input_data = json.load(sys.stdin)
        except Exception:
            raise ValueError("Invalid JSON input from Node process")

        mode = input_data.get("mode", "script")

        # =========================
        # Route by mode
        # =========================
        if mode == "script":
            result = await handle_script_mode(input_data)

        elif mode == "video":
            result = await handle_video_mode(input_data)

        else:
            raise ValueError(f"Unknown mode: {mode}")

        # =========================
        # Success response
        # =========================
        response = {
            "status": "success",
            "data": result
        }

        print(json.dumps(response))
        sys.stdout.flush()

    except Exception as e:
        # Print full traceback to server console
        traceback.print_exc()

        error_response = {
            "status": "error",
            "error": str(e)
        }

        print(json.dumps(error_response))
        sys.stdout.flush()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
