import { NextResponse } from "next/server";
import { admin, decryptToken, graphVersion, requireUser } from "../../../../lib/instagram-server";

export const runtime = "nodejs";
export const maxDuration = 60;

async function graphPost(path: string, params: Record<string, string>, token: string) {
  const body = new URLSearchParams({ ...params, access_token: token });
  const response = await fetch(`https://graph.instagram.com/${graphVersion}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(25000),
  });
  const json = await response.json();
  if (!response.ok || json.error) throw new Error(json.error?.message || "Instagram 게시 API 요청에 실패했습니다.");
  return json;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const { draftId } = await request.json();
    if (!draftId || typeof draftId !== "string") return NextResponse.json({ error: "게시할 콘텐츠를 선택해 주세요." }, { status: 400 });

    const { data: draft, error: draftError } = await admin.from("content_items")
      .select("id,title,status,content,image_urls")
      .eq("id", draftId).eq("user_id", user.id).single();
    if (draftError || !draft) return NextResponse.json({ error: "저장된 콘텐츠를 찾을 수 없습니다." }, { status: 404 });
    if (draft.status !== "approved") return NextResponse.json({ error: "검토 완료 후 승인된 콘텐츠만 게시할 수 있습니다." }, { status: 409 });

    const imageUrl = draft.image_urls?.[0];
    if (!imageUrl) return NextResponse.json({ error: "게시할 시공 사진이 없습니다." }, { status: 400 });
    const parsedImage = new URL(imageUrl);
    if (parsedImage.protocol !== "https:" || !/\.jpe?g$/i.test(parsedImage.pathname)) {
      return NextResponse.json({ error: "현재 인스타그램 자동 게시 1차 버전은 공개 HTTPS JPG/JPEG 사진이 필요합니다. PNG·WEBP는 JPG로 변환한 뒤 다시 올려주세요." }, { status: 400 });
    }

    const { data: connection, error: connectionError } = await admin.from("social_connections")
      .select("account_id,access_token_encrypted,token_expires_at")
      .eq("user_id", user.id).eq("platform", "instagram").single();
    if (connectionError || !connection) return NextResponse.json({ error: "인스타그램 계정을 먼저 연결해 주세요." }, { status: 409 });
    if (new Date(connection.token_expires_at).getTime() < Date.now() + 86400000) {
      return NextResponse.json({ error: "인스타그램 연결 토큰이 곧 만료되거나 만료됐습니다. 계정을 다시 연결해 주세요." }, { status: 401 });
    }

    const token = decryptToken(connection.access_token_encrypted);
    const caption = [draft.content?.instagram?.caption || "", draft.content?.instagram?.hashtags || ""].filter(Boolean).join("\n\n").slice(0, 2200);

    const container = await graphPost(`${connection.account_id}/media`, {
      image_url: imageUrl,
      caption,
    }, token);
    if (!container.id) throw new Error("Instagram 게시 컨테이너를 생성하지 못했습니다.");

    const published = await graphPost(`${connection.account_id}/media_publish`, {
      creation_id: String(container.id),
    }, token);
    if (!published.id) throw new Error("Instagram 게시 결과 ID를 받지 못했습니다.");

    let permalink: string | null = null;
    const detailUrl = new URL(`https://graph.instagram.com/${graphVersion}/${published.id}`);
    detailUrl.searchParams.set("fields", "id,permalink");
    detailUrl.searchParams.set("access_token", token);
    const detailResponse = await fetch(detailUrl, { signal: AbortSignal.timeout(15000) });
    if (detailResponse.ok) {
      const detail = await detailResponse.json();
      permalink = detail.permalink || null;
    }

    const { error: historyError } = await admin.from("content_publications").insert({
      user_id: user.id,
      content_item_id: draft.id,
      platform: "instagram",
      status: "published",
      remote_id: String(published.id),
      permalink,
      published_at: new Date().toISOString(),
    });
    if (historyError) console.error("[Instagram publish history]", historyError);

    return NextResponse.json({ success: true, mediaId: String(published.id), permalink });
  } catch (error: any) {
    console.error("[Instagram publish]", error);
    return NextResponse.json({ error: error.message || "인스타그램 게시에 실패했습니다." }, { status: 500 });
  }
}
