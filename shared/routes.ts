import { z } from "zod";
import { insertScriptSchema, scripts } from "./schema";

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
