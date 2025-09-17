import { JWTPayload, jwtVerify, SignJWT } from "jose";

import { config } from "../config/env.js";

const encoder = new TextEncoder();
const secretKey = encoder.encode(config.jwtSecret);

export interface AuthTokenPayload extends JWTPayload {
  sub: string;
  role: "patient" | "clinician" | "admin";
}

export async function createAuthToken(
  payload: AuthTokenPayload,
  expiresIn = "15m",
): Promise<string> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey);

  return token;
}

export async function verifyAuthToken<T extends JWTPayload = AuthTokenPayload>(
  token: string,
): Promise<T> {
  const { payload } = await jwtVerify<T>(token, secretKey, {
    algorithms: ["HS256"],
  });
  return payload;
}
