"""
history_script_chunker.py
Generates full 8,000+ word History While You Sleep episodes by making
one API call per scene, bypassing GPT-4o's ~4K output token ceiling.

Each call receives:
  - A shared episode "bible" (tone, style rules, characters, setting)
  - The specific scene brief (what this chapter covers)
  - A rolling context summary (what was established in prior chapters)

Returns a scene_data dict in the EXACT same format as ScriptWriterAgent._run()
so the rest of the pipeline (voiceover, video, DB storage) is unchanged.

Usage (called from ScriptWriterAgent._run when style_mode == "history"):
    from ai.agents.history_script_chunker import generate_chunked_history
    scene_data = await generate_chunked_history(topic_dict, progress_callback)
"""

import asyncio
import json
import re
from ai.services.openai_client import generate_script
from ai.utils.logger import logger

# ── Target word counts per scene type ────────────────────────────────────────
HOOK_WORDS        = 350    # scene 2 — opening hook
CHAPTER_WORDS     = 1100   # scenes 3–8 — main chapters
CLOSING_WORDS     = 350    # scene 9 — closing reflection
SUMMARY_WORDS     = 120    # rolling context summary (cheap mini call)

# ── Chapter definitions per episode type ─────────────────────────────────────
CHAPTER_PLANS = {
    "daily_life": [
        ("Opening Hook",       "Before dawn. The city or village is completely still. Set the scene — the place, the era, the season. Introduce the specific person or people we will follow today. End with the first light beginning to touch the sky."),
        ("Waking & Morning",   "The household stirs before sunrise. Morning rituals, prayers, the first tasks of the day. The sounds, smells, and textures of waking in this era. What does breakfast look like? Who is already at work?"),
        ("Work & Commerce",    "The heart of the working day. Follow your characters into their labor — the market, the field, the workshop, the kitchen. The tools, the transactions, the rhythms of commerce in this world."),
        ("Food & Meals",       "The midday meal or main feast. What do people eat, how is it prepared, who eats together and who does not? Food as social ritual, as class marker, as daily miracle."),
        ("Social Life",        "The afternoon — community, gossip, religion, politics as it touches ordinary people. The gathering places: the well, the tavern, the temple, the square. What are people talking about?"),
        ("Evening",            "The day winds down. Evening meals, family, candlelight. What does rest look like after a day of labor? The rituals of nightfall — locking doors, banking fires, saying prayers."),
        ("Night",              "The city or village at night. Who is still awake and why? The sounds of darkness, the dangers, the quiet. The world settling into sleep — just as the listener is doing now."),
        ("Closing Reflection", "Pull back from the specific day to the broader sweep of this era. What made these lives beautiful, difficult, extraordinary? End very slowly — the last candle going out, the world going quiet."),
    ],
    "why_wouldnt_survive": [
        ("Opening Hook",       "Drop the listener — as 'you' — into a single brutal morning in this era. Present tense, second person. You wake up. Everything is already hard. Establish the world through immediate physical sensation."),
        ("Sleeping & Shelter", "Where and how you would sleep. The cold, the damp, the vermin, the noise. Shared beds, shared rooms, shared everything. The statistics of what sleeping conditions did to health and life expectancy."),
        ("Food & Water",       "What you would eat and drink — and what would try to kill you. Contaminated water, preserved meat, seasonal starvation, the absence of everything you consider normal. Real calories, real malnutrition rates."),
        ("Disease & Medicine", "The invisible world of illness in this era. What was killing people, how fast, how young. The treatments — which were often worse than the disease. The complete absence of anything resembling modern medicine."),
        ("Work & Labor",       "The physical reality of daily work — the injuries, the hours, the total absence of safety, the labor that began in childhood and ended only at death. Real working conditions, real accident rates."),
        ("Danger & Violence",  "The ambient violence of this world — crime, warfare, punishment, arbitrary power. The legal system as an instrument of terror. What you could be executed for. How little protection ordinary people had."),
        ("Closing Reflection", "Bring the listener gently back to the present. Their warm bed, their clean water, the miracle of antibiotics, the extraordinary luck of being alive now. End in genuine gratitude and wonder. Very slow and peaceful."),
    ],
    "full_story": [
        ("Opening Hook",       "Drop into the single most dramatic moment of this entire story — a battle, betrayal, discovery, death, or triumph. No context. Pure drama. Let the scene breathe, then pull back with 'But to understand how we got here...'"),
        ("Origins",            "The beginning of this story. The world as it was before. The people, the conditions, the tensions that made what followed inevitable. Introduce the key figures as real human beings with specific traits and desires."),
        ("Rise",               "The ascent — the growth of power, the spread of ideas, the accumulation of events. The turning points that could have gone differently. What did the people living through this believe was happening?"),
        ("Crisis",             "The moment everything changed — the conflict, the disaster, the revelation, the war. The human cost in specific terms. The decisions made by specific people on specific days."),
        ("Turning Point",      "The pivot — the battle that decided it, the death that ended it, the idea that survived it. What happened to the individuals we have been following? Where were they when the world shifted?"),
        ("Aftermath",          "The immediate aftermath — what was left, who survived, what had to be rebuilt or mourned. The world in the weeks and months after the story's climax. The human reckoning."),
        ("Legacy",             "What this story became in the centuries that followed. How it was remembered, distorted, mythologized. What it actually changed about the world. What we owe to it — or what we lost because of it."),
        ("Closing Reflection", "Philosophical and slow. What does this story tell us about human nature — about ambition, love, power, failure, survival? End on a line that invites the listener to carry the story into sleep with them."),
    ],
    "secrets_of": [
        ("Opening Hook",       "Open with the single most counterintuitive or surprising fact about this topic. Something that makes the listener think: 'wait — really?' Build from that surprise into the promise of what this episode will reveal."),
        ("Secret One",         "The first hidden truth — a major misconception corrected, or a forgotten reality revealed. Lead with what most people think, then gently reveal the more complex or surprising reality with specific evidence."),
        ("Secret Two",         "The second secret — go deeper. Something about daily life, social customs, or physical reality that would shock modern people. Concrete details, real examples, real people where possible."),
        ("Secret Three",       "The third secret — focus on something sensory or intimate: food, beauty, medicine, love, or the body. What was considered normal that we would find extraordinary? What did people believe that turns out to be true — or fascinatingly wrong?"),
        ("Secret Four",        "The fourth secret — power, crime, or the dark side of this world. What did official history leave out? What did ordinary people know that rulers wanted hidden? The gap between the story we tell and the reality people lived."),
        ("Secret Five",        "The fifth secret — something about technology, engineering, trade, or knowledge that was lost or forgotten. What could these people do that we cannot, or that we only rediscovered centuries later?"),
        ("Secret Six",         "The sixth secret — something about death, belief, the supernatural, or how people made meaning in this world. What did they know about endings that we have forgotten? What comforted them?"),
        ("Closing Reflection", "The past is never quite what we imagined — and somehow that makes it more human, more real, more alive. End with the sense of wonder that comes from truly seeing another era. Very slow, very quiet, inviting sleep."),
    ],
    "how_survived": [
        ("Opening Hook",       "Drop into a moment of acute crisis — cold, starvation, siege, plague, shipwreck, drought. The threat is real and immediate. Establish the stakes: this is what survival actually looked like."),
        ("Food & Preservation","The challenge of feeding people through shortage, season, and the absence of refrigeration. The specific methods they developed — fermentation, salting, smoking, drying, root cellars. The ingenuity of necessity."),
        ("Shelter & Warmth",   "How people kept warm and dry against conditions that would kill a modern person in days. The specific building techniques, the fuels, the social arrangements — the entire architecture of staying alive through winter."),
        ("Water & Sanitation", "The invisible battle against waterborne disease, waste, and contamination. The solutions they found — often brilliant, sometimes bizarre. The role of beer, of boiling, of civic engineering in keeping people alive."),
        ("Medicine & Injury",  "How people survived wounds, illness, and childbirth without anything modern medicine would recognize. The specific treatments that actually worked — and the surprising scientific reasoning behind some of them."),
        ("Community & Trade",  "The social technology of survival — the networks of mutual aid, the trade routes that moved food across continents, the guild systems and granaries and commons that prevented mass death. Survival was always collective."),
        ("Closing Reflection", "We inherited all of this. Every warm night, every full stomach, every safe water supply — built on centuries of their ingenuity and suffering. Rest now in that inheritance. You are here because they were brilliant. Sleep well."),
    ],
}

