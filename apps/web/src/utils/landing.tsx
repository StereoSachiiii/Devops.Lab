"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/* ─── PARTICLES ─── */
export function useParticles(
  canvas: HTMLCanvasElement | null,
  density = 16000,
  lineDistance = 120,
  maxParticles = 80,
  hoverDensity?: number,
  hoverMaxParticles?: number
) {
  useEffect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0,
      h = 0,
      raf = 0,
      isHovered = false;
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      c: "a" | "b";
    }> = [];


    function resize(el: HTMLCanvasElement) {
      let vw: number, vh: number;
      const pos = window.getComputedStyle(el).position;
      if (pos === "fixed") {
        // Full-viewport background canvas
        vw = window.innerWidth;
        vh = window.innerHeight;
      } else {
        // In-container canvas — use offsetWidth/offsetHeight on parent (reliable unlike getBoundingClientRect)
        const p = el.parentElement;
        vw = p ? p.offsetWidth : window.innerWidth;
        vh = p ? p.offsetHeight : window.innerHeight;
      }
      el.width = vw;
      el.height = vh;
      w = vw;
      h = vh;

      const currentDensity = isHovered && hoverDensity ? hoverDensity : density;
      const currentMax = isHovered && hoverMaxParticles ? hoverMaxParticles : maxParticles;
      const count = Math.min(currentMax, Math.floor((w * h) / currentDensity));

      if (count > particles.length) {
        const added = Array.from({ length: count - particles.length }, () => ({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.85, // Increase velocity to make movement distinct
          vy: (Math.random() - 0.5) * 0.85,
          r: Math.random() * 2.2 + 0.8, // Slightly larger particles
          c: (Math.random() > 0.5 ? "a" : "b") as "a" | "b",
        }));
        particles.push(...added);
      } else if (count < particles.length) {
        particles.length = count;
      }
    }

    function step(el: HTMLCanvasElement, context: CanvasRenderingContext2D) {
      context.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!p) continue;
        context.beginPath();
        context.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        // Direct, high-contrast theme-appropriate colors
        context.fillStyle = p.c === "a" ? "rgba(255, 157, 92, 0.45)" : "rgba(53, 214, 180, 0.45)";
        context.fill();
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          if (!q) continue;
          const dx = p.x - q.x,
            dy = p.y - q.y,
            dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < lineDistance) {
            context.beginPath();
            context.moveTo(p.x, p.y);
            context.lineTo(q.x, q.y);
            context.strokeStyle = `rgba(255, 157, 92, ${0.09 * (1 - dist / lineDistance)})`;
            context.lineWidth = 1;
            context.stroke();
          }
        }
      }
      if (!reduced) raf = requestAnimationFrame(() => step(el, context));
    }

    const runResize = () => resize(canvas);

    const handleEnter = () => {
      isHovered = true;
      runResize();
    };
    const handleLeave = () => {
      isHovered = false;
      runResize();
    };
    const parent = canvas.parentElement;
    if (parent) {
      parent.addEventListener("mouseenter", handleEnter);
      parent.addEventListener("mouseleave", handleLeave);
    }

    runResize();
    window.addEventListener("resize", runResize);
    if (!reduced) raf = requestAnimationFrame(() => step(canvas, ctx));
    else step(canvas, ctx);
    return () => {
      if (parent) {
        parent.removeEventListener("mouseenter", handleEnter);
        parent.removeEventListener("mouseleave", handleLeave);
      }
      window.removeEventListener("resize", runResize);
      cancelAnimationFrame(raf);
    };
  }, [canvas, density, lineDistance, maxParticles, hoverDensity, hoverMaxParticles]);
}

/* ─── TYPEWRITER ─── */
export function useTypewriter(lines: { t: string; v: string }[], speed = 25) {
  const [visibleLines, setVisibleLines] = useState<{ t: string; v: string }[]>([]);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    setVisibleLines([]);
    setIsComplete(false);

    let currentLineIdx = 0;
    let currentCharIdx = 0;
    let timeout: NodeJS.Timeout;
    let isActive = true;

    const typeNext = () => {
      if (!isActive) return;

      if (currentLineIdx >= lines.length) {
        setIsComplete(true);
        return;
      }

      const line = lines[currentLineIdx]!;

      if (line.t === "dim") {
        currentCharIdx++;
        const currentText = line.v.substring(0, currentCharIdx);

        setVisibleLines((prev) => {
          const newLines = [...prev];
          newLines[currentLineIdx] = { t: line.t, v: currentText };
          return newLines;
        });

        if (currentCharIdx < line.v.length) {
          timeout = setTimeout(typeNext, speed + Math.random() * 20);
        } else {
          currentLineIdx++;
          currentCharIdx = 0;
          timeout = setTimeout(typeNext, 200);
        }
      } else {
        setVisibleLines((prev) => {
          const newLines = [...prev];
          newLines[currentLineIdx] = line;
          return newLines;
        });
        currentLineIdx++;
        currentCharIdx = 0;
        timeout = setTimeout(typeNext, 400);
      }
    };

    timeout = setTimeout(typeNext, 300);

    return () => {
      isActive = false;
      clearTimeout(timeout);
    };
  }, [lines, speed]);

  return { visibleLines, isComplete };
}

