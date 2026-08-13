# Find My Basic

선택지가 너무 많아 무엇을 사야 할지 막막한 사용자를 위한 여성 패션 Guided Shopping 서비스입니다. 세 가지 질문에 답하면 상황과 취향에 가까운 기본 아이템 네 개를 추천합니다.

## Local development

```bash
pnpm install
pnpm dev
```

프로덕션 빌드는 `pnpm build`로 확인합니다.

## Toss Payments checkout

결제 요청은 GitHub Pages의 브라우저에서, 주문 생성과 결제 승인은 Supabase Edge Functions에서 처리합니다. 브라우저는 서버가 다시 계산한 주문번호와 금액으로만 토스페이먼츠 SDK를 호출합니다.

공개 클라이언트 키는 환경에 맞게 로컬 `.env.local` 또는 GitHub Repository Variable에 설정합니다.

```dotenv
VITE_TOSS_CLIENT_KEY=test_ck_or_live_ck_from_toss_developer_center
```

시크릿 키는 절대 `VITE_` 변수나 GitHub Pages에 넣지 않습니다. 로컬 함수 테스트용 `supabase/functions/.env.local`은 다음 형식이며 Git에서 제외됩니다.

```dotenv
PAYMENT_ENV=test
TOSS_SECRET_KEY=test_sk_from_toss_developer_center
ALLOWED_ORIGINS=http://localhost:5173,https://yangseonwork-ux.github.io
```

Docker가 실행 중인 로컬 환경에서는 아래 순서로 DB 마이그레이션과 함수를 확인할 수 있습니다.

```bash
pnpm exec supabase start
pnpm exec supabase db reset
pnpm exec supabase functions serve --env-file supabase/functions/.env.local
```

원격 환경을 연결할 때는 마이그레이션 적용, `TOSS_SECRET_KEY` 등록, Edge Function 배포가 별도로 필요합니다. GitHub Pages에는 Repository Variable `VITE_TOSS_CLIENT_KEY`만 전달합니다. `PAYMENT_ENV=test`에는 `test_sk_`, `PAYMENT_ENV=live`에는 `live_sk_` 시크릿 키만 허용하므로 환경과 키가 다르면 승인을 거부합니다.

현재 공개 배포는 결제 연동을 검증하는 테스트 사이트입니다. GitHub Repository Variable `VITE_TOSS_CLIENT_KEY`에는 테스트 상점의 `test_ck_` 키를, Supabase Edge Function Secrets에는 `PAYMENT_ENV=test`와 같은 상점의 `test_sk_` 키를 설정합니다. 배포 워크플로도 테스트 키가 아니면 실패하도록 구성합니다.

실제 운영 상점으로 전환할 때는 토스페이먼츠 계약과 카드사 심사가 완료된 동일 MID의 `live_ck_`/`live_sk_` 키 쌍으로 두 설정을 함께 교체하고, 배포 워크플로의 키 검증을 라이브 모드로 전환해야 합니다. 라이브 결제는 실제 청구가 발생하므로 테스트 주문으로 승인하지 않습니다.

주요 보안 경계는 다음과 같습니다.

- 상품 가격, 배송비, 주문번호는 Edge Function에서 확정합니다.
- `paymentKey`, `orderId`, 결제금액과 회원 또는 비회원 checkout token을 승인 전에 검증합니다.
- 주문별 고정 `Idempotency-Key`와 DB 승인 선점 상태로 중복 승인을 방지합니다.
- 주문·배송지·결제 테이블은 RLS를 활성화하고 브라우저 직접 쓰기 권한을 부여하지 않습니다.

## Google login

로그인은 Supabase Auth와 Google OAuth를 사용합니다. 브라우저에는 Supabase project URL과 publishable key만 포함되며, Google client secret은 Supabase의 비공개 Auth 설정에만 저장합니다.

- Supabase project: `fnqhuivnuwmibrtagcwu`
- Google OAuth callback: `https://fnqhuivnuwmibrtagcwu.supabase.co/auth/v1/callback`
- Production redirect: `https://yangseonwork-ux.github.io/find-my-basic/**`
- Local redirect: `http://localhost:5173/**`

로컬 환경에서는 `.env.development`의 공개 설정을 사용합니다. OAuth provider를 교체할 때는 `.env.example` 형식을 유지하고 비밀키를 `VITE_` 환경변수에 넣지 않습니다.

## Versioning

- `main`: 계속 개선되는 최신 버전
- `releases/v1.0.0`, `releases/v2.0.0`: 공개 시점의 고정 릴리스 브랜치
- `v1.0.0`, `v2.0.0`: CLI 인증 사용 시 릴리스 브랜치 대신 사용할 수 있는 Git 태그
- `/find-my-basic/`: 최신 버전 GitHub Pages
- `/find-my-basic/v1.0.0/`: v1 고정 버전
- `/find-my-basic/versions/`: 배포된 버전 목록

새 버전을 공개할 때 변경 사항을 `main`에 반영한 후 다음과 같이 릴리스 브랜치를 푸시합니다.

```bash
git switch -c releases/v2.0.0
git push origin releases/v2.0.0
git switch main
```

GitHub Actions가 최신 버전과 모든 `releases/v*` 브랜치 또는 `v*` 태그를 각 경로에 자동으로 빌드해 배포합니다. 릴리스 브랜치는 공개 후 수정하지 않습니다.
