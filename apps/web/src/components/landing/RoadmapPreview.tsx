// import React from "react";

const nodes = [
  { n: "✓", label: "Linux Basics", sub: "Filesystems, permissions", done: true, current: false },
  { n: "✓", label: "Networking", sub: "DNS, ports, routing", done: true, current: false },
  { n: "3", label: "Containers", sub: "Docker, gVisor, images", done: false, current: true },
  { n: "4", label: "Orchestration", sub: "Kubernetes, Helm", done: false, current: false },
  { n: "5", label: "CI/CD", sub: "Pipelines, rollbacks", done: false, current: false },
  { n: "6", label: "Incidents", sub: "On-call, postmortems", done: false, current: false },
];

export function RoadmapPreview() {
  return (
    <section id="roadmap" className="py-[100px] relative z-10">
      <div className="max-w-[1180px] mx-auto px-8">
        <div className="max-w-[600px] mb-[44px]">
          <div className="font-mono text-[12px] tracking-[0.14em] uppercase text-teal flex items-center gap-[9px] mb-[14px]">
            <span className="w-[6px] h-[6px] rounded-full bg-teal shadow-[0_0_8px_var(--color-teal)] shrink-0" />
            learning paths
          </div>
          <h2 className="font-space text-[32px] font-bold tracking-[-0.015em] mb-3">
            Follow a roadmap, or build your own.
          </h2>
          <p className="text-panel-muted text-[15.5px] leading-[1.6]">
            Each path is an ordered sequence of challenges - skip ahead if you know your stuff, or
            start from zero.
          </p>
        </div>
        <div className="roadmap-path">
          <div className="roadmap-line" />
          <div className="roadmap-line-active" />
          {nodes.map((node) => (
            <div key={node.label} className="roadmap-node group">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-mono font-semibold text-[13px] border-2 transition-transform duration-200 group-hover:scale-[1.15] group-hover:shadow-[0_10px_20px_-5px_rgba(0,0,0,0.5)] ${node.current ? "roadmap-node-pulse" : ""} ${
                  node.done
                    ? "bg-gradient-to-br from-teal to-[#6be9cf] border-teal text-[#04241d]"
                    : node.current
                      ? "bg-gradient-to-br from-amber to-[#ffcb8a] border-amber text-[#241505]"
                      : "bg-panel border-panel-border text-panel-muted"
                }`}
              >
                {node.n}
              </div>
              <div className="flex flex-col">
                <h4 className="text-[13.5px] font-semibold mb-1 transition-colors duration-200 group-hover:text-white">
                  {node.label}
                </h4>
                <span className="text-[11.5px] text-panel-muted-dim transition-colors duration-200">
                  {node.sub}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
