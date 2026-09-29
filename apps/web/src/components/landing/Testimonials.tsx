// import React from "react";

const testimonials = [
  {
    quote:
      '"No fluff. You get dropped into an SSH session with a 502 error and no clues. Exactly how real on-call feels."',
    name: "Devon K.",
    role: "Platform Engineer",
  },
  {
    quote:
      '"Most dev courses feel like watching a cooking show where you never touch the pan. Here, the kitchen is on fire from step one, and you only pass once the smoke clears."',
    name: "Sarah T.",
    role: "Site Reliability Engineer",
  },
  {
    quote:
      '"The automated grader doesn\'t care which flags you ran in bash—it checks if the daemon is actually bound to the port and serving traffic. That distinction changes everything."',
    name: "Elena R.",
    role: "Senior Systems Engineer",
  },
];

export function Testimonials() {
  return (
    <section className="py-[90px] pb-[110px] relative z-10">
      <div className="max-w-[1440px] xl:max-w-[1600px] 2xl:max-w-[1720px] mx-auto px-6 md:px-8 xl:px-12">
        <div className="max-w-[640px] mb-[44px]">
          <div className="font-mono text-[12px] tracking-[0.14em] uppercase text-teal flex items-center gap-[9px] mb-[14px]">
            <span className="w-[6px] h-[6px] rounded-full bg-teal shadow-[0_0_8px_var(--color-teal)] shrink-0" />
            from the sandbox
          </div>
          <h2 className="font-space text-[32px] font-bold tracking-[-0.015em] mb-3">
            Learners who&apos;d rather debug than watch.
          </h2>
        </div>
        <div className="t-grid grid grid-cols-1 md:grid-cols-3 gap-5">
          {testimonials.map((t) => (
            <div key={t.name} className="bg-panel border border-panel-border rounded-2xl p-[26px]">
              <p className="text-[14px] leading-[1.65] mb-[18px]">{t.quote}</p>
              <div className="flex items-center gap-2.5">
                <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-teal to-amber shrink-0" />
                <div>
                  <div className="text-[13px] font-semibold">{t.name}</div>
                  <div className="text-[12px] text-panel-muted">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
