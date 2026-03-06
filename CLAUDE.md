# Fit Check — 틱톡 크리에이터 조회 툴

틱톡 마케터용. 틱톡 URL을 붙여넣으면 크리에이터 프로필을 조회하고, 필터링/선택 후 CSV로 내보내기.

---

## 기술 스택

| 레이어 | 기술 |
|---|---|
| **Framework** | Next.js 16 (App Router) + TypeScript |
| **UI** | React 19 + Tailwind CSS v4 |
| **틱톡 데이터** | TikTok HTML 직접 스크래핑 + `yt-dlp` (최근 영상 썸네일) |
| **CSV** | PapaParse |
| **DB** | MySQL (mysql2) — 미구현 |

### 시스템 의존성

- **yt-dlp**: 호스트에 설치 필요 (`brew install yt-dlp`). 최근 영상 썸네일 조회에 사용.
- **MySQL**: `.env.local`에 설정되어 있으나 아직 연결 코드 없음.

---

## 프로젝트 구조

```
fit-check/
├── app/
│   ├── page.tsx                    # 메인 페이지 (클라이언트 컴포넌트)
│   ├── layout.tsx                  # 루트 레이아웃 (Geist 폰트, lang=ko)
│   ├── globals.css
│   └── api/
│       ├── tiktok/lookup/route.ts  # POST: SSE 스트리밍으로 프로필 조회
│       └── export/route.ts         # POST: CSV 다운로드
├── components/
│   ├── UrlInput.tsx                # URL textarea + 조회/초기화 버튼
│   ├── FilterBar.tsx               # 팔로워 min/max + 비활동일수 필터
│   ├── CreatorList.tsx             # 카드 리스트 + 숨김 카운트 표시
│   └── CreatorCard.tsx             # 프사/아이디/팔로워/썸네일 카드
├── lib/
│   ├── tiktok.ts                   # TikTok 스크래핑 + yt-dlp 호출
│   └── export.ts                   # CSV 생성 (PapaParse)
└── .env.local                      # MySQL 설정 (미사용)
```

---

## 구현 현황

### 완료

- **크리에이터 조회**: URL 붙여넣기 → SSE 스트리밍으로 실시간 프로필 조회
  - TikTok HTML에서 `__UNIVERSAL_DATA_FOR_REHYDRATION__` 파싱 (프로필 정보)
  - `yt-dlp --flat-playlist`로 최근 영상 10개 썸네일 + 게시일 조회
- **필터링** (클라이언트): 팔로워 수 범위, N일간 비활동 크리에이터 숨김
- **선택 + CSV 내보내기**: 체크박스 선택 → CSV 다운로드 (현재 URL만 포함)
- **실시간 로그**: 조회 진행 상황을 터미널 스타일로 표시

### 미구현

- **스킵 크리에이터 기능**: DB 연동, API (`/api/skipped`), UI 토글 전부 없음
- **DB 연결** (`lib/db.ts`): mysql2 설치됨, 코드 없음
- **DB 스키마** (`database/schema.sql`): 미생성
- **CSV 내보내기 확장**: 현재 URL만 내보냄. 닉네임/팔로워 등 추가 필요
- **캠페인별 관리**: 향후 계획

---

## API

| 엔드포인트 | 상태 | 설명 |
|---|---|---|
| `POST /api/tiktok/lookup` | ✅ | URL 배열 → SSE 스트리밍 (프로필+썸네일) |
| `POST /api/export` | ✅ | 선택한 크리에이터 CSV 다운로드 |
| `GET /api/skipped` | ❌ | 스킵 목록 조회 |
| `POST /api/skipped` | ❌ | 스킵 처리 |
| `DELETE /api/skipped/[username]` | ❌ | 스킵 해제 |

---

## 동작 흐름

1. textarea에 틱톡 URL 여러 개 붙여넣기
2. "조회하기" → SSE로 각 크리에이터 실시간 조회
3. 결과 카드 표시 (프사, @아이디, 닉네임, 팔로워, 최근게시일, 썸네일 10개)
4. 필터 적용 (팔로워 범위, 비활동일수)
5. 체크박스로 선택 → "내보내기" CSV 다운로드

---

## 핵심 화면 (단일 페이지)

```
┌──────────────────────────────────────────────────────┐
│  필터바                                                │
│  [팔로워: [] ~ []] [최근활동: []일 이상 비활동 제외]        │
│  [☐ 스킵한 크리에이터 숨기기] ← 미구현                    │
├──────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────┐           │
│  │ 틱톡 URL 붙여넣기 (textarea)            │           │
│  │ https://tiktok.com/@user1              │           │
│  │ https://tiktok.com/@user2              │           │
│  └────────────────────────────────────────┘           │
│  [조회하기] [초기화]                                     │
├──────────────────────────────────────────────────────┤
│  ☑ [프사] @user1 | 닉네임1 | 12.3K 팔로워 | 최근 2일전   │
│     [썸1][썸2][썸3]...[썸10]                            │
│                                                      │
│  ☐ [프사] @user2 | 닉네임2 | 5.1K 팔로워 | 최근 15일전   │
│     [썸1][썸2][썸3]...[썸10]                            │
│                                                      │
│  (숨겨짐: 팔로워 부족 2명, 활동없음 1명)                   │
├──────────────────────────────────────────────────────┤
│                              [X / Y명 선택] (플로팅)    │
│  [선택한 N명 내보내기 (CSV)]                              │
└──────────────────────────────────────────────────────┘
```

---

## next.config.ts 참고

- `remotePatterns`: `*.tiktokcdn.com`, `*.tiktokcdn-us.com` 이미지 허용
