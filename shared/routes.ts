import { z } from "zod";
import { insertScriptSchema, insertSeriesSchema, scripts, series } from "./schema";

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  scripts: {
    list: {
      method: "GET" as const,
      path: "/api/scripts" as const,
      responses: {
        200: z.array(z.custom<typeof scripts.$inferSelect>()),
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/scripts/:id" as const,
      responses: {
        200: z.custom<typeof scripts.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/scripts" as const,
      input: insertScriptSchema,
      responses: {
        201: z.custom<typeof scripts.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/scripts/:id" as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    audio: {
      method: "GET" as const,
      path: "/api/scripts/:id/audio" as const,
      responses: {
        200: z.any(),
        404: errorSchemas.notFound,
      },
    },
    regenerateAudio: {
      method: "POST" as const,
      path: "/api/scripts/:id/regenerate-audio" as const,
      input: z.object({ voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]) }),
      responses: {
        200: z.custom<typeof scripts.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },
  series: {
    list: {
      method: "GET" as const,
      path: "/api/series" as const,
      responses: {
        200: z.array(z.custom<typeof series.$inferSelect>()),
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/series/:id" as const,
      responses: {
        200: z.custom<typeof series.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/series" as const,
      input: insertSeriesSchema,
      responses: {
        201: z.custom<typeof series.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: "PATCH" as const,
      path: "/api/series/:id" as const,
      input: insertSeriesSchema.partial(),
      responses: {
        200: z.custom<typeof series.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/series/:id" as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    scripts: {
      method: "GET" as const,
      path: "/api/series/:id/scripts" as const,
      responses: {
        200: z.array(z.custom<typeof scripts.$inferSelect>()),
      },
    },
  },
  voices: {
    preview: {
      method: "GET" as const,
      path: "/api/voices/:voice/preview" as const,
      responses: {
        200: z.any(),
        400: errorSchemas.validation,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type ScriptInput = z.infer<typeof api.scripts.create.input>;
export type ScriptResponse = z.infer<typeof api.scripts.create.responses[201]>;
export type ScriptsListResponse = z.infer<typeof api.scripts.list.responses[200]>;
export type SeriesInput = z.infer<typeof api.series.create.input>;
export type SeriesResponse = z.infer<typeof api.series.create.responses[201]>;
export type SeriesListResponse = z.infer<typeof api.series.list.responses[200]>;
