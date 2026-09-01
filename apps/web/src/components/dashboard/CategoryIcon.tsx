import {
  Box,
  ShipWheel,
  Layers,
  Terminal,
  Shield,
  Activity,
  Network,
  Database,
  Code,
  Globe,
} from "lucide-react";

export function CategoryIcon({
  category,
  size = 16,
  className = "",
}: {
  category: string;
  size?: number;
  className?: string;
}) {
  const cat = (category || "").toLowerCase();

  if (cat.includes("docker") || cat.includes("container")) {
    return <Box size={size} className={className} />;
  }
  if (cat.includes("kubernetes") || cat.includes("k8s")) {
    return <ShipWheel size={size} className={className} />;
  }
  if (cat.includes("terraform") || cat.includes("infrastructure")) {
    return <Layers size={size} className={className} />;
  }
  if (cat.includes("linux") || cat.includes("bash")) {
    return <Terminal size={size} className={className} />;
  }
  if (cat.includes("security")) {
    return <Shield size={size} className={className} />;
  }
  if (cat.includes("monitoring") || cat.includes("observability")) {
    return <Activity size={size} className={className} />;
  }
  if (cat.includes("network")) {
    return <Network size={size} className={className} />;
  }
  if (cat.includes("database") || cat.includes("sql") || cat.includes("postgres")) {
    return <Database size={size} className={className} />;
  }
  if (cat.includes("ci/cd") || cat.includes("pipeline")) {
    return <Code size={size} className={className} />;
  }

  return <Globe size={size} className={className} />;
}
