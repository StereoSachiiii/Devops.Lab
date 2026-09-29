// import React from "react";

const features = [
  {
    label: "Learning Style",
    video: "Copy-pasting video scripts",
    lab: "Fixing live degraded systems",
  },
  { label: "Environment", video: "Sanitized happy paths", lab: "Raw, broken production boxes" },
  { label: "Validation", video: "4-choice trivia quizzes", lab: "Live infrastructure inspection" },
  {
    label: "Feedback",
    video: "Manual or non-existent",
    lab: "Instant terminal daemon grading",
  },
];

const CheckIcon = () => (
  <svg
    className="w-[18px] h-[18px] text-teal shrink-0"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={3}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

export function ComparisonTable() {
  return (
    <section className="py-[100px] relative z-10">
      <div className="max-w-[1280px] xl:max-w-[1440px] 2xl:max-w-[1560px] mx-auto px-6 md:px-8 xl:px-12">
        <div className="text-center mb-[50px]">
          <h2 className="font-heading text-[32px] md:text-[36px] font-bold tracking-[-0.015em] mb-3 text-panel-text">
            Why DevOps.lab works better.
          </h2>
          <p className="text-panel-muted text-[16px] leading-[1.6]">
            Watching someone else code doesn&apos;t build muscle memory. Debugging does.
          </p>
        </div>

        {/* Unified Card Container that fully occludes particle background */}
        <div className="bg-panel border border-panel-border rounded-2xl p-4 md:p-6 shadow-[0_24px_48px_-15px_var(--theme-shadow)] overflow-hidden relative z-10">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-0 min-w-[680px]">
              <thead>
                <tr>
                  <th className="py-4 px-6 font-mono text-[12px] uppercase tracking-wider text-panel-muted border-b border-panel-border w-[24%] bg-panel">
                    Feature
                  </th>
                  <th className="py-4 px-6 font-mono text-[12px] uppercase tracking-wider text-panel-muted border-b border-l border-panel-border/80 w-[38%] bg-panel-2/40 rounded-tl-xl">
                    <span className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-panel-muted-dim" />
                      Video Courses & Bootcamps
                    </span>
                  </th>
                  <th className="py-4 px-8 font-mono text-[12px] font-bold uppercase tracking-wider text-teal bg-panel-2 border-l border-t border-r border-panel-border rounded-t-xl w-[38%] relative">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-teal shadow-[0_0_8px_var(--color-teal)]" />
                      DevOps.lab Sandboxes
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {features.map((f, i) => {
                  const isLast = i === features.length - 1;
                  return (
                    <tr key={f.label} className="group">
                      {/* Column 1: Feature label */}
                      <td
                        className={`py-5 px-6 text-[14.5px] font-semibold text-panel-text bg-panel ${
                          !isLast ? "border-b border-panel-border/60" : ""
                        }`}
                      >
                        {f.label}
                      </td>

                      {/* Column 2: Video Courses (Muted Old Way with comfortable contrast & card backdrop) */}
                      <td
                        className={`py-5 px-6 text-[14.5px] text-panel-muted bg-panel-2/40 border-l border-panel-border/80 ${
                          !isLast ? "border-b border-panel-border/60" : "rounded-bl-xl border-b border-panel-border/80"
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="text-red-auth font-mono text-[13px] font-bold">✕</span>
                          {f.video}
                        </span>
                      </td>

                      {/* Column 3: DevOps.lab Sandboxes (Highlighted Active Card) */}
                      <td
                        className={`py-5 px-8 text-[15px] text-panel-text font-medium bg-panel-2 border-l border-r border-panel-border ${
                          !isLast ? "border-b border-panel-border/60" : "border-b rounded-b-xl"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <CheckIcon />
                          <span className="font-semibold">{f.lab}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
