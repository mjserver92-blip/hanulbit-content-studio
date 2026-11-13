
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

const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

// 사진 한 장 다운로드 최대 20초
const IMAGE_TIMEOUT_MS = 20_000;

// Gemini 요청 한 번당 최대 85초
const GEMINI_TIMEOUT_MS = 85_000;

// 최초 요청 포함 최대 2회
const MAX_RETRIES = 2;

function elapsed(start: number) {
  return `${Date.now() - start}ms`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function errorStatus(error: unknown): number | undefined {
  const e = error as {
    status?: number;
    code?: number | string;
    error?: { status?: string; code?: number };
  };

  if (typeof e?.status === "number") return e.status;
  if (typeof e?.code === "number") return e.code;

  const message = errorText(error);
  const match = message.match(/\b(429|500|502|503|504)\b/);

  return match ? Number(match[1]) : undefined;
}

function isTemporaryError(error: unknown): boolean {
  const message = errorText(error).toUpperCase();
  const status = errorStatus(error);

  return (
    [429, 500, 502, 503, 504].includes(status || 0) ||
    /UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL|DEADLINE_EXCEEDED|HIGH DEMAND|OVERLOADED|TIMEOUT|TIMED OUT|ABORTED|ABORTERROR/.test(
      message
    )
  );
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

  if (fromHeader.startsWith("image/")) return fromHeader;

  const lower = url.split("?")[0].toLowerCase();

  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";

  return "image/jpeg";
}

// 사진 다운로드에 개별 시간 제한 적용
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
        `사진 ${index + 1}의 크기가 6MB를 초과합니다.`
      );
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error(
        `사진 ${index + 1}의 크기가 6MB를 초과합니다.`
      );
    }

    console.log(
      `[사진 ${index + 1}] 다운로드 완료: ${elapsed(started)}, ${Math.round(
        buffer.length / 1024
      )}KB`
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
      `[사진 ${index + 1}] 다운로드 오류 (${elapsed(started)}):`,
      errorText(error)
    );

    if (
      error instanceof Error &&
      error.name === "TimeoutError"
    ) {
      throw new Error(
        `사진 ${index + 1} 다운로드 시간이 초과됐습니다. 잠시 후 다시 시도해 주세요.`
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

// Gemini 요청 시간 제한 및 재시도
async function generateWithRetry(
  ai: GoogleGenAI,
  model: string,
  contents: any[],
  config: any
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const started = Date.now();

    try {
      console.log(
        `[Gemini] 요청 시작: ${model}, ${attempt}/${MAX_RETRIES}`
      );

      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          ...config,
          httpOptions: {
            timeout: GEMINI_TIMEOUT_MS,

            // SDK 자체의 기본 재시도와 중복되지 않도록 설정
            retryOptions: {
              attempts: 1,
            },
          },
        },
      });

      console.log(
        `[Gemini] 응답 완료: ${elapsed(started)}`
      );

      return response;
    } catch (error) {
      lastError = error;

      console.error(
        `[Gemini] 요청 실패 (${elapsed(started)}):`,
        errorText(error)
      );

      if (
        !isTemporaryError(error) ||
        attempt === MAX_RETRIES
      ) {
        throw error;
      }

      console.warn(
        "[Gemini] 일시 오류. 2초 후 한 번 더 시도합니다."
      );

      await sleep(2000);
    }
  }

  throw lastError;
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

    const imageUrls: string[] = Array.isArray(body.imageUrls)
      ? body.imageUrls
          .filter(
            (url: unknown): url is string =>
              typeof url === "string" &&
              isAllowedImageUrl(url)
          )
          .slice(0, MAX_IMAGES)
      : [];

    if (imageUrls.length === 0) {
      return NextResponse.json(
        { error: "분석할 사진이 없습니다." },
        { status: 400 }
      );
    }

    console.log(
      `[생성] 사진 ${imageUrls.length}장 처리 시작`
    );

    const imageStarted = Date.now();

    const imageParts = await Promise.all(
      imageUrls.map((url, index) =>
        toInlinePart(url, index)
      )
    );

    console.log(
      `[생성] 사진 전체 처리 완료: ${elapsed(imageStarted)}`
    );

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

    const contents = [
      {
        role: "user",
        parts: [{ text: prompt }, ...imageParts],
      },
    ];

    const config = {
      systemInstruction:
        "정확하고 신중한 한국어 브랜드 콘텐츠 작성자입니다. 지정된 JSON만 반환합니다.",
      responseMimeType: "application/json",
      temperature: 0.7,
      maxOutputTokens: 4096,
    };

    const model =
      process.env.GEMINI_MODEL || "gemini-flash-latest";

    // SDK의 HTTP 요청 시간 제한은 85초
    // 최대 2회 요청하므로 5분 제한에 접근하지 않도록 구성
    const ai = new GoogleGenAI({ apiKey });

    console.log(`[생성] Gemini 모델: ${model}`);

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
      `[생성] 전체 완료: ${elapsed(totalStarted)}`
    );

    return NextResponse.json({ content });
  } catch (error) {
    console.error(
      `[생성] 전체 실패 (${elapsed(totalStarted)}):`,
      error
    );

    const message = errorText(error);
    const status = errorStatus(error);

    if (isTemporaryError(error)) {
      const isQuota =
        status === 429 ||
        /QUOTA|RESOURCE_EXHAUSTED/i.test(message);

      const isTimeout =
        /TIMEOUT|TIMED OUT|ABORTED|ABORTERROR|DEADLINE_EXCEEDED/i.test(
          message
        );

      return NextResponse.json(
        {
          error: isTimeout
            ? "AI 응답 시간이 초과됐습니다. 사진 수를 줄이거나 잠시 후 다시 시도해 주세요."
            : isQuota
              ? "AI 사용량이 일시적으로 많습니다. 잠시 후 다시 시도해 주세요."
              : "Google Gemini 서버가 일시적으로 혼잡합니다. 잠시 후 다시 시도해 주세요.",
          retryable: true,
        },
        { status: isQuota ? 429 : 503 }
      );
    }

    return NextResponse.json(
      {
        error:
          message || "콘텐츠 생성 중 오류가 발생했습니다.",
        retryable: false,
      },
      { status: 500 }
    );
  }
}
