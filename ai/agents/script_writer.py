import os
import re
import json
from ai.agents.base_agent import BaseAgent
from ai.services.openai_client import generate_script
from ai.utils.logger import logger
from ai.agents.history_script_chunker import generate_chunked_history

NARRATION_WPM = 175  # actual OpenAI TTS speed at 0.88x  # average words per minute for documentary narration


class ScriptWriterAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="ScriptWriter")
        self.output_dir = "storage/output/scripts"
        os.makedirs(self.output_dir, exist_ok=True)

    async def _run(self, topic_dict: dict) -> dict:
        title      = topic_dict["title"]
        tone       = topic_dict.get("tone", "informative")
        length     = topic_dict.get("length", 800)
        style_mode = topic_dict.get("style_mode", "timeline")

        research          = topic_dict.get("research_context", "")
        previously_covered = topic_dict.get("previously_covered", [])
        script_model       = topic_dict.get("script_model", "openai")
        if style_mode in ("history", "bible"):
            progress_cb = topic_dict.get("progress_callback", None)
            scene_data = await generate_chunked_history(topic_dict, progress_callback=progress_cb)
        else:
            prompt             = self._build_prompt(title, tone, length, style_mode, research, previously_covered)
            model_arg          = "groq:llama-3.3-70b-versatile" if script_model == "groq" else None
            raw_response = await generate_script(prompt, model=model_arg)

            # Try to parse as structured JSON — fall back to old VO/BROLL format
            scene_data = self._extract_json(raw_response)
            if not scene_data:
                logger.warning("JSON parse failed — falling back to VO/BROLL parser")
                scene_data = self._legacy_parse(raw_response, title)

        # Calculate how long each scene will take to narrate
        for scene in scene_data["scenes"]:
            words = len(scene["voText"].split())
            scene["estimatedDuration"] = round((words / NARRATION_WPM) * 60, 1)

        scene_data["totalEstimatedDuration"] = round(
            sum(s["estimatedDuration"] for s in scene_data["scenes"]), 1
        )
        scene_data["styleMode"] = style_mode

        # Save files
        safe_title = re.sub(r"[^\w\s-]", "", title).strip().lower()
        safe_title = re.sub(r"[-\s]+", "-", safe_title)[:50]

        json_path = os.path.join(self.output_dir, f"{safe_title}.json")
        txt_path  = os.path.join(self.output_dir, f"{safe_title}.txt")

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(scene_data, f, indent=2)

        # Write VO/BROLL text format — pipeline.py reads this
        full_text = "\n\n".join(
            f"VO:\n{s['voText']}\n\nBROLL:\n{s['visualPrompt']}"
            for s in scene_data["scenes"]
        )
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(full_text)

        total_mins = round(scene_data["totalEstimatedDuration"] / 60, 1)
        logger.info(
            f"Script: {len(scene_data['scenes'])} scenes, "
            f"~{total_mins} min estimated"
        )

        return {
            "script_path": txt_path,    # pipeline.py reads this path
            "scene_data":  scene_data,  # stored in DB for video pipeline
            "json_path":   json_path,
        }

    def _build_prompt(self, title: str, tone: str, length: int, style_mode: str, research: str = "", previously_covered: list = []) -> str:
        structures = {
            "timeline": (
                "Chronological: Opening Hook → Early History → "
                "Key Developments → Modern Era → Future Outlook → CTA"
            ),
            "3act": (
                "3 Acts: Act 1 (Setup & Hook) → "
                "Act 2 (Conflict & Deep Dive) → Act 3 (Resolution & CTA)"
            ),
            "hook": (
                "Hook (10s) → Context (30s) → Deep Dive (bulk) → Summary → CTA"
            ),
        }
        structure = structures.get(style_mode, "Clear opening, body sections, strong conclusion.")

        # ── AI Weekly Buzz news format ──────────────────────────────
        if style_mode == "news":
            no_research = "No research provided — use your best knowledge of recent AI news."
            research_text = no_research if not research else research
            prev_text = ""
            if previously_covered:
                prev_text = "\nPREVIOUSLY COVERED (do NOT repeat these stories):\n" + "\n".join(f"- {s}" for s in previously_covered) + "\n"
            return f"""You are the scriptwriter for AI Weekly Buzz — a weekly AI news show on YouTube.

MISSION: Cut through the noise. Every week millions of AI headlines compete for attention. Your job is to identify the ones that actually matter to real people and explain them in plain English with a point of view.

CHANNEL VOICE: You are a sharp well-informed friend. Not a newsreader. Not a professor. Someone who reads everything so your viewer does not have to and tells them what it actually means for their life job and future.

Topic: "{title}"
Target: {length} words of voiceover total. This is NON-NEGOTIABLE. Count every word you write.
Approximate scene word budgets based on your {length} word target (MUST hit these — do not write less):
- Scene 2 Hook: {max(90, length // 13)} words
- Scene 3 Story One: {max(150, length // 8)} words
- Scene 4 Story Two: {max(150, length // 8)} words
- Scene 5 Story Three: {max(150, length // 8)} words
- Scene 6 Story of the Week: {max(300, length // 4)} words
- Scene 7 Quick Hits: {max(80, length // 15)} words
- Scene 8 Outro: {max(70, length // 17)} words
Do NOT stop writing a scene until you have reached its word budget. Write full sentences. No bullet points.

RESEARCH CONTEXT (use ALL specific facts, names, dates, numbers — do not invent anything):
{research_text}{prev_text}

EDITORIAL JUDGMENT:
From all the research above select the 4-5 most impactful stories. Ask yourself: would a nurse, a teacher, a software developer, or a small business owner care about this? If yes it is in. If it is only interesting to AI researchers or investors cut it.
Your Story of the Week is the one story that will change how someone thinks about AI this week. It gets the most time and the deepest treatment.

STRICT STRUCTURE (8 scenes, ~1,200 words total):

Scene 1: MORSE INTRO — voText must be exactly: [MORSE_INTRO]

Scene 2: HOOK (90-110 words)
Open on the single most jaw-dropping fact or development from this week. No welcome back or hi everyone. Drop straight into the story. Make the viewer feel like they almost missed something huge.
End with exactly: "This is AI Weekly Buzz. Let's get into it."

Scene 3: STORY ONE — write AT LEAST 160 words, target 180 words
The second most important story this week. Write full flowing narration — not bullet points.
Open with one punchy headline sentence. Then: full context of what happened with specific names companies numbers dates. Then: why it matters to a normal person — name the exact type of person affected and how their life or work changes. Then: one forward-looking sentence on what comes next.
DO NOT move to the next scene until you have written at least 160 words for this scene.

Scene 4: STORY TWO — write AT LEAST 160 words, target 180 words
The third most important story. Different category from Story One — if Story One was about a model release make this about policy jobs or real-world impact.
Same format as Scene 3. Full narration. No bullet points. At least 160 words.
DO NOT move to the next scene until you have written at least 160 words for this scene.

Scene 5: STORY THREE — write AT LEAST 160 words, target 180 words
Fourth most important story. Again a different angle from the previous two stories.
Same format as Scene 3. Full narration. At least 160 words.
DO NOT move to the next scene until you have written at least 160 words for this scene.

Scene 6: STORY OF THE WEEK — write AT LEAST 350 words, target 400 words
The biggest story of the week. This is the centerpiece of the episode. Three mandatory movements — write each one fully:

WHAT HAPPENED (write at least 100 words): Full context. Names dates numbers sequence of events in order. Assume the viewer has never heard this story before. Give them everything they need to understand it.

WHY THIS CHANGES EVERYTHING (write at least 150 words): The real-world consequence. Who is affected — be uncomfortably specific. Name industries job titles dollar amounts careers relationships. Do not soften it. This is the moment the viewer feels the weight of the story.

WHAT TO WATCH (write at least 80 words): The next domino. What specific event signal or decision in the next 30 days will tell us where this is heading? Give the viewer one concrete thing to watch for.

DO NOT move to the next scene until you have written at least 350 words for this scene.

Scene 7: QUICK HITS — write AT LEAST 80 words
2-3 rapid-fire stories from the RESEARCH CONTEXT ONLY. Do NOT invent stories. Only use facts from the research provided above.
One to two sentences each. Fast pace. Start with: "Also this week..."
If the research only has 2 quick hit stories, expand each to 2 sentences to reach 80 words.
DO NOT make this section shorter than 80 words.

Scene 8: OUTRO — write AT LEAST 80 words, target 90 words
Do not summarize. Zoom out. What do all these stories have in common? What does this week tell us about where AI is actually heading?
Land on something human. A thought that makes the viewer feel informed and capable not overwhelmed.
End with exactly: "New episode next week on AI Weekly Buzz. I'll see you in the next one."
DO NOT make this shorter than 80 words.

Return ONLY valid JSON. No markdown. No code fences.
{{
  "title": "{title}",
  "scenes": [
    {{"sceneNumber": 1, "title": "Morse Intro", "voText": "[MORSE_INTRO]", "visualPrompt": "morse code animation", "suggestedVisualStyle": "news"}},
    {{"sceneNumber": 2, "title": "Hook", "voText": "hook text...", "visualPrompt": "ai technology news breaking", "suggestedVisualStyle": "news"}},
    {{"sceneNumber": 3, "title": "Story One — headline here", "voText": "story...", "visualPrompt": "relevant 3-5 word query", "suggestedVisualStyle": "news", "source": "", "category": ""}},
    {{"sceneNumber": 4, "title": "Story Two — headline here", "voText": "story...", "visualPrompt": "relevant 3-5 word query", "suggestedVisualStyle": "news", "source": "", "category": ""}},
    {{"sceneNumber": 5, "title": "Story Three — headline here", "voText": "story...", "visualPrompt": "relevant 3-5 word query", "suggestedVisualStyle": "news", "source": "", "category": ""}},
    {{"sceneNumber": 6, "title": "Story of the Week — headline here", "voText": "deep dive...", "visualPrompt": "relevant 3-5 word query", "suggestedVisualStyle": "news", "source": "", "category": "Story of the Week"}},
    {{"sceneNumber": 7, "title": "Quick Hits", "voText": "quick hits...", "visualPrompt": "ai news technology montage", "suggestedVisualStyle": "news"}},
    {{"sceneNumber": 8, "title": "Outro", "voText": "outro text...", "visualPrompt": "ai weekly buzz outro", "suggestedVisualStyle": "news"}}
  ],
  "youtubeHooks": ["hook 1", "hook 2", "hook 3"],
  "tweetHooks": ["tweet 1", "tweet 2", "tweet 3"],
  "episodeSummary": "Two sentence summary."
}}
"""
        # ── AI Weekly Buzz Deep Dive / Impact format ──────────────
        if style_mode == "impact":
            research_text = research if research else "No research provided — use your best knowledge of recent AI news."
            return (
                "You are the scriptwriter for AI Weekly Buzz: Deep Dive.\n\n"
                "This week\'s AI Weekly Buzz episode covered these stories:\n"
                + research_text + "\n\n"
                "YOUR FIRST JOB: Read all the stories above. Pick the 2 that will hit hardest for everyday people — "
                "not the most technically impressive, but the ones most likely to affect someone\'s job, money, family, or daily routine. "
                "Ignore stories that are only interesting to tech insiders.\n\n"
                "Write a 6-7 minute script (target: 800-900 words).\n"
                "Topic: \"" + title + "\"\n\n"
                "TONE — this is non-negotiable:\n"
                "- You are a trusted friend who happens to understand AI. Not a teacher. Not an anchor. A friend.\n"
                "- Start each story by painting a specific human scenario. A nurse. A freelance writer. A dad who drives for Uber. Put the viewer IN the story before you explain the news.\n"
                "- Name the uncomfortable truth directly. Do not soften it. Then immediately give them something to hold onto.\n"
                "- Every action must be specific. Not \'consider upskilling\'. Say: \'Go to claude.ai, type this exact prompt, and try it on your actual work task today.\' Give them the next 10 minutes, not a 6-month plan.\n"
                "- Use \"you\" every single time. Never \"people\", \"viewers\", \"folks\", or \"many\".\n"
                "- Plain English only. One jargon term maximum per scene, explained immediately after in one sentence.\n\n"
                "STRICT STRUCTURE (6 scenes):\n"
                "Scene 1: MORSE INTRO — voText must be exactly: [MORSE_INTRO]\n"
                "Scene 2: HOOK (70-90 words) — Open by painting a specific relatable moment of someone encountering AI in their normal life and feeling unsure or threatened. Make it vivid and specific — a real job, a real moment. Then: \'This week on AI Weekly Buzz we covered [story 1] and [story 2]. I picked these two because out of everything we reported on this week, these are the ones most likely to show up in your actual life. Let\'s talk about what they really mean for you.\'\n"
                "Scene 3: DEEP DIVE 1 (320-380 words) — First story. Follow this exact flow:\n"
                "  - OPEN WITH A PERSON (40-50 words): Paint one specific human in one specific moment where this story becomes real for them. Use present tense. Make it cinematic.\n"
                "  - THE PLAIN TRUTH (60-80 words): What actually happened. Explain it like the person you just described is reading it. Zero jargon. If you must use one tech term explain it immediately.\n"
                "  - WHY THIS ONE HITS DIFFERENT (80-100 words): This is not generic impact. Pick a specific type of person — a job title, a life situation — and walk through exactly how their day, their income, or their routine changes because of this story. Be uncomfortably specific.\n"
                "  - YOUR MOVE (80-100 words): One action. Make it something they can do in the next 10 minutes. Name the exact tool, the exact website, the exact first step. If it is a threat — one protective move. If it is an opportunity — one way to get ahead right now. End this section with one sentence that makes them feel capable, not overwhelmed.\n"
                "Scene 4: BRIDGE (30-40 words) — A single short breath between the two stories. Acknowledge that the first story was a lot. Then pivot: \'The second story I want to talk about is different — but in some ways it\'s even more personal.\'\n"
                "Scene 5: DEEP DIVE 2 (320-380 words) — Second story. Same exact flow as Scene 3.\n"
                "Scene 6: OUTRO (70-90 words) — Do not summarize. Instead: zoom out and name the bigger pattern these two stories share. What does it tell us about where things are heading? Then land on something human: the people who navigate this well are not the ones who know the most about AI — they are the ones who stay curious and keep taking small steps. That is exactly what you are doing right now. End with: \'The full episode is linked below if you want the complete picture. I will see you in the next one.\'\n\n"
                "Return ONLY valid JSON. No markdown. No code fences.\n"
                "{\n"
                "  \"title\": \"" + title + "\",\n"
                "  \"scenes\": [\n"
                "    {\"sceneNumber\": 1, \"title\": \"Morse Intro\", \"voText\": \"[MORSE_INTRO]\", \"visualPrompt\": \"morse code intro\", \"suggestedVisualStyle\": \"news\"},\n"
                "    {\"sceneNumber\": 2, \"title\": \"Hook\", \"voText\": \"hook text...\", \"visualPrompt\": \"person looking at phone confused ai news\", \"suggestedVisualStyle\": \"news\"},\n"
                "    {\"sceneNumber\": 3, \"title\": \"Deep Dive — story 1 headline\", \"voText\": \"deep dive story...\", \"visualPrompt\": \"relevant query\", \"suggestedVisualStyle\": \"news\"},\n"
                "    {\"sceneNumber\": 4, \"title\": \"Bridge\", \"voText\": \"bridge text...\", \"visualPrompt\": \"ai weekly buzz transition\", \"suggestedVisualStyle\": \"news\"},\n"
                "    {\"sceneNumber\": 5, \"title\": \"Deep Dive — story 2 headline\", \"voText\": \"deep dive story...\", \"visualPrompt\": \"relevant query\", \"suggestedVisualStyle\": \"news\"},\n"
                "    {\"sceneNumber\": 6, \"title\": \"Outro\", \"voText\": \"outro text...\", \"visualPrompt\": \"ai weekly buzz outro\", \"suggestedVisualStyle\": \"news\"}\n"
                "  ],\n"
                "  \"youtubeHooks\": [\"hook 1\", \"hook 2\", \"hook 3\"],\n"
                "  \"tweetHooks\": [\"tweet 1\", \"tweet 2\", \"tweet 3\"],\n"
                "  \"episodeSummary\": \"Two sentence summary.\"\n"
                "}"
            )

        # ── History While You Sleep format ──────────────────────────
        if style_mode == "history":
            research_text = research if research else "Use your deep knowledge of this historical topic."
            script_type = tone  # tone field carries the history script type

            # Shared base rules for all history types
            base_rules = (
                "WRITING RULES — NON-NEGOTIABLE:\n"
                "You are not writing literature. You are a master storyteller pulling the listener INTO history.\n\n"
                "KILL ADJECTIVE STACKING — THIS IS THE #1 RULE:\n"
                "Every unnecessary adjective loses a listener. One adjective where three are tempting.\n"
                "- BAD: \"The vast, shimmering, golden desert stretched endlessly beneath the blazing sun.\"\n"
                "- GOOD: \"The desert had no mercy. The sun came up like a hammer.\"\n\n"
                "SENTENCE RHYTHM — THIS IS EVERYTHING:\n"
                "- Short sentences create tension. Long sentences create flow. Alternate constantly.\n"
                "- After every 2-3 long sentences, write one that is 5 words or less.\n"
                "- \"He did not look back.\" \"She was seventeen years old.\" \"Nobody moved.\"\n"
                "- These short sentences are where the listener leans in. Use them like punctuation.\n\n"
                "SPECIFICITY KEEPS LISTENERS:\n"
                "- Vague writing loses listeners. Specific details hold them.\n"
                "- BAD: \"The soldiers were fierce and well-trained.\"\n"
                "- GOOD: \"Each soldier carried a short iron sword, a wicker shield, and three days of hard bread.\"\n"
                "- Real names. Real numbers. Real places. Real dates. Always.\n\n"
                "WORD COUNT IS NON-NEGOTIABLE:\n"
                "- Total target: " + str(length) + " words across all scenes. Do not stop writing until you reach it.\n"
                "- Each chapter (scenes 3-8) must be roughly " + str(max(300, length // 8)) + " words. Count them.\n"
                "- The opening hook (scene 2) must be roughly " + str(max(150, length // 20)) + " words.\n"
                "- The closing reflection (scene 9) must be roughly " + str(max(150, length // 20)) + " words.\n\n"
                "NEVER DO THESE:\n"
                "- Never stack more than one adjective before a noun.\n"
                "- Never use: vast, shimmering, resplendent, magnificent, glorious, ethereal, transcendent.\n"
                "- Never use passive voice when active is possible.\n"
                "- Never use bullet points or numbered lists inside voText.\n"
                "- Never say \"in conclusion\", \"to summarize\", \"as we have seen\".\n"
                "- Never repeat information from a previous chapter.\n\n"
                "THE LISTENER IS FALLING ASLEEP — BUT ENGAGED:\n"
                "- Sleep content does NOT mean boring. It means calm, steady, and deeply absorbing.\n"
                "- The pace slows. Sentences get longer. Details get quieter.\n"
                "- End every chapter on a single image or fact that stays in the mind.\n"
            )

            # Scene structure shared by all types
            shared_scenes = (
                "SCENE STRUCTURE:\n"
                "Scene 1: HISTORY INTRO — voText must be exactly: [HISTORY_INTRO]\n"
                "Scene 2: OPENING HOOK (300-400 words)\n"
                "Scene 3-8: CHAPTERS (900-1,200 words each)\n"
                "Scene 9: CLOSING REFLECTION (300-400 words) — calm, philosophical, sleep-inducing\n\n"
                "Return ONLY valid JSON. No markdown. No code fences.\n"
                "{\n"
                "  \"title\": \"" + title + "\",\n"
                "  \"scenes\": [\n"
                "    {\"sceneNumber\": 1, \"title\": \"History Intro\", \"voText\": \"[HISTORY_INTRO]\", \"visualPrompt\": \"history while you sleep intro\", \"suggestedVisualStyle\": \"history\"},\n"
                "    {\"sceneNumber\": 2, \"title\": \"Opening Hook\", \"voText\": \"hook...\", \"visualPrompt\": \"historical scene\", \"suggestedVisualStyle\": \"history\"},\n"
                "    {\"sceneNumber\": 3, \"title\": \"Chapter One — Title\", \"voText\": \"narration...\", \"visualPrompt\": \"historical scene\", \"suggestedVisualStyle\": \"history\"},\n"
                "    {\"sceneNumber\": 4, \"title\": \"Chapter Two — Title\", \"voText\": \"narration...\", \"visualPrompt\": \"historical scene\", \"suggestedVisualStyle\": \"history\"},\n"
                "    {\"sceneNumber\": 5, \"title\": \"Chapter Three — Title\", \"voText\": \"narration...\", \"visualPrompt\": \"historical scene\", \"suggestedVisualStyle\": \"history\"},\n"
                "    {\"sceneNumber\": 6, \"title\": \"Chapter Four — Title\", \"voText\": \"narration...\", \"visualPrompt\": \"historical scene\", \"suggestedVisualStyle\": \"history\"},\n"
                "    {\"sceneNumber\": 7, \"title\": \"Chapter Five — Title\", \"voText\": \"narration...\", \"visualPrompt\": \"historical scene\", \"suggestedVisualStyle\": \"history\"},\n"
                "    {\"sceneNumber\": 8, \"title\": \"Chapter Six — Title\", \"voText\": \"narration...\", \"visualPrompt\": \"historical scene\", \"suggestedVisualStyle\": \"history\"},\n"
                "    {\"sceneNumber\": 9, \"title\": \"Closing Reflection\", \"voText\": \"closing...\", \"visualPrompt\": \"history while you sleep outro\", \"suggestedVisualStyle\": \"history\"}\n"
                "  ],\n"
                "  \"youtubeHooks\": [\"hook 1\", \"hook 2\", \"hook 3\"],\n"
                "  \"tweetHooks\": [\"tweet 1\", \"tweet 2\", \"tweet 3\"],\n"
                "  \"episodeSummary\": \"Two sentence summary.\"\n"
                "}"
            )

            if script_type == "why_wouldnt_survive":
                type_prompt = (
                    "You are writing a \"Why You Wouldn\'t Survive\" episode for History While You Sleep.\n\n"
                    "Topic: \"" + title + "\"\n"
                    "Target: 8,000 words total.\n\n"
                    + base_rules +
                    "EPISODE TYPE RULES:\n"
                    "- This episode puts the LISTENER in that era. Use \"you\" throughout — they are the subject.\n"
                    "- Opening Hook: drop the listener into a single brutal moment of daily life in that era. Present tense. Second person. \"You wake up. The straw beneath you is damp.\"\n"
                    "- Each chapter covers one survival category: sleeping conditions, food and water, disease and medicine, work and labor, danger and violence, nighttime.\n"
                    "- For each category: describe what the listener would experience, smell, feel, fear. Then reveal the historical reality — death rates, life expectancy, common fates.\n"
                    "- The tone is not horror — it is wonder and respect. Our ancestors were extraordinary. End each chapter with a line of quiet admiration.\n"
                    "- Closing Reflection: bring the listener back to the present. Their warm bed. Their clean water. The miracle of now. Sleep-inducing gratitude.\n\n"
                    "RESEARCH CONTEXT:\n" + research_text + "\n\n"
                    + shared_scenes
                )

            elif script_type == "daily_life":
                type_prompt = (
                    "You are writing a \"Daily Life in X\" episode for History While You Sleep.\n\n"
                    "Topic: \"" + title + "\"\n"
                    "Target: 8,000 words total.\n\n"
                    + base_rules +
                    "EPISODE TYPE RULES:\n"
                    "- Structure the episode as a single day — from before dawn to late night.\n"
                    "- Follow one or two specific types of people through their entire day: a merchant, a farmer, a noblewoman, a soldier, a child.\n"
                    "- Opening Hook: begin at the moment just before dawn. The city or village is still. Something is about to begin.\n"
                    "- Chapters follow the arc of the day: waking and morning rituals, work and commerce, food and meals, social life and community, evening, nighttime.\n"
                    "- Weave in the broader world — politics, religion, disease, season — through the personal experience of your characters.\n"
                    "- This is social history. Not kings and battles. The texture of ordinary life.\n"
                    "- Closing Reflection: the city settles into darkness. Candles go out one by one. The world sleeps — just as the listener is about to.\n\n"
                    "RESEARCH CONTEXT:\n" + research_text + "\n\n"
                    + shared_scenes
                )

            elif script_type == "full_story":
                type_prompt = (
                    "You are writing a \"The Full Story of X\" episode for History While You Sleep.\n\n"
                    "Topic: \"" + title + "\"\n"
                    "Target: 8,000 words total.\n\n"
                    + base_rules +
                    "EPISODE TYPE RULES:\n"
                    "- This is an epic narrative. Rise, peak, fall, legacy.\n"
                    "- Opening Hook: begin at the most dramatic singular moment in this story — a battle, a betrayal, a discovery, a death. Drop in with no context. Let the drama speak first.\n"
                    "- Then pull back and tell the full story chronologically through chapters.\n"
                    "- Each chapter should end with a narrative bridge that creates tension: \"But what no one knew yet was...\"\n"
                    "- Give individual humans names and personalities. History is not abstract — it happened to specific people on specific days.\n"
                    "- The final chapter should cover legacy and what this story means for the world that came after.\n"
                    "- Closing Reflection: philosophical. What does this story tell us about human nature? About power, love, ambition, failure? End slowly and gently.\n\n"
                    "RESEARCH CONTEXT:\n" + research_text + "\n\n"
                    + shared_scenes
                )

            elif script_type == "secrets_of":
                type_prompt = (
                    "You are writing a \"Secrets of X\" episode for History While You Sleep.\n\n"
                    "Topic: \"" + title + "\"\n"
                    "Target: 8,000 words total.\n\n"
                    + base_rules +
                    "EPISODE TYPE RULES:\n"
                    "- This episode is driven by curiosity and surprising reveals. Things most people never knew.\n"
                    "- Opening Hook: OPEN WITH THE SINGLE MOST SURPRISING FACT. One sentence. Let it land.\n"
                "  BAD: \"Most people think they know about Roman gladiators, but there is more to the story...\n"
                "  GOOD: \"Most Roman gladiators were vegetarians. They ate barley and beans. The crowds called them hordearii — barley men — while watching them die.\"\n"
                "  One surprising fact. No preamble. Now the listener cannot leave.\n"
                    "- Each chapter reveals a different secret, misconception, or forgotten truth about this era or civilization.\n"
                    "- Lead each chapter with the conventional wisdom — what most people think — then gently reveal the more complex or surprising reality.\n"
                    "- Tone is curious and delighted, not sensational. You are sharing wonders, not shocking headlines.\n"
                    "- Examples of chapter themes: beauty standards, food and drink, medicine and superstition, love and marriage, crime and punishment, lost technologies.\n"
                    "- Closing Reflection: the past is never quite what we imagined. And somehow that makes it more fascinating. Drift off into that wonder.\n\n"
                    "RESEARCH CONTEXT:\n" + research_text + "\n\n"
                    + shared_scenes
                )

            else:  # how_survived or default
                type_prompt = (
                    "You are writing a \"How They Survived X\" episode for History While You Sleep.\n\n"
                    "Topic: \"" + title + "\"\n"
                    "Target: 8,000 words total.\n\n"
                    + base_rules +
                    "EPISODE TYPE RULES:\n"
                    "- This episode is about human ingenuity, resilience, and survival against impossible odds.\n"
                    "- Opening Hook: DROP INTO THE MOMENT OF MAXIMUM DANGER. Already happening. No setup.\n"
                "  BAD: \"In the winter of 1609, the colonists at Jamestown faced terrible hardship...\n"
                "  GOOD: \"By January they were eating the horses. When the horses were gone they ate the rats. When the rats were gone — and this is in the records — some of them ate each other.\"\n"
                "  The first sentence must make it impossible to stop listening.\n"
                    "- Each chapter covers one survival challenge and how people solved it: food preservation, shelter and warmth, water and sanitation, medicine and injury, community and cooperation, navigation and trade.\n"
                    "- For each challenge: describe the problem viscerally, then reveal the ingenious solution our ancestors developed.\n"
                    "- Tone is deep respect and admiration. These people were not primitive — they were brilliant under constraint.\n"
                    "- Weave in specific individuals, specific places, specific inventions or techniques where possible.\n"
                    "- Closing Reflection: we inherited all of this. Every warm night, every full stomach, every safe shelter — built on their ingenuity. Rest now in that inheritance.\n\n"
                    "RESEARCH CONTEXT:\n" + research_text + "\n\n"
                    + shared_scenes
                )

            return type_prompt

        # ── Bible Stories While You Sleep format ─────────────────────
        if style_mode == "bible":
            research_text = research if research else "Use your deep knowledge of biblical history, archaeology, and scripture."
            script_type = tone

            word_per_chapter = max(300, length // 8)
            hook_words = max(150, length // 20)
            closing_words = max(150, length // 20)

            bible_base_rules = f"""WRITING RULES — READ CAREFULLY:
You are writing for a CHRISTIAN AUDIENCE. This is a faith-based channel. God, Jesus, the Holy Spirit,
prayer, miracles, and scripture are central — not optional. Do not avoid or soften them.

THIS IS A CHRISTIAN CHANNEL:
- Write from the perspective of a Christian believer who takes scripture seriously.
- God is real. His actions, words, and purposes are central to every story.
- Reference scripture directly and naturally — quote verses where they add power.
- Use the names: God, the Lord, Jesus Christ, the Holy Spirit, Yahweh where appropriate.
- Miracles are real events, not metaphors. Treat them as such.
- Never sanitize or secularize the story. This is the Word of God being told.

GROUNDED IN SCRIPTURE:
- Every major event must be anchored in specific Bible passages. Reference chapter and verse naturally.
- Stay faithful to what the Bible actually says. Do not invent events not in scripture.
- Where the Bible is silent, say so briefly, then describe the historical/cultural context.
- Use the names, places, and details as scripture records them.

WRITING STYLE — CLEAR AND DIRECT:
- Short, direct sentences. The narrator's voice is calm and authoritative, not flowery.
- No excessive adjectives. Say what happened. Let the story carry the weight.
- BAD: "The shimmering, golden, resplendent light of the glorious morning sun cascaded..."
- GOOD: "The sun rose over Canaan. Abraham rose with it."
- One adjective where three are tempted. One sentence where two will do.
- Sensory detail yes — but earned, not piled on.
- Alternate long sentences with short ones. The short ones land hard.

WORD COUNT IS NON-NEGOTIABLE:
- Total target: {length} words. Do not stop writing until you reach it.
- Each chapter (scenes 3-8): roughly {word_per_chapter} words.
- Opening hook (scene 2): roughly {hook_words} words.
- Closing reflection (scene 9): roughly {closing_words} words.

NEVER DO THESE:
- Never avoid mentioning God, Jesus, or the Holy Spirit.
- Never use bullet points inside voText.
- Never say "in conclusion" or "to summarize".
- Never repeat information from a previous chapter.
- Never write in a secular or academic tone that distances the listener from faith.

THE LISTENER IS FALLING ASLEEP IN FAITH:
- The pace should slow as the episode progresses.
- The final scenes should feel like a prayer settling over the room.
- End on a line that connects the ancient story to the listener's faith today.
"""

            bible_scene_structure = f"""YOUTUBE HOOKS — write 3 compelling hooks for THIS episode:
- Hook 1: A powerful moment or surprising truth from this episode as a question (under 70 chars)
- Hook 2: What most Christians never knew about this person or story
- Hook 3: "Bible Stories While You Sleep: [most compelling spiritual angle]"

SCENE STRUCTURE:
Scene 1: BIBLE INTRO — voText must be exactly: [BIBLE_INTRO]
Scene 2: OPENING HOOK ({hook_words} words) — open with a dramatic moment from scripture. Drop in with no context. God is present from the first sentence.
Scene 3-8: CHAPTERS ({word_per_chapter} words each) — each chapter must reference specific scripture. God's voice, actions, and purposes must be woven throughout.
Scene 9: CLOSING REFLECTION ({closing_words} words) — connect the ancient story to the listener's faith today. End like a prayer. Slow, peaceful, faith-filled.

Return ONLY valid JSON. No markdown. No code fences.
{{
  "title": "{title}",
  "scenes": [
    {{"sceneNumber": 1, "title": "Bible Intro", "voText": "[BIBLE_INTRO]", "visualPrompt": "bible stories while you sleep intro", "suggestedVisualStyle": "history"}},
    {{"sceneNumber": 2, "title": "Opening Hook", "voText": "hook...", "visualPrompt": "biblical ancient scene", "suggestedVisualStyle": "history"}},
    {{"sceneNumber": 3, "title": "Chapter One — Title", "voText": "narration...", "visualPrompt": "biblical scene", "suggestedVisualStyle": "history"}},
    {{"sceneNumber": 4, "title": "Chapter Two — Title", "voText": "narration...", "visualPrompt": "biblical scene", "suggestedVisualStyle": "history"}},
    {{"sceneNumber": 5, "title": "Chapter Three — Title", "voText": "narration...", "visualPrompt": "biblical scene", "suggestedVisualStyle": "history"}},
    {{"sceneNumber": 6, "title": "Chapter Four — Title", "voText": "narration...", "visualPrompt": "biblical scene", "suggestedVisualStyle": "history"}},
    {{"sceneNumber": 7, "title": "Chapter Five — Title", "voText": "narration...", "visualPrompt": "biblical scene", "suggestedVisualStyle": "history"}},
    {{"sceneNumber": 8, "title": "Chapter Six — Title", "voText": "narration...", "visualPrompt": "biblical scene", "suggestedVisualStyle": "history"}},
    {{"sceneNumber": 9, "title": "Closing Reflection", "voText": "closing...", "visualPrompt": "bible stories while you sleep outro", "suggestedVisualStyle": "history"}}
  ],
  "youtubeHooks": ["[hook 1]", "[hook 2]", "[hook 3]"],
  "tweetHooks": ["[tweet 1]", "[tweet 2]"],
  "episodeSummary": "Two sentences that make someone want to listen tonight."
}}
"""

            if script_type == "full_story":
                return (
                    f"You are writing a 'The Full Story of X' episode for Bible Stories While You Sleep.\n\n"
                    f"Topic: \"{title}\"\n"
                    f"Target: {length} words total.\n\n"
                    + bible_base_rules
                    + "EPISODE TYPE RULES:\n"
                    "- Epic narrative: birth, rise, trials, transformation, legacy.\n"
                    "- Opening Hook: begin at the most dramatic singular moment. Drop in with no context.\n"
                    "- Tell the full story chronologically. Give the subject a fully realized inner life.\n"
                    "- Weave in historical and archaeological context throughout.\n"
                    "- Final chapter covers legacy — how this person shaped history, religion, and culture.\n"
                    "- Closing Reflection: gentle and philosophical. End slowly.\n\n"
                    "RESEARCH CONTEXT:\n" + research_text + "\n\n"
                    + bible_scene_structure
                )
            elif script_type == "the_night":
                return (
                    f"You are writing a 'The Night [Event Happened]' episode for Bible Stories While You Sleep.\n\n"
                    f"Topic: \"{title}\"\n"
                    f"Target: {length} words total.\n\n"
                    + bible_base_rules
                    + "EPISODE TYPE RULES:\n"
                    "- Single night or moment from scripture in deep cinematic detail.\n"
                    "- Use present tense throughout — the listener is THERE in real time.\n"
                    "- Opening Hook: the scene just before it begins. The stillness. The not-yet-knowing.\n"
                    "- Each chapter advances the timeline — hour by hour, moment by moment.\n"
                    "- Humanize every figure — what were they thinking, fearing, hoping for?\n"
                    "- Closing Reflection: the dawn after. What changed? What never changed back?\n\n"
                    "RESEARCH CONTEXT:\n" + research_text + "\n\n"
                    + bible_scene_structure
                )
            elif script_type == "who_was":
                return (
                    f"You are writing a 'Who Was [Person] Really?' episode for Bible Stories While You Sleep.\n\n"
                    f"Topic: \"{title}\"\n"
                    f"Target: {length} words total.\n\n"
                    + bible_base_rules
                    + "EPISODE TYPE RULES:\n"
                    "- Goes beyond Sunday school. Historical context, archaeology, what scholars know.\n"
                    "- Opening Hook: the most surprising or misunderstood thing about this person.\n"
                    "- Chapters: their historical world, archaeology, popular image vs reality,\n"
                    "  inner struggles, how different traditions view them, their legacy.\n"
                    "- Tone is curious and respectful — revealing depth, not debunking faith.\n"
                    "- Closing Reflection: who do we need them to be, and who were they really?\n\n"
                    "RESEARCH CONTEXT:\n" + research_text + "\n\n"
                    + bible_scene_structure
                )
            elif script_type == "world_of":
                return (
                    f"You are writing a 'The World of [Book/Era]' episode for Bible Stories While You Sleep.\n\n"
                    f"Topic: \"{title}\"\n"
                    f"Target: {length} words total.\n\n"
                    + bible_base_rules
                    + "EPISODE TYPE RULES:\n"
                    "- Social history — the texture of daily life in a biblical time and place.\n"
                    "- Opening Hook: an ordinary moment. A market. A meal. A child playing in the dust.\n"
                    "- Chapters: food and farming, homes and family, work and trade, religion and ritual,\n"
                    "  danger and medicine, night and sleep.\n"
                    "- Use archaeology heavily — what have we found? What does it tell us?\n"
                    "- Closing Reflection: lamps go out one by one. They sleep — just as the listener is about to.\n\n"
                    "RESEARCH CONTEXT:\n" + research_text + "\n\n"
                    + bible_scene_structure
                )
            else:  # stories_never_heard or default
                return (
                    f"You are writing a 'Stories You Never Heard' episode for Bible Stories While You Sleep.\n\n"
                    f"Topic: \"{title}\"\n"
                    f"Target: {length} words total.\n\n"
                    + bible_base_rules
                    + "EPISODE TYPE RULES:\n"
                    "- Overlooked, forgotten, or misunderstood stories from scripture.\n"
                    "- Opening Hook: the most surprising fact the listener almost certainly never knew.\n"
                    "- Focus on: women of the Bible, minor prophets, unnamed characters,\n"
                    "  stories between the famous stories.\n"
                    "- Lead each chapter with what most people think, then reveal the richer reality.\n"
                    "- Tone is delighted and curious — sharing wonders, not shocking headlines.\n"
                    "- Closing Reflection: scripture is deeper than we imagined. Drift off into wonder.\n\n"
                    "RESEARCH CONTEXT:\n" + research_text + "\n\n"
                    + bible_scene_structure
                )

        # ── Standard documentary format ─────────────────────────────
        return f"""You are an expert documentary scriptwriter for viral faceless YouTube channels.

Write a complete script about: "{title}"
Target narration: approximately {length} words total.
Tone: {tone}
Structure: {structure}

CRITICAL: Return ONLY a valid JSON object. No markdown. No code fences. No text outside the JSON.

Use EXACTLY this structure:
{{
  "title": "{title}",
  "scenes": [
    {{
      "sceneNumber": 1,
      "title": "Scene title here",
      "voText": "Full narration for this scene. Write 2-5 complete sentences.",
      "visualPrompt": "Simple 3-5 word stock footage search query. Write as if searching Pexels. Use concrete nouns and actions. Examples: dog wagging tail owner, scientist lab microscope, pasta being made kitchen, crowd cheering stadium. NO abstract words like 'cinematic', 'nostalgic', 'atmosphere', 'illustration'.",
      "suggestedVisualStyle": "aerial"
    }}
  ]
}}

RESEARCH CONTEXT (use this to make the script accurate and current):
{"No additional research provided — use your general knowledge." if not research else research}

RULES:
- suggestedVisualStyle must be ONE of: aerial, diagram, cinematic, interview, animation, slow-zoom
- visualPrompt must be specific enough to search for — NOT just the topic name
- Aim for 10-20 scenes depending on target length
- Do NOT put scene numbers inside voText
- Do NOT use markdown or bullet points inside any JSON string
"""

    def _extract_json(self, text: str) -> dict | None:
        text = re.sub(r"```(?:json)?", "", text).strip("` \n")
        try:
            data = json.loads(text)
            if "scenes" in data:
                return data
        except json.JSONDecodeError:
            pass

        match = re.search(r'\{[\s\S]*?"scenes"[\s\S]*\}', text)
        if match:
            try:
                data = json.loads(match.group())
                if "scenes" in data:
                    return data
            except json.JSONDecodeError:
                pass
        return None

    def _legacy_parse(self, text: str, title: str) -> dict:
        """Fallback: parse old VO/BROLL format into scene structure."""
        pattern = r"VO:\s*(.*?)\s*BROLL:\s*(.*?)(?=VO:|\Z)"
        matches = re.findall(pattern, text, re.DOTALL)
        scenes  = []
        for i, (vo, broll) in enumerate(matches, start=1):
            scenes.append({
                "sceneNumber":          i,
                "title":                f"Scene {i}",
                "voText":               vo.strip(),
                "visualPrompt":         broll.strip(),
                "suggestedVisualStyle": "cinematic",
            })
        return {"title": title, "scenes": scenes}