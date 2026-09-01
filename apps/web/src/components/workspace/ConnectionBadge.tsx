import { Wifi, WifiOff, AlertCircle, Terminal } from "lucide-react";

export function ConnectionBadge({
  state,
  attempt,
  max,
}: {
  state: string;
  attempt: number;
  max: number;
}) {
  const cfg = {
    CONNECTED: {
      colorClass: "text-teal border-teal/40",
      bgClass: "bg-[rgba(53,214,180,0.1)]",
      icon: <Wifi size={11} />,
      label: "Connected",
    },
    RECONNECTING: {
      colorClass: "text-amber border-amber/40",
      bgClass: "bg-[rgba(255,157,92,0.1)]",
      icon: <Wifi size={11} />,
      label: `Reconnecting (${attempt}/${max})`,
    },
    SANDBOX_LOST: {
      colorClass: "text-red border-red/40",
      bgClass: "bg-[rgba(244,63,94,0.1)]",
      icon: <WifiOff size={11} />,
      label: "Sandbox stopped",
    },
    FAILED: {
      colorClass: "text-red border-red/40",
      bgClass: "bg-[rgba(244,63,94,0.1)]",
      icon: <AlertCircle size={11} />,
      label: "Failed",
    },
  }[state] ?? {
    colorClass: "text-panel-muted-dim border-panel-border",
    bgClass: "bg-transparent",
    icon: <Terminal size={11} />,
    label: state.toLowerCase(),
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] font-mono text-[10.5px] font-semibold border ${cfg.bgClass} ${cfg.colorClass}`}
    >
      {cfg.icon} {cfg.label}
    </span>
  );
}
