import { Lightbulb, ChevronDown, ChevronUp } from "lucide-react";

const HINTS = [
  "Look carefully at every line ending - shell configs require exact syntax.",
  "Check which port the server is supposed to listen on vs. what's configured.",
  "After editing the config, always test with the tool's built-in syntax checker before restarting the service.",
];

export function HintsTab({
  hintsRevealed,
  setHintsRevealed,
}: {
  hintsRevealed: boolean[];
  setHintsRevealed: React.Dispatch<React.SetStateAction<boolean[]>>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 mb-1.5 font-mono text-[11px] text-panel-muted-dim leading-[1.6]">
        Reveal hints one at a time. Try on your own first!
      </p>
      {HINTS.map((hint, i) => (
        <div
          key={i}
          className={`border rounded-[10px] overflow-hidden transition-colors duration-300 ${
            hintsRevealed[i]
              ? "border-amber/30 bg-[rgba(255,157,92,0.08)]"
              : "border-panel-border bg-panel"
          }`}
        >
          <button
            onClick={() =>
              setHintsRevealed((prev) => {
                const n = [...prev];
                n[i] = !n[i];
                return n;
              })
            }
            className={`w-full flex items-center justify-between py-2.5 px-3 bg-transparent border-none cursor-pointer font-mono text-[11px] font-semibold transition-colors duration-200 ${
              hintsRevealed[i] ? "text-amber" : "text-panel-muted hover:text-panel-text"
            }`}
          >
            <div className="flex items-center gap-[7px]">
              <Lightbulb
                size={12}
                className={hintsRevealed[i] ? "text-amber" : "text-panel-muted-dim"}
              />
              Hint {i + 1}
            </div>
            {hintsRevealed[i] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {hintsRevealed[i] && (
            <div className="px-3 pb-3 pt-2.5 font-mono text-[11px] text-panel-muted leading-[1.7] border-t border-amber/25">
              {hint}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
