"use client";

import { useState } from "react";
import { useParticles } from "@/utils/landing";
import { Hero } from "@/components/landing/Hero";
import { StatsRow } from "@/components/landing/StatsRow";
import { BentoGrid } from "@/components/landing/BentoGrid";
import { RoadmapPreview } from "@/components/landing/RoadmapPreview";
import { Testimonials } from "@/components/landing/Testimonials";
import { FinalCta } from "@/components/landing/FinalCta";
import { FamousOutages } from "@/components/landing/FamousOutages";
import { ComparisonTable } from "@/components/landing/ComparisonTable";
import { FaqSection } from "@/components/landing/FaqSection";
import { ContributeCta } from "@/components/landing/ContributeCta";
import { B2bSection } from "@/components/landing/B2bSection";
import { FlashcardSection } from "@/components/landing/FlashcardSection";
import { QuizSection } from "@/components/landing/QuizSection";
import { TechStackSection } from "@/components/landing/TechStackSection";
import { ChallengesSection } from "@/components/landing/ChallengesSection";



export default function LandingPage() {
  const [particlesCanvas, setParticlesCanvas] = useState<HTMLCanvasElement | null>(null);
  useParticles(particlesCanvas, 16000);


  return (
    <div className="bg-bg text-panel-text font-sans overflow-x-hidden min-h-screen transition-colors duration-250">
      <canvas
        ref={setParticlesCanvas}
        className="fixed inset-0 z-0 pointer-events-none"
        style={{ width: "100vw", height: "100vh" }}
      />

      <Hero />

      <ChallengesSection />

      <StatsRow />

      <BentoGrid />

      <FamousOutages />

      <ComparisonTable />

      <RoadmapPreview />

      <QuizSection />

      <FlashcardSection />

      <TechStackSection />

      <Testimonials />

      <ContributeCta />

      <B2bSection />

      <FaqSection />

      <FinalCta />
    </div>
  );
}
