"use client";

import { useState, useCallback, useMemo } from "react";
import { TikTokProfile } from "@/lib/tiktok";
import FilterBar from "@/components/FilterBar";
import UrlInput from "@/components/UrlInput";
import CreatorList from "@/components/CreatorList";

export default function Home() {
  // URL 입력
  const [urlText, setUrlText] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressLog, setProgressLog] = useState<string[]>([]);

  // 조회 결과 (전체)
  const [allProfiles, setAllProfiles] = useState<TikTokProfile[]>([]);

  // 선택된 크리에이터
  const [selectedUsernames, setSelectedUsernames] = useState<Set<string>>(new Set());

  // 필터
  const [followerMin, setFollowerMin] = useState("");
  const [followerMax, setFollowerMax] = useState("");
  const [inactiveDays, setInactiveDays] = useState("");

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
    try {
      const res = await fetch("/api/tiktok/lookup", {
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
                setAllProfiles((prev) => [...prev, event.profile]);
              } else if (event.type === "error") {
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

      // 팔로워 최대
      if (followerMax && p.followerCount > Number(followerMax)) {
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

      return true;
    });

    return { visibleProfiles: visible, hiddenCount: hidden };
  }, [allProfiles, followerMin, followerMax, inactiveDays]);

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
      <h1 className="text-2xl font-bold mb-6">Fit Check — 틱톡 크리에이터 찾기</h1>

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
            followerMax={followerMax}
            inactiveDays={inactiveDays}
            onFollowerMinChange={setFollowerMin}
            onFollowerMaxChange={setFollowerMax}
            onInactiveDaysChange={setInactiveDays}
          />

          <CreatorList
            profiles={visibleProfiles}
            selectedUsernames={selectedUsernames}
            onToggle={handleToggle}
            hiddenCount={hiddenCount}
          />

          {/* 내보내기 버튼 */}
          <div className="mt-4 flex items-center gap-4">
            <button
              onClick={handleExport}
              disabled={selectedCount === 0}
              className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              선택한 {selectedCount}명 내보내기 (CSV)
            </button>
          </div>
        </div>
      )}
      {/* 선택 카운터 — 하단 우측 고정 */}
      {allProfiles.length > 0 && (
        <div className="fixed bottom-6 right-6 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium">
          {selectedCount} / {visibleProfiles.length}명 선택
        </div>
      )}
    </main>
  );
}
