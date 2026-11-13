하늘빛창호 콘텐츠 스튜디오 (MVP)
PC와 휴대폰에서 사용하는 반응형 웹 앱입니다.
포함된 기능
Supabase 이메일 매직링크 로그인
시공 사진 최대 8장 업로드
현장명·시공 내용·지역·메모 입력
Gemini 이미지 분석을 통한 네이버 블로그·인스타그램·스레드·릴스 콘텐츠 초안 생성
채널별 문구 편집 및 복사
초안 저장 및 검토 완료(승인) 상태 저장
아직 구현되지 않은 기능
네이버 블로그 자동 게시
Instagram / Threads 자동 게시
릴스 MP4 영상 자동 제작
실제 게시 전 사용자 승인 후 수동 복사·게시 방식입니다.
GitHub 업로드용 폴더 구조
압축을 풀면 `app`, `lib`, `supabase`, `package.json`이 바로 보여야 합니다.
이 프로젝트 폴더 안의 파일과 폴더 전체를 GitHub 저장소 최상위에 업로드하세요.
`.env.local` 파일은 절대 GitHub에 업로드하지 마세요.
환경변수 설정
Vercel 프로젝트의 Settings → Environment Variables에 아래 4개 값을 등록하세요.
`NEXT_PUBLIC_SUPABASE_URL`: Supabase 프로젝트 URL
`NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase Publishable key (`sb_publishable_...`)
`GEMINI_API_KEY`: Google AI Studio에서 발급한 Gemini API 키
`GEMINI_MODEL`: `gemini-flash-latest` (선택, 비우면 기본값 사용)
값은 `.env.example`을 참고하되, 예시 파일의 `YOUR_...` 부분은 실제 값으로 바꾸어 Vercel에만 등록하세요.
API 키를 GitHub 코드나 채팅에 올리지 마세요. Gemini API는 무료 사용 한도가 있으며, 한도를 넘으면 유료입니다.
Supabase 준비
Supabase SQL Editor에서 `supabase/schema.sql` 전체를 실행합니다.
Authentication → URL Configuration에서 배포된 사이트 주소를 허용 URL에 추가합니다.
Storage의 `site-photos` 버킷은 현재 공개 URL 방식입니다. 고객 얼굴·주소·차량번호 등 개인정보가 포함된 사진은 업로드 전에 가림 처리하세요.
Vercel 배포
GitHub 저장소를 Vercel에 연결합니다.
Root Directory는 `./` (저장소 최상위)로 설정합니다.
Framework Preset은 Next.js, Build Command는 기본값(`next build`)을 사용합니다.
위 환경변수 4개를 Production, Preview, Development에 등록합니다.
Deploy를 실행합니다.
로컬 실행 (선택)
Node.js 20 이상 권장.
```bash
npm install
cp .env.example .env.local
# .env.local에 실제 환경변수 값을 입력
npm run dev
```
브라우저에서 `http://localhost:3000`으로 접속합니다.
보안
`.env.local`은 `.gitignore`에 포함되어 있습니다.
Gemini API 키는 서버 환경변수로만 사용합니다.
이미 GitHub에 올라간 실제 키는 파일을 삭제해도 노출된 것으로 간주해야 합니다. Gemini API 키를 폐기하고 새 키를 발급한 뒤 Vercel 환경변수도 교체하세요.
