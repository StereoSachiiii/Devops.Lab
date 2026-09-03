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
      className={`flex items-center gap-1 bg-panel-2/60 border border-panel-border/70 rounded-xl p-1 overflow-x-auto no-scrollbar ${className}`}
    >
      {options.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            id={tab.id === "description" ? "tab-description" : undefined}
            onClick={() => onChange(tab.id)}
            className={`font-sans text-[11.5px] font-medium py-1.5 px-3 rounded-lg cursor-pointer transition-all duration-200 capitalize whitespace-nowrap shrink-0 ${
              isActive
                ? "bg-panel text-panel-text font-semibold shadow-sm border border-panel-border text-amber"
                : "text-panel-muted hover:text-panel-text hover:bg-panel-2/50"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