# Default to daily_life structure for unknown types
CHAPTER_PLANS["default"] = CHAPTER_PLANS["daily_life"]


# ── Shared writing rules (matches base_rules in script_writer.py) ─────────────
def _base_rules(length: int) -> str:
    chapter_target = max(300, length // 8)
    return f"""WRITING RULES — NON-NEGOTIABLE:
You are not writing an encyclopedia. You are TELLING A STORY.

SPECIFICITY IS EVERYTHING:
- Use real names, real places, real dates, real numbers.
- BAD: "People suffered during the plague."
- GOOD: "In the autumn of 1348, the streets of Florence fell silent. Half the city — perhaps sixty thousand souls — were dead within eight months."

SENSORY DETAIL IS MANDATORY:
- Every paragraph needs at least one sound, smell, texture, or temperature.
- BAD: "The market was busy and loud."
- GOOD: "The market reeked of salt fish and horse dung, and the air rang with the cries of vendors hawking bolts of cloth from Flanders and copper pots from Bristol."

SENTENCE RHYTHM:
- Alternate between long flowing sentences and short ones. The short ones land hard.
- Use ellipses and em-dashes to create natural pause points for narration.
- Never write more than four sentences in a row at the same length.

YOUR TARGET: exactly {chapter_target} words. Count them. Do not stop early.

NEVER DO THESE:
- No bullet points or numbered lists inside narration.
- Never say "in conclusion", "to summarize", "as we have seen".
- Never write academic abstractions. Concrete always beats abstract.
- Never repeat information from earlier chapters (see CONTEXT SUMMARY below).

THE LISTENER IS FALLING ASLEEP:
- The pace should slow as the episode progresses.
- By the final chapters, sentences should get longer and quieter.
- End every chapter on a line that settles rather than excites."""


def _build_bible(title: str, script_type: str, research: str) -> str:
    """The shared context sent with every chapter call."""
    type_descriptions = {
        "daily_life":          "Daily Life — following specific people through a single day from before dawn to night",
        "why_wouldnt_survive": "Why You Wouldn't Survive — putting the listener (second person 'you') into the physical reality of this era",
        "full_story":          "The Full Story — an epic narrative of rise, crisis, fall, and legacy",
        "secrets_of":          "Secrets Of — revealing surprising hidden truths and correcting misconceptions",
        "how_survived":        "How They Survived — celebrating human ingenuity and resilience against impossible conditions",
    }
    episode_type = type_descriptions.get(script_type, "Historical narrative")
    research_text = research if research else "Use your deep knowledge of this historical topic."

    return f"""EPISODE BIBLE — READ THIS BEFORE WRITING ANYTHING
=======================================================
Series: History While You Sleep
Episode title: {title}
Episode type: {episode_type}
Voice: Onyx (deep, warm, measured). Speed: 0.88x. This is sleep narration.
Audience: Adults listening in bed, lights off, eyes closed.

RESEARCH CONTEXT (use all specific facts, names, dates from this):
{research_text}

TONE THROUGHOUT:
- Warm, intimate, authoritative — like a trusted storyteller whispering in a dark room.
- Wonder and deep respect for the people of this era. Never condescending.
- Immersive. The listener should feel transported, not lectured.
- As the episode progresses the pace slows, sentences lengthen, energy drops toward sleep.
======================================================="""


async def _generate_scene(
    bible: str,
    scene_brief: str,
    scene_title: str,
    scene_number: int,
    target_words: int,
    context_summary: str,
    model_arg: str | None,
    base_rules: str,
) -> str:
    """Generate narration for a single scene. Returns voText string."""

    context_block = ""
    if context_summary:
        context_block = f"""
CONTEXT SUMMARY — what has been established in earlier chapters:
{context_summary}
Do NOT repeat any of the above. Continue the narrative naturally from where it left off.
"""

    prompt = f"""{bible}
{base_rules}
{context_block}
YOUR TASK: Write Scene {scene_number} — "{scene_title}"

SCENE BRIEF:
{scene_brief}

TARGET: {target_words} words of narration. Count carefully. Do not stop early.

Return ONLY the narration text — no JSON, no labels, no scene numbers, no headers.
Just the flowing narration prose, ready to be read aloud."""

    import asyncio
    for attempt in range(3):
        result = await generate_script(prompt, model=model_arg)
        if result and len(result.strip()) > 100:
            return result
        logger.warning(f"[chunker] Empty response attempt {attempt+1}, retrying in 10s...")
        await asyncio.sleep(10)
        # On final attempt fall back to OpenAI if Groq keeps failing
        if attempt == 1 and model_arg and "groq" in model_arg:
            logger.warning("[chunker] Groq empty response — falling back to GPT-4o")
            result = await generate_script(prompt, model=None)
            if result and len(result.strip()) > 100:
                return result
    return result or ""


async def _summarise_chapter(
    narration: str,
    scene_title: str,
    model_arg: str | None,
) -> str:
    """
    Cheap summary call (GPT-4o-mini or Groq) to extract what was established.
    This prevents chapter 4 from contradicting chapter 2.
    """
    prompt = f"""You just wrote a chapter titled "{scene_title}" for a History While You Sleep episode.

Chapter text:
{narration[:3000]}  

In 3-5 bullet points (max {SUMMARY_WORDS} words total), list:
- Key people or characters introduced by name
- Key places mentioned by name  
- Key facts, dates, or statistics stated
- The emotional tone or narrative thread established
- Where the chapter ended (so the next chapter can continue naturally)

Be extremely concise. This summary is passed to the next chapter as context."""

    # Always use a cheap model for summaries — this is not creative work
    summary_model = "groq:llama-3.3-70b-versatile" if model_arg and "groq" in model_arg else None
    try:
        return await generate_script(prompt, model=summary_model)
    except Exception:
        # Summary is non-critical — silently skip if it fails
        return f"Previous chapter: {scene_title} — content established, continue naturally."


async def generate_chunked_history(
    topic_dict: dict,
    progress_callback=None,
) -> dict:
    """
    Generate a full history episode via sequential per-scene API calls.

    Args:
        topic_dict: same dict passed to ScriptWriterAgent._run()
        progress_callback: optional async callable(dict) for frontend progress SSE
                           called with: {"status": "writing"|"done"|"summarising",
                                         "scene_number": int, "scene_title": str,
                                         "word_count": int (when done)}

    Returns:
        scene_data dict — identical structure to ScriptWriterAgent._extract_json()
        so the rest of the pipeline is completely unchanged.
    """
    title       = topic_dict["title"]
    tone        = topic_dict.get("tone", "daily_life")   # tone carries script_type
    length      = topic_dict.get("length", 8000)
    research    = topic_dict.get("research_context", "")
    script_model = topic_dict.get("script_model", "openai")
    model_arg   = "groq:llama-3.3-70b-versatile" if script_model == "groq" else None

    script_type = tone  # matches script_writer.py convention
    chapter_plan = CHAPTER_PLANS.get(script_type, CHAPTER_PLANS["daily_life"])

    bible      = _build_bible(title, script_type, research)
    base_rules = _base_rules(length)
    scenes     = []
    context_summary = ""

    # ── Scene 1: History Intro (static placeholder, no API call needed) ──────
    scenes.append({
        "sceneNumber":          1,
        "title":                "History Intro",
        "voText":               "[HISTORY_INTRO]",
        "visualPrompt":         "history while you sleep intro",
        "suggestedVisualStyle": "history",
        "chapterTitle":         None,
        "wordCount":            0,
    })

    # ── Scenes 2–N: one API call each ────────────────────────────────────────
    # chapter_plan has: (scene_title, scene_brief) for each scene
    # scene 2 = hook, scenes 3–(N-1) = chapters, scene N = closing reflection

    total_scenes = len(chapter_plan) + 1  # +1 for the static intro

    for plan_index, (scene_title, scene_brief) in enumerate(chapter_plan):
        scene_number = plan_index + 2  # scene 1 is the static intro

        # Determine word target for this scene
        is_hook    = plan_index == 0
        is_closing = plan_index == len(chapter_plan) - 1
        if is_hook or is_closing:
            target_words = HOOK_WORDS if is_hook else CLOSING_WORDS
        else:
            target_words = CHAPTER_WORDS

        logger.info(f"[chunker] Scene {scene_number}/{total_scenes}: {scene_title} (~{target_words} words)")

        if progress_callback:
            await progress_callback({
                "status":       "writing",
                "scene_number": scene_number,
                "scene_title":  scene_title,
                "total_scenes": total_scenes,
            })

        # ── Generate this scene ───────────────────────────────────────────
        narration = await _generate_scene(
            bible=bible,
            scene_brief=scene_brief,
            scene_title=scene_title,
            scene_number=scene_number,
            target_words=target_words,
            context_summary=context_summary,
            model_arg=model_arg,
            base_rules=base_rules,
        )

        word_count = len(narration.split())
        logger.info(f"[chunker]   → {word_count} words generated")

        # Build the scene dict — matches existing JSON structure exactly
        # Chapter title for transition card: strip "Opening Hook" / "Closing Reflection"
        # Use the scene_title directly as the chapter card title
        is_chapter = not is_hook and not is_closing
        scenes.append({
            "sceneNumber":          scene_number,
            "title":                scene_title,
            "voText":               narration.strip(),
            "visualPrompt":         f"{title} historical scene",
            "suggestedVisualStyle": "history",
            "chapterTitle":         scene_title if is_chapter else None,
            "wordCount":            word_count,
        })

        if progress_callback:
            await progress_callback({
                "status":       "done",
                "scene_number": scene_number,
                "scene_title":  scene_title,
                "word_count":   word_count,
                "total_scenes": total_scenes,
            })

        # ── Summarise for rolling context (skip after closing reflection) ──
        if not is_closing:
            if progress_callback:
                await progress_callback({
                    "status":       "summarising",
                    "scene_number": scene_number,
                    "scene_title":  scene_title,
                    "total_scenes": total_scenes,
                })
            new_summary = await _summarise_chapter(narration, scene_title, model_arg)
            # Append to rolling context, keep it bounded
            context_summary = (context_summary + "\n\n" + new_summary).strip()
            # Cap at ~800 words to avoid bloating the context window
            context_words = context_summary.split()
            if len(context_words) > 800:
                context_summary = " ".join(context_words[-600:])

    # ── Assemble final scene_data dict (identical to ScriptWriterAgent output) ─
    total_words = sum(s["wordCount"] for s in scenes)
    total_duration_secs = round((total_words / 175) * 60, 1)  # TTS actual speed  # NARRATION_WPM = 140

    # Add estimatedDuration per scene (matches ScriptWriterAgent._run())
    for scene in scenes:
        words = scene["wordCount"] or len(scene["voText"].split())
        scene["estimatedDuration"] = round((words / 140) * 60, 1)

    # Build chapters list for chapter_segment_builder (new field, ignored by old pipeline)
    chapters_for_video = [
        {
            "index": s["sceneNumber"] - 1,  # 0-based for segment builder
            "title": s["chapterTitle"] or s["title"],
            "scene_number": s["sceneNumber"],
        }
        for s in scenes
        if s.get("chapterTitle")  # only actual chapter scenes get title cards
    ]

    scene_data = {
        "title":                   title,
        "styleMode":               "history",
        "scriptType":              script_type,
        "scenes":                  scenes,
        "chapters":                chapters_for_video,   # used by chapter_segment_builder
        "totalEstimatedDuration":  total_duration_secs,
        "totalWordCount":          total_words,
        "youtubeHooks":            [
            f"What was daily life really like in {title}?",
            f"The history of {title} — the full story",
            f"History While You Sleep: {title}",
        ],
        "tweetHooks":              [
            f"New episode: {title} — history for your sleep playlist",
        ],
        "episodeSummary": f"A full History While You Sleep episode about {title}. {total_words} words, approximately {round(total_duration_secs/60, 0):.0f} minutes of narration.",
    }

    logger.info(
        f"[chunker] Complete: {len(scenes)} scenes, "
        f"{total_words} words, "
        f"~{round(total_duration_secs/60, 1)} min"
    )

    return scene_data