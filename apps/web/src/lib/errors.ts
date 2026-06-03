export class ApiError extends Error {
  constructor(
    public override message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const ErrorCodes = {
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
  USER_NOT_FOUND: "USER_NOT_FOUND",
  OAUTH_NO_PASSWORD: "OAUTH_NO_PASSWORD",
  INCORRECT_PASSWORD: "INCORRECT_PASSWORD",
  NOT_FOUND: "NOT_FOUND",
} as const;

/**
 * Stable code → user-friendly message.
 * The backend sends a `code` field on every error response.
 * We map on the code, never on the volatile error string.
 */
const CODE_MESSAGES: Record<string, string> = {
  USER_EXISTS: "An account with this email address already exists.",
  INVALID_CREDENTIALS: "The email or password you entered is incorrect.",
  ACCOUNT_LOCKED: "This account has been temporarily locked due to too many failed login attempts. Please try again later.",
  INVALID_VERIFICATION_TOKEN: "The verification link is invalid or has expired. Please request a new one.",
  INVALID_RESET_TOKEN: "Your password reset link is invalid or has expired.",
  INVALID_MFA_CODE: "The verification code is incorrect. Please try again.",
  INVALID_MFA_TOKEN: "Your MFA session has expired. Please log in again.",
  MFA_SETUP_INCOMPLETE: "MFA setup is not complete. Please set up MFA first.",
  MFA_ALREADY_ENABLED: "Multi-factor authentication is already enabled.",
  MFA_NOT_INITIALIZED: "MFA has not been set up yet.",
  REFRESH_TOKEN_MISSING: "Your session has expired. Please log in again.",
  INVALID_REFRESH_TOKEN: "Your session has expired. Please log in again.",
  SESSION_COMPROMISED: "Your session was invalidated for security reasons. Please log in again.",
  USER_NOT_FOUND: "The requested user could not be found.",
  OAUTH_NO_PASSWORD: "This account uses social login and does not have a password.",
  INCORRECT_PASSWORD: "The current password you entered is incorrect.",
  NOT_FOUND: "The requested resource could not be found.",
};

const STATUS_MESSAGES: Record<number, string> = {
  400: "The request was invalid. Please check your inputs.",
  401: "You must be logged in to perform this action.",
  403: "You do not have permission to access this resource.",
  404: "The requested resource could not be found.",
  429: "Too many requests. Please slow down and try again later.",
  500: "A server error occurred. Please try again later.",
  502: "Service unavailable — backend may not be running.",
  503: "Service unavailable — please try again later.",
};

/**
 * Resolve a user-friendly error message from any error shape.
 *
 * Lookup order:
 * 1. ApiError.code → CODE_MESSAGES (stable, backend-controlled)
 * 2. ApiError.status → STATUS_MESSAGES (HTTP status fallback)
 * 3. fallback string
 * 4. Generic default
 */
export function getErrorMessage(error: unknown, fallback?: string): string {
  if (!error) return fallback || "An unexpected error occurred.";

  if (error instanceof ApiError) {
    if (error.code) {
      const msg = CODE_MESSAGES[error.code];
      if (msg) return msg;
    }
    const statusMsg = STATUS_MESSAGES[error.status];
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
