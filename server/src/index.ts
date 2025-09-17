import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify from "fastify";

import { config } from "./config/env.js";
import { authRoutes } from "./routes/auth.js";
import { realtimeRoutes } from "./routes/realtime.js";

async function buildServer() {
  const app = Fastify({
    logger: { level: config.nodeEnv === "development" ? "info" : "warn" },
  });

  await app.register(helmet, { global: true });
  await app.register(cors, {
    origin: config.nodeEnv === "development" ? true : ["https://example.com"],
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  });

  app.get("/healthz", async () => ({ status: "ok", uptime: process.uptime() }));

  await app.register(authRoutes);
  await app.register(realtimeRoutes);

  return app;
}

async function start() {
  try {
    const app = await buildServer();
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`Server listening on http://${config.host}:${config.port}`);
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { buildServer };
