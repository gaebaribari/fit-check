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

      const CONCURRENCY = 3;
      let completed = 0;

      // 틱톡 + 유튜브를 하나의 작업 큐로 합침
      const tasks: { handle: string; platform: "tiktok" | "youtube" }[] = [
        ...tiktokUsernames.map((h) => ({ handle: h, platform: "tiktok" as const })),
        ...youtubeHandles.map((h) => ({ handle: h, platform: "youtube" as const })),
      ];

      for (let i = 0; i < tasks.length; i += CONCURRENCY) {
        const batch = tasks.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map((task) =>
            task.platform === "tiktok"
              ? fetchSingleProfile(task.handle, send)
              : fetchSingleYoutubeProfile(task.handle, send)
          )
        );

        for (let j = 0; j < batch.length; j++) {
          completed++;
          const profile = results[j];
          if (profile) {
            send({ type: "profile", username: batch[j].handle, profile, total: totalCount, completed });
          } else {
            send({
              type: "error",
              username: batch[j].handle,
              step: `조회 실패 (${batch[j].platform === "tiktok" ? "틱톡" : "유튜브"})`,
              total: totalCount,
              completed,
            });
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
