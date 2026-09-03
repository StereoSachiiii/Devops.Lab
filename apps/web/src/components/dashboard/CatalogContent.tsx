"use client";

import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/providers/AuthProvider";
import { ChallengeCard } from "@/components/dashboard/ChallengeCard";
import { CatalogToolbar, CatalogState } from "@/components/dashboard/CatalogToolbar";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { CategorySidebar } from "@/components/dashboard/CategorySidebar";
import { CatalogTour } from "@/components/tour/CatalogTour";
import { HelpCircle } from "lucide-react";

export interface Challenge {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  category: string;
  tags: string[];
  xp: number;
  module: { title: string } | null;
  // Mock properties for frontend spec
  timeEstimate?: string;
  isRecommended?: boolean;
  status?: "Not started" | "In progress" | "Completed";
}

export function CatalogContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [showTour, setShowTour] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (user?.onboardingState === "NEW") {
      setShowTour(true);
    }
  }, [user?.onboardingState]);

  const {
    data: rawChallenges,
    error,
    isLoading,
  } = useSWR<Challenge[]>("/api/challenges", () => apiClient.get<Challenge[]>("/api/challenges"));

  // Inject mock data for spec fulfillment since DB doesn't have these yet
  const challenges = useMemo(() => {
    if (!rawChallenges) return [];
    return rawChallenges.map((c) => ({
      ...c,
      timeEstimate: "15 min",
      isRecommended: c.id === "c1", // Mock SSH challenge as recommended
      status: "Not started" as const,
    }));
  }, [rawChallenges]);

  const state: CatalogState = {
    q: searchParams.get("q") || "",
    sort: searchParams.get("sort") || "Recommended",
    difficulty: searchParams.getAll("difficulty"),
    time: searchParams.getAll("time"),
    type: searchParams.getAll("type"),
    view: (searchParams.get("view") as "grid" | "list") || "grid",
  };

  const updateState = (newState: Partial<CatalogState>) => {
    const params = new URLSearchParams(searchParams);

    // Helper to update array params
    const setArray = (key: string, arr?: string[]) => {
      if (!arr) return;
      params.delete(key);
      arr.forEach((v) => params.append(key, v));
    };

    if (newState.q !== undefined) {
      if (newState.q) params.set("q", newState.q);
      else params.delete("q");
    }

    if (newState.sort) params.set("sort", newState.sort);
    if (newState.view) params.set("view", newState.view);

    setArray("difficulty", newState.difficulty);
    setArray("time", newState.time);
    setArray("type", newState.type);

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Compute available filters based on raw data
  const filterOptions = useMemo(() => {
    const opts = {
      difficulty: {} as Record<string, number>,
      time: {} as Record<string, number>,
      type: {} as Record<string, number>,
    };
    challenges.forEach((c) => {
      opts.difficulty[c.difficulty] = (opts.difficulty[c.difficulty] || 0) + 1;
      opts.time[c.timeEstimate!] = (opts.time[c.timeEstimate!] || 0) + 1;
      c.tags.forEach((t) => {
        opts.type[t] = (opts.type[t] || 0) + 1;
      });
    });
    return opts;
  }, [challenges]);

  // Apply filters and search
  const filtered = useMemo(() => {
    let result = challenges;

    // Search
    if (state.q) {
      const q = state.q.toLowerCase();
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Difficulty OR logic
    if (state.difficulty.length > 0) {
      result = result.filter((c) => state.difficulty.includes(c.difficulty));
    }

    // Time OR logic
    if (state.time.length > 0) {
      result = result.filter((c) => state.time.includes(c.timeEstimate!));
    }

    // Type OR logic
    if (state.type.length > 0) {
      result = result.filter((c) => c.tags.some((t) => state.type.includes(t)));
    }

    // Sort
    result.sort((a, b) => {
      if (state.sort === "Recommended")
        return (b.isRecommended ? 1 : 0) - (a.isRecommended ? 1 : 0);
      if (state.sort === "Newest") return a.id.localeCompare(b.id);
      if (state.sort.includes("Difficulty")) return a.difficulty.localeCompare(b.difficulty);
      return 0;
    });

    return result;
  }, [challenges, state]);

  // Handle Skeleton loading state
  const isFirstLoad = isLoading && !rawChallenges;

  return (
    <div className="text-panel-text font-sans relative">
      <CatalogTour show={showTour} onDone={() => setShowTour(false)} />

      {/* Hero Section */}
      <div className="pt-[60px] pb-6 max-w-[800px] mx-auto text-center relative">
        <button
          onClick={() => setShowTour(true)}
          className="absolute top-5 right-5 bg-panel-2 border border-panel-border rounded-full w-8 h-8 flex items-center justify-center cursor-pointer text-panel-muted transition-all duration-200 hover:text-amber hover:border-[var(--color-amber)]"
          title="Replay Onboarding Tour"
        >
          <HelpCircle size={16} />
        </button>
        <div className="font-mono text-xs tracking-[0.14em] uppercase text-teal mb-4 font-semibold">
          BROWSE CHALLENGES
        </div>
        <h1 className="font-space text-[42px] font-bold tracking-[-0.015em] mb-4 text-panel-text">
          Every broken environment, searchable.
        </h1>
        <p className="text-panel-muted text-base leading-[1.6] m-0">
          {challenges.length} challenges across {Object.keys(filterOptions.type).length} categories
          - from a five-minute permissions fix to a full incident response.
        </p>
      </div>

      <div className="max-w-[1180px] mx-auto flex flex-col lg:flex-row gap-8">
        <div className="flex flex-col gap-6 lg:w-[240px] shrink-0">
          <CategorySidebar
            categories={filterOptions.type}
            totalChallenges={challenges.length}
            activeCategory={state.type[0] || null}
            onSelectCategory={(cat) => updateState({ type: cat ? [cat] : [] })}
          />

          <div className="hidden lg:flex flex-col gap-4 pt-4 border-t border-panel-border">
            <div className="bg-[linear-gradient(135deg,rgba(53,214,180,0.05),rgba(255,157,92,0.05))] border border-panel-border rounded-xl p-4">
              <h3 className="font-space text-sm font-semibold text-panel-text mb-1.5">
                Why hands-on beats reading
              </h3>
              <p className="text-panel-muted text-xs leading-[1.5] m-0">
                You don't learn how to ride a bike by reading a physics textbook. Each challenge spins up a real container or VM with root access. Fix it.
              </p>
            </div>
            <div className="bg-panel-2 border border-panel-border rounded-xl p-4">
              <h3 className="font-space text-sm font-semibold text-panel-text mb-1.5">
                How grading works
              </h3>
              <p className="text-panel-muted text-xs leading-[1.5] m-0">
                Instant, honest grading. Our validation agent connects to your sandbox and runs real tests against your environment.
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <CatalogToolbar
            state={state}
            onChange={updateState}
            options={filterOptions}
            resultCount={filtered.length}
          />

          <div className="mt-4">
            {error && (
              <div className="border border-[var(--color-red)] bg-[rgba(255,107,107,0.05)] p-5 rounded-xl text-[var(--color-red)] font-mono text-[13px]">
                [ERROR] Failed to load challenges. Connection to cluster refused.
              </div>
            )}

            {isFirstLoad && (
              <div
                className={`gap-5 ${state.view === "grid" ? `grid ${challenges.length >= 9 ? "grid-cols-[repeat(auto-fill,minmax(340px,1fr))]" : "grid-cols-1 md:grid-cols-2"}` : "flex flex-col"}`}
              >
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className={`bg-panel border border-panel-border rounded-[14px] relative overflow-hidden ${state.view === "list" ? "p-5 px-[26px] h-[100px]" : "p-[26px] h-[220px]"}`}
                  >
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.02),transparent)] -translate-x-full animate-[shimmer_1.5s_infinite]" />
                  </div>
                ))}
              </div>
            )}

            {!isFirstLoad && !error && filtered.length === 0 && (
              <div className="p-10 md:p-[60px_40px] rounded-xl text-center border border-dashed border-panel-border">
                <div className="font-mono text-sm text-panel-muted mb-4">
                  $ grep -r "{state.q || "matches"}" ./challenges → (no output)
                </div>
                <div className="text-panel-text mb-5 text-[15px]">
                  Try removing a filter, or{" "}
                  <button
                    onClick={() => updateState({ q: "", difficulty: [], time: [], type: [] })}
                    className="bg-transparent border-none text-teal underline cursor-pointer text-[15px] p-0"
                  >
                    Clear all filters
                  </button>
                </div>
                <Link href="/ideas/new" className="text-panel-muted-dim text-[13px] no-underline">
                  Don't see what you're looking for? Submit a challenge idea →
                </Link>
              </div>
            )}

            {!isFirstLoad && !error && filtered.length > 0 && (
              <div
                className={`gap-5 ${state.view === "grid" ? `grid ${challenges.length >= 9 ? "grid-cols-[repeat(auto-fill,minmax(340px,1fr))]" : "grid-cols-1 md:grid-cols-2"}` : "flex flex-col"}`}
              >
                {filtered.map((challenge, i) => (
                  <ChallengeCard
                    key={challenge.id}
                    index={i}
                    id={challenge.id}
                    title={challenge.title}
                    description={challenge.description}
                    category={challenge.category}
                    difficulty={challenge.difficulty}
                    xp={challenge.xp}
                    timeEstimate={challenge.timeEstimate}
                    tags={challenge.tags}
                    isRecommended={challenge.isRecommended}
                    status={challenge.status}
                    viewMode={state.view}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
