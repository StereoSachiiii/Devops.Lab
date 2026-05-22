import { Shield, Cpu, Clock, BarChart } from "lucide-react";

interface ChallengeCardProps {
  title: string;
  category: string;
  difficulty: "Junior" | "Mid" | "Senior";
  xp: number;
  timeEstimate: string;
  tags: string[];
}

export function ChallengeCard({ 
  title, 
  category, 
  difficulty, 
  xp, 
  timeEstimate,
  tags 
}: ChallengeCardProps) {
  return (
    <div className="border border-neutral-800 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          {category === "Security" ? <Shield size={16} /> : <Cpu size={16} />}
        </div>
        <span className="border border-neutral-800 px-2 py-0.5 text-xs">
          {difficulty}
        </span>
      </div>
      
      <h3 className="font-bold">{title}</h3>
      <p className="text-sm">
        Master {category.toLowerCase()} concepts by solving this real-world scenario.
      </p>

      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <span key={tag} className="border border-neutral-800 px-1.5 py-0.5 text-xs">
            #{tag}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between mt-auto pt-2 border-t border-neutral-800">
        <div className="flex gap-3 text-xs">
          <div className="flex items-center gap-1">
            <BarChart size={14} />
            <span>{xp} XP</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock size={14} />
            <span>{timeEstimate}</span>
          </div>
        </div>
        <button className="border border-neutral-700 px-3 py-1 text-xs">
          SOLVE →
        </button>
      </div>
    </div>
  );
}
