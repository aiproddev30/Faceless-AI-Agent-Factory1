# Faceless YouTube Agent Factory

## Overview
AI-powered system that generates YouTube video scripts and voiceover audio. Users submit a topic, tone, target word count, and voice selection, and the system generates a high-retention script and corresponding audio narration using OpenAI models.

## Architecture
- **Frontend**: React + Vite + TanStack Query + wouter + Tailwind CSS + shadcn/ui
- **Backend**: Node.js/Express with TypeScript
- **Database**: PostgreSQL (Neon-backed via Replit)
- **AI**: OpenAI via Replit AI Integrations (env vars: AI_INTEGRATIONS_OPENAI_API_KEY, AI_INTEGRATIONS_OPENAI_BASE_URL)

## Key Files
- `shared/schema.ts` - Drizzle schema + Zod insert schemas
- `shared/routes.ts` - API route definitions with Zod validation
- `server/routes.ts` - Express route handlers + script generation + voiceover generation
- `server/storage.ts` - Database CRUD interface
- `client/src/pages/Dashboard.tsx` - Script list with search/filter
- `client/src/pages/NewScript.tsx` - Create script form (topic, tone, voice, length)
- `client/src/pages/ScriptDetail.tsx` - View script content + audio player
- `client/src/hooks/use-scripts.ts` - TanStack Query hooks with polling

## Data Model
Scripts table: id, topic, tone, length, voice, content, wordCount, status, audioStatus, audioPath, audioError, error, createdAt

## Pipeline Flow
1. User submits form -> POST /api/scripts creates record with status="pending"
2. Background: generateYoutubeScript() sets status="processing", calls OpenAI GPT for script
3. On script completion: sets status="complete", then kicks off generateVoiceover()
4. Voiceover: sets audioStatus="processing", calls OpenAI audio API, saves MP3 to storage/output/audio/
5. Audio served via GET /api/scripts/:id/audio

## Voices Available
alloy, echo, fable, onyx, nova, shimmer (OpenAI TTS voices)

## Recent Changes (Feb 2026)
- Added voice selection field to schema and form
- Added voiceover audio generation pipeline (OpenAI audio API)
- Added audio player to script detail page
- Added audio status badges to cards and detail view
- Removed dead sidebar links (Asset Library, Video Renders, Settings)
- Frontend polls every 2s while script or audio is pending/processing
