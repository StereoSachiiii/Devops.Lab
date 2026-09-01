"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, Lock, CheckCircle2, X } from "lucide-react";
import { CategoryIcon } from "@/components/dashboard/CategoryIcon";
import { RoadmapCard } from "@/components/dashboard/RoadmapCard";
import { apiClient } from "@/lib/apiClient";
import type { Roadmap, RoadmapNode, RoadmapProgress } from "@/lib/api-types";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";

// Helper to determine node status
function getNodeState(nodeId: string, progress: RoadmapProgress | null, roadmap: Roadmap) {
  if (!progress) return "locked"; // Default if not logged in
  if (progress.completedNodes.includes(nodeId)) return "complete";
  if (progress.inProgressNodes.includes(nodeId)) return "in_progress";

  // Check if prerequisites are met
  const node = roadmap.nodes?.find((n) => n.id === nodeId);
  if (!node) return "locked";

  const prereqsMet = node.prerequisites.every((p) => progress.completedNodes.includes(p));
  return prereqsMet ? "available" : "locked";
}

function RoadmapDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = typeof params["slug"] === "string" ? params["slug"] : params["slug"]?.[0] || "";

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [progress, setProgress] = useState<RoadmapProgress | null>(null);
  const [relatedRoadmaps, setRelatedRoadmaps] = useState<Roadmap[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedNode, setSelectedNode] = useState<RoadmapNode | null>(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [animatedProgress, setAnimatedProgress] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const [rm, prog, all] = await Promise.all([
          apiClient.roadmaps.getBySlug(slug),
          apiClient.roadmaps.getProgress(slug).catch(() => null),
          apiClient.roadmaps.getAll(),
        ]);
        setRoadmap(rm);
        setProgress(prog);

        // Simple related logic: just pick 2 others
        const others = all.filter((r) => r.id !== rm.id).slice(0, 2);
        setRelatedRoadmaps(others);

        // Check completion
        if (
          prog &&
          rm.nodes &&
          prog.completedNodes.length === rm.nodes.length &&
          rm.nodes.length > 0
        ) {
          setShowCompletionModal(true);
        }
      } catch (e) {
        console.error("Failed to load roadmap", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  const nodes = roadmap?.nodes || [];
  const completedCount = progress?.completedNodes.length || 0;
  const progressPercent = nodes.length > 0 ? Math.min(100, Math.round((completedCount / nodes.length) * 100)) : 0;

  // Find next available node
  let nextNode: RoadmapNode | null = null;
  if (progress && roadmap) {
    for (const node of nodes) {
      const s = getNodeState(node.id, progress, roadmap);
      if (s === "in_progress" || s === "available") {
        nextNode = node;
        break;
      }
    }
  }

  useEffect(() => {
    let t: NodeJS.Timeout | undefined;
    if (!loading && roadmap) {
      t = setTimeout(() => {
        setAnimatedProgress(progressPercent);
      }, 50);
    }
    return () => {
      if (t) clearTimeout(t);
    };
  }, [loading, roadmap, progressPercent]);

  const svgPath = useMemo(() => {
    const count = nodes.length;
    if (count <= 1) return "M 140,20";
    let d = "M 140,20";
    for (let i = 1; i < count; i++) {
      const x = 140 + (i % 2 === 0 ? 0 : i % 4 === 1 ? 25 : -25);
      const y = 20 + i * 100;
      const prevY = 20 + (i - 1) * 100;
      const midY = (prevY + y) / 2;
      const ctrlX = i % 2 !== 0 ? 220 : 60;
      d += ` Q ${ctrlX},${midY} ${x},${y}`;
    }
    return d;
  }, [nodes.length]);

  if (loading) {
    return <div className="p-10 text-panel-muted font-mono">Loading roadmap...</div>;
  }

  if (!roadmap) {
    return <div className="p-10 text-red font-mono">Roadmap not found.</div>;
  }

  return (
    <div className="flex w-full h-screen overflow-hidden bg-bg text-panel-text">
      {/* Saga-Map Left Rail */}
      <div className="hidden md:flex flex-col w-[280px] border-r border-panel-border bg-panel py-10 overflow-y-auto relative shrink-0">
        <div className="px-8 mb-8">
          <h2 className="font-mono text-xs text-panel-muted uppercase tracking-[0.1em] mb-2">
            Journey Map
          </h2>
          <div className="font-space text-xl font-bold text-panel-text leading-tight">
            {roadmap.title}
          </div>
        </div>

        <div
          className="flex-1 relative"
          style={{ minHeight: `${Math.max(nodes.length * 100, 400)}px` }}
        >
          {/* Animated SVG Path winding through nodes */}
          <svg className="absolute inset-0 w-full h-full z-0" preserveAspectRatio="none">
            <path
              d={svgPath}
              fill="none"
              stroke="var(--color-panel-2)"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d={svgPath}
              fill="none"
              stroke="var(--color-teal)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray="2000"
              strokeDashoffset={2000 - (animatedProgress / 100) * 2000}
              className="transition-[stroke-dashoffset] duration-1000 ease-in-out"
            />
          </svg>

          {nodes.map((node, i) => {
            const state = getNodeState(node.id, progress, roadmap);
            const isComplete = state === "complete";
            const isInProgress = state === "in_progress";
            const yPos = 20 + i * 100;
            // Oscillate x position slightly
            const xPos = 140 + (i % 2 === 0 ? 0 : i % 4 === 1 ? 25 : -25);

            return (
              <div
                key={node.id}
                onClick={() => setSelectedNode(node)}
                className="absolute z-10 cursor-pointer flex flex-col items-center gap-2 -translate-x-1/2 -translate-y-1/2"
                style={{ top: `${yPos}px`, left: `${xPos}px` }}
              >
                {node.chapterLabel && i === 0 && (
                  <div className="absolute -top-6 whitespace-nowrap font-mono text-[10px] text-amber uppercase tracking-[0.05em] bg-bg px-2 py-0.5 rounded-full border border-amber">
                    {node.chapterLabel}
                  </div>
                )}
                <div
                  className={`rounded-full flex items-center justify-center transition-all duration-300 ${
                    isInProgress ? "w-9 h-9" : "w-7 h-7"
                  } ${
                    isComplete
                      ? "bg-teal border-teal shadow-[0_0_12px_rgba(53,214,180,0.6)]"
                      : isInProgress
                        ? "bg-amber border-amber animate-pulse shadow-[0_0_16px_rgba(255,157,92,0.6)]"
                        : "bg-panel-2 border-panel-border"
                  } border-[3px]`}
                >
                  {isComplete && <CheckCircle2 size={16} color="#04241d" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Graph Area */}
      <div className="flex-1 overflow-y-auto relative px-[60px] py-10 scroll-smooth">
        {/* Header Block */}
        <div className="max-w-[800px] mx-auto mb-[60px]">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 font-mono text-xs text-panel-muted mb-5">
            <Link
              href="/roadmaps"
              className="text-inherit no-underline hover:text-panel-text transition-colors"
            >
              Roadmaps
            </Link>
            <ChevronRight size={14} />
            <span className="text-panel-text">{roadmap.title}</span>
          </div>

          <h1 className="font-space text-[40px] font-bold tracking-[-0.015em] mb-4 text-panel-text">
            {roadmap.title}
          </h1>
          <p className="text-panel-muted text-base leading-[1.6] mb-8">{roadmap.description}</p>

          {/* Global Progress */}
          <div className="bg-panel border border-panel-border rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="font-mono text-[13px] font-semibold text-panel-text">
                {completedCount} of {nodes.length} challenges complete
              </div>
              {nextNode && (
                <button
                  onClick={() => setSelectedNode(nextNode)}
                  className="press-feedback bg-teal text-[#04241d] border-none px-4 py-2 rounded-md font-mono text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-colors hover:bg-[#5ce2c6]"
                >
                  Continue where you left off &rarr;
                </button>
              )}
            </div>
            <div className="w-full h-1.5 bg-panel-2 rounded-[3px] overflow-hidden">
              <div
                className="h-full bg-teal transition-all duration-700 ease-out"
                style={{ width: `${animatedProgress}%` }}
              />
            </div>
          </div>

          {/* Legend */}
          <div className="flex gap-5 mt-6 font-mono text-[11px] text-panel-muted">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-[3px] border border-dashed border-panel-muted bg-transparent" />{" "}
              Locked
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-[3px] border border-amber bg-transparent" /> Available
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-[3px] border border-amber bg-amber" /> In progress
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-[3px] bg-teal" /> Complete
            </div>
          </div>
        </div>

        {/* Vertical Graph */}
        <div className="max-w-[800px] mx-auto relative pb-0">
          <div className="absolute left-7 top-5 bottom-5 w-0.5 bg-panel-border z-0" />

          <div className="flex flex-col gap-12 relative z-10">
            {nodes.map((node, index) => {
              const state = getNodeState(node.id, progress, roadmap);

              // Styles based on state
              const isLocked = state === "locked";
              const isComplete = state === "complete";
              const isAvailable = state === "available";
              const isInProgress = state === "in_progress";

              const dotBg = isComplete ? "bg-teal" : isInProgress ? "bg-amber" : "bg-panel";
              const dotBorder = isComplete
                ? "border-teal"
                : isInProgress || isAvailable
                  ? "border-amber"
                  : "border-panel-border";
              const dotColor = isComplete
                ? "#04241d"
                : isInProgress
                  ? "#241505"
                  : "var(--color-panel-muted)";

              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNode(node)}
                  className={`flex items-start gap-6 cursor-pointer transition-all duration-200 ${
                    isLocked ? "opacity-40" : "opacity-100"
                  } ${selectedNode?.id === node.id ? "scale-[1.02]" : "scale-100"}`}
                  style={{
                    animation: "pageFadeIn 500ms cubic-bezier(0.16, 1, 0.3, 1) backwards",
                    animationDelay: `${Math.min(index * 70, 350)}ms`,
                  }}
                >
                  {/* Node Dot */}
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 mt-1 ${dotBg} ${
                      isLocked ? "border-2 border-dashed" : "border-2 border-solid"
                    } ${dotBorder} ${
                      isInProgress
                        ? "shadow-[0_0_0_4px_rgba(255,157,92,0.15)]"
                        : isComplete
                          ? "shadow-[0_0_16px_rgba(53,214,180,0.3)]"
                          : "shadow-none"
                    }`}
                  >
                    <div
                      key={state}
                      className="animate-[iconMorph_0.4s_cubic-bezier(0.34,1.56,0.64,1)] flex items-center justify-center"
                    >
                      {isComplete ? (
                        <CheckCircle2 size={24} color={dotColor} />
                      ) : isLocked ? (
                        <Lock size={20} color={dotColor} />
                      ) : (
                        <span className="font-mono text-base font-bold" style={{ color: dotColor }}>
                          {index + 1}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Node Content */}
                  <div
                    className={`bg-panel rounded-xl p-5 px-6 flex-1 transition-colors duration-200 border-y border-r border-l-4 ${
                      selectedNode?.id === node.id
                        ? "border-y-teal border-r-teal border-l-teal"
                        : "border-y-panel-border border-r-panel-border"
                    } ${
                      node.difficulty.toLowerCase().includes("beginner")
                        ? "border-l-[rgba(53,214,180,1)]"
                        : node.difficulty.toLowerCase().includes("intermediate")
                          ? "border-l-[rgba(255,157,92,1)]"
                          : "border-l-[rgba(255,107,107,1)]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-panel-2 border border-panel-border text-panel-muted">
                          <CategoryIcon
                            category={node.tags[0] || roadmap.icon}
                            className="opacity-80 w-4 h-4"
                          />
                        </div>
                        <h3 className="font-space text-lg font-semibold m-0 text-panel-text">
                          {node.title}
                        </h3>
                      </div>
                      <div className="flex gap-2 font-mono text-[10px] font-semibold">
                        <span className="px-2 py-1 rounded bg-panel-2 text-teal uppercase border border-[rgba(53,214,180,0.2)]">
                          {node.difficulty}
                        </span>
                        <span className="px-2 py-1 rounded bg-panel-2 text-panel-muted border border-panel-border">
                          {node.timeEstimate}
                        </span>
                      </div>
                    </div>
                    <p className="text-panel-muted text-sm leading-[1.5] m-0">{node.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Related Roadmaps */}
        {relatedRoadmaps.length > 0 && (
          <div className="max-w-[800px] mx-auto mt-10 mb-[100px] border-t border-panel-border pt-[60px]">
            <h2 className="font-space text-2xl font-semibold mb-6 text-panel-text">
              {relatedRoadmaps.length > 1 ? "Related Roadmaps" : "Continue your path"}
            </h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6">
              {relatedRoadmaps.map((r) => (
                <RoadmapCard key={r.id} roadmap={r} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Side Panel (Slide-in) */}
      {selectedNode && (
        <div className="w-[420px] bg-panel-2 border-l border-panel-border flex flex-col shrink-0 relative z-10 animate-[slideIn_0.25s_cubic-bezier(0.16,1,0.3,1)]">
          {/* Panel Header */}
          <div className="p-6 border-b border-panel-border flex justify-between items-start">
            <div>
              <div className="font-mono text-[11px] text-teal mb-2 uppercase tracking-[0.05em]">
                Challenge Details
              </div>
              <h2 className="font-space text-[22px] font-semibold m-0 text-panel-text">
                {selectedNode.title}
              </h2>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="bg-transparent border-none text-panel-muted cursor-pointer p-1 transition-colors hover:text-panel-text"
            >
              <X size={20} />
            </button>
          </div>

          {/* Panel Body */}
          <div className="flex-1 overflow-y-auto p-6">
            <p className="text-panel-text text-[15px] leading-[1.6] m-0 mb-6">
              {selectedNode.description}
            </p>

            <div className="flex flex-wrap gap-2 mb-8">
              {selectedNode.tags.map((t) => (
                <Link href={`/challenges?topic=${t}`} key={t} className="no-underline">
                  <span className="font-mono text-[11px] px-2 py-1 rounded bg-panel border border-panel-border text-panel-muted cursor-pointer inline-block transition-colors hover:border-panel-muted hover:text-panel-text">
                    #{t}
                  </span>
                </Link>
              ))}
              <span className="font-mono text-[11px] px-2 py-1 rounded bg-panel border border-panel-border text-amber">
                {selectedNode.xp} XP
              </span>
            </div>

            {/* Prerequisites Note */}
            {getNodeState(selectedNode.id, progress, roadmap) === "locked" && (
              <div className="bg-[rgba(255,107,107,0.05)] border border-[rgba(255,107,107,0.2)] rounded-lg p-4 mb-6">
                <div className="font-mono text-xs text-red font-semibold mb-2 flex items-center gap-1.5">
                  <Lock size={14} /> Locked
                </div>
                <div className="text-[13.5px] text-panel-muted leading-[1.5]">
                  You must complete the prerequisite challenges in this roadmap before you can start
                  this one.
                </div>
              </div>
            )}
          </div>

          {/* Panel Footer */}
          <div className="p-6 border-t border-panel-border bg-panel">
            {getNodeState(selectedNode.id, progress, roadmap) !== "locked" ? (
              <Link
                href={`/challenges/${selectedNode.id}`}
                className="block w-full text-center bg-[linear-gradient(135deg,var(--color-amber),#ffb877)] text-[#241505] border-none py-3.5 px-6 rounded-lg font-sans font-semibold text-[15px] cursor-pointer no-underline shadow-[0_10px_24px_-10px_rgba(255,157,92,0.4)] transition-transform hover:scale-[1.02]"
              >
                Start challenge &rarr;
              </Link>
            ) : (
              <button
                disabled
                className="w-full bg-panel-2 text-panel-muted border border-panel-border py-3.5 px-6 rounded-lg font-sans font-semibold text-[15px] cursor-not-allowed opacity-70"
              >
                Locked
              </button>
            )}
          </div>
        </div>
      )}

      {/* Completion Modal */}
      {showCompletionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(0,0,0,0.8)] backdrop-blur-[4px]">
          <div className="bg-panel border border-panel-border rounded-2xl w-full max-w-[480px] p-10 px-8 text-center shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] animate-[popIn_0.3s_cubic-bezier(0.16,1,0.3,1)]">
            {/* Celebration Badge */}
            <div className="w-[100px] h-[100px] rounded-full bg-[linear-gradient(135deg,var(--color-teal),#6be9cf)] mx-auto mb-6 flex items-center justify-center shadow-[0_0_40px_rgba(53,214,180,0.3)]">
              <CheckCircle2 size={48} color="#04241d" />
            </div>

            <h2 className="font-space text-[28px] font-bold m-0 mb-3 text-panel-text">
              That's the whole roadmap.
            </h2>
            <p className="text-panel-muted text-[15px] leading-[1.6] m-0 mb-8">
              You've completed every challenge in <strong>{roadmap.title}</strong>.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  alert("Share dialog would open here.");
                  setShowCompletionModal(false);
                }}
                className="w-full bg-[linear-gradient(135deg,var(--color-teal),#6be9cf)] text-[#04241d] border-none py-3.5 px-4 rounded-lg font-semibold text-[15px] cursor-pointer flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]"
              >
                Share completion badge
              </button>
              <button
                onClick={() => router.push("/roadmaps")}
                className="w-full bg-panel-2 text-panel-text border border-panel-border py-3.5 px-4 rounded-lg font-semibold text-[15px] cursor-pointer transition-colors hover:bg-panel"
              >
                Pick your next roadmap &rarr;
              </button>
              <button
                onClick={() => setShowCompletionModal(false)}
                className="bg-transparent border-none text-panel-muted text-[13px] mt-4 cursor-pointer underline hover:text-panel-text"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WrappedRoadmapDetailPage(props: any) {
  return (
    <WorkspaceLayout>
      <RoadmapDetailPage {...props} />
    </WorkspaceLayout>
  );
}