/* ─── SLIDER ─── */
export const SLIDES = [
  {
    title: "nginx-challenge - sandbox-7a3f",
    badge: "Web Server Troubleshooting",
    lines: [
      { t: "dim", v: "$ nginx -t" },
      { t: "err", v: 'nginx: [emerg] unknown directive "proxy_ass" line 14' },
      { t: "dim", v: "$ sed -i '14s/proxy_ass/proxy_pass/' app.conf" },
      { t: "ok", v: "✓ syntax ok - configuration test successful" },
    ],
  },
  {
    title: "linux-challenge - sandbox-9c2d",
    badge: "System Administration",
    lines: [
      { t: "dim", v: "$ ls -l app.log" },
      { t: "err", v: "-rw------- root root  (deploy has no access)" },
      { t: "dim", v: "$ chown deploy:deploy app.log && chmod 640 app.log" },
      { t: "ok", v: "✓ 4/4 checks passed - challenge complete" },
    ],
  },
  {
    title: "k8s-challenge - sandbox-2e91",
    badge: "Kubernetes Debugging",
    lines: [
      { t: "dim", v: "$ kubectl get pods" },
      { t: "err", v: "payments-api-6d4f  0/1  CrashLoopBackOff" },
      { t: "dim", v: "$ kubectl logs payments-api-6d4f | grep FATAL" },
      { t: "ok", v: "✓ root cause found - missing env secret restored" },
    ],
  },
];

