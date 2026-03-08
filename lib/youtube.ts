import { exec } from "child_process";
import { promisify } from "util";
import type { TikTokProfile, TikTokVideo, ProgressEvent } from "./tiktok";

const execAsync = promisify(exec);

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractYoutubeHandle(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.startsWith("@")) return trimmed.slice(1);

  const handleMatch = trimmed.match(/youtube\.com\/@([a-zA-Z0-9_.-]+)/);
  if (handleMatch) return handleMatch[1];

  const channelMatch = trimmed.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/);
  if (channelMatch) return channelMatch[1];

  return null;
}

function parseSubscriberCount(text: string): number {
  const cleaned = text.replace(/subscribers?/i, "").trim();
  const match = cleaned.match(/([0-9,.]+)\s*([KMB])?/i);
  if (!match) return 0;

  let num = parseFloat(match[1].replace(/,/g, ""));
  const suffix = (match[2] || "").toUpperCase();
  if (suffix === "K") num *= 1000;
  else if (suffix === "M") num *= 1000000;
  else if (suffix === "B") num *= 1000000000;

  return Math.round(num);
}

async function fetchYoutubeProfileInfo(handle: string) {
  const isChannelId = handle.startsWith("UC");
  const url = isChannelId
    ? `https://www.youtube.com/channel/${handle}`
    : `https://www.youtube.com/@${handle}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": randomUA(),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return null;
  const html = await res.text();

  // meta 태그에서 기본 정보 추출 (HTML 엔티티 디코딩)
  const rawOgTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] || handle;
  const ogTitle = rawOgTitle
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
  const ogImage = html.match(/<meta property="og:url" content="([^"]+)"/)?.[1] || "";

  // 채널 아바타: yt3.googleusercontent.com URL 추출
  const avatarMatch = html.match(/https:\/\/yt3\.googleusercontent\.com\/[a-zA-Z0-9_/=-]+/);
  const avatar = avatarMatch ? avatarMatch[0] : "";

  // 채널 ID 추출 — externalId가 본인 채널의 진짜 ID
  const channelId = html.match(/"externalId":"(UC[a-zA-Z0-9_-]+)"/)?.[1]
    || html.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/)?.[1]
    || "";

  // 실제 핸들 추출 (한글 등 퍼센트 인코딩 디코딩)
  const rawHandle = html.match(/"vanityChannelUrl":"https?:\/\/www\.youtube\.com\/@([^"]+)"/)?.[1]
    || html.match(/"canonicalBaseUrl":"\/@([^"]+)"/)?.[1]
    || handle;
  let actualHandle: string;
  try {
    actualHandle = decodeURIComponent(rawHandle);
  } catch {
    actualHandle = rawHandle;
  }

  // 구독자 수 추출 — accessibilityData.label 패턴 우선
  let subscriberCount = 0;
  const subAccessibility = html.match(/"subscriberCountText":\{"accessibility":\{"accessibilityData":\{"label":"([^"]+)"/);
  if (subAccessibility) {
    subscriberCount = parseSubscriberCount(subAccessibility[1]);
  } else {
    const subSimple = html.match(/"subscriberCountText":\{[^}]*?"simpleText":"([^"]+)"/);
    if (subSimple) {
      subscriberCount = parseSubscriberCount(subSimple[1]);
    }
  }

  // og:url이 있으면 유효한 채널 페이지
  if (!ogImage && !channelId) return null;

  return {
    username: actualHandle,
    nickname: ogTitle,
    avatar,
    followerCount: subscriberCount,
    userId: channelId,
  };
}

interface YtDlpVideoJson {
  id: string;
  title?: string;
  thumbnail?: string;
  timestamp?: number;
  upload_date?: string; // YYYYMMDD
  thumbnails?: { url: string; height?: number }[];
  view_count?: number;
}

async function fetchYoutubeShorts(handle: string): Promise<TikTokVideo[]> {
  const isChannelId = handle.startsWith("UC");
  const url = isChannelId
    ? `https://www.youtube.com/channel/${handle}/shorts`
    : `https://www.youtube.com/@${handle}/shorts`;

  try {
    // 1) flat-playlist로 쇼츠 목록 (썸네일 + 제목)
    const { stdout } = await execAsync(
      `yt-dlp --flat-playlist --dump-json "${url}" --playlist-items 1:10 2>/dev/null`,
      { encoding: "utf-8", timeout: 30000 }
    );

    const lines = stdout.trim().split("\n").filter(Boolean);
    const videos = lines.map((line) => {
      const d: YtDlpVideoJson = JSON.parse(line);
      // flat-playlist에서는 thumbnail 대신 thumbnails 배열 사용
      const bestThumb = d.thumbnails?.sort((a, b) => (b.height || 0) - (a.height || 0))[0]?.url;
      const cover = d.thumbnail
        || bestThumb
        || `https://i.ytimg.com/vi/${d.id}/hqdefault.jpg`;
      return {
        id: d.id,
        cover,
        title: d.title || "",
        createTime: d.timestamp || 0,
      };
    });

    // 2) 최신 쇼츠 1개의 전체 메타데이터 조회 (업로드 날짜 확인)
    if (videos.length > 0 && videos[0].createTime === 0) {
      try {
        const { stdout: metaOut } = await execAsync(
          `yt-dlp --dump-json "https://www.youtube.com/shorts/${videos[0].id}" 2>/dev/null`,
          { encoding: "utf-8", timeout: 20000 }
        );
        const meta: YtDlpVideoJson = JSON.parse(metaOut.trim());
        if (meta.timestamp) {
          videos[0].createTime = meta.timestamp;
        } else if (meta.upload_date) {
          // YYYYMMDD → unix timestamp
          const y = meta.upload_date.slice(0, 4);
          const m = meta.upload_date.slice(4, 6);
          const dd = meta.upload_date.slice(6, 8);
          videos[0].createTime = Math.floor(new Date(`${y}-${m}-${dd}`).getTime() / 1000);
        }
      } catch {
        // 날짜 조회 실패해도 썸네일은 유지
      }
    }

    return videos;
  } catch {
    return [];
  }
}

