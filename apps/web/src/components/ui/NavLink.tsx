import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function NavLink({ href, children, className = "", onClick }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === "/" : pathname?.startsWith(href);

  const linkProps = onClick ? { onClick } : {};

  return (
    <Link
      href={href}
      {...linkProps}
      className={`group relative py-1 text-[14px] no-underline transition-colors duration-150 ${
        isActive
          ? "text-amber font-semibold"
          : "text-panel-muted hover:text-panel-text font-medium"
      } ${className}`}
    >
      {children}
      <span
        className={`absolute bottom-0 left-0 h-[2px] rounded-full transition-all duration-200 ease-out ${
          isActive
            ? "w-full bg-amber"
            : "w-0 bg-panel-border group-hover:w-full group-hover:bg-panel-muted-dim"
        }`}
      />
    </Link>
  );
}

