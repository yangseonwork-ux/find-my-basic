import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import { corsHeaders } from "npm:@supabase/supabase-js@2.112.2/cors";

const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://yangseonwork-ux.github.io",
];

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function parseJsonMap(value: string | undefined) {
  if (!value) return [];
  try {
    return Object.values(JSON.parse(value)).filter((key): key is string => typeof key === "string");
  } catch {
    return [];
  }
}

function publishableKeys() {
  return [
    ...parseJsonMap(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")),
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),
    Deno.env.get("SUPABASE_ANON_KEY"),
  ].filter((key): key is string => Boolean(key));
}

function secretKey() {
  const keys = [
    ...parseJsonMap(Deno.env.get("SUPABASE_SECRET_KEYS")),
    Deno.env.get("SUPABASE_SECRET_KEY"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  ].filter((key): key is string => Boolean(key));
  if (!keys[0]) throw new ApiError(500, "SERVER_NOT_CONFIGURED", "서버 설정을 확인해주세요.");
  return keys[0];
}

export function createAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new ApiError(500, "SERVER_NOT_CONFIGURED", "서버 설정을 확인해주세요.");
  return createClient(url, secretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function corsForRequest(request: Request) {
  const origin = request.headers.get("origin");
  const configured = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedOrigins = configured.length ? configured : defaultAllowedOrigins;

  if (origin && !allowedOrigins.includes(origin)) {
    throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "허용되지 않은 요청 출처입니다.");
  }

  return {
    ...corsHeaders,
    "Access-Control-Allow-Origin": origin || allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function requirePublishableKey(request: Request) {
  const suppliedKey = request.headers.get("apikey") || "";
  if (!publishableKeys().includes(suppliedKey)) {
    throw new ApiError(401, "INVALID_API_KEY", "API 인증 정보를 확인해주세요.");
  }
}

export async function getOptionalUserId(request: Request, admin: ReturnType<typeof createAdminClient>) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || publishableKeys().includes(token)) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "INVALID_SESSION", "로그인 세션을 확인해주세요.");
  return data.user.id;
}

export async function parseRequestBody(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 32768) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "요청 데이터가 너무 큽니다.");
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "요청 형식을 확인해주세요.");
  }
}

export function jsonResponse(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function errorResponse(error: unknown, headers: Record<string, string>) {
  if (error instanceof ApiError) {
    return jsonResponse({ code: error.code, message: error.message }, error.status, headers);
  }
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    return jsonResponse(
      { code: String(error.code), message: String(error.message) },
      400,
      headers,
    );
  }

  console.error("Unhandled payment function error", error);
  return jsonResponse({ code: "INTERNAL_ERROR", message: "결제 서버에서 오류가 발생했습니다." }, 500, headers);
}