export function ChallengeSlider() {
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const go = useCallback((n: number) => {
    setIdx(((n % SLIDES.length) + SLIDES.length) % SLIDES.length);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), 5000);
  }, []);

  useEffect(() => {
    go(0);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [go]);

  const slide = SLIDES[idx]!;
  const { visibleLines, isComplete } = useTypewriter(slide.lines, 20);

  return (
    <div className="relative max-w-[760px] mx-auto">
      <div className="rounded-[14px] border border-panel-border bg-panel shadow-[0_30px_60px_-25px_var(--theme-shadow)] overflow-hidden">
        <div className="flex items-center gap-2 px-3.5 py-3 bg-panel-2 border-b border-panel-border">
          <div className="w-[9px] h-[9px] rounded-full bg-[#4a3234]" />
          <div className="w-[9px] h-[9px] rounded-full bg-[#4a4530]" />
          <div className="w-[9px] h-[9px] rounded-full bg-[#2f4a3a]" />
          <span className="ml-2 font-mono text-[11.5px] text-panel-muted-dim">{slide.title}</span>
        </div>
        <div className="px-7 pt-6 pb-[30px] font-mono text-[13.5px] leading-[2] min-h-[190px]">
          {visibleLines.map((l, i) => {
            if (!l) return null;
            return (
              <div
                key={i}
                className={
                  l.t === "ok" ? "text-teal" : l.t === "err" ? "text-red-auth" : "text-[#7c9cff]"
                }
              >
                {l.v}
                {l.t === "dim" &&
                  i === visibleLines.length - 1 &&
                  slide.lines[i] &&
                  l.v.length < slide.lines[i]!.v.length && (
                    <span className="inline-block w-2 h-3.5 bg-[#7c9cff] ml-1.5 align-middle animate-[cursorBlink_1s_step-end_infinite]" />
                  )}
              </div>
            );
          })}
          {isComplete && (
            <div className="inline-block mt-4 font-mono text-[11px] px-2.5 py-1 rounded-[5px] bg-[rgba(53,214,180,0.12)] text-teal animate-[popIn_300ms_ease-out]">
              {slide.badge}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-center gap-[18px] mt-5">
        <button
          onClick={() => go(idx - 1)}
          className="w-[34px] h-[34px] rounded-full border border-panel-border bg-panel-2 text-panel-text cursor-pointer flex items-center justify-center text-[16px] hover:bg-panel transition-colors"
        >
          ‹
        </button>
        <div className="flex gap-2">
          {SLIDES.map((_, k) => (
            <button
              key={k}
              onClick={() => go(k)}
              className={`h-[7px] rounded-[4px] border-none cursor-pointer p-0 transition-all duration-200 ${
                k === idx ? "w-[20px] bg-amber" : "w-[7px] bg-panel-border hover:bg-panel-muted"
              }`}
            />
          ))}
        </div>
        <button
          onClick={() => go(idx + 1)}
          className="w-[34px] h-[34px] rounded-full border border-panel-border bg-panel-2 text-panel-text cursor-pointer flex items-center justify-center text-[16px] hover:bg-panel transition-colors"
        >
          ›
        </button>
      </div>
    </div>
  );
}

/* ─── QUIZ ─── */
export const QUIZ_OPTS = [
  { k: "A", v: "systemctl restart nginx", correct: false },
  { k: "B", v: "nginx -s reload", correct: true },
  { k: "C", v: "kill -9 $(pgrep nginx)", correct: false },
  { k: "D", v: "service nginx stop && start", correct: false },
];
export const CORRECT_MSGS = [
  "Nice - that's it.",
  "You nailed it.",
  "Correct. You're already good at this.",
  "That's the fix.",
  "Clean answer.",
];

export function QuizCard() {
  const [selected, setSelected] = useState<number | null>(null);
  const msg =
    selected !== null
      ? QUIZ_OPTS[selected]!.correct
        ? CORRECT_MSGS[Math.floor(Math.random() * CORRECT_MSGS.length)]!
        : "✗ not quite - that drops active connections"
      : "";

  return (
    <div className="max-w-[520px] mx-auto bg-panel border border-panel-border rounded-[14px] px-8 py-[30px] shadow-[0_30px_60px_-30px_var(--theme-shadow)]">
      <div className="flex justify-between items-center mb-[18px]">
        <span className="font-mono text-[11px] text-teal bg-[rgba(53,214,180,0.12)] px-[9px] py-1 rounded-[5px]">
          Networking · Q3 of 8
        </span>
        <span className="font-mono text-[11.5px] text-panel-muted">🔥 6-day streak</span>
      </div>
      <div className="text-[16.5px] font-semibold mb-5 leading-snug text-panel-text">
        Which command reloads nginx without dropping active connections?
      </div>
      {QUIZ_OPTS.map((opt, i) => {
        const state =
          selected === null ? "" : opt.correct ? "correct" : selected === i ? "wrong" : "";
        return (
          <div
            key={i}
            onClick={() => setSelected(i)}
            className={`flex items-center gap-3 px-3.5 py-3 rounded-lg mb-2.5 cursor-pointer font-mono text-[13.5px] transition-colors duration-150 border ${
              state === "correct"
                ? "border-teal bg-[rgba(53,214,180,0.08)] text-panel-text"
                : state === "wrong"
                  ? "border-red-auth bg-[rgba(255,107,107,0.08)] text-panel-text"
                  : "border-panel-border bg-transparent text-panel-text hover:bg-panel-2"
            }`}
          >
            <div
              className={`w-[22px] h-[22px] rounded-[5px] flex items-center justify-center text-[11px] shrink-0 transition-colors ${
                state === "correct"
                  ? "bg-teal text-[#04241d]"
                  : state === "wrong"
                    ? "bg-red-auth text-[#400808]"
                    : "bg-panel-2 text-panel-muted"
              }`}
            >
              {opt.k}
            </div>
            {opt.v}
          </div>
        );
      })}
      {selected !== null && (
        <div
          className={`mt-[14px] text-[12.5px] font-mono ${
            QUIZ_OPTS[selected]!.correct ? "text-teal" : "text-red-auth"
          }`}
        >
          {msg}
        </div>
      )}
    </div>
  );
}

/* ─── TECH MARQUEE ─── */
export const STACK = [
  { n: "Docker", c: "#2496ED", slug: "docker" },
  { n: "Kubernetes", c: "#326CE5", slug: "kubernetes" },
  { n: "nginx", c: "#009639", slug: "nginx" },
  { n: "PostgreSQL", c: "#4169E1", slug: "postgresql" },
  { n: "Redis", c: "#DC382D", slug: "redis" },
  { n: "Kafka", c: "#231F20", slug: "apachekafka" },
  { n: "RabbitMQ", c: "#FF6600", slug: "rabbitmq" },
  { n: "Go", c: "#00ADD8", slug: "go" },
  { n: "Node.js", c: "#5FA04E", slug: "nodedotjs" },
  { n: "Next.js", c: "#444", slug: "nextdotjs" },
  { n: "gVisor", c: "#4285F4" },
  { n: "Kong", c: "#003459", slug: "kong" },
];

export function TechMarquee() {
  const items = [...STACK, ...STACK];
  return (
    <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <div className="flex gap-4 w-max animate-[marquee-scroll_28s_linear_infinite] py-2.5 hover:[animation-play-state:paused]">
        {items.map((t, i) => (
          <div
            key={i}
            className="group relative flex items-center gap-2.5 bg-panel border border-panel-border rounded-[10px] px-5 py-3.5 whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] cursor-pointer hover:scale-110 hover:border-amber hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)] hover:z-10"
          >
            <div
              className="w-[26px] h-[26px] rounded-[6px] flex items-center justify-center font-mono text-[10.5px] font-bold text-white transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover:rotate-[15deg] group-hover:scale-110"
              style={{ background: t.c }}
            >
              {t.slug ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`https://cdn.simpleicons.org/${t.slug}/white`}
                  alt={t.n}
                  style={{ width: "14px", height: "14px" }}
                />
              ) : (
                t.n.slice(0, 2).toUpperCase()
              )}
            </div>
            <span className="text-[13.5px] font-medium text-panel-text">{t.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
