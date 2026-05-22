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
} as const;

const ERROR_MESSAGE_MAP: Record<string, string> = {
  // Direct raw backend string error keys
  "User already exists": "An account with this email address already exists.",
  "Invalid credentials": "The email or password you entered is incorrect.",
  "Account locked due to too many failed attempts. Try again later.": "This account has been temporarily locked due to too many failed login attempts. Please try again later.",
  "Invalid or expired verification token": "The verification link is invalid or has expired. Please request a new one.",
  "Invalid or expired reset token": "Your password reset link is invalid or has expired.",
  "Invalid MFA code": "The verification code is incorrect. Please try again.",

  // Status-code-based messages
  "HTTP_400": "The request was invalid. Please check your inputs.",
  "HTTP_401": "You must be logged in to perform this action.",
  "HTTP_403": "You do not have permission to access this resource.",
  "HTTP_404": "The requested resource could not be found.",
  "HTTP_429": "Too many requests. Please slow down and try again later.",
  "HTTP_500": "A server error occurred. Please try again later.",
};

export function getErrorMessage(error: unknown, fallback?: string): string {
  if (!error) return fallback || "An unexpected error occurred.";

  let searchKey = "";

  if (error instanceof ApiError) {
    if (error.code) {
      const msg = ERROR_MESSAGE_MAP[error.code];
      if (msg) return msg;
    }
    if (error.message) {
      const msg = ERROR_MESSAGE_MAP[error.message];
      if (msg) return msg;
    }
    const statusKey = `HTTP_${error.status}`;
    const statusMsg = ERROR_MESSAGE_MAP[statusKey];
    if (statusMsg) {
      return statusMsg;
    }
    searchKey = error.message;
  } else if (error instanceof Error) {
    const msg = ERROR_MESSAGE_MAP[error.message];
    if (msg) return msg;
    searchKey = error.message;
  } else if (typeof error === "string") {
    const msg = ERROR_MESSAGE_MAP[error];
    if (msg) return msg;
    searchKey = error;
  }

  return searchKey || fallback || "An unexpected error occurred.";
}
