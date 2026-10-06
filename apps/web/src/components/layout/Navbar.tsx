"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { useEffect, useState } from "react";
import { LogOut, Menu, X, Sun, Moon } from "lucide-react";
import { NavLink } from "@/components/ui/NavLink";
import { ProfilePill } from "@/components/ui/ProfilePill";
import { Button } from "@/components/ui/Button";

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
        className={`absolute top-[2px] left-[2px] w-[20px] h-[20px] rounded-full bg-gradient-to-br from-amber to-amber-gradient-end flex items-center justify-center text-[10px] text-btn-dark-text transition-transform duration-250 ease-out ${
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

  const mobileLinkClass = (path: string) =>
    `text-[15px] no-underline transition-colors ${isActive(path) ? "text-amber font-semibold" : "text-panel-text font-medium"}`;

  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md bg-bg/80 border-b border-panel-border w-full">
      <div className="relative max-w-[1440px] xl:max-w-[1600px] 2xl:max-w-[1720px] mx-auto px-6 md:px-8 xl:px-12 flex items-center justify-between h-[68px]">
        {/* Brand / Logo (Left) */}
        <div className="flex items-center gap-8 shrink-0 z-10">
          <Link href="/" className="flex items-center gap-2.5 no-underline text-current">
            <div className="w-[30px] h-[30px] rounded-[7px] bg-gradient-to-br from-amber to-amber-gradient-end flex items-center justify-center font-mono font-semibold text-[13px] text-btn-dark-text shadow-sm">
              D/L
            </div>
            <span className="font-heading font-semibold text-[16.5px] text-panel-text">DevOps.lab</span>
          </Link>
        </div>

        {/* Navigation Links (Dead-Centered on Large Screens) */}
        <div className="hidden lg:flex items-center justify-center gap-6 xl:gap-8 absolute left-1/2 -translate-x-1/2 pointer-events-auto">
          <NavLink href="/">Home</NavLink>
          {user && (
            <>
              <NavLink href="/dashboard">Dashboard</NavLink>
              <NavLink href="/teams">Teams</NavLink>
            </>
          )}
          <NavLink href="/challenges">Challenges</NavLink>
          <NavLink href="/articles">Postmortems</NavLink>
          <NavLink href="/roadmaps">Roadmaps</NavLink>
          <NavLink href="/quizzes">Quizzes</NavLink>
          <NavLink href="/leaderboard">Leaderboard</NavLink>
          <NavLink href="/community">Community</NavLink>
          <NavLink href="/#stack">Stack</NavLink>
        </div>

        {/* Controls / Theme / Profile / CTA (Right) */}
        <div className="flex items-center gap-3.5 shrink-0 z-10">
          <NavThemeToggle />

          {user ? (
            <div className="hidden lg:flex items-center">
              <ProfilePill user={user} onLogout={logout} />
            </div>
          ) : (
            <div className="hidden lg:flex items-center gap-3">
              <Button href="/login" variant="ghost" size="sm">
                Sign in
              </Button>
              <Button href="/register" variant="primary" size="sm">
                Get started
              </Button>
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

      {/* Mobile drawer */}
      {isMobileMenuOpen && (
        <div className="lg:hidden bg-panel border-t border-panel-border px-8 py-4 flex flex-col gap-4 animate-[popIn_150ms_ease-out]">
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
            href="/articles"
            onClick={() => setIsMobileMenuOpen(false)}
            className={mobileLinkClass("/articles")}
          >
            Postmortems
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
                <div className="w-[28px] h-[28px] rounded-full bg-gradient-to-br from-amber to-amber-gradient-end text-btn-dark-text font-bold text-[12px] flex items-center justify-center font-mono">
                  {(user.name ? user.name[0] : user.email[0])?.toUpperCase() || "U"}
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
                className="bg-transparent border-none cursor-pointer text-panel-muted p-2 flex items-center gap-1.5 text-[14px] hover:text-amber"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 pt-2">
              <Button
                href="/login"
                variant="outline"
                size="md"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-center"
              >
                Sign in
              </Button>
              <Button
                href="/register"
                variant="primary"
                size="md"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-center"
              >
                Get started
              </Button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

