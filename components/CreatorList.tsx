"use client";

import { TikTokProfile } from "@/lib/tiktok";
import CreatorCard from "./CreatorCard";

interface CreatorListProps {
  profiles: TikTokProfile[];
  selectedUsernames: Set<string>;
  onToggle: (username: string) => void;
  hiddenCount: { follower: number; inactive: number };
}

export default function CreatorList({
  profiles,
  selectedUsernames,
  onToggle,
  hiddenCount,
}: CreatorListProps) {
  const totalHidden = hiddenCount.follower + hiddenCount.inactive;

  return (
    <div className="space-y-3">
      {profiles.map((profile) => (
        <CreatorCard
          key={profile.username}
          profile={profile}
          selected={selectedUsernames.has(profile.username)}
          onToggle={() => onToggle(profile.username)}
        />
      ))}

      {totalHidden > 0 && (
        <div className="text-center py-3 text-sm text-gray-400 border-t border-gray-100">
          숨겨짐:
          {hiddenCount.follower > 0 && ` 팔로워 부족 ${hiddenCount.follower}명`}
          {hiddenCount.inactive > 0 && ` 활동없음 ${hiddenCount.inactive}명`}
        </div>
      )}

      {profiles.length === 0 && totalHidden === 0 && (
        <div className="text-center py-8 text-gray-400">
          조회 결과가 없습니다
        </div>
      )}
    </div>
  );
}
