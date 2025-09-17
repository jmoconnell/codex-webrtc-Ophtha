// src/index.ts
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify from "fastify";

// src/config/env.ts
import * as dotenv from "dotenv";
import { z } from "zod";
dotenv.config();
var EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().transform((val) => Number(val)).pipe(z.number().int().positive()).default("4000"),
  HOST: z.string().default("0.0.0.0"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-4o-realtime-preview-2025-08-28"),
  OPENAI_API_BASE: z.string().url().optional(),
  DEMO_USER_PASSWORD_HASH: z.string().optional(),
  REQUIRE_ENGLISH_GREETINGS: z.string().optional().transform((value) => value ? value.toLowerCase() === "true" : true),
  REQUIRE_MANUAL_MIC_ENABLE: z.string().optional().transform((value) => value ? value.toLowerCase() === "true" : true),
  DEFAULT_GREETING_INSTRUCTIONS: z.string().optional()
});
var env = EnvSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT ?? "4000",
  HOST: process.env.HOST ?? "0.0.0.0",
  JWT_SECRET: process.env.JWT_SECRET,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_REALTIME_MODEL: process.env.OPENAI_REALTIME_MODEL,
  OPENAI_API_BASE: process.env.OPENAI_API_BASE,
  DEMO_USER_PASSWORD_HASH: process.env.DEMO_USER_PASSWORD_HASH,
  REQUIRE_ENGLISH_GREETINGS: process.env.REQUIRE_ENGLISH_GREETINGS,
  REQUIRE_MANUAL_MIC_ENABLE: process.env.REQUIRE_MANUAL_MIC_ENABLE,
  DEFAULT_GREETING_INSTRUCTIONS: process.env.DEFAULT_GREETING_INSTRUCTIONS
});
var config2 = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  host: env.HOST,
  jwtSecret: env.JWT_SECRET,
  openAiApiKey: env.OPENAI_API_KEY,
  openAiRealtimeModel: env.OPENAI_REALTIME_MODEL,
  openAiApiBase: env.OPENAI_API_BASE ?? "https://api.openai.com/v1",
  demoUserPasswordHash: env.DEMO_USER_PASSWORD_HASH,
  requireEnglishGreetings: env.REQUIRE_ENGLISH_GREETINGS,
  requireManualMicEnable: env.REQUIRE_MANUAL_MIC_ENABLE,
  defaultGreetingInstructions: env.DEFAULT_GREETING_INSTRUCTIONS ?? "You are an English-speaking ophthalmology assistant. Introduce yourself once, confirm consent for an AI-assisted voice visit, and invite the patient to describe their reason for today's appointment. Always speak English and do not repeat yourself unless the patient explicitly asks you to."
};

// src/routes/auth.ts
import { z as z2 } from "zod";

// src/data/demo-users.ts
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
var DEFAULT_PASSWORD = process.env.DEMO_USER_PASSWORD || "PatientDemo!123";
var encodedFromEnv = process.env.DEMO_USER_PASSWORD_HASH;
function derivePasswordMaterial() {
  if (encodedFromEnv) {
    const [salt3, hash3] = encodedFromEnv.split(":");
    if (!salt3 || !hash3) {
      throw new Error('DEMO_USER_PASSWORD_HASH must be in format "salt:hash"');
    }
    return { salt: salt3, hash: hash3 };
  }
  const salt2 = randomBytes(16).toString("hex");
  const hash2 = scryptSync(DEFAULT_PASSWORD, salt2, 64).toString("hex");
  return { salt: salt2, hash: hash2 };
}
var { salt, hash } = derivePasswordMaterial();
var users = [
  {
    id: "patient-001",
    username: "patient.one@example.com",
    dob: "1985-04-12",
    role: "patient",
    passwordSalt: salt,
    passwordHash: hash
  }
];
function findDemoUser(username) {
  return users.find(
    (user) => user.username.toLowerCase() === username.toLowerCase()
  );
}
function verifyPassword(user, password) {
  const computed = scryptSync(password, user.passwordSalt, 64);
  const stored = Buffer.from(user.passwordHash, "hex");
  return timingSafeEqual(computed, stored);
}

