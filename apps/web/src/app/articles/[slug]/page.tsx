"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";
import type { Article } from "@devops/types";
import {
  ArrowLeft,
  Clock,
  Tag,
  Shield,
  Cpu,
  GitBranch,
  Terminal,
  Calendar,
  Share2,
  Heart,
  Bookmark,
  Flag,
  CheckCircle2,
  Flame,
  Check,
  X,
} from "lucide-react";

// Extended Article type with interaction fields returned by API
type ArticleWithInteractions = Article & {
  likes: number;
  saves: number;
  liked: boolean;
  saved: boolean;
};

const REPORT_REASONS = [
  "Inaccurate information",
  "Outdated content",
  "Inappropriate content",
  "Plagiarism / Copyright",
  "Other",
];

export default function ArticleDetailPage() {
  const params = useParams();
  const slug = (params && typeof params["slug"] === "string" ? params["slug"] : "") || "";

  const { data: article, isLoading, error } = useSWR<ArticleWithInteractions>(
    slug ? `/api/articles/${slug}` : null,
    () => apiClient.articles.getBySlug(slug) as Promise<ArticleWithInteractions>
  );

  // Optimistic interaction state
  const [likeCount, setLikeCount] = useState<number | null>(null);
  const [liked, setLiked] = useState<boolean | null>(null);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [likeLoading, setLikeLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Report modal state
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportDone, setReportDone] = useState(false);

  // Derive current values (optimistic overrides SWR values once set)
  const currentLikes = likeCount !== null ? likeCount : (article?.likes ?? 0);
  const currentLiked = liked !== null ? liked : (article?.liked ?? false);
  const currentSaved = saved !== null ? saved : (article?.saved ?? false);

  const handleLike = useCallback(async () => {
    if (!article || likeLoading) return;
    const prevLikes = currentLikes;
    const prevLiked = currentLiked;
    // Optimistic update
    setLiked(!prevLiked);
    setLikeCount(prevLiked ? prevLikes - 1 : prevLikes + 1);
    setLikeLoading(true);
    try {
      const res = await apiClient.post<{ likes: number; liked: boolean }>(
        `/api/articles/${article.id}/like`
      );
      setLikeCount(res.likes);
      setLiked(res.liked);
    } catch {
      // Rollback on error
      setLiked(prevLiked);
      setLikeCount(prevLikes);
    } finally {
      setLikeLoading(false);
    }
  }, [article, likeLoading, currentLikes, currentLiked]);

  const handleSave = useCallback(async () => {
    if (!article || saveLoading) return;
    const prevSaved = currentSaved;
    setSaved(!prevSaved);
    setSaveLoading(true);
    try {
      const res = await apiClient.post<{ saves: number; saved: boolean }>(
        `/api/articles/${article.id}/bookmark`
      );
      setSaved(res.saved);
    } catch {
      setSaved(prevSaved);
    } finally {
      setSaveLoading(false);
    }
  }, [article, saveLoading, currentSaved]);

  const handleShare = useCallback(async () => {
    if (typeof navigator === "undefined") return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: article?.title ?? "Article", url });
      } catch {
        /* user cancelled */
      }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    }
  }, [article]);

  const handleReport = useCallback(async () => {
    if (!article || !reportReason || reportLoading) return;
    setReportLoading(true);
    try {
      await apiClient.post(`/api/articles/${article.id}/report`, {
        reason: reportReason,
        details: reportDetails || undefined,
      });
      setReportDone(true);
      setTimeout(() => {
        setShowReport(false);
        setReportDone(false);
        setReportReason("");
        setReportDetails("");
      }, 2000);
    } catch {
      /* show error inline */
    } finally {
      setReportLoading(false);
    }
  }, [article, reportReason, reportDetails, reportLoading]);

  const getCategoryIcon = (cat?: string) => {
    if (!cat) return <Terminal size={16} className="text-teal" />;
    const c = cat.toLowerCase();
    if (c.includes("security") || c.includes("tls")) return <Shield size={16} className="text-red-auth" />;
    if (c.includes("perf") || c.includes("leak") || c.includes("cpu")) return <Cpu size={16} className="text-amber" />;
    if (c.includes("git") || c.includes("version")) return <GitBranch size={16} className="text-purple" />;
    return <Terminal size={16} className="text-teal" />;
  };

  const renderMarkdownContent = (content: string) => {
    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];

    lines.forEach((line, idx) => {
      if (line.startsWith("```")) {
        if (inCodeBlock) {
          elements.push(
            <pre
              key={`code-${idx}`}
              className="my-5 p-4 rounded-xl bg-panel-2 border border-panel-border text-emerald-400 font-mono text-xs overflow-x-auto shadow-inner"
            >
              <code>{codeBlockContent.join("\n")}</code>
            </pre>
          );
          codeBlockContent = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        return;
      }
      if (inCodeBlock) {
        codeBlockContent.push(line);
        return;
      }
      if (line.startsWith("# ")) {
        elements.push(
          <h1 key={idx} className="font-space text-2xl sm:text-3xl font-extrabold text-panel-text mt-8 mb-4 border-b border-panel-border pb-3">
            {line.replace("# ", "")}
          </h1>
        );
      } else if (line.startsWith("## ")) {
        elements.push(
          <h2 key={idx} className="font-space text-xl sm:text-2xl font-bold text-panel-text mt-7 mb-3 text-teal flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal shrink-0" />
            {line.replace("## ", "")}
          </h2>
        );
      } else if (line.startsWith("### ")) {
        elements.push(
          <h3 key={idx} className="font-space text-lg font-bold text-panel-text mt-5 mb-2">
            {line.replace("### ", "")}
          </h3>
        );
      } else if (line.startsWith("- ")) {
        elements.push(
          <li key={idx} className="ml-5 list-disc text-panel-muted text-sm sm:text-base leading-relaxed my-1 marker:text-teal">
            {line.replace("- ", "")}
          </li>
        );
      } else if (/^\d+\.\s/.test(line)) {
        elements.push(
          <li key={idx} className="ml-5 list-decimal text-panel-muted text-sm sm:text-base leading-relaxed my-1 marker:text-teal font-medium">
            {line.replace(/^\d+\.\s/, "")}
          </li>
        );
      } else if (line.trim() === "") {
        elements.push(<div key={idx} className="h-3" />);
      } else {
        elements.push(
          <p key={idx} className="text-panel-muted text-sm sm:text-base leading-relaxed my-2">
            {line}
          </p>
        );
      }
    });

    return elements;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg text-panel-text py-12 px-6 sm:px-10 max-w-4xl mx-auto">
        <div className="w-32 h-6 bg-panel-border/50 rounded mb-8 animate-pulse" />
        <div className="h-10 w-3/4 bg-panel-border/60 rounded mb-4 animate-pulse" />
        <div className="h-6 w-1/2 bg-panel-border/40 rounded mb-10 animate-pulse" />
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-4 bg-panel-border/30 rounded animate-pulse" style={{ width: `${90 - i * 8}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="min-h-screen bg-bg text-panel-text py-16 px-6 text-center max-w-xl mx-auto">
        <div className="p-8 border border-red/40 rounded-2xl bg-red/10 font-mono">
          <h2 className="text-red text-lg font-bold mb-2">Article Not Found</h2>
          <p className="text-panel-muted text-xs mb-6">
            The requested postmortem could not be retrieved from the database.
          </p>
          <Link
            href="/articles"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-panel-2 border border-panel-border text-xs text-panel-text hover:border-teal hover:text-teal transition-all"
          >
            <ArrowLeft size={14} /> Back to Articles Library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-panel-text py-12 px-4 sm:px-10">
      <div className="max-w-4xl mx-auto">

        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-panel-border/60 font-mono text-xs">
          <Link href="/articles" className="inline-flex items-center gap-2 text-panel-muted hover:text-teal transition-colors">
            <ArrowLeft size={14} /> Back to Postmortems Library
          </Link>
          <span className="px-2.5 py-1 rounded bg-panel-2 border border-panel-border text-panel-text">
            {article.badge || article.category}
          </span>
        </div>

        {/* Article Header */}
        <header className="mb-10 space-y-4">
          <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-panel-2 border border-panel-border text-teal">
              {getCategoryIcon(article.category)}
              <span>{article.category}</span>
            </span>

            {article.featured && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber/15 border border-amber/30 text-amber font-bold text-[11px]">
                <Flame size={12} />
                <span>FEATURED SRE CASE STUDY</span>
              </span>
            )}

            <span className="text-panel-muted-dim">&bull;</span>
            <span className="text-panel-muted flex items-center gap-1">
              <Clock size={12} />
              {article.readTime}
            </span>
            <span className="text-panel-muted-dim">&bull;</span>
            <span className="text-panel-muted flex items-center gap-1">
              <Calendar size={12} />
              {new Date(article.publishedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>

          <h1 className="font-space text-3xl sm:text-5xl font-black text-panel-text tracking-tight leading-tight">
            {article.title}
          </h1>

          <p className="text-panel-muted text-base sm:text-lg leading-relaxed font-sans bg-panel-2/50 border-l-4 border-teal p-4 rounded-r-xl">
            {article.summary}
          </p>

          {/* Author + Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-panel-border/60">
            {/* Author */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-teal to-blue-500 flex items-center justify-center font-space font-bold text-bg text-sm shrink-0">
                {article.authorName?.charAt(0) || "D"}
              </div>
              <div>
                <div className="font-space font-bold text-sm text-panel-text">{article.authorName}</div>
                <div className="font-mono text-xs text-panel-muted">{article.authorRole}</div>
              </div>
            </div>

            {/* Interaction Buttons */}
            <div className="flex items-center gap-2">
              {/* Like */}
              <button
                id="article-like-btn"
                onClick={handleLike}
                disabled={likeLoading}
                title={currentLiked ? "Unlike" : "Like this article"}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border font-mono text-xs font-semibold transition-all duration-200 ${
                  currentLiked
                    ? "bg-red/15 border-red/40 text-red shadow-[0_0_12px_rgba(239,68,68,0.2)]"
                    : "bg-panel-2 border-panel-border text-panel-muted hover:border-red/40 hover:text-red"
                }`}
              >
                <Heart
                  size={15}
                  className={`transition-transform duration-200 ${currentLiked ? "fill-current scale-110" : ""}`}
                />
                <span className="tabular-nums min-w-[1.5ch]">{currentLikes}</span>
              </button>

              {/* Save / Bookmark */}
              <button
                id="article-save-btn"
                onClick={handleSave}
                disabled={saveLoading}
                title={currentSaved ? "Remove from saved" : "Save article"}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border font-mono text-xs font-semibold transition-all duration-200 ${
                  currentSaved
                    ? "bg-amber/15 border-amber/40 text-amber shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                    : "bg-panel-2 border-panel-border text-panel-muted hover:border-amber/40 hover:text-amber"
                }`}
              >
                <Bookmark
                  size={15}
                  className={`transition-transform duration-200 ${currentSaved ? "fill-current" : ""}`}
                />
                <span className="hidden sm:inline">{currentSaved ? "Saved" : "Save"}</span>
              </button>

              {/* Share / Copy Link */}
              <button
                id="article-share-btn"
                onClick={handleShare}
                title="Share or copy link"
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border font-mono text-xs font-semibold transition-all duration-200 ${
                  shareCopied
                    ? "bg-teal/15 border-teal/40 text-teal"
                    : "bg-panel-2 border-panel-border text-panel-muted hover:border-teal/40 hover:text-teal"
                }`}
              >
                {shareCopied ? <Check size={15} /> : <Share2 size={15} />}
                <span className="hidden sm:inline">{shareCopied ? "Copied!" : "Share"}</span>
              </button>

              {/* Report */}
              <button
                id="article-report-btn"
                onClick={() => setShowReport(true)}
                title="Report article"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-panel-border bg-panel-2 text-panel-muted hover:border-red/30 hover:text-red font-mono text-xs transition-all duration-200"
              >
                <Flag size={14} />
              </button>
            </div>
          </div>
        </header>

        {/* Article Body */}
        <article className="bg-panel/90 border border-panel-border rounded-2xl p-6 sm:p-10 shadow-lg mb-12">
          <div className="prose prose-invert max-w-none">
            {renderMarkdownContent(article.content)}
          </div>

          {/* Tags */}
          {article.tags && article.tags.length > 0 && (
            <div className="mt-10 pt-6 border-t border-panel-border/60 flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono text-panel-muted flex items-center gap-1 mr-2">
                <Tag size={12} /> Tags:
              </span>
              {article.tags.map((t) => (
                <span
                  key={t}
                  className="px-2.5 py-1 rounded-md text-xs font-mono bg-panel-2 text-panel-text border border-panel-border"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* Bottom Interaction Row (mirrors top for long articles) */}
          <div className="mt-8 pt-6 border-t border-panel-border/60 flex items-center justify-between flex-wrap gap-3">
            <span className="font-mono text-xs text-panel-muted">
              Found this useful?
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleLike}
                disabled={likeLoading}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border font-mono text-xs font-semibold transition-all duration-200 ${
                  currentLiked
                    ? "bg-red/15 border-red/40 text-red"
                    : "bg-panel-2 border-panel-border text-panel-muted hover:border-red/40 hover:text-red"
                }`}
              >
                <Heart size={14} className={currentLiked ? "fill-current" : ""} />
                {currentLiked ? "Liked" : "Like"} · {currentLikes}
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-panel-border bg-panel-2 text-panel-muted hover:border-teal/40 hover:text-teal font-mono text-xs transition-all"
              >
                {shareCopied ? <Check size={14} /> : <Share2 size={14} />}
                {shareCopied ? "Copied!" : "Share"}
              </button>
            </div>
          </div>
        </article>

        {/* CTA */}
        <div className="bg-gradient-to-r from-panel-2 via-panel to-panel-2 border border-teal/30 rounded-2xl p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="font-space text-lg font-bold text-panel-text flex items-center gap-2 justify-center sm:justify-start">
              <CheckCircle2 className="text-teal" size={20} />
              Ready to fix this scenario live?
            </h3>
            <p className="text-panel-muted text-xs font-mono">
              Boot an ephemeral container sandbox with identical broken configs and test your troubleshooting skills.
            </p>
          </div>
          <Link
            href="/challenges"
            className="px-6 py-3 rounded-xl bg-teal text-bg font-space font-bold text-sm hover:bg-teal-hover transition-all shrink-0 shadow-[0_0_20px_rgba(20,184,166,0.3)]"
          >
            Launch Debugging Sandbox &rarr;
          </Link>
        </div>
      </div>

      {/* Report Modal */}
      {showReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowReport(false); }}
        >
          <div className="w-full max-w-md bg-panel border border-panel-border rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-space text-base font-bold text-panel-text flex items-center gap-2">
                <Flag size={16} className="text-red" />
                Report Article
              </h3>
              <button
                onClick={() => setShowReport(false)}
                className="p-1.5 rounded-lg text-panel-muted hover:text-panel-text hover:bg-panel-2 transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {reportDone ? (
              <div className="py-6 text-center space-y-2">
                <Check size={32} className="text-teal mx-auto" />
                <p className="font-space font-bold text-panel-text text-sm">Report submitted</p>
                <p className="font-mono text-xs text-panel-muted">Our editorial team will review it shortly.</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="font-mono text-xs text-panel-muted uppercase tracking-wider">Reason *</label>
                  <div className="grid grid-cols-1 gap-2">
                    {REPORT_REASONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => setReportReason(r)}
                        className={`text-left px-3 py-2.5 rounded-xl border font-mono text-xs transition-all ${
                          reportReason === r
                            ? "border-red/50 bg-red/10 text-red"
                            : "border-panel-border bg-panel-2 text-panel-muted hover:border-panel-text/30"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="font-mono text-xs text-panel-muted uppercase tracking-wider">
                    Additional details <span className="text-panel-muted-dim">(optional)</span>
                  </label>
                  <textarea
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    rows={3}
                    placeholder="Provide more context..."
                    className="w-full px-3 py-2 rounded-xl border border-panel-border bg-panel-2 text-panel-text font-mono text-xs resize-none focus:outline-none focus:border-teal/50 transition-all placeholder:text-panel-muted-dim"
                  />
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={() => setShowReport(false)}
                    className="flex-1 py-2.5 rounded-xl border border-panel-border bg-panel-2 text-panel-muted font-mono text-xs hover:text-panel-text transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    id="submit-report-btn"
                    onClick={handleReport}
                    disabled={!reportReason || reportLoading}
                    className="flex-1 py-2.5 rounded-xl bg-red/90 text-white font-space font-bold text-xs hover:bg-red transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {reportLoading ? "Submitting..." : "Submit Report"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
