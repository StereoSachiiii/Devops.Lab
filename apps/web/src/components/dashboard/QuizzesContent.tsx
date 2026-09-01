"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { QuizCard } from "@/components/dashboard/QuizCard";
import { apiClient } from "@/lib/apiClient";
import type { QuizNode, QuizProgress, FlashcardDeck } from "@/lib/api-types";
import { useAuth } from "@/providers/AuthProvider";
import { AlertCircle, RefreshCw } from "lucide-react";

export function QuizzesContent() {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<QuizNode[]>([]);
  const [progressData, setProgressData] = useState<Record<string, QuizProgress>>({});
  const [flashcardDecks, setFlashcardDecks] = useState<FlashcardDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bannerCanvasRef, setBannerCanvasRef] = useState<HTMLCanvasElement | null>(null);

  // Flashcard review state
  const [activeDeck, setActiveDeck] = useState<FlashcardDeck | null>(null);
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  // Filters
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<"All" | "Not started" | "Completed">("All");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, decks] = await Promise.all([
        apiClient.quizzes.getAll(),
        apiClient.flashcards.getAll().catch(() => []),
      ]);
      setQuizzes(list || []);
      setFlashcardDecks(decks || []);

      if (user) {
        const pMap: Record<string, QuizProgress> = {};
        await Promise.all(
          (list || []).map(async (q) => {
            try {
              const p = await apiClient.quizzes.getProgress(q.slug);
              pMap[q.id] = p;
            } catch {
              // Ignore missing progress
            }
          })
        );
        setProgressData(pMap);
      }
    } catch (e) {
      console.error("Failed to load quizzes", e);
      setError("Failed to load quizzes. Please check your network connection.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Flashcards dense particles effect
  useEffect(() => {
    if (!bannerCanvasRef) return;
    const ctx = bannerCanvasRef.getContext("2d");
    if (!ctx) return;

    let w = (bannerCanvasRef.width = bannerCanvasRef.offsetWidth);
    let h = (bannerCanvasRef.height = bannerCanvasRef.offsetHeight);

    const particles: { x: number; y: number; size: number; vx: number; vy: number }[] = [];
    for (let i = 0; i < 300; i++) {
      // Very dense!
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() * 1.5 + 0.5,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
      });
    }

    let animationId: number;
    const render = () => {
      if (!ctx || !bannerCanvasRef) return;
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = "rgba(53, 214, 180, 0.4)";
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      animationId = requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      w = bannerCanvasRef.width = bannerCanvasRef.offsetWidth;
      h = bannerCanvasRef.height = bannerCanvasRef.offsetHeight;
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
    };
  }, [bannerCanvasRef]);

  // Extract unique topics from fetched quizzes
  const availableTopics = useMemo(() => {
    const topics = new Set<string>();
    quizzes.forEach((q) => {
      if (q.metadata.category) topics.add(q.metadata.category);
    });
    return Array.from(topics).sort();
  }, [quizzes]);

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const filteredQuizzes = useMemo(() => {
    return quizzes.filter((q) => {
      // Topic filter
      if (selectedTopics.length > 0 && !selectedTopics.includes(q.metadata.category)) {
        return false;
      }

      // Status filter
      if (user && selectedStatus !== "All") {
        const p = progressData[q.id];
        const isCompleted = p?.status === "Completed";

        if (selectedStatus === "Completed" && !isCompleted) return false;
        if (selectedStatus === "Not started" && isCompleted) return false;
      }

      return true;
    });
  }, [quizzes, selectedTopics, selectedStatus, progressData, user]);

  if (loading) {
    return (
      <div className="flex flex-col gap-10 px-6 py-10 max-w-6xl mx-auto animate-pulse">
        <div className="space-y-4 max-w-xl">
          <div className="w-24 h-4 bg-panel-border/60 rounded-full" />
          <div className="w-3/4 h-10 bg-panel-border/60 rounded-xl" />
          <div className="w-full h-5 bg-panel-border/40 rounded-lg" />
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-48 bg-panel border border-panel-border/60 rounded-2xl p-6 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-1/2 h-5 bg-panel-border/60 rounded" />
                <div className="w-5/6 h-4 bg-panel-border/40 rounded" />
              </div>
              <div className="w-1/3 h-4 bg-panel-border/50 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-10 px-6 max-w-lg mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="font-space font-bold text-lg text-panel-text">Could not load quizzes</h2>
        <p className="text-xs text-panel-muted font-mono">{error}</p>
        <button
          onClick={() => load()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-panel-2 border border-panel-border text-xs font-mono text-panel-text hover:border-teal transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[60px] px-6 py-10">
      {/* 1. Hero Section */}
      <section className="max-w-[800px]">
        <div className="font-mono text-xs tracking-[0.14em] uppercase text-teal flex items-center gap-2 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-teal shrink-0" />
          QUIZZES
        </div>
        <h1 className="font-space text-[42px] font-bold tracking-[-0.015em] mb-4 text-panel-text">
          Check what actually stuck.
        </h1>
        <p className="text-panel-muted text-base leading-[1.6] m-0">
          {quizzes.length} quizzes — quick, no-stakes checks tied to real challenge topics.
        </p>
      </section>

      {/* Flashcards Banner Feature */}
      {flashcardDecks.length > 0 && (
        <section className="bg-[linear-gradient(135deg,rgba(53,214,180,0.05),rgba(255,157,92,0.05))] border border-panel-border rounded-[14px] p-8 flex items-center justify-between flex-wrap gap-6 relative overflow-hidden">
          <canvas
            ref={setBannerCanvasRef}
            className="absolute inset-0 w-full h-full z-0 opacity-40 pointer-events-none"
          />
          <div className="absolute -top-[50px] -right-[50px] w-[200px] h-[200px] bg-[radial-gradient(circle,var(--color-teal)_0%,transparent_70%)] opacity-5 blur-[30px] pointer-events-none z-0" />

          <div className="flex-[1_1_300px] z-10">
            <h2 className="font-space text-[22px] font-bold m-0 mb-2 text-panel-text">
              Flashcards{" "}
              <span className="text-[14px] text-teal font-normal ml-2 border border-teal px-2 py-0.5 rounded-[20px]">
                New
              </span>
            </h2>
            <p className="text-panel-muted text-[15px] leading-[1.5] m-0 mb-5 max-w-[400px]">
              Quick recall, no scoring pressure. Swipe through key terms and commands in spare
              moments.
            </p>
            <button
              onClick={() => {
                setActiveDeck(flashcardDecks[0] || null);
                setCurrentCardIdx(0);
                setShowAnswer(false);
              }}
              className="press-feedback bg-panel-text text-bg border-none px-5 py-2.5 rounded-lg font-sans text-[14px] font-semibold cursor-pointer inline-flex items-center gap-2"
            >
              Start quick review &rarr;
            </button>
          </div>

          <div
            className="shrink-0 relative w-[160px] h-[100px] z-10 cursor-pointer"
            onClick={() => {
              setActiveDeck(flashcardDecks[0] || null);
              setCurrentCardIdx(0);
              setShowAnswer(false);
            }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="absolute inset-0 bg-panel border border-panel-border rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.2)] flex items-center justify-center p-3 text-center font-mono text-[10px]"
                style={{
                  transform: `rotate(${i * 4 - 4}deg) translate(${i * 5}px, ${i * -2}px)`,
                  transformOrigin: "bottom right",
                  opacity: 1 - i * 0.15,
                  color: i === 0 ? "var(--color-panel-text)" : "transparent",
                }}
              >
                {i === 0 && (flashcardDecks[0]?.cards?.[0]?.frontText || "Recall this fact")}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2. Lightweight filter bar */}
      <section className="flex items-center gap-6 flex-wrap p-5 bg-panel border border-panel-border rounded-[14px]">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-panel-muted uppercase tracking-[0.05em]">
            Topic
          </span>
          <div className="flex gap-2 flex-wrap">
            {availableTopics.map((topic) => {
              const active = selectedTopics.includes(topic);
              return (
                <button
                  key={topic}
                  onClick={() => toggleTopic(topic)}
                  className={`px-3 py-1.5 rounded-md font-mono text-[11px] cursor-pointer transition-all duration-200 ${
                    active
                      ? "bg-[rgba(53,214,180,0.1)] text-teal border border-teal"
                      : "bg-panel-2 text-panel-muted border border-panel-border"
                  }`}
                >
                  {topic}
                </button>
              );
            })}
          </div>
        </div>

        {user && (
          <>
            <div className="w-px h-6 bg-panel-border" />
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-panel-muted uppercase tracking-[0.05em]">
                Status
              </span>
              <div className="flex gap-2 bg-panel-2 p-1 rounded-lg border border-panel-border">
                {(["All", "Not started", "Completed"] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setSelectedStatus(status)}
                    className={`px-3 py-1.5 rounded-md font-mono text-[11px] cursor-pointer transition-all duration-200 ${
                      selectedStatus === status
                        ? "bg-panel text-panel-text border border-panel-border"
                        : "bg-transparent text-panel-muted border border-transparent"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {/* 3. Quiz Card Grid */}
      <section>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
          {filteredQuizzes.length === 0 ? (
            <div className="col-[1/-1] p-10 text-center text-panel-muted font-mono bg-panel border border-panel-border rounded-[14px]">
              No quizzes found for the selected filters.
            </div>
          ) : (
            filteredQuizzes.map((q) => (
              <QuizCard
                key={q.id}
                quiz={q}
                {...(progressData[q.id] ? { progress: progressData[q.id] } : {})}
              />
            ))
          )}
        </div>
      </section>

      {/* Flashcard Review Modal Flow */}
      {activeDeck && activeDeck.cards && activeDeck.cards.length > 0 && (
        <div className="fixed inset-0 z-[200] bg-[rgba(0,0,0,0.85)] backdrop-blur-[4px] flex flex-col items-center justify-center p-5">
          <div className="absolute top-8 right-8">
            <button
              onClick={() => setActiveDeck(null)}
              className="bg-panel-2 text-panel-muted border border-panel-border px-4 py-2 rounded-lg font-mono text-xs cursor-pointer"
            >
              Close
            </button>
          </div>

          <div className="text-panel-muted font-mono text-xs mb-6 tracking-[0.1em] uppercase">
            {activeDeck.title} — {currentCardIdx + 1} / {activeDeck.cards.length}
          </div>

          <div
            onClick={() => !showAnswer && setShowAnswer(true)}
            className={`w-full max-w-[480px] min-h-[280px] bg-panel rounded-[16px] p-10 flex flex-col items-center justify-center text-center relative transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
              showAnswer
                ? "border border-teal cursor-default shadow-[0_20px_40px_-20px_rgba(53,214,180,0.2)]"
                : "border border-panel-border cursor-pointer shadow-[0_20px_40px_-20px_rgba(0,0,0,0.6)]"
            }`}
          >
            <div
              className={`font-sans text-xl font-semibold text-panel-text leading-[1.5] ${showAnswer ? "mb-8" : "mb-0"}`}
            >
              {activeDeck.cards[currentCardIdx]?.frontText}
            </div>

            {showAnswer ? (
              <div className="animate-[fadeInUp_0.3s_ease] flex flex-col items-center gap-6 w-full">
                <div className="border-t border-dashed border-panel-border w-full pt-8 font-mono text-[15px] text-teal leading-[1.6]">
                  {activeDeck.cards[currentCardIdx]?.backText}
                </div>
                {activeDeck.cards[currentCardIdx]?.source && (
                  <div className="text-[11px] font-mono text-panel-muted">
                    Source: {activeDeck.cards[currentCardIdx]?.source}
                  </div>
                )}
              </div>
            ) : (
              <div className="absolute bottom-6 text-panel-muted font-mono text-[11px] opacity-60">
                Tap to flip
              </div>
            )}
          </div>

          <div
            className={`flex gap-4 mt-10 transition-all duration-200 ${
              showAnswer
                ? "opacity-100 pointer-events-auto translate-y-0"
                : "opacity-0 pointer-events-none translate-y-2.5"
            }`}
          >
            <button
              onClick={() => {
                if (currentCardIdx + 1 < activeDeck.cards!.length) {
                  setCurrentCardIdx((prev) => prev + 1);
                  setShowAnswer(false);
                } else setActiveDeck(null);
              }}
              className="bg-[rgba(255,107,107,0.1)] text-red border border-[rgba(255,107,107,0.3)] px-6 py-3 rounded-lg font-sans text-sm font-semibold cursor-pointer min-w-[140px]"
            >
              Still learning
            </button>
            <button
              onClick={() => {
                if (currentCardIdx + 1 < activeDeck.cards!.length) {
                  setCurrentCardIdx((prev) => prev + 1);
                  setShowAnswer(false);
                } else setActiveDeck(null);
              }}
              className="bg-[rgba(53,214,180,0.1)] text-teal border border-[rgba(53,214,180,0.3)] px-6 py-3 rounded-lg font-sans text-sm font-semibold cursor-pointer min-w-[140px]"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
