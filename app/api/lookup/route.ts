import { NextRequest } from "next/server";
import { extractUsernames, fetchSingleProfile } from "@/lib/tiktok";
import { extractYoutubeHandles, fetchSingleYoutubeProfile } from "@/lib/youtube";
import { ProgressEvent } from "@/lib/tiktok";

function classifyUrls(urls: string[]): { tiktok: string[]; youtube: string[] } {
  const tiktok: string[] = [];
  const youtube: string[] = [];

  for (const url of urls) {
    const trimmed = url.trim();
    if (!trimmed) continue;

    if (trimmed.includes("youtube.com") || trimmed.includes("youtu.be")) {
      youtube.push(trimmed);
    } else {
      // 기본값은 틱톡 (tiktok.com URL 또는 @username)
      tiktok.push(trimmed);
    }
  }

  return { tiktok, youtube };
}

export async function POST(req: NextRequest) {
  const { urls } = (await req.json()) as { urls: string[] };

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return new Response(JSON.stringify({ error: "urls 배열이 필요합니다" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { tiktok, youtube } = classifyUrls(urls);
  const tiktokUsernames = extractUsernames(tiktok);
  const youtubeHandles = extractYoutubeHandles(youtube);
  const totalCount = tiktokUsernames.length + youtubeHandles.length;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: ProgressEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      send({ type: "status", step: `${totalCount}명 조회 시작 (틱톡 ${tiktokUsernames.length} + 유튜브 ${youtubeHandles.length})` });

      const TIKTOK_CONCURRENCY = 1;
      const YOUTUBE_CONCURRENCY = 3;
      let completed = 0;

      // 틱톡: 1명씩 순차 처리 + 요청 간 3~5초 대기 (차단 방지)
      for (let i = 0; i < tiktokUsernames.length; i += TIKTOK_CONCURRENCY) {
        if (i > 0) {
          const gap = 3000 + Math.random() * 2000;
          send({ type: "status", step: `틱톡 차단 방지 대기 (${Math.round(gap / 1000)}초)...` });
          await new Promise((r) => setTimeout(r, gap));
        }
        const batch = tiktokUsernames.slice(i, i + TIKTOK_CONCURRENCY);
        const results = await Promise.all(
          batch.map((handle) => fetchSingleProfile(handle, send))
        );
        for (let j = 0; j < batch.length; j++) {
          completed++;
          const profile = results[j];
          if (profile) {
            send({ type: "profile", username: batch[j], profile, total: totalCount, completed });
          } else {
            send({ type: "error", username: batch[j], step: "조회 실패 (틱톡)", total: totalCount, completed });
          }
        }
      }

      // 유튜브: 3명씩 병렬 처리 (차단 리스크 낮음)
      for (let i = 0; i < youtubeHandles.length; i += YOUTUBE_CONCURRENCY) {
        const batch = youtubeHandles.slice(i, i + YOUTUBE_CONCURRENCY);
        const results = await Promise.all(
          batch.map((handle) => fetchSingleYoutubeProfile(handle, send))
        );
        for (let j = 0; j < batch.length; j++) {
          completed++;
          const profile = results[j];
          if (profile) {
            send({ type: "profile", username: batch[j], profile, total: totalCount, completed });
          } else {
            send({ type: "error", username: batch[j], step: "조회 실패 (유튜브)", total: totalCount, completed });
          }
        }
      }

      send({ type: "done", total: totalCount, completed });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
