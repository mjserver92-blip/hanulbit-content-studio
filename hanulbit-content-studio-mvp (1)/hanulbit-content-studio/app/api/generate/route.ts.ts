import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Gemini 클라이언트 초기화 (환경 변수에서 자동으로 GEMINI_API_KEY 인식)
const ai = new GoogleGenAI();

export async function POST(request: Request) {
  try {
    const { prompt, images } = await request.json();

    // 무료 요금제에서 지원하는 gemini-2.5-flash 모델 사용
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt || "시공 사진을 바탕으로 블로그 및 인스타그램 콘텐츠를 작성해줘." },
            // 이미지가 포함된 경우 파트에 추가
            ...(images || []).map((url: string) => ({
              fileData: { fileUri: url, mimeType: 'image/jpeg' }
            }))
          ]
        }
      ],
    });

    return NextResponse.json({ result: response.text });
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return NextResponse.json({ error: error.message || 'AI 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}