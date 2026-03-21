import sys
import json
import asyncio
import traceback

async def handle_script_mode(input_data):
    from ai.pipeline import run_pipeline
    title      = input_data.get("title")
    tone       = input_data.get("tone", "educational")
    length     = input_data.get("length", 300)
    voice      = input_data.get("voice", "onyx")
    style_mode = input_data.get("style_mode", "timeline")
    if not title:
        raise ValueError("title is required for script mode")
    research_context   = input_data.get("research_context", "")
    series_id          = input_data.get("series_id")
    previously_covered = []
    if series_id and style_mode == "news":
        try:
            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"http://localhost:5000/api/series/{series_id}/scripts")
                if r.status_code == 200:
                    episodes = r.json()
                    # Get last 3 episodes story titles
                    recent = sorted(episodes, key=lambda x: x.get("id", 0), reverse=True)[:3]
                    for ep in recent:
                        scenes = (ep.get("sceneData") or {}).get("scenes", [])
                        for sc in scenes:
                            t = sc.get("title", "")
                            if t and t.lower() not in ["morse intro", "hook", "outro"]:
                                previously_covered.append(t)
        except Exception:
            pass
    script_model = input_data.get("script_model", "openai")
    return await run_pipeline(
        title=title,
        tone=tone,
        length=length,
        voice=voice,
        style_mode=style_mode,
        research_context=research_context,
        previously_covered=previously_covered,
        script_model=script_model,
    )

async def handle_preview_clips(input_data):
    from ai.agents.media_agent import MediaAgent
    from ai.video_pipeline import _build_pipeline_data
    from datetime import date
    scene_data   = input_data.get("sceneData")
    topic        = input_data.get("topic", "")
    visual_style = input_data.get("visualStyle", "realistic")
    video_format = input_data.get("videoFormat", "youtube")
    episode      = input_data.get("episode", 1)
    week         = input_data.get("week", "") or date.today().strftime("%B %-d, %Y")
    if not scene_data:
        raise ValueError("sceneData required")
    pipeline_data = _build_pipeline_data(scene_data, audio_path="", script_id=0, topic=topic)
    pipeline_data["visualStyle"]  = visual_style
    pipeline_data["video_format"] = video_format
    pipeline_data["episode"]      = episode
    pipeline_data["week"]         = week
    agent  = MediaAgent()
    result = await agent.execute(pipeline_data)
    return result["sections"]

async def handle_search_clips(input_data):
    from ai.services.pexels_client import search_video
    query = input_data.get("query", "")
    count = int(input_data.get("count", 4))
    clips = await search_video(query, count=count)
    if not isinstance(clips, list):
        clips = [clips]
    return {"clips": clips, "query": query}

async def handle_video_mode(input_data):
    from ai.video_pipeline import run_video_pipeline
    script_id    = input_data.get("scriptId")
    script_text  = input_data.get("scriptText", "")
    audio_path   = input_data.get("audioPath")
    scene_data   = input_data.get("sceneData")
    visual_style = input_data.get("visualStyle", "realistic")
    video_format = input_data.get("videoFormat", "youtube")
    chapters     = input_data.get("chapters", [])
    episode      = input_data.get("episode", 1)
    week         = input_data.get("week", "")
    if not week:
        from datetime import date
        week = date.today().strftime("%B %-d, %Y")
    if not script_id:
        raise ValueError("scriptId is required for video mode")
    if not audio_path:
        raise ValueError("audioPath is required for video mode")
    selected_scenes = input_data.get("selectedScenes", None)
    return await run_video_pipeline(
        script_id=script_id,
        script_text=script_text,
        audio_path=audio_path,
        scene_data=scene_data,
        selected_scenes=selected_scenes,
        visual_style=visual_style,
        episode=episode,
        week=week,
        video_format=video_format,
        chapters=chapters,
    )

