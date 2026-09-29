"use client";

import Link from "next/link";
import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";
import type { Article } from "@devops/types";
import {
  ArrowRight,
  BookOpen,
  Clock,
  AlertTriangle,
  GitBranch,
  Zap,
  ShieldAlert,
  Settings2,
  Sparkles,
} from "lucide-react";

interface CategoryTheme {
  icon: typeof GitBranch;
  iconColor: string;
  badgeBg: string;
  badgeText: string;
  topAccent: string;
  chipBg: string;
}

const getCategoryTheme = (badgeOrCat: string): CategoryTheme => {
  const b = (badgeOrCat || "").toLowerCase();
  if (b.includes("git") || b.includes("version")) {
    return {
      icon: GitBranch,
      iconColor: "text-amber",
      badgeBg: "bg-amber-dim/20 border-amber/30",
      badgeText: "text-amber",
      topAccent: "before:bg-amber",
      chipBg: "bg-amber/10 border-amber/25",
    };
  }
  if (b.includes("memory") || b.includes("performance") || b.includes("cpu") || b.includes("distributed")) {
    return {
      icon: Zap,
      iconColor: "text-teal",
      badgeBg: "bg-teal-dim/20 border-teal/30",
      badgeText: "text-teal",
      topAccent: "before:bg-teal",
      chipBg: "bg-teal/10 border-teal/25",
    };
  }
  if (b.includes("security") || b.includes("tls") || b.includes("cert")) {
    return {
      icon: ShieldAlert,
      iconColor: "text-red-auth",
      badgeBg: "bg-red-auth/15 border-red-auth/30",
      badgeText: "text-red-auth",
      topAccent: "before:bg-red-auth",
      chipBg: "bg-red-auth/10 border-red-auth/25",
    };
  }
  return {
    icon: Settings2,
    iconColor: "text-term-blue",
    badgeBg: "bg-term-blue/15 border-term-blue/30",
    badgeText: "text-term-blue",
    topAccent: "before:bg-term-blue",
    chipBg: "bg-term-blue/10 border-term-blue/25",
  };
};

