import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";
export const maxDuration = 60;

type ProjectInfo = {
  site?: string;
  work?: string;
  area?: string;
  notes?: string;
};

const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

// 보안: 우리 Supabase 저장소에 올라간 사진 주소만 허용합니다.
function isAllowedImageUrl(raw: string): boolean {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return false;
    const u = new URL(raw);
    const allowedHost = new URL(supabaseUrl).hostname;
    return u.protocol === "https:" && u.hostname === allowedHost && u.pathname.startsWith("/storage/");
  } catch {
    return false;
  }
}

function guessMimeType(url: string, headerType: string | null): string {
  const fromHeader = (headerType || "").split(";")[0].trim().toLowerCase();
  if (fromHeader.startsWith("image/")) return fromHeader;
  const lower = url.split("?")[0].toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

// Gemini는 인터넷 주소의 사진을 직접 읽지 못하므로, 서버가 내려받아 데이터로 전달합니다.
async function toInlinePart(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`사진을 불러오지 못했습니다 (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("사진 한 장의 크기가 너무 큽니다. 6MB 이하로 줄여 주세요.");
  }
  return {
    inlineData: {
      mimeType: guessMimeType(url, res.headers.get("content-type")),
      data: buffer.toString("base64")
    }
  };
}

function parseJson(raw: string) {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "서버에 GEMINI_API_KEY 환경변수가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const project = (body.project || {}) as ProjectInfo;
    const imageUrls: string[] = Array.isArray(body.imageUrls)
      ? body.imageUrls
          .filter((url: unknown): url is string => typeof url === "string" && isAllowedImageUrl(url))
          .slice(0, MAX_IMAGES)
      : [];

    if (imageUrls.length === 0) {
      return NextResponse.json({ error: "분석할 사진이 없습니다." }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const imageParts = await Promise.all(imageUrls.map((url) => toInlinePart(url)));

    const prompt = `
당신은 부산·경남 창호 전문 시공업체 '하늘빛창호'의 콘텐츠 에디터입니다.
업로드된 실제 시공 사진과 아래 현장 정보를 바탕으로 채널별 게시물 초안을 한국어로 작성하세요.

현장명: ${project.site || "미입력"}
시공 내용: ${project.work || "사진에서 확인되는 범위만 기술"}
지역: ${project.area || "부산·경남"}
추가 메모: ${project.notes || "없음"}

작성 원칙:
- 사진에서 확인되지 않는 제품 사양, 성능, 공사 기간, 가격, 고객 반응을 지어내지 마세요.
- LX하우시스 제품이 현장 정보에 명시되지 않았다면 LX 제품이라고 단정하지 마세요.
- 하늘빛창호를 LX 공식 대리점 또는 공식 인증점이라고 표현하지 마세요. 필요하면 'LX하우시스 제품 취급·시공' 정도로만 표현하세요.
- 과장 광고, 최저가 보장, 무조건적인 단열·방음 보장 표현은 피하세요.
- 전문적이고 따뜻하며 신뢰감 있는 문체를 사용하세요. 이모지와 해시태그는 과하지 않게 사용하세요.
- 네이버 블로그는 충분한 설명이 있는 글, 인스타그램은 간결한 캡션, 스레드는 대화체의 짧은 글, 릴스는 짧은 영상의 장면 구성과 내레이션을 작성하세요.
- 결과는 반드시 아래 JSON 구조로만 반환하세요.

{
  "blog": {"title":"", "body":"", "hashtags":""},
  "instagram": {"caption":"", "hashtags":""},
  "threads": {"post":""},
  "reels": {"cover":"", "scenes":[{"seconds":"0-3초","visual":"화면 구성","caption":"화면 자막"}], "voiceover":"", "ending":""},
  "checks": ["게시 전 확인할 사항"]
}
`;

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-flash-latest",
      contents: [{ role: "user", parts: [{ text: prompt }, ...imageParts] }],
      config: {
        systemInstruction: "정확하고 신중한 한국어 브랜드 콘텐츠 작성자입니다. 지정된 JSON만 반환합니다.",
        responseMimeType: "application/json",
        temperature: 0.7
      }
    });

    const raw = response.text;
    if (!raw) throw new Error("AI 응답이 비어 있습니다.");
    const content = parseJson(raw);
    return NextResponse.json({ content });
  } catch (error) {
    console.error("Content generation error:", error);
    const message = error instanceof Error ? error.message : "콘텐츠 생성 중 오류가 발생했습니다.";
    const friendly =
      /429|quota|RESOURCE_EXHAUSTED/i.test(message)
        ? "AI 사용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요."
        : message;
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}
