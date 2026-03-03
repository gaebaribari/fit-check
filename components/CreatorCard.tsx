"use client";

import Image from "next/image";
import { TikTokProfile } from "@/lib/tiktok";

interface CreatorCardProps {
  profile: TikTokProfile;
  selected: boolean;
  onToggle: () => void;
}

function formatFollowers(count: number): string {
  if (count >= 10000) return `${(count / 10000).toFixed(1)}만`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

function daysAgo(dateStr: string | null): string {
  if (!dateStr) return "정보없음";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "오늘";
  return `${days}일 전`;
}

export default function CreatorCard({ profile, selected, onToggle }: CreatorCardProps) {
  return (
    <div
      className={`flex gap-4 p-4 rounded-lg border transition-colors cursor-pointer ${
        selected ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"
      }`}
      onClick={onToggle}
    >
      {/* 체크박스 */}
      <div className="flex items-start pt-1">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      </div>

      {/* 프로필 사진 */}
      <div className="flex-shrink-0">
        {profile.avatar ? (
          <Image
            src={profile.avatar}
            alt={profile.nickname}
            width={56}
            height={56}
            className="rounded-full object-cover"
            unoptimized
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xl">
            ?
          </div>
        )}
      </div>

      {/* 정보 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-2">
          <a
            href={profile.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-blue-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            @{profile.username}
          </a>
          <span className="text-gray-600">{profile.nickname}</span>
          <span className="text-sm text-gray-500">
            {formatFollowers(profile.followerCount)} 팔로워
          </span>
          <span className="text-sm text-gray-400">
            최근 {daysAgo(profile.lastPostDate)}
          </span>
        </div>

        {/* 최근 영상 썸네일 */}
        {profile.recentVideos.length > 0 ? (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {profile.recentVideos.map((video) => (
              <div key={video.id} className="flex-shrink-0">
                <Image
                  src={video.cover}
                  alt={video.title}
                  width={80}
                  height={107}
                  className="rounded object-cover"
                  unoptimized
                />
              </div>
            ))}
          </div>
        ) : (
          <a
            href={profile.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-500 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            틱톡에서 영상 보기 →
          </a>
        )}
      </div>
    </div>
  );
}
