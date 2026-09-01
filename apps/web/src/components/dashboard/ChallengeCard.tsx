"use client";

import Link from "next/link";
// import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { CategoryIcon } from "./CategoryIcon";

export interface ChallengeCardProps {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  xp: number;
  timeEstimate?: string;
  tags: string[];
  isRecommended?: boolean;
  status?: "Not started" | "In progress" | "Completed";
  viewMode?: "grid" | "list";
  index?: number;
}

export function ChallengeCard({
  id,
  title,
  description,
  category,
  difficulty,
  timeEstimate = "15 min",
  tags,
  isRecommended = false,
  status = "Not started",
  viewMode = "grid",
  index = 0,
}: ChallengeCardProps) {
  // const [hovered, setHovered] = useState(false);
  const router = useRouter();

  const isBeginner = difficulty === "Beginner" || difficulty === "Easy";
  const isIntermediate = difficulty === "Intermediate" || difficulty === "Medium";

  const diffTextColor = isBeginner ? "text-teal" : isIntermediate ? "text-amber" : "text-red-auth";
  const diffBgColor = isBeginner
    ? "bg-[rgba(53,214,180,0.1)]"
    : isIntermediate
      ? "bg-[rgba(255,157,92,0.1)]"
      : "bg-[rgba(255,107,107,0.1)]";
  const diffBorderColor = isBeginner
    ? "border-[rgba(53,214,180,0.2)]"
    : isIntermediate
      ? "border-[rgba(255,157,92,0.2)]"
      : "border-[rgba(255,107,107,0.2)]";
  const topBorderClass = isBeginner
    ? "border-t-[2px] border-t-[rgba(53,214,180,1)]"
    : isIntermediate
      ? "border-t-[2px] border-t-[rgba(255,157,92,1)]"
      : "border-t-[2px] border-t-[rgba(255,107,107,1)]";

  const isCompleted = status === "Completed";
  const isInProgress = status === "In progress";

  const baseBorderClass = isCompleted ? "border-[rgba(53,214,180,0.4)]" : "border-panel-border";
  const hoverBorderClass = isCompleted ? "hover:border-teal" : "hover:border-amber/60";
  const bgClass = isCompleted
    ? "bg-gradient-to-b from-panel to-[rgba(53,214,180,0.03)]"
    : "bg-panel";

  return (
    <Link
      id={`challenge-${id}`}
      href={`/challenges/${id}`}
      className={`press-feedback block relative overflow-hidden no-underline rounded-[14px] border ${bgClass} ${baseBorderClass} ${hoverBorderClass} ${topBorderClass} transition-all duration-150 ease-out hover:-translate-y-[3px] hover:shadow-[0_20px_40px_-20px_var(--theme-shadow)] ${viewMode === "list" ? "flex flex-row items-center p-5 px-[26px] gap-6" : "flex flex-col items-stretch p-[26px] gap-5"}`}
      style={{
        animation: "pageFadeIn 500ms cubic-bezier(0.16, 1, 0.3, 1) backwards",
        animationDelay: `${Math.min(index * 70, 350)}ms`,
      }}
    >
      <div
        className={`absolute top-0 right-0 w-[150px] h-[150px] pointer-events-none z-0 ${
          isBeginner
            ? "bg-[radial-gradient(circle_at_top_right,rgba(53,214,180,0.1),transparent_70%)]"
            : isIntermediate
              ? "bg-[radial-gradient(circle_at_top_right,rgba(255,157,92,0.1),transparent_70%)]"
              : "bg-[radial-gradient(circle_at_top_right,rgba(255,107,107,0.1),transparent_70%)]"
        }`}
      />

      <div
        className={`relative z-10 flex justify-between items-start ${viewMode === "list" ? "w-auto" : "w-full"}`}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-panel-2 border border-panel-border text-panel-muted">
            <CategoryIcon category={category} className="opacity-80 w-4 h-4" />
          </div>

          {viewMode === "grid" && (
            <div
              className={`font-mono text-[11px] font-semibold px-2 py-1 rounded border ${diffTextColor} ${diffBgColor} ${diffBorderColor}`}
            >
              {difficulty}
            </div>
          )}
        </div>

        {viewMode === "grid" && isRecommended && (
          <div className="font-mono text-[10px] font-semibold tracking-wider text-teal border border-teal bg-teal/10 px-2 py-1 rounded uppercase">
            Good first challenge
          </div>
        )}
      </div>

      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="font-space text-[19px] font-semibold text-panel-text leading-snug m-0 line-clamp-2">
            {title}
          </h3>
          {isCompleted && <CheckCircle2 size={16} className="text-teal shrink-0" />}
          {isInProgress && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-amber shrink-0" />
              <span className="font-mono text-[10px] text-amber whitespace-nowrap">
                In progress
              </span>
            </div>
          )}
        </div>
        <p className="text-panel-muted text-[13.5px] leading-relaxed m-0 line-clamp-1">
          {description}
        </p>
      </div>

      <div
        className={`relative z-10 flex justify-between items-center flex-wrap gap-4 ${viewMode === "list" ? "mt-0 pt-0 border-none" : "mt-auto pt-5 border-t border-panel-border"}`}
      >
        <div className="flex gap-1.5 flex-wrap z-20">
          {tags.slice(0, 3).map((t) => (
            <span
              key={t}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/challenges?type=${t}`);
              }}
              className="font-mono text-[10.5px] px-2 py-1 rounded bg-panel-2 border border-panel-border text-panel-muted cursor-pointer transition-colors hover:text-panel-text"
            >
              {t}
            </span>
          ))}
          {tags.length > 3 && (
            <span className="font-mono text-[10.5px] px-2 py-1 rounded bg-transparent text-panel-muted-dim">
              +{tags.length - 3}
            </span>
          )}
        </div>

        <div className="flex gap-3.5 font-mono text-[11.5px] text-panel-muted-dim items-center">
          {viewMode === "list" && (
            <div
              className={`text-[11px] font-semibold px-2 py-1 rounded border mr-2 ${diffTextColor} ${diffBgColor} ${diffBorderColor}`}
            >
              {difficulty}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-teal">~{timeEstimate}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
