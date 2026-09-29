export interface TabOption<T extends string> {
  id: T;
  label: string;
}

export function SegmentTabs<T extends string>({
  options,
  activeTab,
  onChange,
  className = "",
}: {
  options: readonly TabOption<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
  className?: string;
}) {
  return (
    <div
      className={`relative flex items-center gap-1.5 bg-[#0e1219]/90 backdrop-blur-md border border-panel-border/80 rounded-xl p-1.5 overflow-x-auto no-scrollbar shadow-inner ${className}`}
    >
      {options.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            id={tab.id === "description" ? "tab-description" : undefined}
            onClick={() => onChange(tab.id)}
            className={`group relative font-mono text-[11px] font-semibold py-1.5 px-3 rounded-lg cursor-pointer transition-all duration-200 capitalize whitespace-nowrap shrink-0 flex-1 text-center min-w-fit select-none ${
              isActive
                ? "bg-gradient-to-b from-panel-2 to-[#141923] text-panel-text shadow-[0_2px_8px_rgba(0,0,0,0.4)] border border-teal/30 text-teal"
                : "text-panel-muted hover:text-panel-text hover:bg-white/[0.04]"
            }`}
          >
            <span className="relative z-10 flex items-center justify-center gap-1.5">
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-teal shadow-[0_0_6px_rgba(53,214,180,0.8)]" />
              )}
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
