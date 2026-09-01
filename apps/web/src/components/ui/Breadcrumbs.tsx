// import React from "react";
import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center space-x-2 font-mono text-xs">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <div key={index} className="flex items-center">
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-panel-muted-dim hover:text-panel-text transition-colors duration-200 no-underline"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={`max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap ${isLast ? "text-panel-muted" : "text-panel-muted"}`}
              >
                {item.label}
              </span>
            )}

            {!isLast && <span className="text-panel-border ml-2">/</span>}
          </div>
        );
      })}
    </nav>
  );
}
