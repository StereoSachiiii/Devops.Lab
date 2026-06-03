import { Trophy } from "lucide-react";

export default function LeaderboardPage() {
  return (
    <div className="flex flex-col gap-8 py-6">
      <div className="flex flex-col gap-2 border border-neutral-200 bg-neutral-50/50 rounded-lg p-8 text-center shadow-sm">
        <div className="flex justify-center mb-2">
          <Trophy size={32} className="text-gray-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Global Leaderboard</h1>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          See how you stack up against the best DevOps engineers in the world. Solve challenges to earn XP and climb the ranks.
        </p>
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Coming Soon in Beta 1.1</p>
        </div>
      </div>
    </div>
  );
}
