"use client";

import { useState } from "react";

const faqs = [
  {
    q: "Do I need Docker or local VMs running?",
    a: "Zero local setup. You get an isolated browser-based terminal connected to an ephemeral Linux instance in seconds.",
  },
  {
    q: "Can I run `rm -rf /` or trash the kernel?",
    a: "Go ahead. Every session is an isolated sandbox that gets destroyed on exit. You can't break anything except your own score.",
  },
  {
    q: "Can we use this to screen candidates?",
    a: "Yes. Stop giving trivia quizzes on leetcode—hand candidates a broken cluster and see if they can actually debug it.",
  },
  {
    q: "Do I need to be a senior SRE to use this?",
    a: "If you know basic Linux navigation, you're ready. Scenarios range from simple config blunders to brutal multi-service race conditions.",
  },
];

export function FaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section className="py-[100px] relative z-10">
      <div className="max-w-[880px] xl:max-w-[960px] mx-auto px-6 md:px-8">
        <div className="text-center mb-[50px]">
          <h2 className="font-space text-[32px] font-bold tracking-[-0.015em] mb-3">
            Frequently Asked Questions
          </h2>
          <p className="text-panel-muted text-[15.5px] leading-[1.6]">
            Everything you need to know before starting your first sandbox.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {faqs.map((faq, i) => {
            const isOpen = openIdx === i;
            return (
              <div
                key={i}
                className={`bg-panel border rounded-xl overflow-hidden transition-colors duration-300 ${isOpen ? "border-amber/50" : "border-panel-border hover:border-panel-muted"}`}
                onMouseEnter={() => setOpenIdx(i)}
                onMouseLeave={() => setOpenIdx(null)}
              >
                <button
                  onClick={() => setOpenIdx(isOpen ? null : i)}
                  className="w-full text-left px-6 py-5 flex items-center justify-between cursor-pointer focus:outline-none"
                >
                  <span
                    className={`font-space font-semibold text-[17px] ${isOpen ? "text-amber" : "text-panel-text"}`}
                  >
                    {faq.q}
                  </span>
                  <span
                    className={`text-xl transition-transform duration-300 ${isOpen ? "rotate-45 text-amber" : "text-panel-muted"}`}
                  >
                    +
                  </span>
                </button>
                <div
                  className={`px-6 overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-[200px] pb-6 opacity-100" : "max-h-0 opacity-0"}`}
                >
                  <p className="text-panel-muted text-[15px] leading-[1.6]">{faq.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
