import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];
const PUBLIC_PAGES = ["/", "/challenges", "/paths", "/quizzes", "/leaderboard"];

export function getPageType(pathname: string | null) {
  const isAuthPage = AUTH_PAGES.some((p) => pathname?.startsWith(p));
  const isPublicPage = PUBLIC_PAGES.some((p) => pathname === p || pathname?.startsWith(`${p}/`));
  const isProtectedPage = !isAuthPage && !isPublicPage;

  return { isAuthPage, isPublicPage, isProtectedPage };
}

