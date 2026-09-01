import Link from "next/link";
import { Zap, Map, Search } from "lucide-react";

export function NewUserDashboard() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-space text-panel-text font-medium">Let's get you started.</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Try today's outage */}
        <Link
          href="/challenges/today"
          className="group bg-panel border border-panel-border rounded-xl p-6 hover:border-amber transition-colors flex flex-col h-full"
        >
          <div className="w-10 h-10 rounded-lg bg-panel-2 border border-panel-border flex items-center justify-center mb-4 group-hover:border-amber/50 transition-colors">
            <Zap className="w-5 h-5 text-amber" />
          </div>
          <h3 className="font-space font-medium text-panel-text mb-2 group-hover:text-amber transition-colors">
            Try today's outage
          </h3>
          <p className="text-panel-muted text-sm leading-relaxed mb-6 flex-grow">
            Today's challenge takes about 15 minutes. No roadmap commitment, just dive in.
          </p>
          <span className="text-xs font-mono text-panel-muted group-hover:text-amber transition-colors flex items-center gap-1">
            Dive in{" "}
            <span className="transform transition-transform group-hover:translate-x-1">→</span>
          </span>
        </Link>

        {/* Card 2: Pick a roadmap */}
        <Link
          href="/roadmaps"
          className="group bg-panel border border-panel-border rounded-xl p-6 hover:border-amber transition-colors flex flex-col h-full"
        >
          <div className="w-10 h-10 rounded-lg bg-panel-2 border border-panel-border flex items-center justify-center mb-4 group-hover:border-amber/50 transition-colors">
            <Map className="w-5 h-5 text-amber" />
          </div>
          <h3 className="font-space font-medium text-panel-text mb-2 group-hover:text-amber transition-colors">
            Pick a roadmap
          </h3>
          <p className="text-panel-muted text-sm leading-relaxed mb-6 flex-grow">
            Not sure where to start? Follow a structured path from the basics up.
          </p>
          <span className="text-xs font-mono text-panel-muted group-hover:text-amber transition-colors flex items-center gap-1">
            View roadmaps{" "}
            <span className="transform transition-transform group-hover:translate-x-1">→</span>
          </span>
        </Link>

        {/* Card 3: Browse challenges */}
        <Link
          href="/challenges"
          className="group bg-panel border border-panel-border rounded-xl p-6 hover:border-amber transition-colors flex flex-col h-full"
        >
          <div className="w-10 h-10 rounded-lg bg-panel-2 border border-panel-border flex items-center justify-center mb-4 group-hover:border-amber/50 transition-colors">
            <Search className="w-5 h-5 text-amber" />
          </div>
          <h3 className="font-space font-medium text-panel-text mb-2 group-hover:text-amber transition-colors">
            Browse challenges
          </h3>
          <p className="text-panel-muted text-sm leading-relaxed mb-6 flex-grow">
            Know what you want to practice? Search the full catalog.
          </p>
          <span className="text-xs font-mono text-panel-muted group-hover:text-amber transition-colors flex items-center gap-1">
            Explore catalog{" "}
            <span className="transform transition-transform group-hover:translate-x-1">→</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
