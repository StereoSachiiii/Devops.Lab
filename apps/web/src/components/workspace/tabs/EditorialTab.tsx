import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";
import { EyebrowHeader } from "@/components/ui/EyebrowHeader";
import { Lightbulb, Sparkles } from "lucide-react";

export function EditorialTab({ challengeId }: { challengeId: string }) {
  const { data, error, isLoading } = useSWR<{
    id: string;
    title: string;
    editorial: string;
    authorNotes?: string;
    code?: string;
    canUnlock?: boolean;
  }>(challengeId ? `/api/challenges/${challengeId}/editorial` : null, () =>
    apiClient.get<{
      id: string;
      title: string;
      editorial: string;
      authorNotes?: string;
      code?: string;
      canUnlock?: boolean;
    }>(`/api/challenges/${challengeId}/editorial`)
  );

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-5 w-1/2 bg-panel-border/50 rounded" />
        <div className="h-24 bg-panel-border/30 rounded" />
        <div className="h-16 bg-panel-border/40 rounded" />
      </div>
    );
  }

  // Handle 403 Editorial Locked response or error
  const isLocked =
    (error as any)?.response?.status === 403 ||
    (error as any)?.code === "EDITORIAL_LOCKED" ||
    (error as any)?.status === 403 ||
    data?.code === "EDITORIAL_LOCKED";

  if (isLocked) {
    return (
      <div className="bg-panel-2/60 border border-panel-border/70 rounded-2xl p-6 shadow-sm text-center flex flex-col items-center justify-center gap-3 my-2">
        <div className="w-12 h-12 rounded-2xl bg-amber/10 border border-amber/30 flex items-center justify-center text-amber">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div>
          <h3 className="font-space text-sm font-bold text-panel-text mb-1">
            Editorial Solution Locked
          </h3>
          <p className="font-mono text-xs text-panel-muted max-w-sm mx-auto leading-relaxed">
            Solve and validate this challenge in the active terminal sandbox to unlock the official root-cause analysis, step-by-step fix, and SRE postmortem guide.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-panel border border-panel-border text-[11px] font-mono text-teal mt-1">
          <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
          <span>Pass all verification checks to unlock</span>
        </div>
      </div>
    );
  }

  if (error || !data || !data.editorial) {
    return (
      <div className="p-4 border border-dashed border-panel-border rounded-xl text-center text-xs font-mono text-panel-muted">
        No official editorial guide published yet for this challenge.
      </div>
    );
  }

  // Parse markdown lines
  const renderMarkdown = (text: string) => {
    return text.split("\n").map((line, idx) => {
      if (line.startsWith("# ")) {
        return (
          <h2 key={idx} className="font-space text-base font-bold text-panel-text mt-4 mb-2 pb-1 border-b border-panel-border/60">
            {line.replace("# ", "")}
          </h2>
        );
      }
      if (line.startsWith("## ")) {
        return (
          <h3 key={idx} className="font-space text-sm font-bold text-teal mt-3 mb-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-teal shrink-0" />
            {line.replace("## ", "")}
          </h3>
        );
      }
      if (line.startsWith("### ")) {
        return (
          <h4 key={idx} className="font-space text-xs font-semibold text-panel-text mt-2 mb-1">
            {line.replace("### ", "")}
          </h4>
        );
      }
      if (line.startsWith("- ")) {
        return (
          <li key={idx} className="ml-4 list-disc text-xs font-sans text-panel-muted leading-relaxed my-0.5 marker:text-teal">
            {line.replace("- ", "")}
          </li>
        );
      }
      if (/^\d+\.\s/.test(line)) {
        return (
          <li key={idx} className="ml-4 list-decimal text-xs font-sans text-panel-muted leading-relaxed my-0.5 marker:text-teal">
            {line.replace(/^\d+\.\s/, "")}
          </li>
        );
      }
      if (line.trim() === "") return <div key={idx} className="h-2" />;
      return (
        <p key={idx} className="text-xs font-sans text-panel-muted leading-relaxed my-1">
          {line}
        </p>
      );
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {data.authorNotes && (
        <div className="bg-amber/10 border border-amber/30 rounded-xl p-3 text-xs font-mono text-amber flex items-start gap-2">
          <Lightbulb size={14} className="shrink-0 mt-0.5" />
          <div>
            <strong className="block mb-0.5">Author Hint & Context:</strong>
            <span className="text-amber/90">{data.authorNotes}</span>
          </div>
        </div>
      )}

      <div className="bg-panel-2/60 border border-panel-border/70 rounded-2xl p-4 shadow-sm text-xs">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-teal" />
          <EyebrowHeader dotColor="none" className="uppercase tracking-wider text-[10.5px]">
            Official Solution Guide & Postmortem
          </EyebrowHeader>
        </div>

        <div className="prose prose-invert max-w-none text-xs">
          {renderMarkdown(data.editorial)}
        </div>
      </div>
    </div>
  );
}
