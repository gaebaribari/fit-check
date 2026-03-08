import { NextRequest } from "next/server";
import { extractYoutubeHandles, fetchSingleYoutubeProfile } from "@/lib/youtube";
import { ProgressEvent } from "@/lib/tiktok";

export async function POST(req: NextRequest) {
  const { urls } = (await req.json()) as { urls: string[] };

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return new Response(JSON.stringify({ error: "urls 배열이 필요합니다" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const handles = extractYoutubeHandles(urls);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: ProgressEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      send({ type: "status", step: `${handles.length}명 조회 시작` });

      const CONCURRENCY = 3;
      let completed = 0;

      for (let i = 0; i < handles.length; i += CONCURRENCY) {
        const batch = handles.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map((handle) => fetchSingleYoutubeProfile(handle, send))
        );

        for (let j = 0; j < batch.length; j++) {
          completed++;
          const profile = results[j];
          if (profile) {
            send({ type: "profile", username: batch[j], profile, total: handles.length, completed });
          } else {
            send({ type: "error", username: batch[j], step: "조회 실패", total: handles.length, completed });
          }
        }
      }

      send({ type: "done", total: handles.length, completed });
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
