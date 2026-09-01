// import React from "react";

const testimonials = [
  {
    quote:
      '"First platform where I actually broke a sweat. Fixing a real crash loop taught me more than three Kubernetes courses combined."',
    name: "Priya N.",
    role: "Platform Engineer",
  },
  {
    quote:
      '"The grading is unforgiving in the best way. It checks the actual system state, not whether you clicked the right multiple-choice answer."',
    name: "Marcus T.",
    role: "SRE, mid-size SaaS",
  },
  {
    quote:
      '"I use the roadmap with my junior hires now. By week three they\'ve debugged more real outages than most bootcamps cover in a year."',
    name: "Dana K.",
    role: "Eng Manager",
  },
];

export function Testimonials() {
  return (
    <section className="py-[90px] pb-[110px] relative z-10">
      <div className="max-w-[1180px] mx-auto px-8">
        <div className="max-w-[600px] mb-[44px]">
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
