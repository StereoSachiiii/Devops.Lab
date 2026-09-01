"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";
import type { Article } from "@devops/types";
import {
  Search,
  BookOpen,
  Clock,
  Tag,
  Filter,
  Flame,
  Shield,
  Cpu,
  GitBranch,
  Terminal,
  ChevronRight,
  Sparkles,
} from "lucide-react";

const CATEGORIES = [
  { id: "all", label: "All Postmortems" },
  { id: "Postmortem", label: "Incident Postmortems" },
  { id: "Performance", label: "Performance & Leaks" },
  { id: "Security", label: "Security & TLS" },
  { id: "Configuration", label: "Configuration & Nginx" },
];

export default function ArticlesPage() {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [, startTransition] = useTransition();

  // 300ms Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(() => {
        setDebouncedQuery(searchInput);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const swrKey = `/api/articles?query=${encodeURIComponent(debouncedQuery)}&category=${selectedCategory}`;
  const { data: articles, isLoading, error } = useSWR<Article[]>(
    swrKey,
    () => apiClient.articles.getAll({ query: debouncedQuery, category: selectedCategory })
  );

  const getCategoryIcon = (cat: string) => {
    const c = cat.toLowerCase();
    if (c.includes("security") || c.includes("tls")) return <Shield size={14} className="text-red-auth" />;
    if (c.includes("perf") || c.includes("leak") || c.includes("cpu")) return <Cpu size={14} className="text-amber" />;
    if (c.includes("git") || c.includes("version")) return <GitBranch size={14} className="text-purple" />;
    return <Terminal size={14} className="text-teal" />;
  };

  return (
    <div className="min-h-screen bg-bg text-panel-text">
      {/* Header Banner */}
      <div className="border-b border-panel-border/80 bg-panel/40 backdrop-blur-md relative overflow-hidden py-14 px-6 sm:px-10">
        <div className="absolute top-0 right-0 w-[500px] h-[300px] bg-gradient-to-bl from-teal/10 via-red-auth/5 to-transparent pointer-events-none blur-3xl" />
        
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-panel-2 border border-panel-border text-teal font-mono text-xs uppercase tracking-wider mb-4">
            <Sparkles size={14} />
            <span>SRE Incident Knowledge Base</span>
          </div>

          <h1 className="font-space text-3xl sm:text-5xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-panel-text via-panel-text to-panel-muted bg-clip-text">
            Outage Postmortems & Architecture Analyses
          </h1>
          <p className="text-panel-muted text-base sm:text-lg max-w-3xl leading-relaxed">
            Real incident investigations, root cause analyses, and architectural breakdowns from production engineering disasters. Read the dissection and understand the failure patterns.
          </p>

          {/* Search & Filter Toolbar */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-panel-muted" size={18} />
              <input
                type="text"
                placeholder="Search articles by title, keywords, tags (debounced)..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-panel-2/90 border border-panel-border text-panel-text placeholder:text-panel-muted-dim font-mono text-sm focus:outline-none focus:border-teal transition-all shadow-inner"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-panel-muted hover:text-panel-text"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3.5 py-3 rounded-xl text-xs font-mono whitespace-nowrap transition-all border ${
                    selectedCategory === cat.id
                      ? "bg-teal/15 border-teal text-teal font-bold shadow-[0_0_15px_rgba(20,184,166,0.2)]"
                      : "bg-panel-2 border-panel-border text-panel-muted hover:text-panel-text hover:border-panel-border/80"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area: STACK LAYOUT */}
      <div className="max-w-5xl mx-auto px-6 sm:px-10 py-10">
        {/* Results Metadata */}
        <div className="flex items-center justify-between mb-6 text-xs font-mono text-panel-muted">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-teal" />
            <span>
              Showing {articles?.length ?? 0} article{articles?.length === 1 ? "" : "s"}
              {debouncedQuery && <span> matching &ldquo;{debouncedQuery}&rdquo;</span>}
            </span>
          </div>
          {debouncedQuery && (
            <span className="text-teal animate-pulse">Live Filter Active</span>
          )}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-panel border border-panel-border/60 rounded-2xl p-6 h-40 animate-pulse flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="w-1/3 h-5 bg-panel-border/50 rounded" />
                  <div className="w-3/4 h-4 bg-panel-border/30 rounded" />
                </div>
                <div className="w-1/4 h-3 bg-panel-border/40 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-8 border border-red/40 rounded-2xl bg-red/10 text-red font-mono text-sm text-center">
            Failed to load articles from the database. Please verify core-service is active.
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && articles && articles.length === 0 && (
          <div className="p-16 border border-dashed border-panel-border rounded-2xl text-center bg-panel/30">
            <BookOpen className="mx-auto text-panel-muted-dim mb-3" size={36} />
            <h3 className="font-space text-lg font-bold mb-1 text-panel-text">No articles found</h3>
            <p className="text-panel-muted text-sm font-mono max-w-md mx-auto">
              No postmortems matched &ldquo;{debouncedQuery}&rdquo; in category &ldquo;{selectedCategory}&rdquo;. Try clearing your query.
            </p>
            {debouncedQuery && (
              <button
                onClick={() => {
                  setSearchInput("");
                  setSelectedCategory("all");
                }}
                className="mt-5 px-4 py-2 rounded-xl bg-teal/20 border border-teal/40 text-teal text-xs font-mono hover:bg-teal/30 transition-all"
              >
                Reset Filters
              </button>
            )}
          </div>
        )}

        {/* Stack List of Articles */}
        {!isLoading && articles && articles.length > 0 && (
          <div className="flex flex-col gap-4">
            {articles.map((article) => (
              <Link
                key={article.id}
                href={`/articles/${article.slug}`}
                className="group bg-panel/80 hover:bg-panel border border-panel-border hover:border-teal/50 rounded-2xl p-6 sm:p-7 transition-all duration-200 shadow-sm hover:shadow-[0_8px_30px_rgba(0,0,0,0.35)] relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                {/* Accent glow on hover */}
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-transparent group-hover:bg-teal transition-all" />

                <div className="flex-1 space-y-3">
                  {/* Category & Badge Header */}
                  <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-panel-2 border border-panel-border text-panel-text">
                      {getCategoryIcon(article.category)}
                      <span>{article.badge || article.category}</span>
                    </span>

                    {article.featured && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber/15 border border-amber/30 text-amber text-[11px] font-bold">
                        <Flame size={12} />
                        <span>FEATURED</span>
                      </span>
                    )}

                    <span className="text-panel-muted-dim">&bull;</span>
                    <span className="text-panel-muted flex items-center gap-1">
                      <Clock size={12} />
                      {article.readTime}
                    </span>
                  </div>

                  {/* Title */}
                  <h2 className="font-space text-xl font-bold text-panel-text group-hover:text-teal transition-colors tracking-tight leading-snug">
                    {article.title}
                  </h2>

                  {/* Summary */}
                  <p className="text-panel-muted text-sm leading-relaxed line-clamp-2">
                    {article.summary}
                  </p>

                  {/* Tags & Author Footer */}
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <span className="text-xs font-mono text-panel-muted">
                      By <strong className="text-panel-text font-medium">{article.authorName}</strong> &bull; {article.authorRole}
                    </span>

                    <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                      {article.tags?.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-panel-2/70 text-panel-muted border border-panel-border/60"
                        >
                          <Tag size={10} />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Arrow CTA */}
                <div className="hidden md:flex items-center justify-center w-12 h-12 rounded-xl bg-panel-2 border border-panel-border group-hover:border-teal/50 group-hover:bg-teal/10 text-panel-muted group-hover:text-teal transition-all shrink-0">
                  <ChevronRight size={20} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
