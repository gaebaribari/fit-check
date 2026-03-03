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
      for (const username of usernames) {
        const profile = await fetchSingleProfile(username, send);
        completed++;

        if (profile) {
          send({ type: "profile", username, profile, total: usernames.length, completed });
        } else {
          send({ type: "error", username, step: "조회 실패", total: usernames.length, completed });
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
