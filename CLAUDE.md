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

- **yt-dlp**: 호스트에 설치 필요 (`brew install yt-dlp`). 틱톡/유튜브 최근 영상 썸네일 조회에 사용.
- **MySQL**: `.env.local`에 설정되어 있으나 아직 연결 코드 없음.

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
│   ├── UrlInput.tsx                  # URL textarea + 조회/초기화 + 쇼츠 안내문구
│   ├── FilterBar.tsx                 # 팔로워/비활동/영상수 필터 + 적용/초기화
│   ├── CreatorList.tsx               # 카드 리스트 + 숨김 카운트 표시
│   └── CreatorCard.tsx               # 프사(80px)/아이디/팔로워/썸네일(120×160px) 카드
├── lib/
│   ├── tiktok.ts                     # TikTok 스크래핑 + yt-dlp 호출
│   ├── youtube.ts                    # YouTube 스크래핑 + yt-dlp (쇼츠) 호출
│   └── export.ts                     # CSV 생성 (PapaParse)
├── docs/
│   └── tiktok-data-strategy.md       # 데이터 수집 전략 검토 문서
└── .env.local                        # MySQL 설정 (미사용)
```

---

## 구현 현황

### 완료

- **틱톡 크리에이터 조회**: URL 붙여넣기 → SSE 스트리밍으로 실시간 프로필 조회
  - TikTok HTML에서 `__UNIVERSAL_DATA_FOR_REHYDRATION__` 파싱 (프로필 정보)
  - `yt-dlp --flat-playlist`로 최근 영상 10개 썸네일 + 게시일 조회
  - 실패 시 최대 2회 재시도 (1~3초 랜덤 대기)
  - User-Agent 5종 랜덤 로테이션
  - 3명씩 병렬 처리
- **유튜브 크리에이터 조회**: 틱톡과 동일 구조, **쇼츠 기준**
  - YouTube HTML에서 프로필 정보 파싱:
    - `og:title` (닉네임, HTML 엔티티 디코딩: `&quot;` → `"` 등)
    - `externalId` (채널 ID — `channelId`보다 정확)
    - `vanityChannelUrl` / `canonicalBaseUrl` (핸들, 한글 퍼센트 인코딩 디코딩)
    - `subscriberCountText.accessibility.accessibilityData.label` (구독자 수)
  - 구독자 수 HTML 파싱 실패 시 `yt-dlp` 폴백 (`channel_follower_count`)
  - `yt-dlp --flat-playlist`로 **쇼츠** 10개 썸네일 조회 (`/shorts` URL)
  - 최신 쇼츠 1개는 전체 메타데이터 추가 조회 (업로드 날짜 확인)
  - 동일한 재시도/병렬 처리 적용
- **통합 조회**: 하나의 textarea에 틱톡/유튜브 URL 혼합 입력 → URL 자동 분류 후 조회
- **필터링** (클라이언트, 적용 버튼 방식):
  - 팔로워 N명 이하 제외
  - N일 이상 비활동 제외
  - 영상 10개 미만 제외 (체크박스, 즉시 적용)
  - 적용 버튼: 입력값 변경 시 표시, Enter로도 적용 가능
  - 초기화: 모든 필터 리셋
- **선택 + CSV 내보내기**: 체크박스 선택 → CSV 다운로드 (닉네임, 아이디, 고유주소)
- **실시간 로그**: 조회 진행 상황을 터미널 스타일로 표시
- **실패 URL 팝업**: 조회 실패한 URL을 팝업으로 표시, 복사 가능
- **조회 시 리셋**: 새 조회 시 이전 결과 + 선택 초기화
- **UX 개선**:
  - 조회 중 스피너 + "열심히 조회 중이에요..." 표시
  - 우측 하단 플로팅: 조회 중 `n / 총 N명 조회 중` ↔ 완료 후 `n / N명 선택`
  - 스크롤 ▲ 버튼 (300px 이상 스크롤 시 표시)
  - 유튜브 쇼츠 안내 문구 ("유튜브는 쇼츠 영상 기준으로 조회됩니다")

### 미구현

- **스킵 크리에이터 기능**: DB 연동, API (`/api/skipped`), UI 토글 전부 없음
- **DB 연결** (`lib/db.ts`): mysql2 설치됨, 코드 없음
- **DB 스키마** (`database/schema.sql`): 미생성
- **캠페인별 관리**: 향후 계획

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

