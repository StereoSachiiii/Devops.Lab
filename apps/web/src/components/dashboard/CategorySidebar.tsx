import { CategoryIcon } from "./CategoryIcon";

interface CategorySidebarProps {
  categories: Record<string, number>;
  totalChallenges: number;
  activeCategory: string | null;
  onSelectCategory: (category: string | null) => void;
}

export function CategorySidebar({
  categories,
  totalChallenges,
  activeCategory,
  onSelectCategory,
}: CategorySidebarProps) {
  // Filter out categories with 0 count
  const activeCategories = Object.entries(categories).filter(([_, count]) => count > 0);

  return (
    <div className="flex flex-col lg:w-[240px] shrink-0">
      <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-panel-muted mb-4 px-3 font-semibold">
        Categories
      </div>

      <div className="flex lg:flex-col gap-2 lg:gap-1 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 hide-scrollbar">
        {/* All Challenges */}
        <button
          onClick={() => onSelectCategory(null)}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors whitespace-nowrap lg:whitespace-normal border-l-2 ${
            activeCategory === null
              ? "bg-panel-2 text-panel-text border-amber"
              : "text-panel-muted hover:bg-panel-2 hover:text-panel-text border-transparent"
          }`}
        >
          <div className="w-4 h-4 rounded bg-panel-3 border border-panel-border flex items-center justify-center shrink-0">
            <span className="text-[10px] text-panel-muted">All</span>
          </div>
          <span className="flex-1 font-medium">All challenges</span>
          <span className="text-xs text-panel-muted-dim">({totalChallenges})</span>
        </button>

        {/* Category List */}
        {activeCategories.map(([category, count]) => {
          const isActive = activeCategory === category;
          return (
            <button
              key={category}
              onClick={() => onSelectCategory(category)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors whitespace-nowrap lg:whitespace-normal border-l-2 ${
                isActive
                  ? "bg-panel-2 text-panel-text border-amber"
                  : "text-panel-muted hover:bg-panel-2 hover:text-panel-text border-transparent"
              }`}
            >
              <CategoryIcon
                category={category}
                size={16}
                className={isActive ? "text-amber" : "text-panel-muted"}
              />
              <span className="flex-1 font-medium">{category}</span>
              <span className="text-xs text-panel-muted-dim">({count})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