async def handle_generate_cards(input_data):
    from ai.agents.card_generator import generate_cards
    episode = input_data.get("episode", 1)
    week    = input_data.get("week", "")
    if not week:
        from datetime import date
        week = date.today().strftime("%B %-d, %Y")
    return generate_cards(episode=episode, week=week)

async def handle_research(input_data):
    from ai.services.openai_client import generate_script
    import json, os, re
    import httpx
    topic = input_data.get("topic", "")
    style_mode = input_data.get("style_mode", "timeline")
    if not topic:
        raise ValueError("topic is required for research mode")

    # ── HISTORY or BIBLE mode: Wikipedia + Google Books research ──
    if style_mode in ("history", "bible"):
        wiki_context = ""
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                safe = topic.replace(" ", "_")
                r = await client.get(f"https://en.wikipedia.org/api/rest_v1/page/summary/{safe}")
                if r.status_code == 200:
                    data = r.json()
                    wiki_context += "WIKIPEDIA SUMMARY: " + data.get("extract", "") + "\n\n"
                r2 = await client.get("https://en.wikipedia.org/w/api.php", params={
                    "action": "query", "list": "search",
                    "srsearch": topic, "srlimit": 8,
                    "format": "json"
                })
                if r2.status_code == 200:
                    results = r2.json().get("query", {}).get("search", [])
                    wiki_context += "RELATED TOPICS:\n"
                    for res in results[:6]:
                        wiki_context += "- " + res["title"] + ": " + re.sub("<[^>]+>", "", res.get("snippet", "")) + "\n"
        except Exception as e:
            wiki_context = "Wikipedia unavailable: " + str(e)

        # ── Google Books research ─────────────────────────────────
        books_context = ""
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.get("https://www.googleapis.com/books/v1/volumes", params={
                    "q": topic + (" biblical archaeology" if style_mode == "bible" else " history"),
                    "maxResults": 5,
                    "printType": "books",
                    "langRestrict": "en",
                })
                if r.status_code == 200:
                    items = r.json().get("items", [])
                    books_context += "RELEVANT BOOKS:\n"
                    for item in items[:5]:
                        info = item.get("volumeInfo", {})
                        title = info.get("title", "")
                        authors = ", ".join(info.get("authors", []))
                        desc = info.get("description", "")[:300]
                        books_context += "- " + title + " by " + authors + ": " + desc + "\n"
        except Exception as e:
            books_context = ""

        series_name = "Bible Stories While You Sleep" if style_mode == "bible" else "History While You Sleep"
        bible_extra = """
BIBLE-SPECIFIC RESEARCH NOTES:
- Include what archaeology has found (Dead Sea Scrolls, Qumran, Masada, Jerusalem excavations)
- Note what different traditions (Jewish, Christian, Muslim, secular scholarship) say
- Include historical context: Roman occupation, Temple life, daily life in first-century Judea
- Note what is well-established vs what is tradition or legend
""" if style_mode == "bible" else ""
        prompt = (
            f"You are a research assistant for {series_name}.\n"
            f"Topic: \"{topic}\"\n"
            f"WIKIPEDIA RESEARCH:\n{wiki_context}\n"
            f"GOOGLE BOOKS:\n{books_context}\n"
            f"{bible_extra}"
            f"Create a detailed research brief for an immersive sleep narrative.\n"
            f"Return ONLY valid JSON:\n"
            f"{{\n"
            f"  \"research\": \"800-1200 word research brief\",\n"
            f"  \"chapterOutline\": [\n"
            f"    {{\"chapter\":1,\"title\":\"Title\",\"focus\":\"Focus\"}},\n"
            f"    {{\"chapter\":2,\"title\":\"Title\",\"focus\":\"Focus\"}},\n"
            f"    {{\"chapter\":3,\"title\":\"Title\",\"focus\":\"Focus\"}},\n"
            f"    {{\"chapter\":4,\"title\":\"Title\",\"focus\":\"Focus\"}},\n"
            f"    {{\"chapter\":5,\"title\":\"Title\",\"focus\":\"Focus\"}},\n"
            f"    {{\"chapter\":6,\"title\":\"Title\",\"focus\":\"Focus\"}}\n"
            f"  ],\n"
            f"  \"keyFigures\": [\"person 1\", \"person 2\"],\n"
            f"  \"keyDates\": [\"date + event 1\", \"date + event 2\"],\n"
            f"  \"sources\": [{{\"title\":\"{topic}\"}}]\n"
            f"}}"
        )
        import os
        research_model = "groq:llama-3.3-70b-versatile" if os.environ.get("GROQ_API_KEY") else None
        raw = await generate_script(prompt, model=research_model)
        raw = re.sub(r"```(?:json)?", "", raw).strip()
        try:
            data = json.loads(raw)
        except Exception:
            data = {"research": raw, "sources": []}
        return data

    # ── 1. Fetch real current news from NewsAPI ───────────────────
    news_context = ""
    sources = []
    newsapi_key = os.getenv("NEWSAPI_KEY")
    if newsapi_key:
        try:
            categories = {
                "New Models & Tools": "AI model release benchmark GPT Claude Gemini Grok 2026",
                "Business & Jobs": "AI company revenue valuation funding layoffs workforce 2026",
                "Policy & Ethics": "AI regulation government Pentagon military ethics OpenAI Anthropic 2026",
                "Real World Applications": "AI healthcare education jobs automation consumer product 2026",
            }
            category_articles = {cat: [] for cat in categories}
            async with httpx.AsyncClient(timeout=15.0) as client:
                for cat, query in categories.items():
                    try:
                        r = await client.get("https://newsapi.org/v2/everything", params={
                            "q":        query,
                            "sortBy":   "publishedAt",
                            "pageSize": 5,
                            "language": "en",
                            "from":     ((__import__("datetime").date.today() - __import__("datetime").timedelta(days=7)).isoformat()),
                            "apiKey":   newsapi_key,
                        })
                        if r.status_code == 200:
                            articles = r.json().get("articles", [])
                            for a in articles[:3]:
                                title   = a.get("title", "")
                                desc    = a.get("description", "")
                                url     = a.get("url", "")
                                source  = a.get("source", {}).get("name", "")
                                pubdate = a.get("publishedAt", "")[:10]
                                ai_kw = ["ai", "artificial intelligence", "gpt", "llm", "openai", "anthropic", "gemini", "claude", "machine learning", "neural", "model", "robot", "deepmind", "nvidia", "mistral", "chatbot", "automation"]
                            if title and desc and any(kw in (title + desc).lower() for kw in ai_kw):
                                    category_articles[cat].append({
                                        "title": title, "desc": desc,
                                        "url": url, "source": source, "pubdate": pubdate
                                    })
                                    sources.append({"title": title, "url": url})
                    except Exception:
                        pass
            for cat, articles in category_articles.items():
                if articles:
                    news_context += f"\n[CATEGORY: {cat}]\n"
                    for a in articles:
                        news_context += f"- [{a['pubdate']}] {a['title']} ({a['source']}): {a['desc']}\n"
        except Exception as e:
            news_context = ""

    # ── 2. Fetch Hacker News top AI stories ─────────────────────
    hn_context = ""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get("https://hacker-news.firebaseio.com/v0/beststories.json")
            story_ids = r.json()[:80]
            ai_keywords = ["ai", "gpt", "llm", "openai", "anthropic", "gemini", "claude",
                           "machine learning", "neural", "model", "robot", "deepmind",
                           "nvidia", "artificial intelligence", "mistral", "mcp", "agent",
                           "copilot", "cursor", "perplexity", "grok", "xai", "chatbot",
                           "siri", "alexa", "automation", "gpu", "inference", "rag"]
            hn_stories = []
            import asyncio
            async def fetch_story(sid):
                try:
                    sr = await client.get(f"https://hacker-news.firebaseio.com/v0/item/{sid}.json", timeout=5.0)
                    return sr.json()
                except:
                    return None
            story_data = await asyncio.gather(*[fetch_story(sid) for sid in story_ids[:60]])
            for s in story_data:
                if not s or not s.get("title"):
                    continue
                title_lower = s["title"].lower()
                if any(kw in title_lower for kw in ai_keywords):
                    score = s.get("score", 0)
                    url   = s.get("url", "")
                    hn_stories.append((score, s["title"], url))
                    sources.append({"title": s["title"], "url": url})
            hn_stories.sort(reverse=True)
            for score, title, url in hn_stories[:10]:
                hn_context += "- [HN:" + str(score) + "pts] " + title + " " + url + "\n"
    except Exception as e:
        hn_context = ""

    reddit_context = ""

    # ── 3b. Fetch RSS feeds from top AI publications ──────────────
    rss_context = ""
    rss_feeds = [
        ("TechCrunch AI", "https://techcrunch.com/category/artificial-intelligence/feed/"),
        ("The Verge AI",  "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml"),
        ("VentureBeat AI","https://venturebeat.com/category/ai/feed/"),
    ]
    try:
        import xml.etree.ElementTree as ET
        from datetime import datetime, timezone, timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        async with httpx.AsyncClient(timeout=10.0) as client:
            for feed_name, feed_url in rss_feeds:
                try:
                    r = await client.get(feed_url, headers={"User-Agent": "Mozilla/5.0"})
                    if r.status_code != 200:
                        continue
                    root = ET.fromstring(r.text)
                    ns = {"atom": "http://www.w3.org/2005/Atom"}
                    # Handle both RSS and Atom formats
                    items = root.findall(".//item") or root.findall(".//atom:entry", ns)
                    feed_stories = []
                    for item in items[:8]:
                        title_el = item.find("title")
                        link_el  = item.find("link") or item.find("atom:link", ns)
                        desc_el  = item.find("description") or item.find("atom:summary", ns)
                        title = title_el.text.strip() if title_el is not None and title_el.text else ""
                        link  = link_el.text.strip() if link_el is not None and link_el.text else (link_el.get("href", "") if link_el is not None else "")
                        desc  = desc_el.text.strip()[:200] if desc_el is not None and desc_el.text else ""
                        # Strip HTML from desc
                        import re as _re
                        desc = _re.sub(r"<[^>]+>", "", desc).strip()[:200]
                        if title:
                            feed_stories.append(f"- {title}: {desc}")
                            sources.append({"title": title, "url": link})
                    if feed_stories:
                        rss_context += f"\n[{feed_name}]\n" + "\n".join(feed_stories[:5]) + "\n"
                except Exception:
                    pass
    except Exception:
        pass

    # ── 4. Use GPT to synthesize into research summary ────────────
    combined_context = ""
    if news_context:
        combined_context += "AI EDITORIAL BRIEF (GPT-4o curated):\n" + news_context + "\n"
    if rss_context:
        combined_context += "TOP AI PUBLICATIONS:\n" + rss_context + "\n"
    if hn_context:
        combined_context += "HACKER NEWS TRENDING:\n" + hn_context + "\n"
    prompt = f"""You are a research assistant for the AI Weekly Buzz YouTube channel.
Topic: "{topic}"
CURRENT NEWS (organized by category):
{combined_context if combined_context else "No live news available — use your general knowledge."}
Identify the best story per category AND select one Story of the Week (most impactful overall).
Return ONLY a valid JSON object:
{{
  "research": "400-600 word summary organized by category with specific facts, dates, and names",
  "storyOfTheWeek": {{"category": "which category", "headline": "the story headline", "why": "why most impactful this week"}},
  "categoryStories": {{
    "New Models & Tools": "headline + 2-3 key facts",
    "Business & Jobs": "headline + 2-3 key facts",
    "Policy & Ethics": "headline + 2-3 key facts",
    "Real World Applications": "headline + 2-3 key facts"
  }},
  "sources": {json.dumps(sources[:15])},
  "keyPoints": ["key point 1", "key point 2", "key point 3", "key point 4", "key point 5"]
}}
CRITICAL: Return ONLY valid JSON. No markdown. No code fences."""

    raw = await generate_script(prompt)
    raw = re.sub(r"```(?:json)?", "", raw).strip("` \n")
    try:
        data = json.loads(raw)
        data["sources"] = sources[:20]
    except Exception:
        data = {"research": raw, "sources": sources[:20], "keyPoints": []}
    return data

