import Link from "next/link";
import { useState } from "react";
import {
  Terminal,
  Network,
  Shield,
  Box,
  Database,
  GitBranch,
  Globe,
  CheckCircle2,
} from "lucide-react";
import type { QuizNode, QuizProgress } from "@/lib/api-types";

interface QuizCardProps {
  quiz: QuizNode;
  progress?: QuizProgress;
}

const CategoryIcon = ({ category }: { category?: string }) => {
  const c = (category || "").toLowerCase();
  const props = { size: 16, style: { opacity: 0.8 } };
  if (c.includes("linux") || c.includes("bash")) return <Terminal {...props} />;
  if (c.includes("network")) return <Network {...props} />;
  if (c.includes("security")) return <Shield {...props} />;
  if (c.includes("container") || c.includes("docker")) return <Box {...props} />;
  if (c.includes("database") || c.includes("data")) return <Database {...props} />;
  if (c.includes("ci") || c.includes("cd") || c.includes("git")) return <GitBranch {...props} />;
  return <Globe {...props} />;
};

export function QuizCard({ quiz, progress }: QuizCardProps) {
  const [hovered, setHovered] = useState(false);

  const isCompleted = progress?.status === "Completed";
  const baseBorderColor = isCompleted ? "rgba(53, 214, 180, 0.4)" : "var(--auth-border)";
  const hoverBorderColor = isCompleted
    ? "var(--auth-teal)"
    : "var(--auth-amber-dim, rgba(255, 157, 92, 0.6))";

  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(hover: none)").matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -4;
    const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 4;
    e.currentTarget.style.transform = `perspective(1000px) scale(1.02) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    setHovered(false);
    e.currentTarget.style.transform = "perspective(1000px) scale(1) rotateX(0deg) rotateY(0deg)";
  };

  const meta = quiz.metadata as any;
  const slug = quiz.slug || meta?.slug || quiz.id;
  const questionCount = quiz.metadata?.questions?.length || 0;
  const category = quiz.metadata?.category || meta?.topic || (quiz as any).category;

  return (
    <Link
      id={`quiz-${quiz.id}`}
      href={`/quizzes/${slug}`}
      className="press-feedback"
      onMouseEnter={() => setHovered(true)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        display: "flex",
        flexDirection: "column",
        background: isCompleted
          ? "linear-gradient(180deg, var(--auth-panel), rgba(53,214,180,0.03))"
          : "var(--auth-panel)",
        border: `1px solid ${hovered ? hoverBorderColor : baseBorderColor}`,
        borderRadius: "14px",
        padding: "26px",
        gap: "20px",
        transition: "transform 100ms ease-out, border-color 180ms ease, box-shadow 180ms ease",
        transform: "perspective(1000px) scale(1) rotateX(0deg) rotateY(0deg)",
        boxShadow: hovered ? "0 20px 40px -20px var(--auth-shadow, rgba(0,0,0,0.6))" : "none",
        position: "relative",
        overflow: "hidden",
        textDecoration: "none",
        alignItems: "stretch",
        height: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          zIndex: 1,
          width: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              color: "var(--auth-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--auth-panel-2)",
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              border: "1px solid var(--auth-border)",
            }}
          >
            <CategoryIcon category={category} />
          </div>
        </div>

        {isCompleted && progress?.score !== undefined && progress?.total !== undefined && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--auth-teal)",
              background: "rgba(53, 214, 180, 0.1)",
              padding: "4px 8px",
              borderRadius: "4px",
              border: "1px solid var(--auth-teal)",
            }}
          >
            <CheckCircle2 size={12} />
            {progress.score}/{progress.total}
          </div>
        )}
      </div>

      <div style={{ zIndex: 1, flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <h3
          style={{
            fontFamily: "var(--font-space)",
            fontSize: "19px",
            fontWeight: 600,
            color: "var(--auth-text)",
            lineHeight: 1.3,
            margin: "0 0 8px 0",
          }}
        >
          {quiz.title}
        </h3>
        <p style={{ color: "var(--auth-muted)", fontSize: "13.5px", lineHeight: 1.5, margin: 0 }}>
          {quiz.description}
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          borderTop: "1px solid var(--auth-border)",
          paddingTop: "20px",
          zIndex: 1,
          marginTop: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              gap: "12px",
              fontFamily: "var(--font-mono)",
              fontSize: "11.5px",
              color: "var(--auth-muted-dim)",
            }}
          >
            <span>{questionCount} questions</span>
            <span>{quiz.timeEstimate || "~5 min"}</span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11.5px",
              fontWeight: 600,
              color: "var(--auth-muted)",
            }}
          >
            {isCompleted ? "Review or Retake" : "Take Quiz"} &rarr;
          </div>
        </div>

        {quiz.challengeId && (
          <div style={{ display: "flex", alignItems: "center" }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 600,
                color: "var(--auth-muted)",
                background: "var(--auth-panel-2)",
                border: "1px solid var(--auth-border)",
                padding: "4px 8px",
                borderRadius: "4px",
              }}
            >
              Tests: {quiz.challengeId} &rarr;
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
