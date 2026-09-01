import { useState } from "react";

export function FlashcardPreview() {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className="max-w-[520px] mx-auto relative perspective-[1000px] h-[260px] cursor-pointer group"
      onClick={() => setFlipped(!flipped)}
    >
      <div
        className={`w-full h-full absolute top-0 left-0 transition-transform duration-500 ease-in-out ${flipped ? "rotate-y-180" : ""}`}
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Front */}
        <div
          className="absolute w-full h-full bg-panel border border-panel-border rounded-[14px] flex flex-col items-center justify-center p-8 shadow-[0_30px_60px_-30px_var(--theme-shadow)] group-hover:border-amber transition-colors duration-300"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="absolute top-5 right-5 font-mono text-[11px] text-panel-muted bg-panel-2 px-2 py-1 rounded">
            Click to flip
          </div>
          <span className="font-mono text-[12px] text-amber mb-4 tracking-[0.1em] uppercase">
            Linux Command
          </span>
          <h3 className="font-sans text-[20px] font-semibold text-panel-text text-center leading-snug">
            What command creates a tarball of a directory?
          </h3>
        </div>

        {/* Back */}
        <div
          className="absolute w-full h-full bg-panel-2 border border-amber/30 rounded-[14px] flex flex-col items-center justify-center p-8 shadow-[0_30px_60px_-30px_rgba(255,157,92,0.1)]"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <div className="absolute top-5 right-5 font-mono text-[11px] text-amber bg-amber/10 px-2 py-1 rounded">
            Click to flip back
          </div>
          <span className="font-mono text-[12px] text-amber mb-4 tracking-[0.1em] uppercase">
            Answer
          </span>
          <code className="font-mono text-[15px] text-teal bg-panel border border-panel-border px-4 py-2 rounded-lg">
            tar -czvf archive.tar.gz /path/to/dir
          </code>
        </div>
      </div>
    </div>
  );
}

export function FlashcardSection() {
  return (
    <section
      id="flashcards"
      className="py-[100px] relative z-10 bg-[linear-gradient(180deg,var(--auth-bg),var(--auth-panel-2))] border-y border-panel-border/50"
    >
      <div className="max-w-[1180px] mx-auto px-8">
        <div className="max-w-[600px] mx-auto mb-[44px] text-center">
          <div className="font-mono text-[12px] tracking-[0.14em] uppercase text-amber flex items-center justify-center gap-[9px] mb-[14px]">
            <span className="w-[6px] h-[6px] rounded-full bg-amber shadow-[0_0_8px_var(--color-amber)] shrink-0" />
            Quick Recall
          </div>
          <h2 className="font-space text-[32px] font-bold tracking-[-0.015em] mb-3">
            Keep commands fresh.
          </h2>
          <p className="text-panel-muted text-[15px] leading-[1.6]">
            Swipe through key terms and commands in your spare moments with zero scoring pressure.
          </p>
        </div>
        <FlashcardPreview />
      </div>
    </section>
  );
}
