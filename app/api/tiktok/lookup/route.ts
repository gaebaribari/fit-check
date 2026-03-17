import { NextRequest } from "next/server";
import { extractUsernames, fetchSingleProfile, ProgressEvent } from "@/lib/tiktok";

export async function POST(req: NextRequest) {
  const { urls } = (await req.json()) as { urls: string[] };

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return new Response(JSON.stringify({ error: "urls 배열이 필요합니다" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const usernames = extractUsernames(urls);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: ProgressEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      send({ type: "status", step: `${usernames.length}명 조회 시작` });

      let completed = 0;

      // 1명씩 순차 처리 + 요청 간 3~5초 대기 (차단 방지)
      for (let i = 0; i < usernames.length; i++) {
        if (i > 0) {
          const gap = 3000 + Math.random() * 2000;
          send({ type: "status", step: `차단 방지 대기 (${Math.round(gap / 1000)}초)...` });
          await new Promise((r) => setTimeout(r, gap));
        }

        const profile = await fetchSingleProfile(usernames[i], send);
        completed++;

        if (profile) {
          send({ type: "profile", username: usernames[i], profile, total: usernames.length, completed });
        } else {
          send({ type: "error", username: usernames[i], step: "조회 실패", total: usernames.length, completed });
        }
      }

      send({ type: "done", total: usernames.length, completed });
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
