export function TagPill({
  children,
  variant = "default",
  className = "",
}: {
  children: React.ReactNode;
  variant?: "default" | "teal" | "amber";
  className?: string;
}) {
  const variantClass =
    variant === "teal"
      ? "bg-teal/10 border-teal/30 text-teal shadow-[0_0_12px_rgba(53,214,180,0.1)]"
      : variant === "amber"
        ? "bg-amber/10 border-amber/30 text-amber shadow-[0_0_12px_rgba(255,157,92,0.1)]"
        : "bg-panel-2/70 border-panel-border text-panel-muted hover:border-panel-muted-dim hover:text-panel-text shadow-sm";

  return (
    <span
      className={`font-mono text-[10.5px] font-semibold py-1 px-2.5 rounded-lg border transition-all cursor-default inline-flex items-center gap-1.5 backdrop-blur-md ${variantClass} ${className}`}
    >
      {children}
    </span>
  );
}
