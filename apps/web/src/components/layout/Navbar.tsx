"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { useEffect, useState } from "react";
import { LogOut, User, Menu, X, Sun, Moon } from "lucide-react";

export function NavThemeToggle() {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    setIsLight(document.documentElement.getAttribute("data-theme") === "light");
  }, []);

  const toggle = () => {
    const next = !isLight;
    document.documentElement.setAttribute("data-theme", next ? "light" : "dark");
    localStorage.setItem("devopslab-theme", next ? "light" : "dark");
    if (next) {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
    setIsLight(next);
  };

  return (
    <button
      onClick={toggle}
      role="button"
      aria-label="Toggle theme"
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      className="relative flex-shrink-0 w-[50px] h-[26px] bg-panel-2 border border-panel-border rounded-full p-[3px] cursor-pointer transition-colors"
    >
      <div
        className={`absolute top-[2px] left-[2px] w-[20px] h-[20px] rounded-full bg-gradient-to-br from-amber to-amber-dim flex items-center justify-center text-[10px] text-[#241505] transition-transform duration-250 ease-out ${
          isLight ? "translate-x-[24px]" : "translate-x-0"
        }`}
      >
        {isLight ? <Sun size={12} /> : <Moon size={12} />}
      </div>
    </button>
  );
}

export function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isActive = (path: string) => (path === "/" ? pathname === "/" : pathname?.startsWith(path));

  const desktopLinkClass = (path: string) =>
    `text-[14px] no-underline transition-colors ${isActive(path) ? "text-amber font-semibold" : "text-panel-muted hover:text-panel-text"}`;

  const mobileLinkClass = (path: string) =>
    `text-[15px] no-underline transition-colors ${isActive(path) ? "text-amber font-semibold" : "text-panel-text font-medium"}`;

  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md bg-bg/80 border-b border-panel-border">
      <div className="max-w-[1180px] mx-auto px-8 flex items-center justify-between h-[68px]">
        <Link href="/" className="flex items-center gap-2.5 no-underline text-current">
          <div className="w-[30px] h-[30px] rounded-[7px] bg-gradient-to-br from-amber to-amber-dim flex items-center justify-center font-mono font-semibold text-[13px] text-[#241505]">
            D/L
          </div>
          <span className="font-space font-semibold text-[16.5px] text-panel-text">DevOps.lab</span>
        </Link>

        <div className="hidden lg:flex items-center gap-[30px]">
          <Link href="/" className={desktopLinkClass("/")}>
            Home
          </Link>
          {user && (
            <>
              <Link href="/dashboard" className={desktopLinkClass("/dashboard")}>
                Dashboard
              </Link>
              <Link href="/teams" className={desktopLinkClass("/teams")}>
                Teams
              </Link>
            </>
          )}
          <Link href="/challenges" className={desktopLinkClass("/challenges")}>
            Challenges
          </Link>
          <Link href="/roadmaps" className={desktopLinkClass("/roadmaps")}>
            Roadmaps
          </Link>
          <Link href="/quizzes" className={desktopLinkClass("/quizzes")}>
            Quizzes
          </Link>
          <Link href="/leaderboard" className={desktopLinkClass("/leaderboard")}>
            Leaderboard
          </Link>
          <Link href="/community" className={desktopLinkClass("/community")}>
            Community
          </Link>
          <Link
            href="/#stack"
            className="text-[14px] text-panel-muted no-underline hover:text-panel-text transition-colors"
          >
            Stack
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <NavThemeToggle />

          {user ? (
            <div className="hidden lg:flex items-center gap-3 bg-panel border border-panel-border rounded-xl px-2.5 py-1.5">
              <Link
                href="/profile"
                className="flex items-center gap-2 font-mono text-[12px] font-semibold text-panel-text no-underline hover:text-amber transition-colors"
              >
                <div className="bg-panel-2 p-1.5 rounded-lg flex">
                  <User size={14} className="text-panel-muted" />
                </div>
                <span>{user.name || user.email.split("@")[0]}</span>
              </Link>
              <div className="w-[1px] h-4 bg-panel-border" />
              <button
                onClick={() => logout()}
                className="bg-transparent border-none cursor-pointer flex items-center justify-center text-panel-muted p-1 transition-colors hover:text-amber"
                title="Log Out"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="hidden lg:flex items-center gap-4">
              <Link
                href="/login"
                className="text-[14px] text-panel-text no-underline hover:text-amber transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="bg-gradient-to-br from-amber to-[#ffb877] text-[#241505] font-bold text-[13.5px] rounded-lg border-none cursor-pointer shadow-[0_10px_24px_-10px_rgba(var(--theme-particle),0.45)] transition-transform hover:scale-95 no-underline inline-block px-[18px] py-[9px]"
              >
                Get started
              </Link>
            </div>
          )}

          <button
            className="lg:hidden flex items-center justify-center bg-transparent border-none text-panel-text cursor-pointer p-1"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="lg:hidden bg-panel border-t border-panel-border px-8 py-4 flex flex-col gap-4">
          <Link
            href="/"
            onClick={() => setIsMobileMenuOpen(false)}
            className={mobileLinkClass("/")}
          >
            Home
          </Link>
          {user && (
            <>
              <Link
                href="/dashboard"
                onClick={() => setIsMobileMenuOpen(false)}
                className={mobileLinkClass("/dashboard")}
              >
                Dashboard
              </Link>
              <Link
                href="/teams"
                onClick={() => setIsMobileMenuOpen(false)}
                className={mobileLinkClass("/teams")}
              >
                Teams
              </Link>
            </>
          )}
          <Link
            href="/challenges"
            onClick={() => setIsMobileMenuOpen(false)}
            className={mobileLinkClass("/challenges")}
          >
            Challenges
          </Link>
          <Link
            href="/roadmaps"
            onClick={() => setIsMobileMenuOpen(false)}
            className={mobileLinkClass("/roadmaps")}
          >
            Roadmaps
          </Link>
          <Link
            href="/quizzes"
            onClick={() => setIsMobileMenuOpen(false)}
            className={mobileLinkClass("/quizzes")}
          >
            Quizzes
          </Link>
          <Link
            href="/leaderboard"
            onClick={() => setIsMobileMenuOpen(false)}
            className={mobileLinkClass("/leaderboard")}
          >
            Leaderboard
          </Link>
          <Link
            href="/community"
            onClick={() => setIsMobileMenuOpen(false)}
            className={mobileLinkClass("/community")}
          >
            Community
          </Link>
          <Link
            href="/#stack"
            onClick={() => setIsMobileMenuOpen(false)}
            className="text-[15px] text-panel-text no-underline font-medium"
          >
            Stack
          </Link>

          <div className="h-[1px] bg-panel-border my-1" />

          {user ? (
            <div className="flex items-center justify-between pt-2">
              <Link
                href="/profile"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-2.5 text-panel-text no-underline hover:text-amber transition-colors"
              >
                <div className="bg-panel-2 p-2 rounded-lg">
                  <User size={16} className="text-panel-muted" />
                </div>
                <span className="text-[15px] font-semibold">
                  {user.name || user.email.split("@")[0]}
                </span>
              </Link>
              <button
                onClick={() => {
                  logout();
                  setIsMobileMenuOpen(false);
                }}
                className="bg-transparent border-none cursor-pointer text-panel-muted p-2 flex items-center gap-1.5 text-[14px]"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 pt-2">
              <Link
                href="/login"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-[15px] text-panel-text no-underline text-center p-2.5 rounded-lg border border-panel-border"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                onClick={() => setIsMobileMenuOpen(false)}
                className="bg-gradient-to-br from-amber to-[#ffb877] text-[#241505] font-bold text-[15px] rounded-lg border-none cursor-pointer shadow-[0_10px_24px_-10px_rgba(var(--theme-particle),0.45)] transition-transform hover:scale-95 no-underline text-center p-2.5"
              >
                Get started
              </Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
