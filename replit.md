# Faceless YouTube Agent Factory

## Overview
AI-powered system that generates YouTube video scripts and voiceover audio. Users submit a topic, tone, target word count, and voice selection, and the system generates a high-retention script and corresponding audio narration using OpenAI models.

## Architecture
- **Frontend**: React + Vite + TanStack Query + wouter + Tailwind CSS + shadcn/ui
- **Backend**: Node.js/Express with TypeScript
- **Database**: PostgreSQL (Neon-backed via Replit)
- **AI**: OpenAI via Replit AI Integrations (env vars: AI_INTEGRATIONS_OPENAI_API_KEY, AI_INTEGRATIONS_OPENAI_BASE_URL)

## Key Files
- `shared/schema.ts` - Drizzle schema + Zod insert schemas (scripts + series tables)
- `shared/routes.ts` - API route definitions with Zod validation
- `server/routes.ts` - Express route handlers + script generation + voiceover generation
- `server/storage.ts` - Database CRUD interface (scripts + series)
- `client/src/pages/Dashboard.tsx` - Script list with search/filter, series cards, view modes
- `client/src/pages/NewScript.tsx` - Create script form (topic, tone, voice, length, optional series)
- `client/src/pages/NewSeries.tsx` - Create series form (name, description)
- `client/src/pages/ScriptDetail.tsx` - View script content + audio player
- `client/src/pages/SeriesDetail.tsx` - View series with episode list + add episode
- `client/src/hooks/use-scripts.ts` - TanStack Query hooks for scripts with polling
- `client/src/hooks/use-series.ts` - TanStack Query hooks for series CRUD
- `client/src/components/SeriesCard.tsx` - Series card with episode count + progress

## Data Model
Scripts table: id, topic, tone, length, voice, content, wordCount, status, audioStatus, audioPath, audioError, error, seriesId (nullable), episodeNumber (nullable), createdAt
Series table: id, name, description (nullable), createdAt

## Routes
- `/` - Dashboard (series cards + standalone scripts, search + filter)
- `/new` - New Script form (supports `?seriesId=X` for adding episodes)
- `/new-series` - New Series form
- `/script/:id` - Script detail + audio player
- `/series/:id` - Series detail with episode list

## Pipeline Flow
1. User submits form -> POST /api/scripts creates record with status="pending"
2. Background: generateYoutubeScript() sets status="processing", calls OpenAI GPT for script
3. On script completion: sets status="complete", then kicks off generateVoiceover()
4. Voiceover pipeline:
   a. extractNarration() strips non-spoken text (B-ROLL markers, headings, timestamps)
   b. splitTextIntoChunks() splits narration into ~300-word chunks at paragraph boundaries
   c. Each chunk generates audio via OpenAI gpt-audio API sequentially
   d. All chunk buffers concatenated into single MP3, saved to storage/output/audio/
   e. Falls back to full content if narration extraction yields too little text
5. Audio served via GET /api/scripts/:id/audio

## Voices Available
alloy, echo, fable, onyx, nova, shimmer (OpenAI TTS voices)

## Recent Changes (Feb 2026)
- Added Series model for grouping scripts into multi-episode series
- Dashboard redesigned: series cards section + standalone scripts section, with view mode tabs
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
