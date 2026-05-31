"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Terminal, Menu, X, LogOut, User } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/providers/AuthProvider";

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/challenges", label: "Challenges" },
  { href: "/paths", label: "Learning Paths" },
  { href: "/quizzes", label: "Quizzes" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <Terminal size={24} />
          <Link href="/" className="text-xl font-bold tracking-tight">
            DevOps.lab
          </Link>
        </div>

        <nav className="hidden md:flex gap-6 items-center">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link 
                key={link.href} 
                href={link.href} 
                className={`text-sm font-semibold transition-opacity ${isActive ? "text-black underline underline-offset-4" : "text-gray-500 hover:text-black"}`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-4">
          {user ? (
            <div className="border border-neutral-200 bg-neutral-50/50 rounded-lg px-3 py-1.5 flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-neutral-700">
                <User size={14} className="text-neutral-500" />
                <span>{user.name || user.email.split('@')[0]}</span>
              </div>
              <div className="w-px h-4 bg-neutral-200" />
              <button 
                onClick={() => logout()}
                className="text-neutral-500 hover:text-black transition-colors cursor-pointer flex items-center"
                title="Log Out"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <Link href="/login" style={{ "--btn-color": "#000000", color: "#ffffff" } as React.CSSProperties} className="btn">
              Log In
            </Link>
          )}
        </div>

        <button
          className="md:hidden p-2"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle menu"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

     
      {isOpen && (
        <div className="md:hidden border-b border-gray-200 bg-white px-4 py-4">
          <nav className="flex flex-col gap-4">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link 
                  key={link.href} 
                  href={link.href} 
                  className={`text-base font-semibold ${isActive ? "text-black underline underline-offset-4" : "text-gray-500"}`}
                  onClick={() => setIsOpen(false)}
                >
                  {link.label}
                </Link>
              );
            })}
            <hr className="border-gray-200 my-2" />
            {user ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 px-2">
                  <User size={16} />
                  <span>{user.name || user.email.split('@')[0]}</span>
                </div>
                <button 
                  onClick={() => {
                    logout();
                    setIsOpen(false);
                  }}
                  className="btn w-full bg-neutral-100 flex items-center justify-center gap-2"
                  style={{ "--btn-color": "#f5f5f5", color: "#000000" } as React.CSSProperties}
                >
                  <LogOut size={16} />
                  Log Out
                </button>
              </div>
            ) : (
              <Link href="/login" style={{ "--btn-color": "#000000", color: "#ffffff" } as React.CSSProperties} className="btn w-full" onClick={() => setIsOpen(false)}>
                Log In
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
