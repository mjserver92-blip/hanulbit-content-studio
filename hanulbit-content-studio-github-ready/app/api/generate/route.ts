
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";
export const maxDuration = 300;

type ProjectInfo = {
  site?: string;
  work?: string;
  area?: string;
  notes?: string;
};

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const IMAGE_TIMEOUT_MS = 15_000;
const GEMINI_TIMEOUT_MS = 100_000;

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function errorStatus(error: unknown): number | undefined {
  const e = error as {
    status?: number;
    code?: number | string;
  };

  if (typeof e?.status === "number") return e.status;
  if (typeof e?.code === "number") return e.code;

  const message = errorText(error);
  const match = message.match(/\b(429|500|502|503|504)\b/);

  return match ? Number(match[1]) : undefined;
}

function isAllowedImageUrl(raw: string): boolean {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!supabaseUrl) return false;

    const u = new URL(raw);
    const allowedHost = new URL(supabaseUrl).hostname;

    return (
      u.protocol === "https:" &&
      u.hostname === allowedHost &&
      u.pathname.startsWith("/storage/")
    );
  } catch {
    return false;
  }
}

function guessMimeType(
  url: string,
  headerType: string | null
): string {
  const fromHeader = (headerType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (fromHeader.startsWith("image/")) {
    return fromHeader;
  }

  const lower = url.split("?")[0].toLowerCase();

  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";

  return "image/jpeg";
}

async function toInlinePart(url: string, index: number) {
  const started = Date.now();

  try {
    console.log(`[사진 ${index + 1}] 다운로드 시작`);

    const res = await fetch(url, {
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(
        `사진 ${index + 1} 다운로드 실패: HTTP ${res.status}`
      );
    }

    const contentLength = Number(
      res.headers.get("content-length") || 0
    );

    if (contentLength > MAX_IMAGE_BYTES) {
      throw new Error(
        `사진 ${index + 1}이 6MB를 초과합니다.`
      );
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error(
        `사진 ${index + 1}이 6MB를 초과합니다.`
      );
    }

    console.log(
      `[사진 ${index + 1}] 완료: ${Date.now() - started}ms`
    );

    return {
      inlineData: {
        mimeType: guessMimeType(
          url,
          res.headers.get("content-type")
        ),
        data: buffer.toString("base64"),
      },
    };
  } catch (error) {
    console.error(
      `[사진 ${index + 1}] 오류:`,
      errorText(error)
    );

    if (
      error instanceof Error &&
      error.name === "TimeoutError"
    ) {
      throw new Error(
        `사진 ${index + 1} 다운로드 시간이 초과됐습니다.`
      );
    }

    throw error;
  }
}

function parseJson(raw: string) {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  return JSON.parse(cleaned);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gemini 504는 재시도하지 않습니다.
// 503만 한 번 재시도합니다.
async function generateWithRetry(
  ai: GoogleGenAI,
  model: string,
  contents: any[],
  config: any
) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();

    try {
      console.log(
        `[Gemini] 요청 시작: ${model} (${attempt}/2)`
      );

      const response = await ai.models.generateContent({
        model,
        contents,
        config,
      });

      console.log(
        `[Gemini] 응답 완료: ${Date.now() - started}ms`
      );

      return response;
    } catch (error) {
      const status = errorStatus(error);
      const message = errorText(error).toUpperCase();

      console.error(
        `[Gemini] 요청 실패 (${Date.now() - started}ms):`,
        errorText(error)
      );

      const isDeadline =
        status === 504 ||
        message.includes("DEADLINE_EXCEEDED");

      if (isDeadline) {
        throw new Error(
          "Gemini 서버가 요청을 제한 시간 안에 처리하지 못했습니다. 사진 수를 줄이거나 잠시 후 다시 시도해 주세요."
        );
      }

      if (status !== 503 || attempt === 2) {
        throw error;
      }

      console.warn(
        "[Gemini] 503 오류. 2초 후 한 번 재시도합니다."
      );

      await sleep(2000);
    }
  }

  throw new Error("Gemini 요청에 실패했습니다.");
}

export async function POST(request: Request) {
  const totalStarted = Date.now();

  try {
    console.log("[생성] 요청 접수");

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "서버에 GEMINI_API_KEY 환경변수가 설정되지 않았습니다.",
        },
        { status: 500 }
      );
    }

    const body = await request.json();

    const project = (body.project || {}) as ProjectInfo;

    const rawUrls: unknown[] = Array.isArray(body.imageUrls)
      ? body.imageUrls
      : [];

    const imageUrls = rawUrls.filter(
      (url): url is string =>
        typeof url === "string" &&
        isAllowedImageUrl(url)
    );

    if (imageUrls.length === 0) {
      return NextResponse.json(
        { error: "분석할 사진이 없습니다." },
        { status: 400 }
      );
    }

    if (imageUrls.length > MAX_IMAGES) {
      return NextResponse.json(
        {
          error:
            "안정적인 분석을 위해 사진은 한 번에 최대 4장까지 올려 주세요.",
        },
        { status: 400 }
      );
    }

    console.log(
      `[생성] 사진 ${imageUrls.length}장 처리`
    );

    const imageStarted = Date.now();

    const imageParts = await Promise.all(
      imageUrls.map((url, index) =>
        toInlinePart(url, index)
      )
    );

    console.log(
      `[생성] 사진 처리 완료: ${Date.now() - imageStarted}ms`
    );

    const prompt = `
당신은 부산·경남 창호 전문 시공업체 하늘빛창호의 콘텐츠 에디터입니다.

아래 현장 정보와 실제 시공 사진을 바탕으로
네이버 블로그, 인스타그램, 스레드, 릴스 게시물 초안을 작성하세요.

현장명: ${project.site || "미입력"}
시공 내용: ${project.work || "사진에서 확인되는 내용만 작성"}
지역: ${project.area || "부산·경남"}
추가 메모: ${project.notes || "없음"}

작성 원칙:

1. 사진에서 확인되지 않는 제품 사양, 성능, 가격, 공사 기간,
   고객 반응을 만들어 내지 마세요.

2. LX하우시스 제품이라고 현장 정보에 명시된 경우에만
   LX 제품으로 표현하세요.

3. 하늘빛창호를 LX 공식 대리점이나 공식 인증점이라고
   표현하지 마세요.

4. 과장 광고나 최저가 보장 표현은 금지합니다.

5. 전문적이고 따뜻하며 신뢰감 있는 문체를 사용하세요.

6. 블로그는 설명이 충분한 글로 작성하세요.
   인스타그램은 간결한 캡션으로 작성하세요.
   스레드는 자연스러운 대화체로 작성하세요.
   릴스는 4개 장면 이내로 구성하세요.

7. 불필요하게 긴 설명과 반복 표현은 피하세요.

반드시 아래 JSON 구조로만 반환하세요.

{
  "blog": {
    "title": "",
    "body": "",
    "hashtags": ""
  },
  "instagram": {
    "caption": "",
    "hashtags": ""
  },
  "threads": {
    "post": ""
  },
  "reels": {
    "cover": "",
    "scenes": [
      {
        "seconds": "0-3초",
        "visual": "",
        "caption": ""
      }
    ],
    "voiceover": "",
    "ending": ""
  },
  "checks": [
    "게시 전 확인할 사항"
  ]
}
`;

    const contents = [
      {
        role: "user",
        parts: [
          { text: prompt },
          ...imageParts,
        ],
      },
    ];

    const model =
      process.env.GEMINI_MODEL ||
      "gemini-3.1-flash-lite";

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: GEMINI_TIMEOUT_MS,
        retryOptions: {
          attempts: 1,
        },
      },
    });

    const config = {
      systemInstruction:
        "정확하고 신중한 한국어 브랜드 콘텐츠 작성자입니다. 요청한 JSON만 반환합니다.",

      responseMimeType: "application/json",

      temperature: 0.5,

      maxOutputTokens: 2048,

      thinkingConfig: {
        thinkingLevel: "minimal",
      },
    };

    console.log(`[생성] 모델: ${model}`);

    const response = await generateWithRetry(
      ai,
      model,
      contents,
      config
    );

    const raw = response.text;

    if (!raw) {
      throw new Error("AI 응답이 비어 있습니다.");
    }

    const content = parseJson(raw);

    console.log(
      `[생성] 전체 완료: ${Date.now() - totalStarted}ms`
    );

    return NextResponse.json({ content });
  } catch (error) {
    const message = errorText(error);
    const status = errorStatus(error);

    console.error(
      `[생성] 전체 실패 (${Date.now() - totalStarted}ms):`,
      error
    );

    if (
      status === 504 ||
      /DEADLINE_EXCEEDED/i.test(message)
    ) {
      return NextResponse.json(
        {
          error:
            "Google Gemini가 응답을 완료하지 못했습니다. 사진을 1~2장으로 줄이고 잠시 후 다시 시도해 주세요.",
          retryable: true,
          errorCode: "GEMINI_DEADLINE",
        },
        { status: 504 }
      );
    }

    if (status === 429) {
      return NextResponse.json(
        {
          error:
            "Gemini 무료 사용량 한도에 도달했거나 요청이 제한됐습니다. 사용량을 확인한 뒤 다시 시도해 주세요.",
          retryable: true,
          errorCode: "GEMINI_QUOTA",
        },
        { status: 429 }
      );
    }

    if (status === 503) {
      return NextResponse.json(
        {
          error:
            "Google Gemini 서버가 일시적으로 혼잡합니다. 잠시 후 다시 시도해 주세요.",
          retryable: true,
          errorCode: "GEMINI_UNAVAILABLE",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error:
          message || "콘텐츠 생성 중 오류가 발생했습니다.",
        retryable: false,
        errorCode: "GENERATION_ERROR",
      },
      { status: 500 }
    );
  }
}
