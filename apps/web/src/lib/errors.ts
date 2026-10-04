/**
 * DevOps.lab - Centralized Global Error & Exception Handling Engine
 *
 * Provides strongly-typed error representations, comprehensive code mappings,
 * severity classifications, and safe normalization from any unknown exception.
 */

export type ErrorSeverity = "info" | "warning" | "error" | "critical";

export interface ErrorDetails {
  message: string;
  code: string;
  status: number;
  severity: ErrorSeverity;
  retryable: boolean;
  field?: string | undefined;
  raw?: unknown;
}

export const ErrorCodes = {
  // Authentication & Session
  USER_EXISTS: "USER_EXISTS",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  INVALID_VERIFICATION_TOKEN: "INVALID_VERIFICATION_TOKEN",
  INVALID_RESET_TOKEN: "INVALID_RESET_TOKEN",
  MFA_REQUIRED: "MFA_REQUIRED",
  INVALID_MFA_CODE: "INVALID_MFA_CODE",
  INVALID_MFA_TOKEN: "INVALID_MFA_TOKEN",
  MFA_SETUP_INCOMPLETE: "MFA_SETUP_INCOMPLETE",
  MFA_ALREADY_ENABLED: "MFA_ALREADY_ENABLED",
  MFA_NOT_INITIALIZED: "MFA_NOT_INITIALIZED",
  REFRESH_TOKEN_MISSING: "REFRESH_TOKEN_MISSING",
  INVALID_REFRESH_TOKEN: "INVALID_REFRESH_TOKEN",
  SESSION_COMPROMISED: "SESSION_COMPROMISED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  OAUTH_NO_PASSWORD: "OAUTH_NO_PASSWORD",
  INCORRECT_PASSWORD: "INCORRECT_PASSWORD",

  // Sandbox & Challenges
  CHALLENGE_NOT_FOUND: "CHALLENGE_NOT_FOUND",
  EDITORIAL_LOCKED: "EDITORIAL_LOCKED",
  SESSION_LIMIT_EXCEEDED: "SESSION_LIMIT_EXCEEDED",
  SANDBOX_UNAVAILABLE: "SANDBOX_UNAVAILABLE",
  SANDBOX_BOOT_FAILED: "SANDBOX_BOOT_FAILED",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  EXECUTION_TIMEOUT: "EXECUTION_TIMEOUT",

  // Curriculum & Roadmaps
  ROADMAPS_LOAD_FAILED: "ROADMAPS_LOAD_FAILED",
  ROADMAP_NOT_FOUND: "ROADMAP_NOT_FOUND",
  QUIZZES_LOAD_FAILED: "QUIZZES_LOAD_FAILED",
  QUIZ_NOT_FOUND: "QUIZ_NOT_FOUND",
  ASSISTANT_ERROR: "ASSISTANT_ERROR",
  SHARE_NOT_FOUND: "SHARE_NOT_FOUND",

  // Organization & Teams
  ORG_NOT_FOUND: "ORG_NOT_FOUND",
  ORG_ACCESS_DENIED: "ORG_ACCESS_DENIED",
  INVITE_EXPIRED: "INVITE_EXPIRED",
  SEAT_LIMIT_REACHED: "SEAT_LIMIT_REACHED",

  // System & Network
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  NETWORK_ERROR: "NETWORK_ERROR",
  SERVER_ERROR: "SERVER_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  TIMEOUT: "TIMEOUT",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type ErrorCodeKey = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Single source of truth mapping stable backend error codes to user-facing messages,
 * severities, and retry heuristics.
 */
interface CodeConfig {
  message: string;
  severity: ErrorSeverity;
  retryable: boolean;
}

const CODE_REGISTRY: Record<string, CodeConfig> = {
  // Auth
  [ErrorCodes.USER_EXISTS]: {
    message: "An account with this email address already exists.",
    severity: "warning",
    retryable: false,
  },
  [ErrorCodes.INVALID_CREDENTIALS]: {
    message: "The email or password you entered is incorrect.",
    severity: "error",
    retryable: false,
  },
  [ErrorCodes.ACCOUNT_LOCKED]: {
    message: "This account has been temporarily locked due to too many failed attempts. Please try again later.",
    severity: "critical",
    retryable: false,
  },
  [ErrorCodes.INVALID_VERIFICATION_TOKEN]: {
    message: "The verification link is invalid or has expired. Please request a new one.",
    severity: "error",
    retryable: false,
  },
  [ErrorCodes.INVALID_RESET_TOKEN]: {
    message: "Your password reset link is invalid or has expired.",
    severity: "error",
    retryable: false,
  },
  [ErrorCodes.MFA_REQUIRED]: {
    message: "Multi-factor authentication is required to continue.",
    severity: "info",
    retryable: false,
  },
  [ErrorCodes.INVALID_MFA_CODE]: {
    message: "The verification code is incorrect. Please try again.",
    severity: "error",
    retryable: false,
  },
  [ErrorCodes.INVALID_MFA_TOKEN]: {
    message: "Your MFA session has expired. Please log in again.",
    severity: "warning",
    retryable: false,
  },
  [ErrorCodes.MFA_SETUP_INCOMPLETE]: {
    message: "MFA setup is not complete. Please finish setup first.",
    severity: "warning",
    retryable: false,
  },
  [ErrorCodes.MFA_ALREADY_ENABLED]: {
    message: "Multi-factor authentication is already enabled on your account.",
    severity: "info",
    retryable: false,
  },
  [ErrorCodes.MFA_NOT_INITIALIZED]: {
    message: "MFA has not been set up yet.",
    severity: "info",
    retryable: false,
  },
  [ErrorCodes.REFRESH_TOKEN_MISSING]: {
    message: "Your session has expired. Please log in again.",
    severity: "warning",
    retryable: false,
  },
  [ErrorCodes.INVALID_REFRESH_TOKEN]: {
    message: "Your session has expired. Please log in again.",
    severity: "warning",
    retryable: false,
  },
  [ErrorCodes.SESSION_COMPROMISED]: {
    message: "Your session was invalidated for security reasons. Please log in again.",
    severity: "critical",
    retryable: false,
  },
  [ErrorCodes.SESSION_EXPIRED]: {
    message: "Your active session has expired. Please refresh or re-authenticate.",
    severity: "warning",
    retryable: false,
  },
  [ErrorCodes.UNAUTHORIZED]: {
    message: "You must be logged in to perform this action.",
    severity: "warning",
    retryable: false,
  },
  [ErrorCodes.FORBIDDEN]: {
    message: "You do not have permission to access this resource.",
    severity: "error",
    retryable: false,
  },
  [ErrorCodes.USER_NOT_FOUND]: {
    message: "The requested user account could not be found.",
    severity: "error",
    retryable: false,
  },
  [ErrorCodes.OAUTH_NO_PASSWORD]: {
    message: "This account uses social sign-in and does not have a local password.",
    severity: "info",
    retryable: false,
  },
  [ErrorCodes.INCORRECT_PASSWORD]: {
    message: "The current password you entered is incorrect.",
    severity: "error",
    retryable: false,
  },

  // Sandbox & Challenges
  [ErrorCodes.CHALLENGE_NOT_FOUND]: {
    message: "The requested challenge scenario does not exist or has been archived.",
    severity: "error",
    retryable: false,
  },
  [ErrorCodes.EDITORIAL_LOCKED]: {
    message: "The solution editorial is locked until you complete the scenario or obtain administrator access.",
    severity: "warning",
    retryable: false,
  },
  [ErrorCodes.SESSION_LIMIT_EXCEEDED]: {
    message: "You have reached the maximum number of concurrent sandbox containers. Terminate an existing lab first.",
    severity: "warning",
    retryable: true,
  },
  [ErrorCodes.SANDBOX_UNAVAILABLE]: {
    message: "Sandbox worker nodes are currently at capacity. Please retry in a few moments.",
    severity: "error",
    retryable: true,
  },
  [ErrorCodes.SANDBOX_BOOT_FAILED]: {
    message: "Failed to initialize the container environment. Please try starting the lab again.",
    severity: "error",
    retryable: true,
  },
  [ErrorCodes.VALIDATION_FAILED]: {
    message: "Automated checks did not pass. Inspect check output and try again.",
    severity: "warning",
    retryable: true,
  },
  [ErrorCodes.EXECUTION_TIMEOUT]: {
    message: "The execution or validation test timed out before completing.",
    severity: "warning",
    retryable: true,
  },

  // Curriculum & Roadmaps
  [ErrorCodes.ROADMAPS_LOAD_FAILED]: {
    message: "Failed to load engineering roadmaps. Please try again.",
    severity: "error",
    retryable: true,
  },
  [ErrorCodes.ROADMAP_NOT_FOUND]: {
    message: "The requested roadmap could not be found or has been removed.",
    severity: "error",
    retryable: false,
  },
  [ErrorCodes.QUIZZES_LOAD_FAILED]: {
    message: "Failed to load quizzes. Please check your network connection.",
    severity: "error",
    retryable: true,
  },
  [ErrorCodes.QUIZ_NOT_FOUND]: {
    message: "The requested quiz could not be found or has been removed.",
    severity: "error",
    retryable: false,
  },
  [ErrorCodes.ASSISTANT_ERROR]: {
    message: "Failed to connect to assistant. Please try again.",
    severity: "warning",
    retryable: true,
  },
  [ErrorCodes.SHARE_NOT_FOUND]: {
    message: "Proof of skill not found or link has expired.",
    severity: "error",
    retryable: false,
  },

  // Organization & Teams
  [ErrorCodes.ORG_NOT_FOUND]: {
    message: "Organization not found.",
    severity: "error",
    retryable: false,
  },
  [ErrorCodes.ORG_ACCESS_DENIED]: {
    message: "You do not have the required organization privileges for this operation.",
    severity: "error",
    retryable: false,
  },
  [ErrorCodes.INVITE_EXPIRED]: {
    message: "This team invitation has expired. Please ask your administrator to re-invite you.",
    severity: "warning",
    retryable: false,
  },
  [ErrorCodes.SEAT_LIMIT_REACHED]: {
    message: "Your organization has allocated all purchased member seats.",
    severity: "warning",
    retryable: false,
  },

  // System
  [ErrorCodes.NOT_FOUND]: {
    message: "The requested resource could not be found.",
    severity: "error",
    retryable: false,
  },
  [ErrorCodes.RATE_LIMITED]: {
    message: "Too many requests. Please slow down and try again later.",
    severity: "warning",
    retryable: true,
  },
  [ErrorCodes.NETWORK_ERROR]: {
    message: "Unable to reach the server. Please check your internet connection.",
    severity: "error",
    retryable: true,
  },
  [ErrorCodes.SERVER_ERROR]: {
    message: "An internal server error occurred. Our engineering team has been notified.",
    severity: "critical",
    retryable: true,
  },
  [ErrorCodes.SERVICE_UNAVAILABLE]: {
    message: "The service is temporarily unavailable. Please try again shortly.",
    severity: "critical",
    retryable: true,
  },
  [ErrorCodes.TIMEOUT]: {
    message: "The network request timed out. Please try again.",
    severity: "warning",
    retryable: true,
  },
  [ErrorCodes.UNKNOWN_ERROR]: {
    message: "An unexpected error occurred. Please try again.",
    severity: "error",
    retryable: true,
  },
};

const STATUS_FALLBACKS: Record<number, { message: string; code: string; severity: ErrorSeverity; retryable: boolean }> = {
  400: { message: "The request was invalid. Please verify your inputs.", code: "BAD_REQUEST", severity: "warning", retryable: false },
  401: { message: "You must be logged in to perform this action.", code: ErrorCodes.UNAUTHORIZED, severity: "warning", retryable: false },
  403: { message: "You do not have permission to access this resource.", code: ErrorCodes.FORBIDDEN, severity: "error", retryable: false },
  404: { message: "The requested resource could not be found.", code: ErrorCodes.NOT_FOUND, severity: "error", retryable: false },
  409: { message: "A conflicting resource already exists.", code: "CONFLICT", severity: "warning", retryable: false },
  422: { message: "Validation failed. Please check the supplied fields.", code: "UNPROCESSABLE_ENTITY", severity: "warning", retryable: false },
  429: { message: "Too many requests. Please slow down and try again later.", code: ErrorCodes.RATE_LIMITED, severity: "warning", retryable: true },
  500: { message: "An internal server error occurred.", code: ErrorCodes.SERVER_ERROR, severity: "critical", retryable: true },
  502: { message: "Bad Gateway - backend service may be starting or unavailable.", code: ErrorCodes.SERVICE_UNAVAILABLE, severity: "critical", retryable: true },
  503: { message: "Service temporarily unavailable. Please try again later.", code: ErrorCodes.SERVICE_UNAVAILABLE, severity: "critical", retryable: true },
  504: { message: "Gateway timeout waiting for upstream microservice.", code: ErrorCodes.TIMEOUT, severity: "critical", retryable: true },
};

/**
 * Strongly typed application error class containing status code, domain code,
 * severity level, and retryability heuristics.
 */
export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly severity: ErrorSeverity;
  public readonly retryable: boolean;
  public readonly field?: string | undefined;

  constructor(
    message: string,
    status = 500,
    code?: string,
    options?: { field?: string | undefined; severity?: ErrorSeverity; retryable?: boolean }
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code || STATUS_FALLBACKS[status]?.code || ErrorCodes.UNKNOWN_ERROR;
    this.field = options?.field;

    // Resolve severity and retryable from code registry if not explicitly provided
    const config = CODE_REGISTRY[this.code];
    this.severity = options?.severity || config?.severity || STATUS_FALLBACKS[status]?.severity || "error";
    this.retryable = options?.retryable ?? (config?.retryable ?? STATUS_FALLBACKS[status]?.retryable ?? false);

    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Factory method to create an ApiError directly from a known ErrorCode.
   */
  public static fromCode(code: ErrorCodeKey, status = 400, customMessage?: string): ApiError {
    const config = CODE_REGISTRY[code];
    return new ApiError(customMessage || config?.message || "Operation failed", status, code);
  }

  /**
   * Returns a structured representation suitable for logging or UI consumption.
   */
  public toDetails(): ErrorDetails {
    return {
      message: this.message,
      code: this.code,
      status: this.status,
      severity: this.severity,
      retryable: this.retryable,
      field: this.field,
      raw: this,
    };
  }
}

/**
 * Global Normalizer: Safely extract a structured ErrorDetails object from any unknown error.
 */
export function normalizeError(error: unknown, fallbackMessage?: string): ErrorDetails {
  if (error instanceof ApiError) {
    // If the error message was the default generic "Request failed", use the friendly mapped message
    const friendly = CODE_REGISTRY[error.code]?.message;
    const finalMsg = friendly || (error.message !== "Request failed" ? error.message : fallbackMessage || friendly || "An unexpected error occurred.");
    return {
      ...error.toDetails(),
      message: finalMsg,
    };
  }

  if (error && typeof error === "object") {
    const errObj = error as Record<string, any>;

    // Handle Axios errors or raw response envelopes using bracket notation for index signature
    if (errObj["isAxiosError"] || errObj["response"]) {
      const resp = errObj["response"];
      const status = Number(resp?.status) || 500;
      const data = resp?.data;
      const serverCode = data?.code as string | undefined;
      const serverMsg = data?.error || data?.message;
      const matchedCode = serverCode || STATUS_FALLBACKS[status]?.code || ErrorCodes.UNKNOWN_ERROR;
      const friendlyMsg = (serverCode && CODE_REGISTRY[serverCode]?.message) || serverMsg;

      return {
        message: friendlyMsg || STATUS_FALLBACKS[status]?.message || fallbackMessage || "Network request failed.",
        code: matchedCode,
        status,
        severity: CODE_REGISTRY[matchedCode]?.severity || STATUS_FALLBACKS[status]?.severity || "error",
        retryable: CODE_REGISTRY[matchedCode]?.retryable ?? (STATUS_FALLBACKS[status]?.retryable ?? true),
        field: data?.field,
        raw: error,
      };
    }

    if (errObj instanceof Error) {
      return {
        message: fallbackMessage || errObj.message || "An unexpected error occurred.",
        code: ErrorCodes.UNKNOWN_ERROR,
        status: 500,
        severity: "error",
        retryable: true,
        raw: error,
      };
    }
  }

  if (typeof error === "string") {
    return {
      message: fallbackMessage || error || "An unexpected error occurred.",
      code: ErrorCodes.UNKNOWN_ERROR,
      status: 500,
      severity: "error",
      retryable: true,
      raw: error,
    };
  }

  return {
    message: fallbackMessage || "An unexpected error occurred.",
    code: ErrorCodes.UNKNOWN_ERROR,
    status: 500,
    severity: "error",
    retryable: true,
    raw: error,
  };
}

/**
 * Central user-friendly error message resolver.
 * Lookup order:
 * 1. ApiError.code -> CODE_REGISTRY (stable, backend-controlled)
 * 2. ApiError.status -> STATUS_FALLBACKS (HTTP status fallback)
 * 3. fallback string (if provided)
 * 4. Error.message / default
 */
export function getErrorMessage(error: unknown, fallback?: string): string {
  if (!error) return fallback || "An unexpected error occurred.";

  if (error instanceof ApiError) {
    if (error.code) {
      const reg = CODE_REGISTRY[error.code];
      if (reg) return reg.message;
    }
    const statusMsg = STATUS_FALLBACKS[error.status]?.message;
    if (statusMsg) return statusMsg;
    return fallback || error.message || "An unexpected error occurred.";
  }

  if (error instanceof Error) {
    return fallback || error.message;
  }

  if (typeof error === "string") {
    return fallback || error;
  }

  return fallback || "An unexpected error occurred.";
}
