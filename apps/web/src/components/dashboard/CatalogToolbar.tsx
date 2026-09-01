import { Search, ChevronDown, Check, Grid, List, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export interface FilterOptions {
  difficulty: Record<string, number>;
  time: Record<string, number>;
  type: Record<string, number>;
}

export interface CatalogState {
  q: string;
  sort: string;
  difficulty: string[];
  time: string[];
  type: string[];
  view: "grid" | "list";
}

interface CatalogToolbarProps {
  state: CatalogState;
  onChange: (newState: Partial<CatalogState>) => void;
  options: FilterOptions;
  resultCount: number;
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      handler();
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler]);
}

const FilterDropdown = ({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Record<string, number>;
  selected: string[];
  onChange: (val: string[]) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const toggle = (opt: string) => {
    if (selected.includes(opt)) onChange(selected.filter((x) => x !== opt));
    else onChange([...selected, opt]);
  };

  const hasSelection = selected.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-[14px] py-[8px] rounded-lg text-[13px] font-sans font-medium transition-colors cursor-pointer ${
          hasSelection
            ? "bg-panel-2 border border-amber text-panel-text"
            : "bg-transparent border border-panel-border text-panel-text hover:bg-panel-2"
        }`}
      >
        {label}{" "}
        {hasSelection && (
          <span className="bg-amber text-[#000] px-1.5 py-0.5 rounded-[10px] text-[11px] font-bold">
            {selected.length}
          </span>
        )}
        <ChevronDown
          size={14}
          className={`opacity-70 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 bg-panel border border-panel-border rounded-xl shadow-[0_10px_30px_var(--theme-shadow)] min-w-[200px] max-h-[300px] overflow-y-auto z-50 p-1.5">
          {Object.entries(options).map(([opt, count]) => {
            const isSelected = selected.includes(opt);
            return (
              <div
                key={opt}
                onClick={() => toggle(opt)}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer rounded-lg font-sans text-[13px] transition-colors ${
                  isSelected
                    ? "bg-panel-2 text-panel-text"
                    : "bg-transparent text-panel-muted hover:text-panel-text"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                      isSelected ? "border-amber bg-amber" : "border-panel-border bg-transparent"
                    }`}
                  >
                    {isSelected && <Check size={10} color="#000" strokeWidth={3} />}
                  </div>
                  {opt}
                </div>
                <span className="text-[11px] font-mono opacity-60">{count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

export function CatalogToolbar({ state, onChange, options, resultCount }: CatalogToolbarProps) {
  const [localQ, setLocalQ] = useState(state.q);
  const debouncedQ = useDebounce(localQ, 300);

  useEffect(() => {
    if (debouncedQ !== state.q) {
      onChange({ q: debouncedQ });
    }
  }, [debouncedQ, state.q, onChange]);

  useEffect(() => {
    setLocalQ(state.q);
  }, [state.q]);

  const sortOptions = [
    "Recommended",
    "Newest",
    "Difficulty: Beginner → Advanced",
    "Time: Shortest → Longest",
    "Most attempted",
  ];
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  useClickOutside(sortRef, () => setSortOpen(false));

  const activeFilterCount = state.difficulty.length + state.time.length + state.type.length;
  const hasFilters = activeFilterCount > 0 || state.q !== "";
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div
      id="catalog-toolbar"
      className={`sticky top-0 z-40 bg-bg py-5 ${
        hasFilters ? "border-none" : "border-b border-panel-border"
      }`}
    >
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[300px] group">
          <Search
            size={18}
            className={`absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-300 ${isFocused ? "text-teal" : "text-panel-muted"}`}
          />
          <input
            id="catalog-search"
            type="text"
            value={localQ}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onChange={(e) => setLocalQ(e.target.value)}
            placeholder='Search challenges (e.g. "nginx", "k8s")'
            className="w-full bg-panel border border-panel-border rounded-[14px] py-[14px] pr-[50px] pl-12 text-panel-text font-sans text-[14.5px] outline-none transition-all duration-300 focus:border-teal focus:shadow-[0_0_0_4px_rgba(53,214,180,0.1)] hover:border-panel-muted-dim"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-1">
            <kbd className="hidden sm:inline-flex items-center justify-center h-6 px-2 text-[10px] font-mono font-medium text-panel-muted-dim bg-panel-2 border border-panel-border rounded uppercase">
              Ctrl K
            </kbd>
          </div>
        </div>

        <div ref={sortRef} className="relative">
          <button
            onClick={() => setSortOpen(!sortOpen)}
            className="bg-transparent border border-panel-border text-panel-text px-4 py-[11px] rounded-xl text-[13px] font-sans cursor-pointer flex items-center gap-2 hover:bg-panel-2 transition-colors"
          >
            <span className="text-panel-muted">Sort by:</span> {state.sort}
            <ChevronDown size={14} className="opacity-70" />
          </button>

          {sortOpen && (
            <div className="absolute top-full right-0 mt-2 bg-panel border border-panel-border rounded-xl shadow-[0_10px_30px_var(--theme-shadow)] min-w-[220px] z-50 p-1.5">
              {sortOptions.map((opt) => (
                <div
                  key={opt}
                  onClick={() => {
                    onChange({ sort: opt });
                    setSortOpen(false);
                  }}
                  className={`px-3.5 py-2.5 cursor-pointer rounded-lg font-sans text-[13px] transition-colors ${
                    state.sort === opt
                      ? "text-panel-text bg-panel-2"
                      : "text-panel-muted bg-transparent hover:text-panel-text"
                  }`}
                >
                  {opt}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="w-[1px] h-6 bg-panel-border" />

        <FilterDropdown
          label="Difficulty"
          options={options.difficulty}
          selected={state.difficulty}
          onChange={(v) => onChange({ difficulty: v })}
        />
        <FilterDropdown
          label="Time"
          options={options.time}
          selected={state.time}
          onChange={(v) => onChange({ time: v })}
        />
      </div>

      {hasFilters && (
        <div className="flex justify-between items-center mt-4 pb-4 border-b border-panel-border">
          <div className="flex items-center gap-2 flex-wrap">
            {state.q && (
              <div className="flex items-center gap-1.5 bg-panel-2 border border-panel-border px-2.5 py-1 rounded-full text-[12px] font-sans text-panel-text">
                <span className="text-panel-muted">Search:</span> "{state.q}"
                <button
                  onClick={() => onChange({ q: "" })}
                  className="bg-transparent border-none text-panel-muted cursor-pointer flex items-center p-0 ml-1 hover:text-panel-text transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {state.difficulty.map((d) => (
              <div
                key={d}
                className="flex items-center gap-1.5 bg-panel-2 border border-panel-border px-2.5 py-1 rounded-full text-[12px] font-sans text-panel-text"
              >
                {d}
                <button
                  onClick={() => onChange({ difficulty: state.difficulty.filter((x) => x !== d) })}
                  className="bg-transparent border-none text-panel-muted cursor-pointer flex items-center p-0 ml-1 hover:text-panel-text transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {state.time.map((t) => (
              <div
                key={t}
                className="flex items-center gap-1.5 bg-panel-2 border border-panel-border px-2.5 py-1 rounded-full text-[12px] font-sans text-panel-text"
              >
                {t}
                <button
                  onClick={() => onChange({ time: state.time.filter((x) => x !== t) })}
                  className="bg-transparent border-none text-panel-muted cursor-pointer flex items-center p-0 ml-1 hover:text-panel-text transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {state.type.map((t) => (
              <div
                key={t}
                className="flex items-center gap-1.5 bg-panel-2 border border-panel-border px-2.5 py-1 rounded-full text-[12px] font-sans text-panel-text"
              >
                {t}
                <button
                  onClick={() => onChange({ type: state.type.filter((x) => x !== t) })}
                  className="bg-transparent border-none text-panel-muted cursor-pointer flex items-center p-0 ml-1 hover:text-panel-text transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}

            {(activeFilterCount > 0 || state.q) && (
              <button
                onClick={() => onChange({ q: "", difficulty: [], time: [], type: [] })}
                className="bg-transparent border-none text-panel-muted text-[12px] font-sans cursor-pointer ml-2 underline underline-offset-4 hover:text-panel-text transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`flex justify-between items-center ${hasFilters ? "mt-4" : "mt-6"}`}>
        <div className="font-mono text-[13px] text-panel-muted">{resultCount} challenges match</div>
        <div className="flex bg-panel-2 border border-panel-border rounded-lg p-0.5">
          <button
            onClick={() => onChange({ view: "grid" })}
            className={`border-none p-1.5 rounded-md cursor-pointer transition-all duration-200 ${
              state.view === "grid"
                ? "bg-panel text-amber shadow-[0_2px_8px_var(--theme-shadow)]"
                : "bg-transparent text-panel-muted hover:text-panel-text"
            }`}
          >
            <Grid size={16} />
          </button>
          <button
            onClick={() => onChange({ view: "list" })}
            className={`border-none p-1.5 rounded-md cursor-pointer transition-all duration-200 ${
              state.view === "list"
                ? "bg-panel text-amber shadow-[0_2px_8px_var(--theme-shadow)]"
                : "bg-transparent text-panel-muted hover:text-panel-text"
            }`}
          >
            <List size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
