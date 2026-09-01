"use client";

import { useState } from "react";

const faqs = [
  {
    q: "Do I need to install anything?",
    a: "No. Everything runs directly in your browser via a secure, isolated container. No messy local environment setups.",
  },
  {
    q: "Is it safe to run destructive commands?",
    a: "Yes. Sandboxes are completely isolated using gVisor. You can rm -rf / or drop databases without any risk to your own machine or our infrastructure.",
  },
  {
    q: "Can I use this for team hiring?",
    a: "Yes. We offer custom team roadmaps and skill tracking for engineering managers looking to evaluate candidates with real-world scenarios.",
  },
  {
    q: "What skill level is required?",
    a: "We offer paths starting from absolute Linux basics up to advanced multi-cluster Kubernetes debugging. You choose where to start.",
  },
];

export function FaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section className="py-[100px] relative z-10">
      <div className="max-w-[800px] mx-auto px-8">
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
