import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import path from "path";

const app = express();
const httpServer = createServer(app);

/**
 * Allow rawBody access (for webhooks if needed)
 */
declare module "http" {
  interface IncomingMessage {
    rawBody?: Buffer;
  }
}

/**
 * Body Parsers
 */
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(express.urlencoded({ extended: false }));

/**
 * Static Media Routes
 * ---------------------
 * These allow browser access to generated media files
 */

app.use(
  "/audio",
  express.static(path.join(process.cwd(), "storage/output/audio"))
);

app.use(
  "/images",
  express.static(path.join(process.cwd(), "storage/output/images"))
);

app.use(
  "/videos",
  express.static(path.join(process.cwd(), "storage/output/videos"))
);

/**
 * Logger Utility
 */
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

/**
 * API Request Logger
 */
app.use((req, res, next) => {
  const start = Date.now();
  const pathName = req.path;

  let capturedJsonResponse: Record<string, any> | undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;

    if (pathName.startsWith("/api")) {
      let logLine = `${req.method} ${pathName} ${res.statusCode} in ${duration}ms`;

      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine, "api");
    }
  });

  next();
});

/**
 * Bootstrap Server
 */
(async () => {
  try {
    // Register API routes
    await registerRoutes(httpServer, app);

    /**
     * Global Error Handler
     */
    app.use(
      (err: any, _req: Request, res: Response, next: NextFunction) => {
        const status = err.status || err.statusCode || 500;
        const message = err.message || "Internal Server Error";

        console.error("❌ Internal Server Error:", err);

        if (res.headersSent) {
          return next(err);
        }

        return res.status(status).json({
          success: false,
          message,
        });
      }
    );

    /**
     * Frontend Handling
     */
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    /**
     * Start Server
     */
    const port = parseInt(process.env.PORT || "5000", 10);

    httpServer.listen(
      {
        port,
        host: "0.0.0.0",
        reusePort: true,
      },
      () => {
        log(`🚀 Server running on port ${port}`);
      }
    );
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
})();
