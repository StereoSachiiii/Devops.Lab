export const TOPICS = {
  USER_REGISTERED: 'identity.user.registered',
  EMAIL_VERIFICATION_REQUESTED: 'identity.email.verify',
  CHALLENGE_SOLVED: 'curriculum.challenge.solved',
  QUIZ_COMPLETED: 'curriculum.quiz.completed',
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


export type EventClassMap = {
  [TOPICS.USER_REGISTERED]: UserRegisteredEvent;
  [TOPICS.EMAIL_VERIFICATION_REQUESTED]: EmailVerificationRequestedEvent;
};


