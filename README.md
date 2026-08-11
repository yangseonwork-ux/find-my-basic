# Find My Basic

선택지가 너무 많아 무엇을 사야 할지 막막한 사용자를 위한 패션 Guided Shopping 서비스입니다. 세 가지 질문에 답하면 상황과 취향에 가까운 기본 아이템 네 개를 추천합니다.

## Local development

```bash
pnpm install
pnpm dev
```

프로덕션 빌드는 `pnpm build`로 확인합니다.

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
