export interface ValidationResponse {
  passed: boolean;
  feedback?: string;
}

export interface ValidationResult {
  questionId: number;
  correct: boolean;
  correctIndex: number;
  explanation: string;
}

export interface SubmitResponse {
  passed: boolean;
  score: number;
  total: number;
  results: ValidationResult[];
}

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
}

export interface QuizMetadata {
  category: string;
  difficulty: string;
  xp: number;
  questions: QuizQuestion[];
}

export interface QuizNode {
  id: string;
  type: string;
  title: string;
  description: string;
  metadata: QuizMetadata;
}

export type ApiSuccess<T> = { ok: true; data: T; status: number };
export type ApiFailure = { ok: false; error: string; status: number; code?: string | undefined; data?: any };
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export interface UserSession {
  id: string;
  email: string;
  name: string | null;
  role: string;
  xp: number;
  emailVerified: string | null;
  mfaEnabled: boolean;
  mfaRequired?: boolean;
  mfaToken?: string;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  category: string;
  tags: string[];
  xp: number;
  dockerImage: string;
  templateCode?: string;
  editorLanguage?: string;
  moduleId?: string;
  module?: {
    title: string;
    path: { title: string };
  };
}

export interface Session {
  sessionId: string;
  status: string;
  challengeTitle: string;
  dockerImage: string;
  userId: string;
  challengeId: string;
  sandboxId: string | null;
  host: string | null;
  sshPort: number | null;
  httpPort: number | null;
  expiresAt: string | null;
}

