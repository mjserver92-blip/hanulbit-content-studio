import { NextResponse } from "next/server";
import { admin, appUrl, encryptToken, graphVersion, verifyState } from "../../../../lib/instagram-server";

export const runtime = "nodejs";

async function exchangeCode(code: string, redirectUri: string, appId: string, appSecret: string) {
  const form = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const response = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(20000),
  });
  const json = await response.json();
  if (!response.ok || !json.access_token) throw new Error(json.error_message || json.error?.message || "Instagram 토큰 발급에 실패했습니다.");
  return json as { access_token: string; user_id: number; permissions?: string };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appId = process.env.META_INSTAGRAM_APP_ID;
  const appSecret = process.env.META_INSTAGRAM_APP_SECRET;
  const redirectUri = process.env.META_INSTAGRAM_REDIRECT_URI;

  try {
    if (url.searchParams.get("error")) throw new Error(url.searchParams.get("error_description") || "Instagram 인증이 취소됐습니다.");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state || !appId || !appSecret || !redirectUri) throw new Error("인증 응답 또는 Meta 환경변수가 누락됐습니다.");

    const { userId } = verifyState(state);
    const shortToken = await exchangeCode(code, redirectUri, appId, appSecret);

    const longUrl = new URL("https://graph.instagram.com/access_token");
    longUrl.searchParams.set("grant_type", "ig_exchange_token");
    longUrl.searchParams.set("client_secret", appSecret);
    longUrl.searchParams.set("access_token", shortToken.access_token);
    const longResponse = await fetch(longUrl, { signal: AbortSignal.timeout(20000) });
    const longJson = await longResponse.json();
    if (!longResponse.ok || !longJson.access_token) throw new Error(longJson.error?.message || "장기 액세스 토큰 발급에 실패했습니다.");

    const profileUrl = new URL("https://graph.instagram.com/me");
    profileUrl.searchParams.set("fields", "user_id,username");
    profileUrl.searchParams.set("access_token", longJson.access_token);
    const profileResponse = await fetch(profileUrl, { signal: AbortSignal.timeout(20000) });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.user_id) throw new Error(profile.error?.message || "인스타그램 계정 정보를 가져오지 못했습니다.");

    const { error } = await admin.from("social_connections").upsert({
      user_id: userId,
      platform: "instagram",
      account_id: String(profile.user_id),
      username: profile.username || null,
      access_token_encrypted: encryptToken(longJson.access_token),
      token_expires_at: new Date(Date.now() + Number(longJson.expires_in || 5184000) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,platform" });

    if (error) throw new Error(error.message);
    return NextResponse.redirect(new URL("/?instagram=connected", appUrl));
  } catch (error: any) {
    console.error("[Instagram OAuth]", error);
    const target = new URL("/", appUrl);
    target.searchParams.set("instagram", "error");
    target.searchParams.set("reason", (error.message || "연결 실패").slice(0, 180));
    return NextResponse.redirect(target);
  }
}
