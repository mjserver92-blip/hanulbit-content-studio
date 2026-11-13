import { createClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const encryptionSecret = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY!;

export const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function requireUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("로그인이 필요합니다.");
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new Error("로그인 인증이 만료됐습니다. 다시 로그인해 주세요.");
  return data.user;
}

function keyBytes() {
  if (!encryptionSecret) throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY 환경변수가 필요합니다.");
  const key = /^[a-f0-9]{64}$/i.test(encryptionSecret)
    ? Buffer.from(encryptionSecret, "hex")
    : Buffer.from(encryptionSecret, "base64");
  if (key.length !== 32) throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY는 32바이트 키의 Base64 또는 64자리 16진수여야 합니다.");
  return key;
}

export function encryptToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptToken(value: string) {
  const [iv, tag, data] = value.split(".");
  if (!iv || !tag || !data) throw new Error("저장된 계정 토큰 형식이 올바르지 않습니다.");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export function signState(payload: { userId: string; exp: number }) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", keyBytes()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyState(state: string) {
  const [body, signature] = state.split(".");
  if (!body || !signature) throw new Error("인증 상태값이 올바르지 않습니다.");
  const expected = createHmac("sha256", keyBytes()).update(body).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("인증 상태값 검증에 실패했습니다.");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!payload.userId || payload.exp < Date.now()) throw new Error("인증 시간이 만료됐습니다. 다시 연결해 주세요.");
  return payload as { userId: string; exp: number };
}

export const graphVersion = process.env.META_GRAPH_VERSION || "v27.0";
export const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://hanulbit-studio.vercel.app";
