import os
import uuid
import subprocess
import json
from ai.utils.logger import logger

OUTPUT_DIR = "storage/output/video"
SUBS_DIR   = "storage/output/subtitles"
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(SUBS_DIR,   exist_ok=True)


def _get_duration(path: str) -> float:
    try:
        result = subprocess.run([
            'ffprobe', '-v', 'quiet', '-print_format', 'json',
            '-show_format', path
        ], capture_output=True, text=True)
        data = json.loads(result.stdout)
        return float(data.get('format', {}).get('duration', 0))
    except Exception:
        return 0.0


def _probe_video(path: str) -> dict:
    result = subprocess.run([
        'ffprobe', '-v', 'quiet', '-print_format', 'json',
        '-show_streams', path
    ], capture_output=True, text=True)
    streams = json.loads(result.stdout).get('streams', [])
    vstream = next((s for s in streams if s.get('codec_type') == 'video'), {})
    fps_raw = vstream.get('r_frame_rate', '30/1')
    fps_num, fps_den = fps_raw.split('/') if '/' in fps_raw else (fps_raw, '1')
    return {
        'width':  vstream.get('width',  1920),
        'height': vstream.get('height', 1080),
        'fps':    round(int(fps_num) / max(int(fps_den), 1)),
    }


def _hex_to_ass(hex_color: str) -> str:
    """Convert #RRGGBB to ASS &H00BBGGRR format."""
    h = hex_color.lstrip('#')
    if len(h) == 6:
        r, g, b = h[0:2], h[2:4], h[4:6]
        return f"&H00{b}{g}{r}".upper()
    return "&H00FFFFFF"


def _build_force_style(style: dict) -> str:
    """Build FFmpeg subtitles force_style string from style dict."""
    font_name    = style.get("fontName",    "Arial")
    font_size    = style.get("fontSize",    18)
    primary      = _hex_to_ass(style.get("primaryColor",  "#FFFFFF"))
    outline_col  = _hex_to_ass(style.get("outlineColor",  "#000000"))
    outline      = style.get("outline",     2)
    bold         = 1 if style.get("bold",      False) else 0
    italic       = 1 if style.get("italic",    False) else 0
    underline    = 1 if style.get("underline", False) else 0
    # Alignment: 2=bottom-center, 8=top-center, 5=middle-center
    pos_map      = {"bottom": 2, "top": 8, "center": 5}
    alignment    = pos_map.get(style.get("position", "bottom"), 2)
    margin_v     = style.get("marginV", 30)
    shadow       = style.get("shadow",  0)
    back_color   = _hex_to_ass(style.get("backColor", "#000000"))
    back_alpha   = style.get("backAlpha", 0)   # 0=transparent, 128=half, 255=opaque
    # BackColour includes alpha in ASS: &HAABBGGRR
    back_ass     = f"&H{back_alpha:02X}{style.get('backColor','#000000').lstrip('#')[4:6]}{style.get('backColor','#000000').lstrip('#')[2:4]}{style.get('backColor','#000000').lstrip('#')[0:2]}".upper() if back_alpha > 0 else "&H00000000"

    return (
        f"FontName={font_name},FontSize={font_size},"
        f"PrimaryColour={primary},OutlineColour={outline_col},"
        f"Outline={outline},Shadow={shadow},"
        f"Bold={bold},Italic={italic},Underline={underline},"
        f"Alignment={alignment},MarginV={margin_v}"
    )


