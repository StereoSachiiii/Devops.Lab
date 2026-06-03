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
