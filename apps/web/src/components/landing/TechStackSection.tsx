"use client";

import { useState } from "react";
import { useParticles, TechMarquee } from "@/utils/landing";

export function TechStackSection() {
  const [techParticlesCanvas, setTechParticlesCanvas] = useState<HTMLCanvasElement | null>(null);
  useParticles(techParticlesCanvas, 1800, 120, 400);

  return (
    <section id="stack" className="pt-[90px] pb-[100px] relative overflow-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <canvas ref={setTechParticlesCanvas} className="block w-full h-full" />
      </div>
      <div className="max-w-[1180px] mx-auto px-8 relative z-10">
        <div className="max-w-[600px] mx-auto mb-[44px] text-center">
          <div className="font-mono text-[12px] tracking-[0.14em] uppercase text-teal flex items-center justify-center gap-[9px] mb-[14px]">
            <span className="w-[6px] h-[6px] rounded-full bg-teal shadow-[0_0_8px_var(--color-teal)] shrink-0" />
            the real stack
          </div>
          <h2 className="font-space text-[32px] font-bold tracking-[-0.015em]">
            Practice on the tools production actually runs.
          </h2>
        </div>
      </div>
      <div className="relative z-10">
        <TechMarquee />
      </div>
    </section>
  );
}
