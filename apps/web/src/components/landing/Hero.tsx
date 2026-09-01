// import React from "react";
import Link from "next/link";

export function Hero() {
  return (
    <section className="pt-[100px] pb-[70px] text-center relative z-10">
      <div className="max-w-[1180px] mx-auto px-8">
        <h1 className="font-space font-bold text-[clamp(36px,5.5vw,56px)] leading-[1.08] tracking-[-0.015em] mb-5 max-w-[820px] mx-auto">
          Stop watching tutorials.
          <br />
          Start breaking <em className="not-italic text-amber">servers</em>.
        </h1>
        <p className="text-panel-muted text-[17px] max-w-[560px] mx-auto mb-8 leading-[1.6]">
          DevOps.lab drops you into a real, broken infrastructure - misconfigured nginx, locked-down
          permissions, a cron job that silently died - and grades you on the fix, not a quiz.
        </p>
        <div className="flex gap-[14px] justify-center mb-4">
          <Link
            href="/register"
            className="bg-gradient-to-br from-amber to-[#ffb877] text-[#241505] font-bold text-[15px] px-[26px] py-[13px] rounded-lg shadow-[0_10px_24px_-10px_rgba(var(--color-particle),0.45)] transition-transform hover:scale-[0.98] active:scale-95 no-underline inline-block"
          >
            Start your first sandbox &rarr;
          </Link>
          <button
            className="bg-panel-2 border border-panel-border text-panel-text font-semibold text-[15px] px-[26px] py-[13px] rounded-lg cursor-pointer hover:bg-panel transition-colors"
            onClick={() =>
              document.getElementById("challenges")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            See a challenge
          </button>
        </div>
        <div className="font-mono text-[12px] text-panel-muted-dim">
          no video lectures &middot; no slides &middot; just a terminal and a problem to solve
        </div>
      </div>
    </section>
  );
}
