"use client";

interface FilterBarProps {
  followerMin: string;
  followerMax: string;
  inactiveDays: string;
  onFollowerMinChange: (v: string) => void;
  onFollowerMaxChange: (v: string) => void;
  onInactiveDaysChange: (v: string) => void;
}

export default function FilterBar({
  followerMin,
  followerMax,
  inactiveDays,
  onFollowerMinChange,
  onFollowerMaxChange,
  onInactiveDaysChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
      {/* 팔로워 필터 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">팔로워</span>
        <input
          type="number"
          placeholder="최소"
          value={followerMin}
          onChange={(e) => onFollowerMinChange(e.target.value)}
          className="w-24 px-2 py-1.5 text-sm text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-gray-400">~</span>
        <input
          type="number"
          placeholder="최대"
          value={followerMax}
          onChange={(e) => onFollowerMaxChange(e.target.value)}
          className="w-24 px-2 py-1.5 text-sm text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 최근활동 필터 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">최근활동</span>
        <input
          type="number"
          placeholder="일"
          value={inactiveDays}
          onChange={(e) => onInactiveDaysChange(e.target.value)}
          className="w-20 px-2 py-1.5 text-sm text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-500">일 내 게시물 없으면 제외</span>
      </div>

    </div>
  );
}
