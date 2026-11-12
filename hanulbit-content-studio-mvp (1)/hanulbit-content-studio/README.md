# 하늘빛창호 콘텐츠 스튜디오 (MVP 0.1)

PC·휴대폰에서 사용하는 반응형 웹 앱입니다.

## 현재 구현된 기능
- 이메일 매직링크 로그인 (Supabase Auth)
- 시공 사진 최대 8장 업로드
- 현장명/시공 내용/지역/메모 입력
- OpenAI 비전 모델을 이용한 4개 채널 콘텐츠 초안 생성
- 네이버 블로그·인스타그램·스레드·릴스 대본 탭별 편집
- 현재 채널 원고 복사
- 초안 저장 및 승인 상태 저장
- 다른 기기에서 로그인해 초안 불러오기

## 아직 연결되지 않은 기능
- 네이버 블로그 자동 발행: 공식 글쓰기 API 사용을 전제로 하지 않습니다. 승인 후 복사/붙여넣기로 최종 등록합니다.
- 인스타그램/Threads 자동 발행: Meta 앱 생성, 권한 승인, 계정 연결 및 게시 API 구현이 추가로 필요합니다.
- 릴스 영상 파일 자동 렌더링: 현재는 장면 구성·자막·내레이션 대본을 만듭니다. 영상 렌더링은 후속 단계입니다.
- 도메인 연결: DNS 및 배포 계정 접근 권한이 필요합니다.

## 준비물
1. Supabase 프로젝트
2. OpenAI API 키 (ChatGPT 구독과 별도 과금)
3. Vercel 계정 및 도메인 DNS 관리 권한

## 로컬 실행
Node.js 20 이상 권장.

```bash
npm install
cp .env.example .env.local
```

`.env.local`에 Supabase URL, anon key, OpenAI API key를 입력합니다.

Supabase SQL Editor에서 `supabase/schema.sql`을 실행한 뒤,
Supabase Authentication > URL Configuration에 로컬 주소 `http://localhost:3000`과 배포 주소를 등록합니다.

```bash
npm run dev
```

브라우저에서 http://localhost:3000 접속합니다.

## Vercel 배포
1. 이 프로젝트를 GitHub 저장소에 업로드합니다.
2. Vercel에서 해당 저장소를 Import합니다.
3. Environment Variables에 `.env.example`의 세 값을 등록합니다.
4. Deploy를 실행합니다.
5. Vercel 프로젝트 Domains에 `hanulbit.co.kr` 또는 사용할 서브도메인을 추가합니다.
6. 안내되는 DNS 레코드를 도메인 관리 업체에 등록합니다.
7. Supabase Auth URL Configuration에도 최종 도메인을 추가합니다.

## 보안 주의
- `OPENAI_API_KEY`는 반드시 서버 환경변수로만 등록합니다.
- `.env.local` 파일은 GitHub에 올리지 않습니다.
- 사진 버킷은 현재 공개 URL 방식입니다. 링크를 아는 사람은 이미지를 볼 수 있으므로 고객 얼굴·주소·차량번호 등 개인정보가 나온 사진은 업로드 전 가림 처리하세요.
- 초기 버전은 사용자별 이메일 로그인과 행 단위 보안 정책을 적용합니다.
- 실제 고객 운영 전에는 관리자 계정 제한, 비용 한도, 이미지 보관 정책을 추가 점검하세요.
