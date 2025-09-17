import * as dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z
    .string()
    .transform((val) => Number(val))
    .pipe(z.number().int().positive())
    .default("4000"),
  HOST: z.string().default("0.0.0.0"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_REALTIME_MODEL: z
    .string()
    .default("gpt-4o-realtime-preview-2025-08-28"),
  OPENAI_API_BASE: z.string().url().optional(),
  DEMO_USER_PASSWORD_HASH: z.string().optional(),
  REQUIRE_ENGLISH_GREETINGS: z
    .string()
    .optional()
    .transform((value) => (value ? value.toLowerCase() === "true" : true)),
  REQUIRE_MANUAL_MIC_ENABLE: z
    .string()
    .optional()
    .transform((value) => (value ? value.toLowerCase() === "true" : true)),
  DEFAULT_GREETING_INSTRUCTIONS: z.string().optional(),
});

const env = EnvSchema.parse({
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
  DEFAULT_GREETING_INSTRUCTIONS: process.env.DEFAULT_GREETING_INSTRUCTIONS,
});

export const config = {
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
  defaultGreetingInstructions:
    env.DEFAULT_GREETING_INSTRUCTIONS ??
    "You are an English-speaking ophthalmology assistant. Introduce yourself once, confirm consent for an AI-assisted voice visit, and invite the patient to describe their reason for today's appointment. Always speak English and do not repeat yourself unless the patient explicitly asks you to.",
};
