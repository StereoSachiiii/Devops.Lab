import Link from "next/link";
import { useState } from "react";
import { Terminal, Network, Shield, Box, Database, GitBranch, Globe, Activity } from "lucide-react";
import type { Roadmap } from "@/lib/api-types";

interface RoadmapCardProps {
  roadmap: Roadmap;
  status?: "Not started" | "In progress" | "Completed";
  completedCount?: number;
}

const CategoryIcon = ({ icon }: { icon: string }) => {
  const c = icon.toLowerCase();
  const props = { size: 16, style: { opacity: 0.8 } };
  if (c.includes("terminal") || c.includes("linux")) return <Terminal {...props} />;
  if (c.includes("activity")) return <Activity {...props} />;
  if (c.includes("network")) return <Network {...props} />;
  if (c.includes("shield")) return <Shield {...props} />;
  if (c.includes("box") || c.includes("docker")) return <Box {...props} />;
  if (c.includes("database")) return <Database {...props} />;
  if (c.includes("git") || c.includes("branch")) return <GitBranch {...props} />;
  return <Globe {...props} />;
};

export function RoadmapCard({
  roadmap,
  status = "Not started",
  completedCount = 0,
}: RoadmapCardProps) {
  const [hovered, setHovered] = useState(false);

  const isCompleted = status === "Completed";
  const isInProgress = status === "In progress";

  const baseBorderColor = isCompleted ? "rgba(53, 214, 180, 0.4)" : "var(--auth-border)";
  const hoverBorderColor = isCompleted ? "var(--auth-teal)" : "rgba(255, 157, 92, 0.6)";

  const progressPercent = Math.min(100, Math.round((completedCount / roadmap.nodeCount) * 100));

  let cta = "Start roadmap";
  if (isInProgress) cta = "Continue";
  if (isCompleted) cta = "Review";

  return (
    <Link
      id={`roadmap-${roadmap.id}`}
      href={`/roadmaps/${roadmap.slug}`}
      className="press-feedback block relative overflow-hidden no-underline rounded-[14px] border p-[26px] gap-5 flex flex-col items-stretch transition-all duration-150 ease-out hover:-translate-y-[3px] hover:shadow-[0_20px_40px_-20px_var(--theme-shadow)]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: isCompleted
          ? "linear-gradient(180deg, var(--auth-panel), rgba(53,214,180,0.03))"
          : "var(--auth-panel)",
        borderColor: hovered ? hoverBorderColor : baseBorderColor,
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
            <CategoryIcon icon={roadmap.icon} />
          </div>
        </div>
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
          {roadmap.title}
        </h3>
        <p style={{ color: "var(--auth-muted)", fontSize: "13.5px", lineHeight: 1.5, margin: 0 }}>
          {roadmap.description}
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
            <span>{roadmap.nodeCount} challenges</span>
            <span>{roadmap.timeEstimate}</span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11.5px",
              fontWeight: 600,
              color: isCompleted
                ? "var(--auth-teal)"
                : isInProgress
                  ? "var(--auth-amber)"
                  : "var(--auth-muted)",
            }}
          >
            {cta} &rarr;
          </div>
        </div>

        {status !== "Not started" && (
          <div
            style={{
              width: "100%",
              height: "4px",
              background: "var(--auth-panel-2)",
              borderRadius: "2px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: "100%",
                background: "var(--auth-teal)",
                borderRadius: "2px",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        )}
      </div>
    </Link>
  );
}
