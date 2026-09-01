"use client";

import { useState } from "react";
import { bentoCards } from "@/content/landing";
import { useParticles } from "@/utils/landing";

export function BentoGrid() {
  const [c1, setC1] = useState<HTMLCanvasElement | null>(null);
  const [c2, setC2] = useState<HTMLCanvasElement | null>(null);
  const [c3, setC3] = useState<HTMLCanvasElement | null>(null);
  const [c4, setC4] = useState<HTMLCanvasElement | null>(null);

  // Higher base density (1500, max 200), and 2x that on hover (750, max 400)
  useParticles(c1, 1500, 60, 200, 750, 400);
  useParticles(c2, 1500, 60, 200, 750, 400);
  useParticles(c3, 1500, 60, 200, 750, 400);
  useParticles(c4, 1500, 60, 200, 750, 400);

  return (
    <section className="py-[100px] relative z-10">
      <div className="max-w-[1180px] mx-auto px-8">
        <div className="max-w-[600px] mb-[44px]">
          <div className="font-mono text-[12px] tracking-[0.14em] uppercase text-teal flex items-center gap-[9px] mb-[14px]">
            <span className="w-[6px] h-[6px] rounded-full bg-teal shadow-[0_0_8px_var(--color-teal)] shrink-0" />
            how you&apos;ll learn
          </div>
          <h2 className="font-space text-[32px] font-bold tracking-[-0.015em] mb-3">
            Everything you need, nothing you don&apos;t.
          </h2>
          <p className="text-panel-muted text-[15.5px] leading-[1.6]">
            Real environments, structured paths, and a way to check what you actually know -
            designed to work on their own or together.
          </p>
        </div>

        <div className="bento-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr] auto-rows-[minmax(210px,auto)] lg:auto-rows-auto lg:grid-rows-[repeat(2,210px)] gap-[18px]">
          {/* Bento 1 - full height */}
          <div className="bg-panel border border-panel-border rounded-2xl p-[26px] relative overflow-hidden transition-colors md:col-span-2 lg:col-[1/2] lg:row-[1/3] flex flex-col group hover:border-amber/60">
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: bentoCards[0]!.accentGradient }}
            />
            <canvas
              ref={setC1}
              className="absolute inset-0 z-0 pointer-events-none w-full h-full opacity-60 group-hover:opacity-100 transition-opacity duration-500"
            />

            <h3 className="font-space text-[19px] font-semibold mb-2 relative z-10">
              {bentoCards[0]!.title}
            </h3>
            <p className="text-panel-muted text-[13.5px] leading-[1.55] relative z-10">
              {bentoCards[0]!.description}
            </p>
            <div className="mt-auto relative z-10 font-mono text-[11.5px] bg-[#07090c] border border-panel-border rounded-lg py-3 px-3.5 text-[#7c9cff]">
              $ systemctl status nginx
              <br />
              <span className="text-teal">● active (running) - validated</span>
            </div>
          </div>

          {/* Bento 2 */}
          <div className="bg-panel border border-panel-border rounded-2xl p-[26px] relative overflow-hidden transition-colors md:col-span-1 lg:col-[2/3] lg:row-[1/2] flex flex-col group hover:border-amber/60">
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: bentoCards[1]!.accentGradient }}
            />
            <canvas
              ref={setC2}
              className="absolute inset-0 z-0 pointer-events-none w-full h-full opacity-60 group-hover:opacity-100 transition-opacity duration-500"
            />

            <h3 className="font-space text-[19px] font-semibold mb-2 relative z-10">
              {bentoCards[1]!.title}
            </h3>
            <p className="text-panel-muted text-[13.5px] leading-[1.55] relative z-10">
              {bentoCards[1]!.description}
            </p>
            <div className="relative z-10 flex gap-2 flex-wrap mt-auto">
              {bentoCards[1]!.tags?.map((t) => (
                <span
                  key={t}
                  className="font-mono text-[10.5px] py-1 px-[9px] rounded-[5px] bg-panel-2 border border-panel-border text-panel-muted"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Bento 3 */}
          <div className="bg-panel border border-panel-border rounded-2xl p-[26px] relative overflow-hidden transition-colors md:col-span-1 lg:col-[3/4] lg:row-[1/2] flex flex-col group hover:border-amber/60">
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: bentoCards[2]!.accentGradient }}
            />
            <canvas
              ref={setC3}
              className="absolute inset-0 z-0 pointer-events-none w-full h-full opacity-60 group-hover:opacity-100 transition-opacity duration-500"
            />

            <h3 className="font-space text-[19px] font-semibold mb-2 relative z-10">
              {bentoCards[2]!.title}
            </h3>
            <p className="text-panel-muted text-[13.5px] leading-[1.55] relative z-10">
              {bentoCards[2]!.description}
            </p>
            <div className="relative z-10 flex gap-2 mt-auto flex-wrap">
              {bentoCards[2]!.tags?.map((t) => (
                <span
                  key={t}
                  className="font-mono text-[10.5px] py-1 px-[9px] rounded-[5px] bg-panel-2 border border-panel-border text-panel-muted"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Bento 4 */}
          <div className="bg-panel border border-panel-border rounded-2xl p-[26px] relative overflow-hidden transition-colors md:col-span-2 lg:col-[2/4] lg:row-[2/3] flex flex-col group hover:border-amber/60">
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: bentoCards[3]!.accentGradient }}
            />
            <canvas
              ref={setC4}
              className="absolute inset-0 z-0 pointer-events-none w-full h-full opacity-60 group-hover:opacity-100 transition-opacity duration-500"
            />

            <h3 className="font-space text-[19px] font-semibold mb-2 relative z-10">
              {bentoCards[3]!.title}
            </h3>
            <p className="text-panel-muted text-[13.5px] leading-[1.55] relative z-10">
              {bentoCards[3]!.description}
            </p>
            <div className="relative z-10 flex gap-2 flex-wrap mt-auto">
              {["Terminal-native", "Zero manual review", "Live logs"].map((t) => (
                <span
                  key={t}
                  className="font-mono text-[10.5px] py-1 px-[9px] rounded-[5px] bg-panel-2 border border-panel-border text-panel-muted"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
