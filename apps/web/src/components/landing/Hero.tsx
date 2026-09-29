"use client";

import { Button } from "@/components/ui/Button";
import { ChallengeSlider } from "@/utils/landing";

export function Hero() {
  return (
    <section className="pt-12 md:pt-20 pb-16 relative z-10">
      <div className="max-w-[1440px] xl:max-w-[1600px] 2xl:max-w-[1720px] mx-auto px-6 md:px-8 xl:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 xl:gap-16 items-center">
          {/* LEFT COLUMN: Headline, subtext, CTAs, caption */}
          <div className="lg:col-span-6 xl:col-span-5 flex flex-col text-left">
            <h1 className="font-heading font-bold text-[clamp(32px,4vw,50px)] leading-[1.1] tracking-[-0.015em] mb-5">
              Stop watching tutorials.
              <br />
              Start breaking <em className="not-italic text-amber">servers</em>.
            </h1>
            <p className="text-panel-muted text-[16px] md:text-[17px] mb-8 leading-[1.6]">
              DevOps.lab drops you into a real, broken infrastructure (misconfigured nginx, locked-down
              permissions, a cron job that silently died) and grades you on the fix, not a quiz.
            </p>
            <div className="flex flex-wrap gap-3.5 items-center mb-5">
              <Button href="/register" variant="primary" size="lg">
                Start your first sandbox &rarr;
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() =>
                  document.getElementById("challenges")?.scrollIntoView({ behavior: "smooth" })
                }
              >
                See a challenge
              </Button>
            </div>
            <div className="font-mono text-[12px] text-panel-muted-dim leading-relaxed">
              no video lectures &middot; no slides &middot; just a terminal and a problem to solve
            </div>
          </div>

          {/* RIGHT COLUMN: Terminal Mockup Card */}
          <div className="lg:col-span-6 xl:col-span-7 w-full">
            <div id="challenges" className="w-full scroll-mt-24">
              <ChallengeSlider />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

