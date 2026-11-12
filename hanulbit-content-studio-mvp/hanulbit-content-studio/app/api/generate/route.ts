import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "서버에 OPENAI_API_KEY가 설정되지 않았습니다." }, { status: 500 });
    }
    const { project, imageUrls } = await req.json();
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json({ error: "시공 사진을 한 장 이상 올려주세요." }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = `당신은 부산·경남 창호 전문 시공 브랜드 '하늘빛창호'의 콘텐츠 에디터다.
브랜드 톤: 프리미엄, 정돈된 전문성, 따뜻하고 신뢰감 있는 한국어. 과장·저가 홍보 문구 금지.
업체 정보: 하늘빛창호. LX하우시스 제품을 취급·시공하지만 공식 대리점이라고 표현하지 않는다.
연락처: 010-9759-8518 / 010-8301-2822.
지역: 부산·경남.
고객이 제공한 현장 정보: ${JSON.stringify(project ?? {})}

사진에서 확인되지 않는 제품명, 유리 사양, 단열 성능, 공사 기간, 하자 보증, 가격, 아파트 동·호수 등을 지어내지 말 것.
정보가 부족하면 일반적인 표현으로 쓰고, 필요한 확인 사항은 "확인 필요"로 남길 것.
한 번의 시공 사례를 4개 채널에 맞게 다르게 작성한다.
JSON 객체만 반환하고 다음 키를 반드시 포함한다:
{
 "blog":{"title":"","body":"","hashtags":""},
 "instagram":{"caption":"","hashtags":""},
 "threads":{"post":""},
 "reels":{"cover":"","hook":"","scenes":[{"seconds":"0-3초","visual":"","caption":""}],"voiceover":"","ending":""},
 "checks":["게시 전 확인할 사실"]
}
블로그는 제목/소제목/문단이 있는 완성 원고, 인스타는 간결한 캡션, 스레드는 대화체의 짧은 글, 릴스는 15~30초 세로 영상용 장면 구성으로 작성.`;

    const content: any[] = [{ type: "text", text: prompt }];
    for (const url of imageUrls.slice(0, 8)) {
      content.push({ type: "image_url", image_url: { url, detail: "low" } });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "정확하고 과장 없는 한국어 창호 시공 콘텐츠를 작성한다. 요청된 JSON만 출력한다." },
        { role: "user", content }
      ],
      temperature: 0.7
    });
    const raw = completion.choices[0]?.message?.content || "{}";
    return NextResponse.json({ content: JSON.parse(raw) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "콘텐츠 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}