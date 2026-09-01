// import React from "react";

const features = [
  {
    label: "Learning Style",
    video: "Passive watching / Copy-pasting",
    lab: "Active debugging & problem solving",
  },
  { label: "Environment", video: "Clean, perfect setups", lab: "Messy, production-broken systems" },
  { label: "Validation", video: "Multiple-choice quizzes", lab: "Real system-state verification" },
  {
    label: "Feedback",
    video: "Manual or non-existent",
    lab: "Instant, automated terminal grading",
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
      <div className="max-w-[1000px] mx-auto px-8">
        <div className="text-center mb-[60px]">
          <h2 className="font-space text-[32px] font-bold tracking-[-0.015em] mb-3">
            Why DevOps.lab works better.
          </h2>
          <p className="text-panel-muted text-[16px] leading-[1.6]">
            Watching someone else code doesn&apos;t build muscle memory. Debugging does.
          </p>
        </div>

        <div className="overflow-x-auto pb-8">
          <table className="w-full text-left border-separate border-spacing-0 min-w-[700px]">
            <thead>
              <tr>
                <th className="py-6 px-8 font-mono text-[12px] uppercase tracking-wider text-panel-muted-dim border-b border-panel-border/40 w-[25%]">
                  Feature
                </th>
                <th className="py-6 px-8 font-mono text-[12px] uppercase tracking-wider text-panel-muted border-b border-panel-border/40 w-[35%]">
                  Video Courses & Bootcamps
                </th>
                <th className="py-6 px-10 font-mono text-[13px] font-bold uppercase tracking-wider text-teal bg-panel rounded-t-2xl shadow-[0_-10px_30px_-15px_var(--theme-shadow)] relative z-10 w-[40%]">
                  DevOps.lab Sandboxes
                </th>
              </tr>
            </thead>
            <tbody>
              {features.map((f, i) => {
                const isLast = i === features.length - 1;
                return (
                  <tr key={f.label} className="group">
                    <td
                      className={`py-8 px-8 text-[15.5px] font-bold text-panel-text ${!isLast ? "border-b border-panel-border/30" : ""}`}
                    >
                      {f.label}
                    </td>
                    <td
                      className={`py-8 px-8 text-[14.5px] text-panel-muted opacity-70 ${!isLast ? "border-b border-panel-border/30" : ""}`}
                    >
                      {f.video}
                    </td>
                    <td
                      className={`py-8 px-10 text-[15.5px] text-panel-text font-medium bg-panel shadow-[0_10px_30px_-15px_var(--theme-shadow)] relative z-10 ${isLast ? "rounded-b-2xl" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        <CheckIcon /> {f.lab}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
