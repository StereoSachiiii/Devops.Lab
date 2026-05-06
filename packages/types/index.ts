export type Difficulty = 'junior' | 'mid' | 'senior';

export type ChallengeCategory = 
  | 'kubernetes' 
  | 'docker' 
  | 'ci-cd' 
  | 'terraform' 
  | 'bash' 
  | 'security' 
  | 'monitoring';

export interface Challenge {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  category: ChallengeCategory;
  tags: string[];
  xp: number;
}

export interface Submission {
  id: string;
  challengeId: string;
  userId: string;
  code: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: {
    stdout: string;
    stderr: string;
    exitCode: number;
    passed: boolean;
  };
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'guest' | 'learner' | 'contributor' | 'admin';
  xp: number;
  badges: string[];
}
