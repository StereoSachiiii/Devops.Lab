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
      className={`flex gap-1.5 bg-bg/80 backdrop-blur-md border border-panel-border/80 rounded-xl p-1.5 shadow-inner ${className}`}
    >
      {options.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            id={tab.id === "description" ? "tab-description" : undefined}
            onClick={() => onChange(tab.id)}
            className={`flex-1 font-mono text-[11px] font-semibold py-1.5 px-2.5 rounded-lg cursor-pointer transition-all duration-200 capitalize tracking-wide ${
              isActive
                ? "bg-panel-2 text-panel-text border border-panel-border shadow-[0_2px_10px_rgba(0,0,0,0.3)] font-bold text-amber"
                : "bg-transparent text-panel-muted-dim hover:text-panel-muted border border-transparent hover:bg-panel-2/30"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
