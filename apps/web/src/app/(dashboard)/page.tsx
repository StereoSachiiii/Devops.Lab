import { ChallengeCard } from "@/components/dashboard/ChallengeCard";
import { Terminal, Rocket, Sparkles, Activity } from "lucide-react";

const mockChallenges = [
  {
    id: "challenge-k8s-debug",
    title: "Kubernetes Pod Debugging",
    category: "Infrastructure",
    difficulty: "Junior" as const,
    xp: 250,
    timeEstimate: "15m",
    tags: ["K8s", "Debugging"],
  },
  {
    id: "challenge-docker-hardening",
    title: "Docker Image Hardening",
    category: "Security",
    difficulty: "Mid" as const,
    xp: 500,
    timeEstimate: "30m",
    tags: ["Docker", "Security"],
  },
  {
    id: "challenge-tf-migration",
    title: "Terraform State Migration",
    category: "Infrastructure",
    difficulty: "Senior" as const,
    xp: 1200,
    timeEstimate: "1h",
    tags: ["Terraform", "Cloud"],
  },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-8">
      {/* Hero Section */}
      <section className="flex flex-col gap-3 py-6">
        <div className="flex items-center gap-1.5 border border-neutral-800 px-2 py-0.5 w-fit text-xs">
          <Sparkles size={12} />
          <span>BETA VERSION 1.0</span>
        </div>
        <h1 className="text-2xl font-bold">
          Level up your DevOps Engineering Skills.
        </h1>
        <p className="text-sm max-w-xl">
          Solve real-world infrastructure challenges in isolated sandboxes. 
          Built for scale, documented for engineering clarity.
        </p>
        <div className="flex gap-3 mt-2">
          <button className="border border-neutral-700 px-4 py-2 text-sm font-semibold">
            Start Challenges
          </button>
          <button className="border border-neutral-800 px-4 py-2 text-sm">
            View Learning Paths
          </button>
        </div>
      </section>

      {/* Stats Quick View */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "XP Points", value: "0", icon: Sparkles },
          { label: "Completed", value: "0", icon: Rocket },
          { label: "Rank", value: "#--", icon: Activity },
          { label: "Daily Streak", value: "0", icon: Terminal },
        ].map((stat) => (
          <div key={stat.label} className="border border-neutral-800 p-4 flex items-center gap-3">
            <div className="flex items-center">
              <stat.icon size={16} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs">{stat.label}</span>
              <span className="text-lg font-bold">{stat.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Featured Challenges */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold">Featured Challenges</h2>
            <p className="text-xs">Hand-picked scenarios to sharpen your skills.</p>
          </div>
          <button className="border border-neutral-800 px-3 py-1 text-xs">View All</button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {mockChallenges.map((challenge) => (
            <ChallengeCard key={challenge.title} {...challenge} />
          ))}
        </div>
      </div>
    </div>
  );
}
