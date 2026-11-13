# Instagram 자동 게시 설정 (하늘빛창호)

## 1. Supabase SQL 실행
Supabase 프로젝트의 SQL Editor에서 `supabase/social-publishing.sql` 전체를 한 번 실행합니다.

## 2. Meta 개발자 앱 준비
1. https://developers.facebook.com/apps 에서 개발자 앱을 만듭니다.
2. Instagram API의 **Instagram Login** 설정을 추가합니다.
3. Instagram 로그인 권한에 다음 두 권한을 추가합니다.
   - `instagram_business_basic`
   - `instagram_business_content_publish`
4. OAuth Redirect URI를 아래 주소와 정확히 일치시킵니다.
   - `https://hanulbit-studio.vercel.app/api/instagram/callback`
5. 개발 단계에서는 앱 역할에 등록된 계정으로 먼저 테스트합니다. 다른 사람의 계정까지 연결해 서비스하려면 Meta의 Advanced Access/App Review 등 추가 승인이 필요할 수 있습니다.

## 3. Vercel 환경변수
Vercel → 프로젝트 → Settings → Environment Variables에 아래 값을 등록합니다.

- `NEXT_PUBLIC_APP_URL` = `https://hanulbit-studio.vercel.app`
- `META_INSTAGRAM_APP_ID` = Meta 앱의 App ID
- `META_INSTAGRAM_APP_SECRET` = Meta 앱의 App Secret
- `META_INSTAGRAM_REDIRECT_URI` = `https://hanulbit-studio.vercel.app/api/instagram/callback`
- `SUPABASE_SERVICE_ROLE_KEY` = Supabase의 service_role 키 (절대 브라우저 코드나 GitHub에 넣지 마세요)
- `SOCIAL_TOKEN_ENCRYPTION_KEY` = 32바이트 암호화 키의 Base64 또는 64자리 16진수
- `META_GRAPH_VERSION` = `v27.0`

암호화 키는 로컬 터미널에서 다음 명령으로 만들 수 있습니다.
```bash
openssl rand -base64 32
```
생성한 값을 Vercel 환경변수에만 넣고 GitHub에 커밋하지 마세요.

## 4. 재배포 및 연결 테스트
1. 환경변수를 저장한 뒤 Vercel에서 최신 배포를 다시 실행합니다.
2. `https://hanulbit-studio.vercel.app/`에 관리자 계정으로 로그인합니다.
3. 화면 상단의 **인스타그램 계정 연결**을 누르고 `@hanulbitwindow` 비즈니스 계정으로 승인합니다.
4. 시공 사진을 새로 업로드해 콘텐츠를 생성합니다. 업로드 사진은 게시 호환성을 위해 JPG로 변환됩니다.
5. 인스타그램 탭에서 캡션/해시태그를 확인하고 **초안 저장** 또는 **검토 완료 · 승인**을 누릅니다.
6. 보관함에 승인된 콘텐츠가 저장된 것을 확인한 다음, 해당 콘텐츠를 열고 인스타그램 탭에서 **승인 콘텐츠 인스타그램 게시**를 누릅니다.

## 현재 1차 게시 범위
- 피드 단일 사진 게시 (첫 번째 JPG 사진만 게시)
- 캡션 + 해시태그 게시
- 승인된 콘텐츠만 게시
- 동일한 콘텐츠의 중복 게시 차단
- 게시 성공 시 게시물 ID 및 가능한 경우 permalink 반환

릴스 영상 게시, 여러 장 사진 캐러셀, 게시 예약은 별도 개발 항목입니다.
