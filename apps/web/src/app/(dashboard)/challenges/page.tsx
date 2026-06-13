"use client";

import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";
import { ChallengeCard } from "@/components/dashboard/ChallengeCard";

interface Challenge {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  category: string;
  tags: string[];
  xp: number;
  module: { title: string } | null;
}

export default function ChallengesPage() {
  const { data: challenges, error, isLoading } = useSWR<Challenge[]>(
    "/api/challenges",
    () => apiClient.get<Challenge[]>("/api/challenges")
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 border-b border-neutral-800 pb-4">
        <h1 className="text-xl font-bold">Challenges</h1>
        <p className="text-xs">Select a scenario to build your DevOps and infrastructure troubleshooting skills.</p>
      </div>

      {isLoading && <div className="p-4 text-sm">Loading challenges...</div>}
      
      {error && (
        <div className="border border-neutral-800 p-4 text-sm">
          Failed to load challenges. Please make sure the services are running.
        </div>
      )}

      {challenges && challenges.length === 0 && (
        <div className="border border-neutral-800 p-4 text-sm">
          No challenges found. Seed the database to get started.
        </div>
      )}

      {challenges && challenges.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {challenges.map((challenge) => (
            <ChallengeCard
              key={challenge.id}
              id={challenge.id}
              title={challenge.title}
              category={challenge.category}
              difficulty={challenge.difficulty}
              xp={challenge.xp}
              tags={challenge.tags}
            />
          ))}
        </div>
      )}
    </div>
  );
}
