"use client";

import { useEffect, useState, useRef } from "react";
import { stats } from "@/content/landing";

export function CountUp({
  num,
  prefix = "",
  suffix = "",
  decimals = 0,
  fallback,
}: {
  num?: number | undefined;
  prefix?: string | undefined;
  suffix?: string | undefined;
  decimals?: number | undefined;
  fallback: string;
}) {
  const [val, setVal] = useState(num ?? 0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasRun = useRef(false);

  useEffect(() => {
    if (num === undefined) return;
    setVal(num); // Ensure it starts loaded directly if hydration or SSR is active

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !hasRun.current) {
          hasRun.current = true;
          const duration = 2000;
          const startTime = performance.now();

          const animate = (currTime: number) => {
            const elapsed = currTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out quintic
            const easeOutQuint = 1 - Math.pow(1 - progress, 5);
            setVal(num * easeOutQuint);
            if (progress < 1) requestAnimationFrame(animate);
            else setVal(num);
          };
          requestAnimationFrame(animate);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [num]);

  if (num === undefined) return <span>{fallback}</span>;
  return (
    <span ref={ref}>
      {prefix}
      {val.toFixed(decimals)}
      {suffix}
    </span>
  );
}

export function StatsRow() {
  return (
    <section className="py-12 border-y border-panel-border relative z-10">
      <div className="stats-grid max-w-[1180px] mx-auto px-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
        {stats.map(({ value, label, num, prefix, suffix, decimals }) => (
          <div key={label}>
            <div className="font-space font-bold text-[34px] text-amber">
              <CountUp
                num={num}
                prefix={prefix}
                suffix={suffix}
                decimals={decimals}
                fallback={value}
              />
            </div>
            <div className="text-panel-muted text-[13px] mt-1.5">{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