export function FamousOutages() {
  const { data: articles, isLoading } = useSWR<Article[]>(
    "/api/articles?category=all",
    () => apiClient.articles.getAll()
  );

  // Content Logic: Sort by explicit trendingRank / featured flag / publication date, then slice top 5 (1 featured + 4 grid)
  const displayArticles = (() => {
    if (!articles || articles.length === 0) return [];
    const sorted = [...articles].sort((a, b) => {
      // 1. Explicit trendingRank if present (lower number = higher rank)
      if (a.trendingRank !== undefined && b.trendingRank !== undefined) {
        return a.trendingRank - b.trendingRank;
      }
      if (a.trendingRank !== undefined) return -1;
      if (b.trendingRank !== undefined) return 1;

      // 2. Featured items rank higher
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;

      // 3. Fall back to publish date descending
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
    return sorted.slice(0, 5);
  })();

  const featuredArticle = displayArticles[0];
  const secondaryArticles = displayArticles.slice(1);

  return (
    <section className="py-[100px] relative z-10">
      <div className="max-w-[1440px] xl:max-w-[1600px] 2xl:max-w-[1720px] mx-auto px-6 md:px-8 xl:px-12">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-[44px] gap-6">
          <div className="max-w-[640px]">
            <div className="font-mono text-[12px] tracking-[0.14em] uppercase text-red-auth flex items-center gap-[9px] mb-[14px]">
              <span className="w-[6px] h-[6px] rounded-full bg-red-auth shadow-[0_0_8px_rgba(255,107,107,0.6)] shrink-0" />
              real-world postmortems
            </div>
            <h2 className="font-heading text-[32px] md:text-[36px] font-bold tracking-[-0.015em] mb-3 text-panel-text">
              Fix the disasters you read about.
            </h2>
            <p className="text-panel-muted text-[15.5px] leading-[1.6]">
              Interactive postmortems and incident root-cause deep dives from real-world outages. Read the postmortem analysis, then launch the simulation.
            </p>
          </div>

          <Link
            href="/articles"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-panel-2 border border-panel-border text-panel-text hover:border-teal/50 hover:text-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal transition-all font-mono text-[13px] self-start md:self-auto group shrink-0"
          >
            <BookOpen size={16} className="text-teal" />
            <span>Browse All Articles</span>
            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* Content Area */}
        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-1 bg-panel border border-panel-border rounded-2xl p-7 h-[380px] animate-pulse flex flex-col justify-between" />
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-5">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="bg-panel border border-panel-border rounded-2xl p-6 h-[180px] animate-pulse flex flex-col justify-between"
                />
              ))}
            </div>
          </div>
        ) : displayArticles.length === 0 ? (
          <div className="p-12 border border-dashed border-panel-border rounded-2xl text-center font-mono text-sm text-panel-muted bg-panel/50">
            <AlertTriangle className="mx-auto mb-3 text-amber" size={28} />
            No postmortem articles found in database.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Visual Hierarchy: Primary Featured Postmortem Card (Spans 5 cols on lg) */}
            {featuredArticle && (() => {
              const theme = getCategoryTheme(featuredArticle.badge || featuredArticle.category);
              const IconComp = theme.icon;

              return (
                <Link
                  key={featuredArticle.slug}
                  href={`/articles/${featuredArticle.slug}`}
                  className={`lg:col-span-5 bg-panel border border-panel-border rounded-2xl p-7 relative overflow-hidden flex flex-col justify-between transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:shadow-[0_16px_32px_-12px_var(--theme-shadow)] hover:border-panel-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[3px] ${theme.topAccent} group`}
                >
                  <div>
                    {/* Top Meta Bar with Chip and Featured Pill */}
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium px-2.5 py-1 rounded-md border bg-panel-2 border-panel-border text-panel-text">
                          <span className={`w-1.5 h-1.5 rounded-full ${theme.iconColor.replace('text-', 'bg-')}`} />
                          {featuredArticle.badge || featuredArticle.category}
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-wider text-amber bg-amber-dim/20 border border-amber/30 px-2 py-0.5 rounded">
                          <Sparkles size={11} />
                          Featured
                        </span>
                      </div>

                      {/* Icon Chip */}
                      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${theme.chipBg}`}>
                        <IconComp size={18} className={theme.iconColor} />
                      </div>
                    </div>

                    {/* Headline */}
                    <h3 className="font-heading text-[20px] font-bold mb-3 text-panel-text group-hover:text-teal transition-colors leading-[1.35] line-clamp-2">
                      {featuredArticle.title}
                    </h3>

                    {/* Excerpt */}
                    <p className="text-panel-muted text-[14px] leading-[1.65] line-clamp-4 mb-6">
                      {featuredArticle.summary}
                    </p>
                  </div>

                  {/* Footer */}
                  <div className="pt-4 border-t border-panel-border/60 flex items-center justify-between font-mono text-[12px] text-panel-muted">
                    <span className="flex items-center gap-1.5 text-panel-muted-dim">
                      <Clock size={13} />
                      {featuredArticle.readTime}
                    </span>
                    <span className="text-teal font-medium flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      Read postmortem &rarr;
                    </span>
                  </div>
                </Link>
              );
            })()}

            {/* Secondary Postmortem Cards Grid (Spans 7 cols on lg, 2x2 subgrid) */}
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-5">
              {secondaryArticles.map((art) => {
                const theme = getCategoryTheme(art.badge || art.category);
                const IconComp = theme.icon;

                return (
                  <Link
                    key={art.slug}
                    href={`/articles/${art.slug}`}
                    className={`bg-panel border border-panel-border rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:shadow-[0_14px_28px_-10px_var(--theme-shadow)] hover:border-panel-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] ${theme.topAccent} group min-h-[220px]`}
                  >
                    <div>
                      {/* Top Bar */}
                      <div className="flex items-center justify-between mb-3.5">
                        <span className="font-mono text-[10.5px] font-medium text-panel-text border border-panel-border bg-panel-2 px-2.5 py-1 rounded-[5px]">
                          {art.badge || art.category}
                        </span>

                        {/* Icon Chip */}
                        <div className={`w-7 h-7 rounded-md border flex items-center justify-center shrink-0 ${theme.chipBg}`}>
                          <IconComp size={14} className={theme.iconColor} />
                        </div>
                      </div>

                      {/* Headline */}
                      <h3 className="font-mono text-[14.5px] font-semibold mb-2 text-panel-text group-hover:text-teal transition-colors leading-[1.4] line-clamp-2">
                        {art.title}
                      </h3>

                      {/* Excerpt */}
                      <p className="text-panel-muted text-[12.5px] leading-[1.6] line-clamp-2 mb-4">
                        {art.summary}
                      </p>
                    </div>

                    {/* Footer */}
                    <div className="pt-3 border-t border-panel-border/50 flex items-center justify-between font-mono text-[11px] text-panel-muted">
                      <span className="flex items-center gap-1 text-panel-muted-dim">
                        <Clock size={11} />
                        {art.readTime}
                      </span>
                      <span className="text-panel-muted group-hover:text-teal transition-colors flex items-center gap-1 font-medium">
                        Read postmortem &rarr;
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
