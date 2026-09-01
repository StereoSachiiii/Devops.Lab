export function EyebrowHeader({
  children,
  dotColor = "teal",
  className = "",
}: {
  children: React.ReactNode;
  dotColor?: "teal" | "amber" | "none";
  className?: string;
}) {
  const dotColorClass =
    dotColor === "amber"
      ? "bg-amber shadow-[0_0_8px_var(--color-amber)]"
      : dotColor === "teal"
        ? "bg-teal shadow-[0_0_8px_var(--color-teal)]"
        : "";

  const textColorClass =
    dotColor === "amber" ? "text-amber" : dotColor === "teal" ? "text-teal" : "text-panel-muted-dim";

  return (
    <div
      className={`font-mono text-[11px] tracking-[0.14em] uppercase ${textColorClass} flex items-center gap-2 ${className}`}
    >
      {dotColor !== "none" && (
        <span className={`w-[6px] h-[6px] rounded-full shrink-0 ${dotColorClass}`} />
      )}
      {children}
    </div>
  );
}
