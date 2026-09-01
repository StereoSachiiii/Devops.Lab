"use client";

import { useEffect, useState, useCallback } from "react";
import { RoadmapCard } from "@/components/dashboard/RoadmapCard";
import { apiClient } from "@/lib/apiClient";
import type { Roadmap, RoadmapProgress } from "@/lib/api-types";
import Link from "next/link";
import { AlertCircle, RefreshCw } from "lucide-react";

export function RoadmapsContent() {
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [progressData, setProgressData] = useState<Record<string, RoadmapProgress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await apiClient.roadmaps.getAll();
      setRoadmaps(list || []);

      // Fetch progress for each roadmap
      const pMap: Record<string, RoadmapProgress> = {};
      await Promise.all(
        (list || []).map(async (r) => {
          try {
            const p = await apiClient.roadmaps.getProgress(r.slug);
            pMap[r.id] = p;
          } catch {
            // no progress
          }
        })
      );
      setProgressData(pMap);
    } catch (e) {
      console.error("Failed to load roadmaps", e);
      setError("Failed to load engineering roadmaps. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleScrollToGrid = () => {
    document.getElementById("roadmap-grid")?.scrollIntoView({ behavior: "smooth" });
  };

  const getStatus = (r: Roadmap) => {
    const p = progressData[r.id];
    if (!p) return "Not started";
    if (p.completedNodes.length === r.nodeCount && r.nodeCount > 0) return "Completed";
    if (p.completedNodes.length > 0 || p.inProgressNodes.length > 0) return "In progress";
    return "Not started";
  };

  const getCompletedCount = (r: Roadmap) => {
    return progressData[r.id]?.completedNodes.length || 0;
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-10 p-10 px-6 max-w-6xl mx-auto animate-pulse">
        <div className="space-y-4 max-w-xl">
          <div className="w-24 h-4 bg-panel-border/60 rounded-full" />
          <div className="w-3/4 h-10 bg-panel-border/60 rounded-xl" />
          <div className="w-full h-5 bg-panel-border/40 rounded-lg" />
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-56 bg-panel border border-panel-border/60 rounded-2xl p-6 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-panel-border/60" />
                <div className="w-1/2 h-5 bg-panel-border/60 rounded" />
                <div className="w-5/6 h-4 bg-panel-border/40 rounded" />
              </div>
              <div className="w-1/3 h-4 bg-panel-border/50 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-10 px-6 max-w-lg mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="font-space font-bold text-lg text-panel-text">Could not load roadmaps</h2>
        <p className="text-xs text-panel-muted font-mono">{error}</p>
        <button
          onClick={() => load()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-panel-2 border border-panel-border text-xs font-mono text-panel-text hover:border-teal transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[60px] p-10 px-6">
      {/* 1. Hero Section */}
      <section className="relative flex flex-col justify-center py-10 max-w-[800px] animate-[heroFadeOut_linear_both] [animation-timeline:view()] [animation-range:exit_0%_exit_100%]">
        {/* Ambient drift background specifically for roadmaps hero */}
        <div className="absolute -inset-[100px] -z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(53,214,180,0.08)_0%,rgba(255,157,92,0.05)_30%,transparent_70%)] bg-[size:200%_200%] animate-[ambientDrift_60s_ease-in-out_infinite_alternate] pointer-events-none" />

        <div className="font-mono text-xs tracking-[0.14em] uppercase text-teal flex items-center gap-[9px] mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-teal shrink-0" />
          ROADMAPS
        </div>
        <h1 className="font-space text-[42px] font-bold tracking-[-0.015em] mb-4 text-panel-text">
          Pick a path. Follow the graph.
        </h1>
        <p className="text-panel-muted text-base leading-[1.6] m-0">
          {roadmaps.length} roadmaps, {roadmaps.reduce((acc, r) => acc + r.nodeCount, 0)} challenges
          total - each one a real dependency chain, not a bullet list.
        </p>
      </section>

      {/* 2. "Not sure where to start?" Picker */}
      <section className="bg-panel-2 border border-panel-border rounded-[14px] p-[30px] relative z-10">
        <h2 className="font-space text-xl font-semibold text-panel-text mb-5">
          Not sure where to start?
        </h2>
        <div className="flex gap-3 flex-wrap">
          <Link
            href="/roadmaps/linux-fundamentals"
            className="bg-panel border border-panel-border text-panel-text px-5 py-3 rounded-lg no-underline text-sm transition-colors duration-200 hover:border-panel-muted"
          >
            I'm new to Linux &rarr;
          </Link>
          <Link
            href="/roadmaps/kubernetes-operations"
            className="bg-panel border border-panel-border text-panel-text px-5 py-3 rounded-lg no-underline text-sm transition-colors duration-200 hover:border-panel-muted"
          >
            I want to focus on Kubernetes &rarr;
          </Link>
          <Link
            href="/roadmaps/site-reliability-engineering"
            className="bg-panel border border-panel-border text-panel-text px-5 py-3 rounded-lg no-underline text-sm transition-colors duration-200 hover:border-panel-muted"
          >
            I want the full SRE path &rarr;
          </Link>
          <button
            onClick={handleScrollToGrid}
            className="bg-transparent border border-transparent text-panel-muted px-5 py-3 rounded-lg cursor-pointer text-sm transition-colors duration-200 hover:text-panel-text"
          >
            Just let me browse
          </button>
        </div>
      </section>

      {/* Structured Onboarding Explainer */}
      <section className="bg-[linear-gradient(135deg,rgba(53,214,180,0.05),rgba(255,157,92,0.05))] border border-panel-border rounded-[14px] p-8 mb-5">
        <h2 className="font-space text-xl font-semibold text-panel-text mb-3 flex items-center gap-2">
          Built for structured onboarding
        </h2>
        <p className="text-panel-muted text-[15px] leading-[1.6] m-0 max-w-[600px]">
          Roadmaps aren't just collections of tags—they are deliberate sequences. If you skip ahead,
          you might miss the underlying fundamentals. Follow the graph to build compounding
          knowledge without the gaps.
        </p>
      </section>

      {/* 3. Roadmap Card Grid */}
      <section id="roadmap-grid" className="relative z-10">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
          {roadmaps.map((r) => (
            <RoadmapCard
              key={r.id}
              roadmap={r}
              status={getStatus(r)}
              completedCount={getCompletedCount(r)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