async def handle_regenerate_audio(input_data):
    from ai.agents.voiceover_agent import VoiceoverAgent
    import os, uuid
    text  = input_data.get("text", "")
    voice = input_data.get("voice", "onyx")
    if not text:
        raise ValueError("text is required for regenerate_audio mode")
    agent  = VoiceoverAgent()
    result = await agent.execute({
        "text":  text,
        "voice": voice,
        "index": uuid.uuid4().hex[:8],
    })
    audio_path = result if isinstance(result, str) else result.get("audio_path", "")
    return {"audio_path": audio_path}

async def handle_polish_video(input_data):
    from ai.agents.post_processor import polish_video
    import base64, tempfile, os

    input_path      = input_data.get("inputPath")
    intro_b64       = input_data.get("introImage")
    intro_dur       = float(input_data.get("introDuration", 3.0))
    outro_b64       = input_data.get("outroImage")
    outro_dur       = float(input_data.get("outroDuration", 5.0))
    trim_start      = float(input_data.get("trimStart", 0.0))
    trim_end        = float(input_data.get("trimEnd",   0.0))
    subtitle_style  = input_data.get("subtitleStyle",  None)
    burn_subtitles  = bool(input_data.get("burnSubtitles", False))
    script_sections = input_data.get("scriptSections", None)

    if not input_path or not os.path.exists(input_path):
        raise ValueError(f"inputPath not found: {input_path}")

    intro_path = outro_path = None
    tmp_files  = []

    def _save_b64(b64_str: str, suffix: str) -> str:
        data = base64.b64decode(b64_str)
        tmp  = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        tmp.write(data); tmp.close()
        tmp_files.append(tmp.name)
        return tmp.name

    if intro_b64:
        intro_path = _save_b64(intro_b64, ".png")
    if outro_b64:
        outro_path = _save_b64(outro_b64, ".png")

    try:
        output_path = polish_video(
            input_path=input_path,
            script_sections=script_sections,
            intro_path=intro_path,
            intro_duration=intro_dur,
            outro_path=outro_path,
            outro_duration=outro_dur,
            trim_start=trim_start,
            trim_end=trim_end,
            subtitle_style=subtitle_style,
            burn_subtitles=burn_subtitles,
        )
    finally:
        for f in tmp_files:
            if os.path.exists(f): os.remove(f)

    return {"video_path": output_path}

async def main():
    try:
        try:
            input_data = json.load(sys.stdin)
        except Exception:
            raise ValueError("Invalid JSON input from Node process")
        mode = input_data.get("mode", "script")
        if mode == "script":
            result = await handle_script_mode(input_data)
        elif mode == "video":
            result = await handle_video_mode(input_data)
        elif mode == "preview_clips":
            result = await handle_preview_clips(input_data)
        elif mode == "search_clips":
            result = await handle_search_clips(input_data)
        elif mode == "generate_cards":
            result = await handle_generate_cards(input_data)
        elif mode == "research":
            result = await handle_research(input_data)
        elif mode == "regenerate_audio":
            result = await handle_regenerate_audio(input_data)
        elif mode == "polish_video":
            result = await handle_polish_video(input_data)
        else:
            raise ValueError(f"Unknown mode: {mode}")
        print(json.dumps({"status": "success", "data": result}))
        sys.stdout.flush()
    except Exception as e:
        traceback.print_exc()
        print(json.dumps({"status": "error", "error": str(e)}))
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
