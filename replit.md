# Faceless YouTube Agent Factory

## Overview
AI-powered system that generates YouTube video scripts and voiceover audio. Users submit a topic, tone, target word count, and voice selection, and the system generates a high-retention script and corresponding audio narration using OpenAI models. The system now includes web-powered trending topics discovery and real-time research to make scripts current and accurate.

## Architecture
- **Frontend**: React + Vite + TanStack Query + wouter + Tailwind CSS + shadcn/ui
- **Backend**: Node.js/Express with TypeScript
- **Database**: PostgreSQL (Neon-backed via Replit)
- **AI**: OpenAI via Replit AI Integrations (env vars: AI_INTEGRATIONS_OPENAI_API_KEY, AI_INTEGRATIONS_OPENAI_BASE_URL)
- **Web Search**: OpenAI Responses API with web_search_preview tool for real-time research

## Key Files
- `shared/schema.ts` - Drizzle schema + Zod insert schemas (scripts + series tables)
- `shared/routes.ts` - API route definitions with Zod validation (scripts, series, trends, research, voices)
- `server/routes.ts` - Express route handlers + script generation + voiceover generation + web research
- `server/storage.ts` - Database CRUD interface (scripts + series)
- `client/src/pages/Dashboard.tsx` - Script list with search/filter, series cards, view modes, trending topics bar
- `client/src/pages/NewScript.tsx` - Create script form (topic, tone, voice, length, optional series, web research)
- `client/src/pages/NewSeries.tsx` - Create series form (name, description)
- `client/src/pages/ScriptDetail.tsx` - View script content + audio player
- `client/src/pages/SeriesDetail.tsx` - View series with episode list + add episode
- `client/src/hooks/use-scripts.ts` - TanStack Query hooks for scripts with polling
- `client/src/hooks/use-series.ts` - TanStack Query hooks for series CRUD
- `client/src/hooks/use-trends.ts` - TanStack Query hooks for trending topics + web research
- `client/src/components/TrendingBar.tsx` - Scrollable trending topics bar with category badges
- `client/src/components/SeriesCard.tsx` - Series card with episode count + progress

## Data Model
Scripts table: id, topic, tone, length, voice, content, wordCount, status, audioStatus, audioPath, audioError, error, seriesId (nullable), episodeNumber (nullable), createdAt
Series table: id, name, description (nullable), createdAt

## Routes
- `/` - Dashboard (trending bar + series cards + standalone scripts, search + filter)
- `/new` - New Script form (supports `?seriesId=X` and `?topic=X` query params)
- `/new-series` - New Series form
- `/script/:id` - Script detail + audio player
- `/series/:id` - Series detail with episode list

## API Endpoints
- GET /api/scripts - list all scripts
- POST /api/scripts - create script (accepts optional researchContext field)
- GET /api/scripts/:id - get script
- DELETE /api/scripts/:id - delete script
- GET /api/scripts/:id/audio - stream audio file
- POST /api/scripts/:id/regenerate-audio - regenerate voiceover
- GET /api/series - list all series
- POST /api/series - create series
- GET /api/series/:id - get series
- PATCH /api/series/:id - update series
- DELETE /api/series/:id - delete series (nullifies scripts)
- GET /api/series/:id/scripts - get series episodes
- GET /api/trends - fetch trending topics (cached 15 min)
- POST /api/research - web research on a topic
- GET /api/voices/:voice/preview - voice preview audio

## Pipeline Flow
1. User submits form -> POST /api/scripts creates record with status="pending"
2. Background: generateYoutubeScript() first researches topic via OpenAI web search
3. Research results fed into script generation prompt for accuracy
4. On script completion: sets status="complete", then kicks off generateVoiceover()
5. Voiceover pipeline:
   a. extractNarration() strips non-spoken text (B-ROLL markers, headings, timestamps)
   b. splitTextIntoChunks() splits narration into ~300-word chunks at paragraph boundaries
   c. Each chunk generates audio via OpenAI gpt-audio API sequentially
   d. All chunk buffers concatenated into single MP3, saved to storage/output/audio/
   e. Falls back to full content if narration extraction yields too little text
6. Audio served via GET /api/scripts/:id/audio

## Trending Topics & Research
- Dashboard shows scrollable "Trending Now" bar with 8 current topics
- Topics fetched via OpenAI Responses API with web_search_preview tool
- Cached server-side for 15 minutes to reduce API calls
- Clicking a trend pre-fills topic on New Script form
- New Script form has "Research" button to search web for topic context
- Research results displayed with sources and auto-included in script generation
- Script generation auto-researches topic if no manual research provided

## Voices Available
alloy, echo, fable, onyx, nova, shimmer (OpenAI TTS voices)

## Recent Changes (Feb 2026)
- Added trending topics bar to Dashboard using OpenAI web search
- Added web research integration to script generation pipeline
- Added "Research" button on New Script form for manual topic research
- Scripts now auto-research topics via web before generation for current events accuracy
- Added Series model for grouping scripts into multi-episode series
- Dashboard redesigned: trending bar + series cards + standalone scripts, with view mode tabs
- Added search bar and tone filter to Dashboard
- Added Series detail page with episode list and "Add Episode" button
- Added New Series creation page
- Updated New Script form with optional series assignment + episode number
- Added voice selection field to schema and form
- Added voiceover audio generation pipeline (OpenAI audio API)
- Added chunked audio generation: scripts split into ~300-word chunks for full-length narration
- Added narration extraction to strip non-spoken text (B-ROLL, headers) before TTS
- Added voice preview on New Script form (cached to storage/output/previews/)
- Added audio player to script detail page
- Added audio status badges to cards and detail view
- Frontend polls every 2s while script or audio is pending/processing
