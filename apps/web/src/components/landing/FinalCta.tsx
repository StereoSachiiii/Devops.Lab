// import React from "react";
import Link from "next/link";

export function FinalCta() {
  return (
    <section className="py-[100px] text-center relative z-10">
      <div className="max-w-[1180px] mx-auto px-8">
        <h2 className="font-space text-[34px] font-bold tracking-[-0.015em] mb-[14px]">
          Your next outage is a practice run.
        </h2>
        <p className="text-panel-muted mb-7">
          Create an account and get your first sandbox in under a minute.
        </p>
        <Link
          href="/register"
          className="bg-gradient-to-br from-amber to-[#ffb877] text-[#241505] font-bold text-[15px] px-[26px] py-[13px] rounded-lg shadow-[0_10px_24px_-10px_rgba(var(--color-particle),0.45)] transition-transform hover:scale-[0.98] active:scale-95 no-underline inline-block"
        >
          Create free account
        </Link>
      </div>
    </section>
  );
}
