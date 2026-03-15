import { z } from "zod";

// ================================================================
// URL BUILDER
// ================================================================

export function buildUrl(
  path: string,
  params: Record<string, string | number> = {},
  query: Record<string, string | number> = {}
): string {
  let url = path;
  for (const [key, value] of Object.entries(params)) {
    url = url.replace(`:${key}`, encodeURIComponent(String(value)));
  }
  const queryEntries = Object.entries(query);
  if (queryEntries.length > 0) {
    const qs = queryEntries
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    url = `${url}?${qs}`;
  }
  return url;
}

// ================================================================
// SHARED SCHEMAS
// ================================================================

const ScriptSchema = z.object({
  id:            z.number(),
  topic:         z.string(),
  tone:          z.string(),
  length:        z.number(),
  voice:         z.string(),
  styleMode:     z.string().optional().nullable(),
  content:       z.string().optional().nullable(),
  wordCount:     z.number().optional().nullable(),
  sections:      z.array(z.object({ vo: z.string(), broll: z.string() })).optional().nullable(),
  sceneData:     z.any().optional().nullable(),
  status:        z.string(),
  error:         z.string().optional().nullable(),
  audioStatus:   z.string(),
  audioPath:     z.string().optional().nullable(),
  audioError:    z.string().optional().nullable(),
  imageStatus:   z.string().optional().nullable(),
  imageError:    z.string().optional().nullable(),
  images:        z.array(z.string()).optional().nullable(),
  videoStatus:   z.string().optional().nullable(),
  videoPath:     z.string().optional().nullable(),
  videoError:    z.string().optional().nullable(),
  seriesId:      z.number().optional().nullable(),
  episodeNumber: z.number().optional().nullable(),
  youtubeHooks:  z.array(z.string()).optional().nullable(),
  tweetHooks:    z.array(z.string()).optional().nullable(),
  episodeSummary: z.string().optional().nullable(),
  createdAt:     z.string().optional().nullable(),
});

const SeriesSchema = z.object({
  id:          z.number(),
  name:        z.string(),
  description: z.string().optional().nullable(),
  createdAt:   z.string().optional().nullable(),
});

const ErrorSchema = z.object({
  message: z.string(),
});

export const ScriptInputSchema = z.object({
  topic:         z.string().min(1, "Topic is required"),
  tone:          z.string().min(1),
  length:        z.number().min(100).max(10000),
  voice:         z.string().min(1),
  styleMode:     z.string().optional(),
  seriesId:      z.number().optional(),
  episodeNumber: z.number().optional(),
});

export type ScriptInput = z.infer<typeof ScriptInputSchema>;

// ================================================================
// API ROUTE DEFINITIONS
// ================================================================

export const api = {
  scripts: {
    list: {
      path:   "/api/scripts",
      method: "GET" as const,
      responses: { 200: z.array(ScriptSchema) },
    },
    create: {
      path:   "/api/scripts",
      method: "POST" as const,
      input:  ScriptInputSchema,
      responses: {
        201: ScriptSchema,
        200: ScriptSchema,
        400: ErrorSchema,
      },
    },
    get: {
      path:   "/api/scripts/:id",
      method: "GET" as const,
      responses: { 200: ScriptSchema },
    },
    update: {
      path:   "/api/scripts/:id",
      method: "PATCH" as const,
      input:  z.object({ content: z.string().optional() }),
      responses: { 200: ScriptSchema },
    },
    scenes: {
      path:   "/api/scripts/:id/scenes",
      method: "GET" as const,
      responses: { 200: z.object({ scriptId: z.number(), sceneData: z.any() }) },
    },
    generateAudio: {
      path:   "/api/scripts/:id/generate-audio",
      method: "POST" as const,
      responses: { 200: ScriptSchema },
    },
    regenerateAudio: {
      path:   "/api/scripts/:id/generate-audio",
      method: "POST" as const,
      responses: { 200: ScriptSchema },
    },
    generateVideo: {
      path:   "/api/scripts/:id/generate-video",
      method: "POST" as const,
      responses: { 200: ScriptSchema },
    },
    delete: {
      path:   "/api/scripts/:id",
      method: "DELETE" as const,
      responses: { 200: z.object({ success: z.boolean() }) },
    },
  },

  series: {
    list: {
      path:   "/api/series",
      method: "GET" as const,
      responses: { 200: z.array(SeriesSchema) },
    },
    create: {
      path:   "/api/series",
      method: "POST" as const,
      input:  z.object({ name: z.string().min(1), description: z.string().optional() }),
      responses: {
        200: SeriesSchema,
        201: SeriesSchema,
        400: ErrorSchema,
      },
    },
    get: {
      path:   "/api/series/:id",
      method: "GET" as const,
      responses: { 200: SeriesSchema },
    },
    update: {
      path:   "/api/series/:id",
      method: "PUT" as const,
      responses: { 200: SeriesSchema },
    },
    delete: {
      path:   "/api/series/:id",
      method: "DELETE" as const,
      responses: { 200: z.object({ success: z.boolean() }) },
    },
    scripts: {
      path:   "/api/series/:id/scripts",
      method: "GET" as const,
      responses: { 200: z.array(ScriptSchema) },
    },
  },

  voices: {
    preview: {
      path:   "/api/voices/:voice/preview",
      method: "GET" as const,
      responses: { 200: z.any() },
    },
  },

  research: {
    trends: {
      path:   "/api/research/trends",
      method: "POST" as const,
      responses: { 200: z.any() },
    },
  },
} as const;