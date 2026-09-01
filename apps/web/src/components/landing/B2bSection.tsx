"use client";

import { Users, Shield, TrendingUp, Cpu } from "lucide-react";
import Link from "next/link";

export function B2bSection() {
  return (
    <section className="py-[100px] relative z-10 overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-amber/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-[1180px] mx-auto px-8 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-[60px]">
          
          {/* Left Side: Copy */}
          <div className="flex-1 text-center lg:text-left">
            <div className="font-mono text-[12px] tracking-[0.14em] uppercase text-teal flex items-center justify-center lg:justify-start gap-[9px] mb-[14px]">
              <span className="w-[6px] h-[6px] rounded-full bg-teal shadow-[0_0_8px_var(--color-teal)] shrink-0" />
              for engineering teams
            </div>

            <h2 className="font-space text-[36px] md:text-[44px] font-bold tracking-[-0.015em] mb-6 text-panel-text leading-tight">
              Train your trainees on <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal to-amber">systems tailored</span> for your company.
            </h2>

            <p className="text-panel-muted text-[16px] leading-[1.6] mb-8 max-w-[500px] mx-auto lg:mx-0">
              Why practice on generic tutorials when you can train your team on your actual architecture? 
              Create private, multi-tenant learning paths scoped exclusively to your organization.
            </p>

            <Link
              href="/teams"
              className="inline-flex items-center gap-2 bg-panel-2 border border-panel-border text-panel-text hover:text-teal font-semibold text-[15px] px-[26px] py-[15px] rounded-xl cursor-pointer hover:bg-panel hover:border-teal/50 transition-colors shadow-lg no-underline"
            >
              Visit our B2B service
              <span className="ml-1 transition-transform group-hover:translate-x-1">&rarr;</span>
            </Link>
          </div>

          {/* Right Side: Bento Grid layout */}
          <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-6 gap-4">
            {/* Private Sandboxes Card (span 3) */}
            <div className="sm:col-span-3 bg-panel/30 backdrop-blur-md border border-panel-border rounded-xl p-6 relative overflow-hidden group hover:border-amber/40 hover:shadow-[0_12px_24px_-10px_rgba(255,157,92,0.15)] transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-amber/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="w-10 h-10 rounded-lg bg-panel-2 border border-panel-border flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110">
                <Shield className="text-amber w-5 h-5" />
              </div>
              <h3 className="font-space font-bold text-[17px] text-panel-text mb-2">Private Sandboxes</h3>
              <p className="text-panel-muted text-[13.5px] leading-[1.5]">Clone your actual production architecture into isolated environments that never leak data.</p>
            </div>

            {/* Custom Scenarios Card (span 3) */}
            <div className="sm:col-span-3 bg-panel/30 backdrop-blur-md border border-panel-border rounded-xl p-6 relative overflow-hidden group hover:border-teal/40 hover:shadow-[0_12px_24px_-10px_rgba(53,214,180,0.15)] transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-teal/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="w-10 h-10 rounded-lg bg-panel-2 border border-panel-border flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110">
                <Cpu className="text-teal w-5 h-5" />
              </div>
              <h3 className="font-space font-bold text-[17px] text-panel-text mb-2">Custom Scenarios</h3>
              <p className="text-panel-muted text-[13.5px] leading-[1.5]">Turn your past incidents and unique infra quirks into repeatable training modules.</p>
            </div>

            {/* Onboard Faster Card (span 6 or split) */}
            <div className="sm:col-span-3 bg-panel/30 backdrop-blur-md border border-panel-border rounded-xl p-6 relative overflow-hidden group hover:border-[#3b82f6]/40 hover:shadow-[0_12px_24px_-10px_rgba(59,130,246,0.15)] transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-[#3b82f6]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="w-10 h-10 rounded-lg bg-panel-2 border border-panel-border flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110">
                <Users className="text-[#3b82f6] w-5 h-5" />
              </div>
              <h3 className="font-space font-bold text-[17px] text-panel-text mb-2">Onboard Faster</h3>
              <p className="text-panel-muted text-[13.5px] leading-[1.5]">New hires break things in the sandbox instead of staging. Accelerate time-to-productivity.</p>
            </div>

            {/* Skill Analytics Card (span 3) */}
            <div className="sm:col-span-3 bg-panel/30 backdrop-blur-md border border-panel-border rounded-xl p-6 relative overflow-hidden group hover:border-[#8b5cf6]/40 hover:shadow-[0_12px_24px_-10px_rgba(139,92,246,0.15)] transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-[#8b5cf6]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="w-10 h-10 rounded-lg bg-panel-2 border border-panel-border flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110">
                <TrendingUp className="text-[#8b5cf6] w-5 h-5" />
              </div>
              <h3 className="font-space font-bold text-[17px] text-panel-text mb-2">Skill Analytics</h3>
              <p className="text-panel-muted text-[13.5px] leading-[1.5]">Track team competencies and identify knowledge gaps before they cause downtime.</p>
            </div>
          </div>
          
        </div>
      </div>
    </section>
  );
}
