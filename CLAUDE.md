# Fit Check — 크리에이터 조회 툴

마케터용. 틱톡/유튜브 URL을 붙여넣으면 크리에이터 프로필을 조회하고, 필터링/선택 후 CSV로 내보내기.

---

## 기술 스택

| 레이어 | 기술 |
|---|---|
| **Framework** | Next.js 16 (App Router) + TypeScript |
| **UI** | React 19 + Tailwind CSS v4 |
| **데이터 수집** | TikTok/YouTube HTML 스크래핑 + `yt-dlp` (영상 썸네일/날짜) |
| **CSV** | PapaParse |
| **DB** | MySQL (mysql2) — 미구현 |

### 시스템 의존성

- **yt-dlp**: 호스트에 설치 필요 (`brew install yt-dlp`)
- **MySQL**: `.env.local`에 설정되어 있으나 아직 연결 코드 없음

---

## 프로젝트 구조

```
fit-check/
├── app/
│   ├── page.tsx                      # 메인 페이지 (클라이언트 컴포넌트)
│   ├── layout.tsx                    # 루트 레이아웃 (Geist 폰트, lang=ko)
│   ├── globals.css
│   └── api/
│       ├── lookup/route.ts           # POST: 통합 SSE 스트리밍 (틱톡+유튜브 자동 분류)
│       ├── tiktok/lookup/route.ts    # POST: 틱톡 전용 SSE 스트리밍
│       ├── youtube/lookup/route.ts   # POST: 유튜브 전용 SSE 스트리밍
│       └── export/route.ts           # POST: CSV 다운로드
├── components/
│   ├── UrlInput.tsx                  # URL textarea + 조회/초기화
│   ├── FilterBar.tsx                 # 팔로워/비활동/영상수 필터
│   ├── CreatorList.tsx               # 카드 리스트 + 숨김 카운트
│   └── CreatorCard.tsx               # 프사/아이디/팔로워/썸네일 카드
├── lib/
│   ├── tiktok.ts                     # TikTok 스크래핑 + yt-dlp
│   ├── youtube.ts                    # YouTube 스크래핑 + yt-dlp (쇼츠)
│   └── export.ts                     # CSV 생성 (PapaParse)
└── .env.local                        # MySQL 설정 (미사용)
```

---

## 구현 현황

### 완료

- **틱톡 크리에이터 조회**: HTML 스크래핑 + `yt-dlp` 최근 영상 10개
  - 1명씩 순차 처리 + 요청 간 3~5초 대기 (차단 방지)
  - 재시도 최대 2회 (3~6초 대기), User-Agent 5종 로테이션
- **유튜브 크리에이터 조회**: HTML 스크래핑 + `yt-dlp` **쇼츠** 10개
  - 3명 병렬 처리, 구독자 수 파싱 실패 시 yt-dlp 폴백
- **통합 조회**: 틱톡/유튜브 URL 혼합 입력 → 자동 분류 후 조회
- **필터링**: 팔로워 N명 이하 / 비활동 N일 이상 / 영상 10개 미만 제외
- **CSV 내보내기**: 선택한 크리에이터 다운로드 (닉네임, 아이디, 고유주소)
- **실패 URL 팝업**: 실패한 URL 표시 + 전체 복사 버튼
- **UX**: 실시간 로그, 스피너, 플로팅 진행/선택 배지, 스크롤 ▲ 버튼

### 미구현

- **스킵 크리에이터 기능**: DB 연동, API (`/api/skipped`), UI 전부 없음
- **DB 연결/스키마**: mysql2 설치됨, 코드 없음
- **캠페인별 관리**: 향후 계획

### 검토 중 (다음 작업)

- **조회 결과 공유 캐시 (MySQL)**
  - 목적: 같은 사무실(동일 IP)에서 여러 마케터가 동시에 쓸 때 TikTok 요청 횟수 줄이기
  - 방식: 조회 결과를 MySQL에 저장, 24시간 이내 동일 크리에이터 재조회 시 캐시 반환
  - 필요 작업:
    1. `lib/db.ts` — MySQL 연결 풀 생성
    2. `database/schema.sql` — `creator_cache` 테이블 (username, platform, profile_data JSON, created_at)
    3. 조회 로직 수정 — 스크래핑 전 캐시 조회, 히트 시 바로 반환, 미스 시 스크래핑 후 저장
  - 선결 조건: 사무실 공용 MySQL 서버 접속 정보 확인 필요
- **TikTok Creator Marketplace API 전환**
  - 목적: 스크래핑 차단 근본 해결
  - 현황: 틱톡 코리아 담당자에게 API 액세스 문의 예정
  - 전환 시: `lib/tiktok.ts`의 스크래핑 로직을 API 호출로 교체

---

## API

| 엔드포인트 | 상태 | 설명 |
|---|---|---|
| `POST /api/lookup` | ✅ | URL 배열 → 틱톡/유튜브 자동 분류 후 SSE 스트리밍 |
| `POST /api/tiktok/lookup` | ✅ | 틱톡 전용 SSE 스트리밍 |
| `POST /api/youtube/lookup` | ✅ | 유튜브 전용 SSE 스트리밍 |
| `POST /api/export` | ✅ | 선택한 크리에이터 CSV 다운로드 (닉네임/아이디/고유주소) |
| `GET /api/skipped` | ❌ | 스킵 목록 조회 |
| `POST /api/skipped` | ❌ | 스킵 처리 |
| `DELETE /api/skipped/[username]` | ❌ | 스킵 해제 |

---

## next.config.ts 참고

- `remotePatterns`: `*.tiktokcdn.com`, `*.tiktokcdn-us.com`, `yt3.googleusercontent.com`, `i.ytimg.com` 이미지 허용
