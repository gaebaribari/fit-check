import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface TikTokVideo {
  id: string;
  cover: string;
  title: string;
  createTime: number;
}

export interface TikTokProfile {
  username: string;
  nickname: string;
  avatar: string;
  followerCount: number;
  url: string;
  uniqueUrl: string;
  recentVideos: TikTokVideo[];
  lastPostDate: string | null;
}

export interface ProgressEvent {
  type: "status" | "profile" | "done" | "error";
  username?: string;
  step?: string;
  profile?: TikTokProfile;
  total?: number;
  completed?: number;
}

function extractUsername(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.startsWith("@")) return trimmed.slice(1);
  const match = trimmed.match(/tiktok\.com\/@([a-zA-Z0-9_.]+)/);
  return match ? match[1] : null;
}

interface YtDlpVideoJson {
  id: string;
  title?: string;
  thumbnail?: string;
  timestamp?: number;
  uploader?: string;
  uploader_id?: string;
  thumbnails?: { id?: string; url: string }[];
}

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

async function fetchProfileInfo(username: string) {
  const url = `https://www.tiktok.com/@${username}`;
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

  const scriptMatch = html.match(
    new RegExp('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\\s\\S]*?)</script>')
  );
  if (!scriptMatch) return null;

  const data = JSON.parse(scriptMatch[1]);
  const userInfo = data?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo;
  if (!userInfo) return null;

  const user = userInfo.user;
  const stats = userInfo.stats;

  return {
    username: user.uniqueId as string,
    nickname: user.nickname as string,
    avatar: (user.avatarLarger || user.avatarMedium || user.avatarThumb || "") as string,
    followerCount: (stats.followerCount || 0) as number,
    userId: (user.id || "") as string,
  };
}

async function fetchVideosWithYtDlp(username: string): Promise<TikTokVideo[]> {
  try {
    const { stdout } = await execAsync(
      `yt-dlp --flat-playlist --dump-json "https://www.tiktok.com/@${username}" --playlist-items 1:10 2>/dev/null`,
      { encoding: "utf-8", timeout: 20000 }
    );

    const lines = stdout.trim().split("\n").filter(Boolean);
    return lines.map((line) => {
      const d: YtDlpVideoJson = JSON.parse(line);
      // thumbnails 배열에서 originCover 우선, 없으면 cover
      const originCover = d.thumbnails?.find((t) => t.id === "originCover")?.url;
      const cover = d.thumbnails?.find((t) => t.id === "cover")?.url;
      return {
        id: d.id,
        cover: originCover || cover || d.thumbnail || "",
        title: d.title || "",
        createTime: d.timestamp || 0,
      };
    });
  } catch {
    return [];
  }
}

export function extractUsernames(inputs: string[]): string[] {
  const usernames = inputs.map(extractUsername).filter(Boolean) as string[];
  return [...new Set(usernames)];
}

const MAX_RETRIES = 2;

export async function fetchSingleProfile(
  username: string,
  onProgress: (event: ProgressEvent) => void
): Promise<TikTokProfile | null> {
  // 1) 프로필 정보 (재시도 포함)
  onProgress({ type: "status", username, step: "프로필 조회 중..." });
  const t1 = Date.now();

  let profile = await fetchProfileInfo(username).catch(() => null);

  for (let attempt = 1; !profile && attempt <= MAX_RETRIES; attempt++) {
    const waitMs = 1000 + Math.random() * 2000;
    onProgress({ type: "status", username, step: `프로필 재시도 ${attempt}/${MAX_RETRIES} (${Math.round(waitMs)}ms 대기)...` });
    await delay(waitMs);
    profile = await fetchProfileInfo(username).catch(() => null);
  }

  const profileMs = Date.now() - t1;

  if (!profile) {
    onProgress({ type: "status", username, step: `프로필 실패 (${profileMs}ms, ${MAX_RETRIES}회 재시도 후)` });
    return null;
  }
  onProgress({ type: "status", username, step: `프로필 완료 (${profileMs}ms), 영상 조회 중...` });

  // 2) 최근 영상
  const t2 = Date.now();
  const recentVideos = await fetchVideosWithYtDlp(username);
  const videoMs = Date.now() - t2;

  onProgress({
    type: "status",
    username,
    step: `완료 — 프로필 ${profileMs}ms + 영상 ${recentVideos.length}개 ${videoMs}ms`,
  });

  const lastPostDate =
    recentVideos.length > 0 && recentVideos[0].createTime > 0
      ? new Date(recentVideos[0].createTime * 1000).toISOString()
      : null;

  return {
    ...profile,
    url: `https://www.tiktok.com/@${profile.username}`,
    uniqueUrl: profile.userId
      ? `https://www.tiktok.com/@${profile.userId}`
      : `https://www.tiktok.com/@${profile.username}`,
    recentVideos,
    lastPostDate,
  };
}
