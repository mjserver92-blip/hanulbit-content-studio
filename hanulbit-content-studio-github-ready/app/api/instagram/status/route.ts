import { NextResponse } from "next/server";
import { admin, requireUser } from "../../../../lib/instagram-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const { data, error } = await admin.from("social_connections")
      .select("username,account_id,token_expires_at,updated_at")
      .eq("user_id", user.id).eq("platform", "instagram").maybeSingle();
    if (error) throw error;
    return NextResponse.json({ connected: !!data, account: data?.username || null, expiresAt: data?.token_expires_at || null });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "연결 상태를 확인하지 못했습니다." }, { status: 401 });
  }
}
