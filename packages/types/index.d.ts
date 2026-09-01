export interface ValidationResponse {
    passed: boolean;
    feedback?: string;
    checkResults?: CheckResult[];
}
export interface CheckResult {
    checkId: string;
    passed: boolean;
    message: string;
}
export interface StandardResponse {
    success: boolean;
    message?: string;
}
export interface OnboardingStatus {
    state: "NEW" | "TOUR_DISMISSED" | "TOUR_COMPLETED";
    version: number;
}
export interface SandboxHealth {
    alive: boolean;
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
    sourceLabel?: string;
    sourceUrl?: string;
    deepExplanationMarkdown?: string;
}
export interface QuizMetadata {
    category: string;
    difficulty: string;
    xp: number;
    questions: QuizQuestion[];
    editorial?: string;
    takeaways?: string[];
}
export interface QuizNode {
    id: string;
    slug: string;
    challengeId?: string;
    timeEstimate?: string;
    type: string;
    title: string;
    description: string;
    metadata: QuizMetadata;
    editorial?: string;
    prerequisiteQuizIds?: string[];
}
export interface QuizProgress {
    quizId: string;
    status: "Not started" | "Completed";
    score?: number;
    total?: number;
}
export type ApiSuccess<T> = {
    ok: true;
    data: T;
    status: number;
};
export type ApiFailure = {
    ok: false;
    error: string;
    status: number;
    code?: string | undefined;
    data?: unknown;
};
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
    onboardingState: "NEW" | "TOUR_DISMISSED" | "TOUR_COMPLETED";
    jobTitle?: string | null;
    avatarUrl?: string | null;
    currentStreak?: number;
}
export interface Article {
    id: string;
    slug: string;
    title: string;
    summary: string;
    content: string;
    category: string;
    badge: string;
    authorName: string;
    authorRole: string;
    authorAvatar?: string | null;
    readTime: string;
    tags: string[];
    featured?: boolean;
    publishedAt: string;
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
    editorial?: string | null;
    authorNotes?: string | null;
    moduleId?: string;
    module?: {
        title: string;
        path: {
            title: string;
        };
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
export interface RoadmapNode {
    id: string;
    title: string;
    description: string;
    difficulty: string;
    timeEstimate: string;
    xp: number;
    tags: string[];
    prerequisites: string[];
    chapterLabel?: string;
}
export interface Roadmap {
    id: string;
    slug: string;
    title: string;
    description: string;
    icon: string;
    nodeCount: number;
    timeEstimate: string;
    nodes?: RoadmapNode[];
}
export interface RoadmapProgress {
    roadmapId: string;
    completedNodes: string[];
    inProgressNodes: string[];
}
export interface Flashcard {
    id: string;
    frontText: string;
    backText: string;
    source?: string;
    order: number;
}
export interface FlashcardDeck {
    id: string;
    title: string;
    cardCount: number;
    cards?: Flashcard[];
}
export interface AssistantMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
}
export interface QuizAttempt {
    id: string;
    userId: string;
    nodeId: string;
    score: number;
    total: number;
    passed: boolean;
    createdAt: string;
}
export interface SubmissionHistory {
    id: string;
    code: string;
    status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
    result?: {
        stdout?: string;
        stderr?: string;
        exitCode?: number;
        passed?: boolean;
    };
    userId: string;
    challengeId: string;
    createdAt: string;
}
export interface DashboardData {
    hasActivity: boolean;
    todayChallenge: {
        id: string;
        title: string;
        completedToday: boolean;
    } | null;
    inProgress: Array<{
        id: string;
        type: "roadmap" | "challenge";
        title: string;
        category: string;
        completed: number;
        total: number;
        lastTouchedAt: string;
    }>;
    stats: {
        xp: number;
        streak: number;
        longestStreak?: number;
        roadmapsCompleted: number;
        badgesEarned: number;
    };
    recommendedNext: {
        title: string;
        description: string;
        link: string;
    } | null;
    recentBadges: Array<{
        id: string;
        title: string;
        icon: string;
        earnedAt: string;
    }>;
    recentActivity: Array<{
        id: string;
        description: string;
        date: string;
    }>;
    org: {
        name: string;
        teammateCount: number;
    } | null;
}
export interface SecurityLogEntry {
    id: string;
    userId: string;
    action: string;
    ip?: string;
    userAgent?: string;
    createdAt: string;
}
export interface SecurityLogResponse {
    logs: SecurityLogEntry[];
    total: number;
    page: number;
    limit: number;
}
export interface ActiveSession {
    id: string;
    userId: string;
    userAgent?: string;
    ip?: string;
    createdAt: string;
    lastSeenAt: string;
}
export interface HistoryItem {
    id: string;
    description: string;
    date: string;
    metadata?: unknown;
}
export interface UserProfile {
    id: string;
    name: string | null;
    email: string;
    role: string;
    xp: number;
    mfaEnabled: boolean;
    avatarUrl?: string | null;
    jobTitle?: string | null;
    createdAt?: string | null;
    currentStreak?: number;
    badges?: Array<{
        badge: {
            id: string;
            title: string;
            iconRef: string;
        };
        earnedAt: string;
    }>;
    githubId?: string | null;
    emailVerified?: string | null;
    hasPassword?: boolean;
}
export interface MfaSetupResponse {
    secret: string;
    qrCode: string;
}
