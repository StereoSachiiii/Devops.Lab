"use client";

import { useEffect, useRef, useState } from "react";

export function ParticlesCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w: number, h: number;
    let particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      c: "a" | "b";
    }> = [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animationFrameId: number;

    function getColors() {
      const root = document.querySelector(".auth-root") || document.documentElement;
      const rootStyles = getComputedStyle(root);
      return {
        a: rootStyles.getPropertyValue("--auth-particle").trim() || "255,157,92",
        b: rootStyles.getPropertyValue("--auth-particle-2").trim() || "53,214,180",
      };
    }

    function resize() {
      w = canvas!.width = window.innerWidth;
      h = canvas!.height = window.innerHeight;
      const count = Math.min(90, Math.floor((w * h) / 16000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.4 + 0.6,
        c: Math.random() > 0.5 ? "a" : "b",
      }));
    }

    function step() {
      const colors = getColors();
      ctx!.clearRect(0, 0, w, h);
      for (const p of particles) {
        if (!p) continue;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!p) continue;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${p.c === "a" ? colors.a : colors.b},0.55)`;
        ctx!.fill();
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          if (!q) continue;
          const dx = p.x - q.x,
            dy = p.y - q.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 130) {
            ctx!.beginPath();
            ctx!.moveTo(p.x, p.y);
            ctx!.lineTo(q.x, q.y);
            ctx!.strokeStyle = `rgba(${colors.a},${0.09 * (1 - dist / 130)})`;
            ctx!.lineWidth = 1;
            ctx!.stroke();
          }
        }
      }
      if (!reduced) {
        animationFrameId = requestAnimationFrame(step);
      }
    }

    resize();
    window.addEventListener("resize", resize);
    if (!reduced) {
      animationFrameId = requestAnimationFrame(step);
    } else {
      step();
    }

    return () => {
      window.removeEventListener("resize", resize);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      id="particles"
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
    />
  );
}

export function ScrambleText({ text, className = "" }: { text: string; className?: string }) {
  const [output, setOutput] = useState(text);
  const chars = "!<>-_\\\\/[]{}—=+*^?#";
  const frameRef = useRef(0);
  const queueRef = useRef<
    Array<{ from: string; to: string; start: number; end: number; char?: string }>
  >([]);
  const requestRef = useRef<number>(null);

  const startScramble = () => {
    const oldText = output;
    const length = Math.max(oldText.length, text.length);
    queueRef.current = [];
    for (let i = 0; i < length; i++) {
      const from = oldText[i] || "";
      const to = text[i] || "";
      const start = Math.floor(Math.random() * 12);
      const end = start + Math.floor(Math.random() * 12) + 6;
      queueRef.current.push({ from, to, start, end });
    }
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    frameRef.current = 0;
    update();
  };

  const update = () => {
    let newOutput = "";
    let complete = 0;
    for (let i = 0; i < queueRef.current.length; i++) {
      const item = queueRef.current[i];
      if (!item) continue;
      const { from, to, start, end } = item;
      let { char } = item;
      if (frameRef.current >= end) {
        complete++;
        newOutput += to;
      } else if (frameRef.current >= start) {
        if (!char || Math.random() < 0.3) {
          char = chars[Math.floor(Math.random() * chars.length)] || "!";
          item.char = char;
        }
        newOutput += `<span class="dud" style="opacity:0.7; color:var(--amber)">${char}</span>`;
      } else {
        newOutput += from;
      }
    }
    setOutput(newOutput);
    if (complete === queueRef.current.length) return;
    requestRef.current = requestAnimationFrame(update);
    frameRef.current++;
  };

  return (
    <div
      className={className}
      onMouseEnter={startScramble}
      dangerouslySetInnerHTML={{ __html: output }}
    />
  );
}

export function ThemeToggle() {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const isL =
      document.documentElement.classList.contains("light") ||
      document.documentElement.getAttribute("data-theme") === "light";
    setIsLight(isL);
  }, []);

  const toggleTheme = () => {
    if (isLight) {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("devopslab-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("devopslab-theme", "light");
    }
    setIsLight(!isLight);
  };

  return (
    <div
      className="theme-toggle"
      onClick={toggleTheme}
      role="button"
      aria-label="Toggle light and dark mode"
      style={{
        position: "absolute",
        top: "24px",
        right: "24px",
        width: "50px",
        height: "26px",
        borderRadius: "13px",
        background: "var(--theme-panel-2, #10141b)",
        border: "1px solid var(--theme-panel-border, #1d232e)",
        padding: "1px",
        cursor: "pointer",
        zIndex: 50,
      }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, var(--auth-amber), #ffcb8a)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            transition: "transform .25s ease",
            color: "#241505",
            transform: isLight ? "translateX(26px)" : "translateX(0)",
          }}
        >
          {isLight ? "☀" : "☾"}
        </div>
      </div>
    </div>
  );
}
