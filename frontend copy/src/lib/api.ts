const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

export interface LoginRequest {
  username: string;
  password: string;
  dob: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: {
    id: string;
    username: string;
    role: string;
  };
}

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE}/api/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      "Invalid credentials. Please verify your details and try again.",
    );
  }

  return (await response.json()) as LoginResponse;
}

interface RealtimeSessionResponse {
  sessionId: string;
  model: string;
  expiresAt: string;
  clientSecret: {
    value: string;
    expiresAt: string;
  };
  iceServers: Array<{
    urls: string[];
    username?: string;
    credential?: string;
  }>;
  settings?: {
    requireManualMicEnable?: boolean;
    requireEnglishGreeting?: boolean;
  };
}

export async function createRealtimeSession(
  accessToken: string,
): Promise<RealtimeSessionResponse> {
  const response = await fetch(`${API_BASE}/api/realtime/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unable to initialize voice session. ${text}`);
  }

  return (await response.json()) as RealtimeSessionResponse;
}
