import { FastifyInstance } from "fastify";
import { z } from "zod";

import { findDemoUser, verifyPassword } from "../data/demo-users.js";
import { createAuthToken } from "../utils/jwt.js";

const loginSchema = z.object({
  username: z.string().min(3).email(),
  password: z.string().min(8),
  dob: z
    .string()
    .regex(/\d{4}-\d{2}-\d{2}/, "DOB must be in YYYY-MM-DD format"),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/login", async (request, reply) => {
    const parseResult = loginSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        details: parseResult.error.flatten().fieldErrors,
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
      username: user.username,
    });

    return reply.send({
      accessToken: token,
      tokenType: "Bearer",
      expiresIn: 15 * 60,
      user: {
        id: user.id,
        role: user.role,
        username: user.username,
      },
    });
  });
}
