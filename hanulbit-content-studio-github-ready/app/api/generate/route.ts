import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

type ProjectInfo = {
  site?: string;
  work?: string;
  area?: string;
  notes?: string;
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "서버에 OPENAI_API_KEY 환경변수가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const project = (body.project || {}) as ProjectInfo;
    const imageUrls = Array.isArray(body.imageUrls)
      ? body.imageUrls.filter((url: unknown): url is string =>
          typeof url === "string" && /^https:\/\/.+/i.test(url)
        ).slice(0, 8)
      : [];

    if (imageUrls.length === 0) {
      return NextResponse.json({ error: "분석할 사진이 없습니다." }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });
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

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "정확하고 신중한 한국어 브랜드 콘텐츠 작성자입니다. 지정된 JSON만 반환합니다." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            ...imageUrls.map((url: string) => ({
              type: "image_url" as const,
              image_url: { url, detail: "high" as const }
            }))
          ]
        }
      ],
      temperature: 0.7
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error("AI 응답이 비어 있습니다.");
    const content = JSON.parse(raw);
    return NextResponse.json({ content });
  } catch (error) {
    console.error("Content generation error:", error);
    const message = error instanceof Error ? error.message : "콘텐츠 생성 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