// src/utils/jwt.ts
import { jwtVerify, SignJWT } from "jose";
var encoder = new TextEncoder();
var secretKey = encoder.encode(config2.jwtSecret);
async function createAuthToken(payload, expiresIn = "15m") {
  const token = await new SignJWT({ ...payload }).setProtectedHeader({ alg: "HS256" }).setSubject(payload.sub).setIssuedAt().setExpirationTime(expiresIn).sign(secretKey);
  return token;
}
async function verifyAuthToken(token) {
  const { payload } = await jwtVerify(token, secretKey, {
    algorithms: ["HS256"]
  });
  return payload;
}

// src/routes/auth.ts
var loginSchema = z2.object({
  username: z2.string().min(3).email(),
  password: z2.string().min(8),
  dob: z2.string().regex(/\d{4}-\d{2}-\d{2}/, "DOB must be in YYYY-MM-DD format")
});
async function authRoutes(app) {
  app.post("/api/login", async (request, reply) => {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        details: parseResult.error.flatten().fieldErrors
      });
    }
    const { username, password, dob } = parseResult.data;
    const user = findDemoUser(username);
    if (!user || user.dob !== dob || !verifyPassword(user, password)) {
      return reply.status(401).send({ error: "INVALID_CREDENTIALS" });
    }
    const token = await createAuthToken({
      sub: user.id,
      role: user.role,
      username: user.username
    });
    return reply.send({
      accessToken: token,
      tokenType: "Bearer",
      expiresIn: 15 * 60,
      user: {
        id: user.id,
        role: user.role,
        username: user.username
      }
    });
  });
}

// src/routes/realtime.ts
import { fetch } from "undici";
import { z as z3 } from "zod";
var sessionRequestSchema = z3.object({
  voice: z3.string().optional(),
  hints: z3.array(z3.string()).optional()
});
async function realtimeRoutes(app) {
  app.post("/api/realtime/session", async (request, reply) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "MISSING_TOKEN" });
    }
    const token = authorization.replace("Bearer ", "");
    try {
      await verifyAuthToken(token);
    } catch (error) {
      request.log.warn({ err: error }, "Invalid auth token");
      return reply.status(401).send({ error: "INVALID_TOKEN" });
    }
    const parseBody = sessionRequestSchema.safeParse(request.body ?? {});
    if (!parseBody.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        details: parseBody.error.flatten()
      });
    }
    let instructions = config2.defaultGreetingInstructions;
    if (config2.requireEnglishGreetings) {
      instructions = `Respond strictly in English. Do not use any other language even if the patient does. ${instructions}`;
    }
    if (parseBody.data.hints && parseBody.data.hints.length > 0) {
      instructions = `${instructions}
${parseBody.data.hints.join("\n")}`;
    }
    const bodyPayload = {
      model: config2.openAiRealtimeModel,
      voice: parseBody.data.voice ?? "verse",
      modalities: ["text", "audio"],
      instructions
    };
    try {
      const response = await fetch(
        `${config2.openAiApiBase}/realtime/sessions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config2.openAiApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(bodyPayload)
        }
      );
      if (!response.ok) {
        const errorText = await response.text();
        request.log.error(
          { status: response.status, errorText },
          "Failed to create OpenAI session"
        );
        return reply.status(502).send({
          error: "OPENAI_SESSION_INIT_FAILED",
          details: response.statusText
        });
      }
      const payload = await response.json();
      return reply.send({
        sessionId: payload.id,
        model: payload.model,
        expiresAt: payload.expires_at,
        clientSecret: payload.client_secret,
        iceServers: payload.ice_servers ?? [],
        settings: {
          requireManualMicEnable: config2.requireManualMicEnable,
          requireEnglishGreeting: config2.requireEnglishGreetings
        }
      });
    } catch (error) {
      request.log.error(
        { err: error },
        "Unexpected error creating realtime session"
      );
      return reply.status(500).send({ error: "INTERNAL_SERVER_ERROR" });
    }
  });
}

// src/index.ts
async function buildServer() {
  const app = Fastify({
    logger: { level: config2.nodeEnv === "development" ? "info" : "warn" }
  });
  await app.register(helmet, { global: true });
  await app.register(cors, {
    origin: config2.nodeEnv === "development" ? true : ["https://example.com"],
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true
  });
  app.get("/healthz", async () => ({ status: "ok", uptime: process.uptime() }));
  await app.register(authRoutes);
  await app.register(realtimeRoutes);
  return app;
}
async function start() {
  try {
    const app = await buildServer();
    await app.listen({ port: config2.port, host: config2.host });
    app.log.info(`Server listening on http://${config2.host}:${config2.port}`);
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}
export {
  buildServer
};
