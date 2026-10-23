import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config/env";
import { checkDbConnection, pool } from "./db/index";
import authRoutes from "./routes/auth";
import protectedRoutes from "./routes/protected";
import icuRoutes from "./routes/icu";
import { csrfProtection } from "./middleware/auth";

const app = express();
const PORT = config.port;

// Configure CORS for frontend with credentials (cookies)
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token"],
  })
);

app.use(cookieParser());
app.use(express.json());

// CSRF protection for state-changing requests
app.use(csrfProtection);

/**
 * GET /api/health
 * Verifies backend service status and PostgreSQL connectivity without exposing credentials
 */
app.get("/api/health", async (_req: Request, res: Response) => {
  const dbHealth = await checkDbConnection();

  if (dbHealth.connected) {
    res.status(200).json({
      status: "ok",
      backend: "healthy",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: "degraded",
      backend: "healthy",
      database: "disconnected",
      message: dbHealth.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Mount modular routes
app.use("/api/auth", authRoutes);
app.use("/api/protected", protectedRoutes);
app.use("/api/icu", icuRoutes);

// Fallback 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: "Not Found",
    message: "Requested API endpoint does not exist.",
  });
});

const server = app.listen(PORT, () => {
  console.log(`ICU Monitor API running at http://localhost:${PORT}`);
  console.log(`Environment: ${config.nodeEnv}`);
});

// Graceful shutdown handling
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server and database pool");
  server.close(() => {
    pool.end().catch(() => {});
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received: closing HTTP server and database pool");
  server.close(() => {
    pool.end().catch(() => {});
  });
});

export default app;
