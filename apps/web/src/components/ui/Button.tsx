import React, { forwardRef } from "react";
import Link from "next/link";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  href?: string;
  asExternal?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className = "",
    variant = "primary",
    size = "md",
    href,
    asExternal = false,
    disabled,
    ...props
  },
  ref
) {
  const sizeStyles = {
    sm: "text-[13px] px-3.5 py-1.5 rounded-lg",
    md: "text-[14px] px-[18px] py-[9px] rounded-lg",
    lg: "text-[15px] px-[26px] py-[13px] rounded-lg",
  }[size];

  const variantStyles = {
    primary:
      "bg-gradient-to-br from-amber to-amber-gradient-end text-btn-dark-text font-bold shadow-[0_10px_24px_-10px_rgba(var(--color-particle),0.45)] hover:scale-[0.98] active:scale-95 border-none",
    secondary:
      "bg-panel-2 border border-panel-border text-panel-text font-semibold hover:bg-panel hover:border-panel-muted active:scale-95",
    outline:
      "bg-transparent border border-panel-border text-panel-text font-semibold hover:bg-panel-2 hover:border-amber hover:text-amber active:scale-95",
    ghost:
      "bg-transparent border-none text-panel-muted font-medium hover:text-panel-text hover:bg-panel-2 active:scale-95",
  }[variant];

  const baseStyles =
    "inline-flex items-center justify-center gap-2 cursor-pointer no-underline transition-all duration-150 select-none text-center disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed";

  const combinedClassName = `${baseStyles} ${sizeStyles} ${variantStyles} ${className}`;

  if (href) {
    if (asExternal) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={combinedClassName}
        >
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={combinedClassName}>
        {children}
      </Link>
    );
  }

  return (
    <button
      ref={ref}
      className={combinedClassName}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
});
