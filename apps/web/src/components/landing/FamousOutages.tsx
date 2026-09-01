"use client";

import Link from "next/link";
import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";
import type { Article } from "@devops/types";
import { ArrowRight, BookOpen, Clock, AlertTriangle } from "lucide-react";

export function FamousOutages() {
  const { data: articles, isLoading } = useSWR<Article[]>(
    "/api/articles?category=all",
    () => apiClient.articles.getAll()
  );

  const displayArticles = (articles && articles.length > 0) ? articles.slice(0, 4) : [];

  const getIcon = (badge: string) => {
    const b = badge.toLowerCase();
    if (b.includes("git") || b.includes("version")) return "⎇";
    if (b.includes("memory") || b.includes("performance") || b.includes("cpu")) return "⚡";
    if (b.includes("security") || b.includes("tls") || b.includes("cert")) return "🔒";
    return "⚙";
  };

  return (
    <section className="py-[100px] relative z-10">
      <div className="max-w-[1180px] mx-auto px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-[44px] gap-6">
          <div className="max-w-[640px]">
            <div className="font-mono text-[12px] tracking-[0.14em] uppercase text-red-auth flex items-center gap-[9px] mb-[14px]">
              <span className="w-[6px] h-[6px] rounded-full bg-red-auth shadow-[0_0_8px_rgba(255,107,107,0.6)] shrink-0" />
              real-world postmortems
            </div>
            <h2 className="font-space text-[32px] font-bold tracking-[-0.015em] mb-3 text-panel-text">
              Fix the disasters you read about.
            </h2>
            <p className="text-panel-muted text-[15.5px] leading-[1.6]">
              Interactive postmortems and incident root-cause deep dives from real-world outages. Read the postmortem analysis, then launch the simulation.
            </p>
          </div>

          <Link
            href="/articles"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-panel-2 border border-panel-border text-panel-text hover:border-teal/50 hover:text-teal transition-all font-mono text-[13px] self-start md:self-auto group shrink-0"
          >
            <BookOpen size={16} className="text-teal" />
            <span>Browse All Articles</span>
            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[18px]">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="bg-panel border border-panel-border rounded-2xl p-[26px] h-[260px] animate-pulse flex flex-col justify-between"
              >
                <div className="w-20 h-6 bg-panel-border/50 rounded" />
                <div className="space-y-2">
                  <div className="w-3/4 h-5 bg-panel-border/60 rounded" />
                  <div className="w-full h-12 bg-panel-border/30 rounded" />
                </div>
                <div className="w-28 h-4 bg-panel-border/40 rounded" />
              </div>
            ))}
          </div>
        ) : displayArticles.length === 0 ? (
          <div className="p-8 border border-dashed border-panel-border rounded-2xl text-center font-mono text-sm text-panel-muted">
            <AlertTriangle className="mx-auto mb-2 text-amber" size={24} />
            No postmortem articles found in database.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[18px]">
            {displayArticles.map((art) => (
              <Link
                key={art.slug}
                href={`/articles/${art.slug}`}
                className="bg-panel border border-panel-border rounded-2xl p-[26px] relative overflow-hidden transition-all duration-300 hover:border-red-auth/50 hover:shadow-[0_10px_30px_-15px_rgba(255,107,107,0.2)] group flex flex-col"
              >
                <div
                  className="absolute inset-0 pointer-events-none transition-opacity duration-500 opacity-0 group-hover:opacity-100"
                  style={{
                    background:
                      "radial-gradient(300px 200px at 50% 0%, rgba(255,107,107,0.06), transparent 70%)",
                  }}
                />

                <div className="flex items-center justify-between mb-5 relative z-10">
                  <span className="font-mono text-[10.5px] text-panel-text border border-panel-border bg-panel-2 px-2.5 py-1.5 rounded-[5px]">
                    {art.badge || art.category}
                  </span>
                  <span className="text-panel-muted text-lg group-hover:text-red-auth transition-colors duration-300">
                    {getIcon(art.badge || art.category)}
                  </span>
                </div>

                <h3 className="font-mono text-[16px] font-semibold mb-3 text-panel-text group-hover:text-red-auth transition-colors duration-300 relative z-10 flex items-start gap-2 line-clamp-2">
                  <span className="text-red-auth/60 mt-[1px]">{">"}</span>
                  {art.title}
                </h3>

                <p className="text-panel-muted text-[13px] leading-[1.6] mb-6 flex-grow relative z-10 line-clamp-3">
                  {art.summary}
                </p>

                <div className="mt-auto pt-3 border-t border-panel-border/50 flex items-center justify-between font-mono text-[11px] text-panel-muted-dim relative z-10">
                  <span className="flex items-center gap-1.5">
                    <Clock size={12} className="text-panel-muted" />
                    {art.readTime}
                  </span>
                  <span className="group-hover:text-teal transition-colors flex items-center gap-1 text-panel-muted">
                    Read postmortem &rarr;
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