def _make_srt(clips_or_sections: list, source: str = "clips") -> str:
    """Generate SRT from timeline clips or script sections."""
    path    = os.path.join(SUBS_DIR, f"subs_{uuid.uuid4().hex[:8]}.srt")
    entries = []
    idx     = 1
    t       = 0.0

    def _ts(s: float) -> str:
        h  = int(s // 3600)
        m  = int((s % 3600) // 60)
        sc = int(s % 60)
        ms = int((s - int(s)) * 1000)
        return f"{h:02}:{m:02}:{sc:02},{ms:03}"

    items = clips_or_sections
    for item in items:
        if source == "sections":
            vo  = (item.get("voText") or item.get("vo", "")).strip()
            dur = float(item.get("estimatedDuration") or item.get("estimated_duration", 10.0))
        else:
            vo  = item.get("vo_text", "").strip()
            dur = float(item.get("duration", 5.0))

        if not vo:
            t += dur
            continue

        words      = vo.split()
        chunk_size = 8
        chunks     = [words[i:i+chunk_size] for i in range(0, len(words), chunk_size)]
        chunk_dur  = dur / max(len(chunks), 1)

        for chunk in chunks:
            entries.append(
                f"{idx}\n"
                f"{_ts(t)} --> {_ts(t + chunk_dur)}\n"
                f"{' '.join(chunk)}\n"
            )
            idx += 1
            t   += chunk_dur

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(entries))

    logger.info(f"SRT generated: {idx-1} lines → {path}")
    return path


def polish_video(
    input_path:     str,
    script_sections: list | None = None,
    intro_path:     str | None = None,
    intro_duration: float = 3.0,
    outro_path:     str | None = None,
    outro_duration: float = 5.0,
    trim_start:     float = 0.0,
    trim_end:       float = 0.0,
    subtitle_style: dict | None = None,
    burn_subtitles: bool = True,
) -> str:
    output_path = os.path.join(OUTPUT_DIR, f"polished_{uuid.uuid4().hex[:8]}.mp4")

    # ── Step 1: Trim ──────────────────────────────────────────────
    main_path = input_path
    if trim_start > 0 or trim_end > 0:
        trimmed_path = os.path.join(OUTPUT_DIR, f"trimmed_{uuid.uuid4().hex[:8]}.mp4")
        duration = _get_duration(input_path)
        end_time = duration - trim_end if trim_end > 0 else duration
        trim_cmd = [
            "ffmpeg", "-y",
            "-ss", str(trim_start), "-to", str(end_time),
            "-i", input_path,
            "-c", "copy", trimmed_path,
        ]
        result = subprocess.run(trim_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"Trim failed: {result.stderr[-500:]}")
        main_path = trimmed_path
        logger.info(f"Trimmed: removed {trim_start}s start, {trim_end}s end")

    # ── Step 2: Burn subtitles onto main video if requested ───────
    if burn_subtitles and script_sections:
        srt_path   = _make_srt(script_sections, source="sections")
        srt_safe   = os.path.abspath(srt_path).replace("\\", "/").replace(":", "\\:")
        style_str  = _build_force_style(subtitle_style or {})
        subbed     = os.path.join(OUTPUT_DIR, f"subbed_{uuid.uuid4().hex[:8]}.mp4")
        sub_cmd    = [
            "ffmpeg", "-y", "-i", main_path,
            "-vf", f"subtitles='{srt_safe}':force_style='{style_str}'",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "copy", subbed,
        ]
        result = subprocess.run(sub_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            logger.error(f"Subtitle burn FAILED:\n{result.stderr[-1000:]}")
            raise RuntimeError(f"Subtitle burn failed: {result.stderr[-300:]}")
        else:
            if main_path != input_path and os.path.exists(main_path):
                os.remove(main_path)
            main_path = subbed
            logger.info(f"Subtitles burned with style: {style_str}")

    # ── Step 3: Add intro/outro ───────────────────────────────────
    if not intro_path and not outro_path:
        if main_path != input_path:
            os.rename(main_path, output_path)
        else:
            # Just copy
            import shutil
            shutil.copy2(main_path, output_path)
        return output_path

    info = _probe_video(main_path)
    W, H, fps = info['width'], info['height'], info['fps']

    def _image_to_clip(img_path: str, duration: float, fade: float = 0.5) -> str:
        out = os.path.join(OUTPUT_DIR, f"seg_{uuid.uuid4().hex[:8]}.mp4")
        fade_out_start = max(0, duration - fade)
        cmd = [
            "ffmpeg", "-y",
            "-loop", "1", "-t", str(duration), "-i", img_path,
            "-vf", (
                f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
                f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:black,"
                f"fade=t=in:st=0:d={fade},"
                f"fade=t=out:st={fade_out_start}:d={fade}"
            ),
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-r", str(fps), "-pix_fmt", "yuv420p", "-an", out,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"Image segment failed: {result.stderr[-500:]}")
        return out

    segments = []
    if intro_path:
        segments.append(("video_only", _image_to_clip(intro_path, intro_duration)))
    segments.append(("full", main_path))
    if outro_path:
        segments.append(("video_only", _image_to_clip(outro_path, outro_duration)))

    # Add silent audio to image segments
    final_segments = []
    for seg_type, seg_path in segments:
        if seg_type == "video_only":
            dur = _get_duration(seg_path)
            with_audio = os.path.join(OUTPUT_DIR, f"sa_{uuid.uuid4().hex[:8]}.mp4")
            cmd = [
                "ffmpeg", "-y", "-i", seg_path,
                "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo:d={dur}",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
                with_audio,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise RuntimeError("Silent audio injection failed")
            final_segments.append(with_audio)
        else:
            final_segments.append(seg_path)

    concat_list = os.path.join(OUTPUT_DIR, f"concat_{uuid.uuid4().hex[:8]}.txt")
    with open(concat_list, "w") as f:
        for seg in final_segments:
            f.write(f"file '{os.path.abspath(seg)}'\n")

    concat_cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", concat_list,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
        output_path,
    ]
    result = subprocess.run(concat_cmd, capture_output=True, text=True)

    # Cleanup
    for seg in final_segments:
        if seg != main_path and os.path.exists(seg):
            os.remove(seg)
    if os.path.exists(concat_list):
        os.remove(concat_list)
    if main_path != input_path and os.path.exists(main_path):
        os.remove(main_path)

    if result.returncode != 0:
        raise RuntimeError(f"Concat failed: {result.stderr[-1000:]}")

    logger.info(f"Polished video: {output_path}")
    return output_path