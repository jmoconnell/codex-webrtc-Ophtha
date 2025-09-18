import { FastifyInstance } from "fastify";
import { fetch } from "undici";
import { z } from "zod";

import { config } from "../config/env.js";
import { verifyAuthToken } from "../utils/jwt.js";

const sessionRequestSchema = z.object({
  voice: z.string().optional(),
  hints: z.array(z.string()).optional(),
});

interface OpenAiRealtimeSession {
  id: string;
  model: string;
  expires_at: string;
  client_secret: {
    value: string;
    expires_at: string;
  };
  ice_servers?: Array<{
    urls: string[];
    username?: string;
    credential?: string;
  }>;
}

export async function realtimeRoutes(app: FastifyInstance) {
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
        details: parseBody.error.flatten(),
      });
    }

    let instructions = config.defaultGreetingInstructions;

    if (config.requireEnglishGreetings) {
      instructions = `Respond strictly in English. Do not use any other language even if the patient does. ${instructions}`;
    }

    if (parseBody.data.hints && parseBody.data.hints.length > 0) {
      instructions = `${instructions}\n${parseBody.data.hints.join("\n")}`;
    }

    const bodyPayload = {
      model: config.openAiRealtimeModel,
      voice: parseBody.data.voice ?? "verse",
      modalities: ["text", "audio", "video"],
      instructions,
    } satisfies Record<string, unknown>;

    try {
      const response = await fetch(
        `${config.openAiApiBase}/realtime/sessions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.openAiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(bodyPayload),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        request.log.error(
          { status: response.status, errorText },
          "Failed to create OpenAI session",
        );
        return reply.status(502).send({
          error: "OPENAI_SESSION_INIT_FAILED",
          details: response.statusText,
        });
      }

      const payload = (await response.json()) as OpenAiRealtimeSession;

      return reply.send({
        sessionId: payload.id,
        model: payload.model,
        expiresAt: payload.expires_at,
        clientSecret: payload.client_secret,
        iceServers: payload.ice_servers ?? [],
        settings: {
          requireManualMicEnable: config.requireManualMicEnable,
          requireEnglishGreeting: config.requireEnglishGreetings,
        },
      });
    } catch (error) {
      request.log.error(
        { err: error },
        "Unexpected error creating realtime session",
      );
      return reply.status(500).send({ error: "INTERNAL_SERVER_ERROR" });
    }
  });
}
