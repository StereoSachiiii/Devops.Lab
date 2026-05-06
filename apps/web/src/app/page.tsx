import { ChallengeCard } from "@/components/dashboard/ChallengeCard";
import { Terminal, Rocket, Sparkles, Activity } from "lucide-react";

const mockChallenges = [
  {
    title: "Kubernetes Pod Debugging",
    category: "Infrastructure",
    difficulty: "Junior" as const,
    xp: 250,
    timeEstimate: "15m",
    tags: ["K8s", "Debugging"],
  },
  {
    title: "Docker Image Hardening",
    category: "Security",
    difficulty: "Mid" as const,
    xp: 500,
    timeEstimate: "30m",
    tags: ["Docker", "Security"],
  },
  {
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
    <div>
      {/* Hero Section */}
      <section>
        <div>
          <div>
            <Sparkles />
            BETA VERSION 1.0
          </div>
          <h1>
            Level up your <span>DevOps Engineering</span> Skills.
          </h1>
          <p>
            Solve real-world infrastructure challenges in isolated sandboxes. 
            Built for scale, documented for engineering clarity.
          </p>
          <div>
            <button>
              Start Challenges
            </button>
            <button>
              View Learning Paths
            </button>
          </div>
        </div>
      </section>

      {/* Stats Quick View */}
      <div>
        {[
          { label: "XP Points", value: "0", icon: Sparkles },
          { label: "Completed", value: "0", icon: Rocket },
          { label: "Rank", value: "#--", icon: Activity },
          { label: "Daily Streak", value: "0", icon: Terminal },
        ].map((stat) => (
          <div key={stat.label}>
            <div>
              <stat.icon />
            </div>
            <div>
              <p>{stat.label}</p>
              <p>{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Featured Challenges */}
      <div>
        <div>
          <div>
            <h2>Featured Challenges</h2>
            <p>Hand-picked scenarios to sharpen your skills.</p>
          </div>
          <button>View All</button>
        </div>
        <div>
          {mockChallenges.map((challenge) => (
            <ChallengeCard key={challenge.title} {...challenge} />
          ))}
        </div>
      </div>
    </div>
  );
}
