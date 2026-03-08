"use client";

import { useState, useEffect } from "react";

interface FilterBarProps {
  followerMin: string;
  inactiveDays: string;
  fewVideos: boolean;
  onFollowerMinChange: (v: string) => void;
  onInactiveDaysChange: (v: string) => void;
  onFewVideosChange: (v: boolean) => void;
}

export default function FilterBar({
  followerMin,
  inactiveDays,
  fewVideos,
  onFollowerMinChange,
  onInactiveDaysChange,
  onFewVideosChange,
}: FilterBarProps) {
  const [draftMin, setDraftMin] = useState(followerMin);
  const [draftDays, setDraftDays] = useState(inactiveDays);

  useEffect(() => { setDraftMin(followerMin); }, [followerMin]);
  useEffect(() => { setDraftDays(inactiveDays); }, [inactiveDays]);

  const hasChanges =
    draftMin !== followerMin ||
    draftDays !== inactiveDays;

  const handleApply = () => {
    onFollowerMinChange(draftMin);
    onInactiveDaysChange(draftDays);
  };

  const isApplied = followerMin !== "" || inactiveDays !== "" || fewVideos;

  const handleReset = () => {
    setDraftMin("");
    setDraftDays("");
    onFollowerMinChange("");
    onInactiveDaysChange("");
    onFewVideosChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && hasChanges) {
      handleApply();
    }
  };

  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
      {/* 상단: 입력 필터 + 버튼 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap">팔로워</span>
          <input
            type="number"
            placeholder="명"
            value={draftMin}
            onChange={(e) => setDraftMin(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-24 px-2.5 py-1.5 text-sm text-black border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <span className="text-sm text-gray-500 whitespace-nowrap">이하 제외</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap">비활동</span>
          <input
            type="number"
            placeholder="일"
            value={draftDays}
            onChange={(e) => setDraftDays(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-20 px-2.5 py-1.5 text-sm text-black border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <span className="text-sm text-gray-500 whitespace-nowrap">일 이상 제외</span>
        </div>

        {hasChanges && (
          <button
            onClick={handleApply}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            적용
          </button>
        )}
      </div>

      {/* 하단: 체크박스 + 초기화 */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={fewVideos}
            onChange={(e) => onFewVideosChange(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-600">영상 10개 이하 제외</span>
        </label>

        {isApplied && !hasChanges && (
          <button
            onClick={handleReset}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            필터 초기화
          </button>
        )}
      </div>
    </div>
  );
}