## 동작 흐름

1. textarea에 틱톡/유튜브 URL 여러 개 붙여넣기 (혼합 가능)
2. "조회하기" → URL 자동 분류 → SSE로 각 크리에이터 실시간 조회 (3명 병렬)
3. 결과 카드 실시간 표시 (프사, @아이디, 닉네임, 팔로워/구독자, 최근게시일, 썸네일 10개)
4. 조회 중: 하단 스피너 + 플로팅 배지에 진행 상황 표시
5. 실패한 URL은 팝업으로 표시 (복사 가능)
6. 필터 적용 (팔로워 이하 제외, 비활동일수 제외, 영상 10개 미만 제외)
7. 체크박스로 선택 → "내보내기" CSV 다운로드

---

## 데이터 수집 방식

현재 직접 스크래핑 방식 사용. 상세 전략 검토는 `docs/tiktok-data-strategy.md` 참고.

| 항목 | 틱톡 | 유튜브 |
|---|---|---|
| 프로필 | HTML 스크래핑 (`__UNIVERSAL_DATA_FOR_REHYDRATION__`) | HTML 스크래핑 (`externalId`, `og:title`, `subscriberCountText`) |
| 영상 썸네일 | `yt-dlp --flat-playlist` (최근 10개) | `yt-dlp --flat-playlist` (**쇼츠** 최근 10개) |
| 최근 게시일 | flat-playlist의 timestamp | 최신 쇼츠 1개 전체 메타데이터 조회 (`upload_date`) |
| 구독자/팔로워 | HTML 파싱 | HTML 파싱 + yt-dlp 폴백 (`channel_follower_count`) |
| 핸들 인코딩 | — | 한글 퍼센트 인코딩 `decodeURIComponent` 처리 |
| 닉네임 인코딩 | — | HTML 엔티티 디코딩 (`&quot;` → `"`) |
| 재시도 | 최대 2회 (1~3초 대기) | 최대 2회 (1~3초 대기) |
| 차단 리스크 | 있음 (동일 IP 반복 요청) | 낮음 (YouTube는 관대함) |

---

## 핵심 화면 (단일 페이지)

```
┌──────────────────────────────────────────────────────┐
│  ┌────────────────────────────────────────┐           │
│  │ 틱톡/유튜브 URL 붙여넣기 (textarea)      │           │
│  │ https://tiktok.com/@user1              │           │
│  │ https://youtube.com/@channel1          │           │
│  └────────────────────────────────────────┘           │
│  유튜브는 쇼츠 영상 기준으로 조회됩니다                     │
│  [조회하기] [초기화]                                     │
├──────────────────────────────────────────────────────┤
│  필터바                                                │
│  팔로워 [  ] 이하 제외    비활동 [  ]일 이상 제외  [적용]  │
│  ☐ 영상 10개 이하 제외                    필터 초기화    │
├──────────────────────────────────────────────────────┤
│  ☑ [프사] @user1 | 닉네임1 | 12.3K 팔로워 | 최근 2일전   │
│     [썸1][썸2][썸3]...[썸10]                            │
│                                                      │
│  ☐ [프사] @channel1 | 채널명 | 5.1K 구독자 | 최근 15일전  │
│     [썸1][썸2][썸3]...[썸10]                            │
│                                                      │
│  🔄 열심히 조회 중이에요...  ← 로딩 중일 때              │
│  (숨겨짐: 팔로워 부족 2명, 활동없음 1명)                   │
├──────────────────────────────────────────────────────┤
│  [선택한 N명 내보내기 (CSV)]                              │
│                         [▲]                           │
│                  [n / 총 N명 조회 중] (플로팅, 로딩 중)   │
│                  [n / N명 선택] (플로팅, 완료 후)         │
│                                                      │
│  [실패 URL 팝업] ← 실패 시 자동 표시, 복사 가능            │
└──────────────────────────────────────────────────────┘
```

---

## next.config.ts 참고

- `remotePatterns`: `*.tiktokcdn.com`, `*.tiktokcdn-us.com`, `yt3.googleusercontent.com`, `i.ytimg.com` 이미지 허용
