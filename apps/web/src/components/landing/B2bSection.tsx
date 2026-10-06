"use client";

import { Users, Shield, TrendingUp, Cpu } from "lucide-react";
import Link from "next/link";

export function B2bSection() {
  return (
    <section className="py-[100px] relative z-10 overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-amber/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-[1440px] xl:max-w-[1600px] 2xl:max-w-[1720px] mx-auto px-6 md:px-8 xl:px-12 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-[60px] xl:gap-[80px]">
          
          {/* Left Side: Copy */}
          <div className="flex-1 text-center lg:text-left">
            <div className="font-mono text-[12px] tracking-[0.14em] uppercase text-teal flex items-center justify-center lg:justify-start gap-[9px] mb-[14px]">
              <span className="w-[6px] h-[6px] rounded-full bg-teal shadow-[0_0_8px_var(--color-teal)] shrink-0" />
              for engineering teams
            </div>

            <h2 className="font-space text-[36px] md:text-[44px] font-bold tracking-[-0.015em] mb-6 text-panel-text leading-tight">
              Stop onboarding on production. <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal to-amber">Break our staging</span> instead.
            </h2>

            <p className="text-panel-muted text-[16px] leading-[1.6] mb-8 max-w-[500px] mx-auto lg:mx-0">
              Handing a new hire production access after a 10-slide onboarding doc is a recipe for an outage. Simulate your actual infrastructure failures in dedicated team sandboxes.
            </p>

            <Link
              href="/teams"
              className="inline-flex items-center gap-2 bg-panel-2 border border-panel-border text-panel-text hover:text-teal font-semibold text-[15px] px-[26px] py-[15px] rounded-xl cursor-pointer hover:bg-panel hover:border-teal/50 transition-colors shadow-lg no-underline"
            >
              Set up team sandboxes &rarr;
            </Link>
          </div>

          {/* Right Side: Bento Grid layout */}
          <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Private Sandboxes Card */}
            <div className="bg-panel border border-panel-border rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_32px_-10px_var(--theme-shadow)] hover:border-amber/50 group before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[2.5px] before:bg-amber before:opacity-80">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber/5 rounded-full blur-2xl pointer-events-none group-hover:bg-amber/10 transition-colors duration-500" />
              <div>
                <div className="w-11 h-11 rounded-xl bg-amber-dim/20 border border-amber/30 flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110 shadow-sm">
                  <Shield className="text-amber w-5 h-5" />
                </div>
                <h3 className="font-heading font-bold text-[18px] text-panel-text mb-2.5 group-hover:text-amber transition-colors">
                  Private Sandboxes
                </h3>
                <p className="text-panel-muted text-[14px] leading-[1.6]">
                  Isolated cloud nodes provisioned per engineer. No shared state, no cross-contamination, and automatic lifecycle management.
                </p>
              </div>
            </div>

            {/* Custom Scenarios Card */}
            <div className="bg-panel border border-panel-border rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_32px_-10px_var(--theme-shadow)] hover:border-teal/50 group before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[2.5px] before:bg-teal before:opacity-80">
              <div className="absolute top-0 right-0 w-32 h-32 bg-teal/5 rounded-full blur-2xl pointer-events-none group-hover:bg-teal/10 transition-colors duration-500" />
              <div>
                <div className="w-11 h-11 rounded-xl bg-teal-dim/20 border border-teal/30 flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110 shadow-sm">
                  <Cpu className="text-teal w-5 h-5" />
                </div>
                <h3 className="font-heading font-bold text-[18px] text-panel-text mb-2.5 group-hover:text-teal transition-colors">
                  Custom Scenarios
                </h3>
                <p className="text-panel-muted text-[14px] leading-[1.6]">
                  Recreate your own past Sev-1 postmortems into interactive labs so new engineers never repeat the same outage in production.
                </p>
              </div>
            </div>

            {/* Onboard Faster Card */}
            <div className="bg-panel border border-panel-border rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_32px_-10px_var(--theme-shadow)] hover:border-term-blue/50 group before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[2.5px] before:bg-term-blue before:opacity-80">
              <div className="absolute top-0 right-0 w-32 h-32 bg-term-blue/5 rounded-full blur-2xl pointer-events-none group-hover:bg-term-blue/10 transition-colors duration-500" />
              <div>
                <div className="w-11 h-11 rounded-xl bg-term-blue/15 border border-term-blue/30 flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110 shadow-sm">
                  <Users className="text-term-blue w-5 h-5" />
                </div>
                <h3 className="font-heading font-bold text-[18px] text-panel-text mb-2.5 group-hover:text-term-blue transition-colors">
                  Onboard Faster
                </h3>
                <p className="text-panel-muted text-[14px] leading-[1.6]">
                  Cut time-to-first-on-call. Give engineers real terminal muscle memory and verified problem solving before they touch prod.
                </p>
              </div>
            </div>

            {/* Skill Analytics Card */}
            <div className="bg-panel border border-panel-border rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_32px_-10px_var(--theme-shadow)] hover:border-red-auth/50 group before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[2.5px] before:bg-red-auth before:opacity-80">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-auth/5 rounded-full blur-2xl pointer-events-none group-hover:bg-red-auth/10 transition-colors duration-500" />
              <div>
                <div className="w-11 h-11 rounded-xl bg-red-auth/15 border border-red-auth/30 flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110 shadow-sm">
                  <TrendingUp className="text-red-auth w-5 h-5" />
                </div>
                <h3 className="font-heading font-bold text-[18px] text-panel-text mb-2.5 group-hover:text-red-auth transition-colors">
                  Skill Analytics
                </h3>
                <p className="text-panel-muted text-[14px] leading-[1.6]">
                  Measure how engineers actually triage issues—command efficiency, time to root-cause, and real verification check accuracy.
                </p>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </section>
  );
}
