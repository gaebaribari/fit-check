"use client";

interface UrlInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

export default function UrlInput({ value, onChange, onSubmit, loading }: UrlInputProps) {
  return (
    <div className="space-y-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`틱톡/유튜브 URL을 한 줄에 하나씩 붙여넣기\nhttps://www.tiktok.com/@username1\nhttps://www.youtube.com/@channel1\n@username2`}
        rows={6}
        className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
      />
      <p className="text-xs text-gray-400">유튜브는 쇼츠 영상 기준으로 조회됩니다</p>
      <div className="flex gap-2">
        <button
          onClick={onSubmit}
          disabled={loading || !value.trim()}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "조회 중..." : "조회하기"}
        </button>
        {value.trim() && !loading && (
          <button
            onClick={() => onChange("")}
            className="px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
          >
            초기화
          </button>
        )}
      </div>
    </div>
  );
}
