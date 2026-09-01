"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const slides = [
  {
    title: "Master Real-World Infrastructure",
    subtitle: "Solve production-grade challenges in isolated sandboxes. No more basic tutorials.",
  },
  {
    title: "Zero Setup, Instant Environments",
    subtitle: "Launch full Kubernetes clusters and CI/CD pipelines in seconds with one click.",
  },
  {
    title: "Validate Skills Automatically",
    subtitle: "Our engine verifies your infrastructure state and provides instant feedback.",
  },
];

export function HeroCarousel() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative w-full h-[400px] sm:h-[500px] flex items-center justify-center overflow-hidden rounded-2xl bg-zinc-950 text-foreground shadow-2xl mb-24">
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 sm:p-16 z-10"
        >
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight font-outfit mb-6"
          >
            {slides[current]?.title}
          </motion.h1>
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="text-lg sm:text-2xl text-zinc-400 max-w-3xl font-inter font-light"
          >
            {slides[current]?.subtitle}
          </motion.p>
        </motion.div>
      </AnimatePresence>

      <div className="absolute bottom-8 flex space-x-3 z-20">
        {slides.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrent(idx)}
            className={`h-1.5 rounded-full transition-all duration-500 ease-in-out ${
              current === idx
                ? "w-12 bg-primary text-primary-foreground"
                : "w-4 bg-zinc-700 hover:bg-zinc-500"
            }`}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>

      {/* Subtle background glow effect */}
      <div className="absolute inset-0 bg-gradient-to-tr from-black via-zinc-900 to-black opacity-80 z-0" />
    </div>
  );
}
