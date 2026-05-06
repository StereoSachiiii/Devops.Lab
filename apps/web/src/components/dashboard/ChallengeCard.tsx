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
    <div className="challenge-card">
      <div className="card-header">
        <div className="category-icon">
          {category === "Security" ? <Shield /> : <Cpu />}
        </div>
        <span className={`difficulty-badge ${difficulty.toLowerCase()}`}>
          {difficulty}
        </span>
      </div>
      
      <h3 className="card-title">{title}</h3>
      <p className="card-description">
        Master {category.toLowerCase()} concepts by solving this real-world scenario.
      </p>

      <div className="card-tags">
        {tags.map((tag) => (
          <span key={tag} className="tag">
            #{tag}
          </span>
        ))}
      </div>

      <div className="card-footer">
        <div className="stats">
          <div className="stat-item">
            <BarChart size={14} />
            <span>{xp} XP</span>
          </div>
          <div className="stat-item">
            <Clock size={14} />
            <span>{timeEstimate}</span>
          </div>
        </div>
        <button className="solve-button">
          SOLVE →
        </button>
      </div>
    </div>
  );
}