// yt-dlp로 구독자 수 조회 (HTML 파싱 실패 시 폴백)
async function fetchSubscriberCountViaYtDlp(handle: string): Promise<number> {
  const isChannelId = handle.startsWith("UC");
  const url = isChannelId
    ? `https://www.youtube.com/channel/${handle}/shorts`
    : `https://www.youtube.com/@${handle}/shorts`;

  try {
    const { stdout } = await execAsync(
      `yt-dlp --dump-json --playlist-items 1 "${url}" 2>/dev/null`,
      { encoding: "utf-8", timeout: 30000 }
    );
    const data = JSON.parse(stdout.trim());
    return data.channel_follower_count || 0;
  } catch {
    return 0;
  }
}

export function extractYoutubeHandles(inputs: string[]): string[] {
  const handles = inputs.map(extractYoutubeHandle).filter(Boolean) as string[];
  return [...new Set(handles)];
}

const MAX_RETRIES = 2;

export async function fetchSingleYoutubeProfile(
  handle: string,
  onProgress: (event: ProgressEvent) => void
): Promise<TikTokProfile | null> {
  // 1) 프로필 정보 (재시도 포함)
  onProgress({ type: "status", username: handle, step: "프로필 조회 중..." });
  const t1 = Date.now();

  let profile = await fetchYoutubeProfileInfo(handle).catch(() => null);

  for (let attempt = 1; !profile && attempt <= MAX_RETRIES; attempt++) {
    const waitMs = 1000 + Math.random() * 2000;
    onProgress({ type: "status", username: handle, step: `프로필 재시도 ${attempt}/${MAX_RETRIES} (${Math.round(waitMs)}ms 대기)...` });
    await delay(waitMs);
    profile = await fetchYoutubeProfileInfo(handle).catch(() => null);
  }

  const profileMs = Date.now() - t1;

  if (!profile) {
    onProgress({ type: "status", username: handle, step: `프로필 실패 (${profileMs}ms, ${MAX_RETRIES}회 재시도 후)` });
    return null;
  }
  onProgress({ type: "status", username: handle, step: `프로필 완료 (${profileMs}ms), 영상 조회 중...` });

  // 구독자 수 폴백: HTML 파싱 실패 시 yt-dlp로 재시도
  if (profile.followerCount === 0) {
    onProgress({ type: "status", username: handle, step: "구독자 수 재조회 중 (yt-dlp)..." });
    const ytdlpSubs = await fetchSubscriberCountViaYtDlp(handle);
    if (ytdlpSubs > 0) {
      profile.followerCount = ytdlpSubs;
    }
  }

  // 2) 최근 쇼츠
  const t2 = Date.now();
  const recentVideos = await fetchYoutubeShorts(handle);
  const videoMs = Date.now() - t2;

  onProgress({
    type: "status",
    username: handle,
    step: `완료 — 프로필 ${profileMs}ms + 영상 ${recentVideos.length}개 ${videoMs}ms`,
  });

  const lastPostDate =
    recentVideos.length > 0 && recentVideos[0].createTime > 0
      ? new Date(recentVideos[0].createTime * 1000).toISOString()
      : null;

  return {
    ...profile,
    url: `https://www.youtube.com/@${profile.username}`,
    uniqueUrl: profile.userId
      ? `https://www.youtube.com/channel/${profile.userId}`
      : `https://www.youtube.com/@${profile.username}`,
    recentVideos,
    lastPostDate,
  };
}
