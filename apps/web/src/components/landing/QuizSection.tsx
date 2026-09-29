// import React from "react";
import { QuizCard } from "@/utils/landing";

export function QuizSection() {
  return (
    <section id="quiz" className="py-[100px] relative z-10">
      <div className="max-w-[1440px] xl:max-w-[1600px] 2xl:max-w-[1720px] mx-auto px-6 md:px-8 xl:px-12">
        <div className="max-w-[640px] mx-auto mb-[44px] text-center">
          <div className="font-mono text-[12px] tracking-[0.14em] uppercase text-teal flex items-center justify-center gap-[9px] mb-[14px]">
            <span className="w-[6px] h-[6px] rounded-full bg-teal shadow-[0_0_8px_var(--color-teal)] shrink-0" />
            knowledge checks
          </div>
          <h2 className="font-space text-[32px] font-bold tracking-[-0.015em] mb-3">
            Validate your mental model.
          </h2>
        </div>
        <QuizCard />
      </div>
    </section>
  );
}
