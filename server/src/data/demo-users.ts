import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

interface DemoUser {
  id: string;
  username: string;
  dob: string; // ISO YYYY-MM-DD
  role: "patient";
  passwordSalt: string;
  passwordHash: string;
}

const DEFAULT_PASSWORD = process.env.DEMO_USER_PASSWORD || "PatientDemo!123";
const encodedFromEnv = process.env.DEMO_USER_PASSWORD_HASH;

function derivePasswordMaterial() {
  if (encodedFromEnv) {
    const [salt, hash] = encodedFromEnv.split(":");
    if (!salt || !hash) {
      throw new Error('DEMO_USER_PASSWORD_HASH must be in format "salt:hash"');
    }
    return { salt, hash };
  }
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(DEFAULT_PASSWORD, salt, 64).toString("hex");
  return { salt, hash };
}

const { salt, hash } = derivePasswordMaterial();

const users: DemoUser[] = [
  {
    id: "patient-001",
    username: "patient.one@example.com",
    dob: "1985-04-12",
    role: "patient",
    passwordSalt: salt,
    passwordHash: hash,
  },
];

export function findDemoUser(username: string): DemoUser | undefined {
  return users.find(
    (user) => user.username.toLowerCase() === username.toLowerCase(),
  );
}

export function verifyPassword(user: DemoUser, password: string): boolean {
  const computed = scryptSync(password, user.passwordSalt, 64);
  const stored = Buffer.from(user.passwordHash, "hex");
  return timingSafeEqual(computed, stored);
}

export type { DemoUser };
