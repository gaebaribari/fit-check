"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { TikTokProfile } from "@/lib/tiktok";
import FilterBar from "@/components/FilterBar";
import UrlInput from "@/components/UrlInput";
import CreatorList from "@/components/CreatorList";

export default function Home() {
  // URL 입력
  const [urlText, setUrlText] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [totalLookupCount, setTotalLookupCount] = useState(0);

  // 조회 결과 (전체)
  const [allProfiles, setAllProfiles] = useState<TikTokProfile[]>([]);

  // 실패 팝업
  const [failedPopupUrls, setFailedPopupUrls] = useState<string[] | null>(null);

  // 선택된 크리에이터
  const [selectedUsernames, setSelectedUsernames] = useState<Set<string>>(new Set());

  // 필터
  const [followerMin, setFollowerMin] = useState("");
  const [inactiveDays, setInactiveDays] = useState("");
  const [fewVideos, setFewVideos] = useState(false);

  // 스크롤 위치 감지
  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 조회하기 (SSE 스트리밍)
  const handleLookup = useCallback(async () => {
    const urls = urlText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (urls.length === 0) return;

    setLoading(true);
    setAllProfiles([]);
    setSelectedUsernames(new Set());
    setProgressLog([]);
    setTotalLookupCount(urls.length);
    const failedUrls: string[] = [];
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        // SSE 이벤트는 \n\n으로 구분
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          // 각 파트에서 data: 라인들 추출
          const dataLines = part.split("\n").filter((l) => l.startsWith("data: "));
          for (const dataLine of dataLines) {
            const dataStr = dataLine.slice(6).trim(); // "data: " 제거
            if (!dataStr) continue;
            try {
              const event = JSON.parse(dataStr);
              if (event.type === "status") {
                setProgressLog((prev) => {
                  const msg = event.username
                    ? `@${event.username}: ${event.step}`
                    : event.step;
                  const updated = [...prev];
                  const idx = updated.findIndex((l) =>
                    event.username ? l.startsWith(`@${event.username}`) : false
                  );
                  if (idx >= 0) updated[idx] = msg;
                  else updated.push(msg);
                  return updated;
                });
              } else if (event.type === "profile" && event.profile) {
                if (event.total) setTotalLookupCount(event.total);
                setAllProfiles((prev) => [...prev, event.profile]);
              } else if (event.type === "error") {
                if (event.total) setTotalLookupCount(event.total);
                // 실패 step에서 플랫폼 구분
                const isYoutube = event.step?.includes("유튜브");
                const failUrl = isYoutube
                  ? `https://www.youtube.com/@${event.username}`
                  : `https://www.tiktok.com/@${event.username}`;
                failedUrls.push(failUrl);
                setProgressLog((prev) => [
                  ...prev,
                  `@${event.username}: ❌ ${event.step}`,
                ]);
              } else if (event.type === "done") {
                setProgressLog((prev) => [
                  ...prev,
                  `✅ 완료 — ${event.completed}/${event.total}명 조회`,
                ]);
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }
      // 실패한 URL이 있으면 팝업으로 표시
      if (failedUrls.length > 0) {
        setFailedPopupUrls(failedUrls);
      }
      setUrlText("");
    } catch {
      alert("조회 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }, [urlText]);

  // 필터링
  const { visibleProfiles, hiddenCount } = useMemo(() => {
    const hidden = { follower: 0, inactive: 0 };

    const visible = allProfiles.filter((p) => {
      // 팔로워 최소
      if (followerMin && p.followerCount < Number(followerMin)) {
        hidden.follower++;
        return false;
      }

      // 최근활동 필터
      if (inactiveDays && p.lastPostDate) {
        const daysSincePost = Math.floor(
          (Date.now() - new Date(p.lastPostDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSincePost > Number(inactiveDays)) {
          hidden.inactive++;
          return false;
        }
      }
      // 게시물이 아예 없는 계정도 비활성으로 처리
      if (inactiveDays && !p.lastPostDate) {
        hidden.inactive++;
        return false;
      }

      // 영상 10개 미만 제외 (최대 10개만 조회하므로 10개 = 충분)
      if (fewVideos && (p.recentVideos?.length || 0) < 10) {
        hidden.follower++;
        return false;
      }

      return true;
    });

    return { visibleProfiles: visible, hiddenCount: hidden };
  }, [allProfiles, followerMin, inactiveDays, fewVideos]);

  // 선택 토글
  const handleToggle = useCallback((username: string) => {
    setSelectedUsernames((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  }, []);

  // 내보내기 (CSV)
  const handleExport = useCallback(async () => {
    const selected = visibleProfiles.filter((p) => selectedUsernames.has(p.username));
    if (selected.length === 0) {
      alert("내보낼 크리에이터를 선택해주세요");
      return;
    }

    // CSV 다운로드
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profiles: selected }),
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `creators_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [visibleProfiles, selectedUsernames]);

  const selectedCount = visibleProfiles.filter((p) =>
    selectedUsernames.has(p.username)
  ).length;

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Fit Check — 크리에이터 찾기</h1>

      {/* URL 입력 */}
      <UrlInput
        value={urlText}
        onChange={setUrlText}
        onSubmit={handleLookup}
        loading={loading}
      />

      {/* 진행상황 로그 */}
      {progressLog.length > 0 && (
        <div className="mt-4 p-3 bg-gray-900 rounded-lg text-xs font-mono text-green-400 max-h-40 overflow-y-auto">
          {progressLog.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {/* 조회 결과 있을 때만 필터바 + 리스트 표시 */}
      {allProfiles.length > 0 && (
        <div className="mt-6 space-y-4">
          <FilterBar
            followerMin={followerMin}
            inactiveDays={inactiveDays}
            fewVideos={fewVideos}
            onFollowerMinChange={setFollowerMin}
            onInactiveDaysChange={setInactiveDays}
            onFewVideosChange={setFewVideos}
          />

          <CreatorList
            profiles={visibleProfiles}
            selectedUsernames={selectedUsernames}
            onToggle={handleToggle}
            hiddenCount={hiddenCount}
          />

          {/* 로딩 중 표시 */}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-4 text-gray-500">
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm">열심히 조회 중이에요...</span>
            </div>
          )}

          {/* 내보내기 버튼 */}
          {!loading && (
            <div className="mt-4 flex items-center gap-4">
              <button
                onClick={handleExport}
                disabled={selectedCount === 0}
                className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                선택한 {selectedCount}명 내보내기 (CSV)
              </button>
            </div>
          )}
        </div>
      )}
      {/* 우측 하단 플로팅 */}
      {allProfiles.length > 0 && (
        <div className="fixed bottom-6 right-6 flex flex-col items-end gap-2">
          {showScrollTop && (
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="w-10 h-10 bg-white text-gray-700 border border-gray-200 rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors text-lg"
            >
              ▲
            </button>
          )}
          <div className="bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium">
            {loading
              ? `${allProfiles.length} / 총 ${totalLookupCount}명 조회 중`
              : `${selectedCount} / ${visibleProfiles.length}명 선택`}
          </div>
        </div>
      )}
      {/* 실패 URL 팝업 */}
      {failedPopupUrls && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">
              조회 실패 {failedPopupUrls.length}건
            </h3>
            <p className="text-sm text-gray-500 mb-3">
              아래 URL을 복사해서 다시 조회할 수 있습니다.
            </p>
            <textarea
              readOnly
              value={failedPopupUrls.join("\n")}
              className="w-full h-40 p-3 border border-gray-300 rounded-lg text-sm font-mono bg-gray-50 text-black resize-none focus:outline-none"
              onFocus={(e) => e.target.select()}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(failedPopupUrls.join("\n"));
                }}
                className="px-5 py-2 bg-gray-200 text-black rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                전체 복사
              </button>
              <button
                onClick={() => setFailedPopupUrls(null)}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
