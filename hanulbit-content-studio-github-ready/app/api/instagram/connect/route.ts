import { NextResponse } from "next/server";
import { requireUser, signState } from "../../../../lib/instagram-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const appId = process.env.META_INSTAGRAM_APP_ID;
    const redirectUri = process.env.META_INSTAGRAM_REDIRECT_URI;
    if (!appId || !redirectUri) {
      return NextResponse.json({ error: "Meta 앱 ID와 Redirect URI 환경변수를 먼저 설정해야 합니다." }, { status: 503 });
    }

    const state = signState({ userId: user.id, exp: Date.now() + 10 * 60 * 1000 });
    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "instagram_business_basic,instagram_business_content_publish");
    url.searchParams.set("state", state);
    url.searchParams.set("enable_fb_login", "0");
    url.searchParams.set("force_authentication", "1");
    return NextResponse.json({ url: url.toString() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "인스타그램 연결을 시작하지 못했습니다." }, { status: 401 });
  }
}
