export const TOPICS = {
  USER_REGISTERED: 'identity.user.registered',
  EMAIL_VERIFICATION_REQUESTED: 'identity.email.verify',
  CHALLENGE_SOLVED: 'curriculum.challenge.solved',
  CHALLENGE_FAILED: 'curriculum.challenge.failed',
  QUIZ_COMPLETED: 'curriculum.quiz.completed',
  SESSION_STARTED: 'sandbox.session.started',
  SESSION_ENDED: 'sandbox.session.ended',
} as const;

export type Topic = typeof TOPICS[keyof typeof TOPICS];

export const GROUPS = {
  NOTIFICATIONS: 'group.notifications',
  PROGRESS: 'group.progress',
  ANALYTICS: 'group.analytics',
} as const;

export type GroupId = typeof GROUPS[keyof typeof GROUPS];


export abstract class BaseEvent<T> {
  abstract readonly topic: Topic;
  readonly version: string = '1.0.0';
  readonly timestamp: string;
  readonly correlationId: string;

  constructor(public readonly payload: T, correlationId?: string) {
    this.timestamp = new Date().toISOString();
    this.correlationId = correlationId || crypto.randomUUID();
  }
}


export class UserRegisteredEvent extends BaseEvent<{
  userId: string;
  email: string;
  name: string | null;
}> {
  readonly topic = TOPICS.USER_REGISTERED;
}

export class EmailVerificationRequestedEvent extends BaseEvent<{
  userId: string;
  email: string;
  token: string;
}> {
  readonly topic = TOPICS.EMAIL_VERIFICATION_REQUESTED;
}


export class ChallengeSolvedEvent extends BaseEvent<{
  submissionId: string;
  challengeId: string;
  userId: string;
  passed: true;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}> {
  readonly topic = TOPICS.CHALLENGE_SOLVED;
}

export class ChallengeFailedEvent extends BaseEvent<{
  submissionId: string;
  challengeId: string;
  userId: string;
  passed: false;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}> {
  readonly topic = TOPICS.CHALLENGE_FAILED;
}


export type EventClassMap = {
  [TOPICS.USER_REGISTERED]: UserRegisteredEvent;
  [TOPICS.EMAIL_VERIFICATION_REQUESTED]: EmailVerificationRequestedEvent;
  [TOPICS.CHALLENGE_SOLVED]: ChallengeSolvedEvent;
  [TOPICS.CHALLENGE_FAILED]: ChallengeFailedEvent;
  [TOPICS.SESSION_STARTED]: SessionStartedEvent;
  [TOPICS.SESSION_ENDED]: SessionEndedEvent;
};

export class SessionStartedEvent extends BaseEvent<{
  type: 'session.started';
  sessionId: string;
  userId: string;
  challengeId: string;
  image: string;
  ttlMins: number;
}> {
  readonly topic = TOPICS.SESSION_STARTED;
}

export class SessionEndedEvent extends BaseEvent<{
  type: 'session.ended';
  sessionId: string;
  reason: 'user_left' | 'timeout' | 'completed';
}> {
  readonly topic = TOPICS.SESSION_ENDED;
}
