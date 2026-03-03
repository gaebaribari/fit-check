import { NextRequest, NextResponse } from "next/server";
import { generateCSV } from "@/lib/export";
import { TikTokProfile } from "@/lib/tiktok";

export async function POST(req: NextRequest) {
  try {
    const { profiles } = (await req.json()) as { profiles: TikTokProfile[] };

    if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
      return NextResponse.json({ error: "내보낼 크리에이터가 없습니다" }, { status: 400 });
    }

    const csv = generateCSV(profiles);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="creators_${Date.now()}.csv"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "CSV 생성 실패" }, { status: 500 });
  }
}
