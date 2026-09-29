import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { User, LogOut, ChevronDown } from "lucide-react";

export interface ProfilePillProps {
  user: {
    name?: string | null;
    email: string;
  };
  onLogout: () => void;
}

export function ProfilePill({ user, onLogout }: ProfilePillProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const displayName = user.name || user.email.split("@")[0];
  const initial = (user.name ? user.name[0] : user.email[0])?.toUpperCase() || "U";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2.5 bg-panel-2 hover:bg-panel border border-panel-border hover:border-panel-muted-dim rounded-full pl-1.5 pr-3 py-1 cursor-pointer transition-all duration-150 text-panel-text group"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="User menu"
      >
        <div className="w-[26px] h-[26px] rounded-full bg-gradient-to-br from-amber to-amber-gradient-end text-btn-dark-text font-bold text-[12px] flex items-center justify-center font-mono shrink-0 shadow-sm">
          {initial}
        </div>
        <span className="font-mono text-[12.5px] font-semibold tracking-tight text-panel-text max-w-[120px] truncate">
          {displayName}
        </span>
        <ChevronDown
          size={13}
          className={`text-panel-muted transition-transform duration-200 ${
            isOpen ? "rotate-180 text-amber" : "group-hover:text-panel-text"
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-panel border border-panel-border rounded-xl shadow-[0_12px_32px_var(--theme-shadow)] py-1.5 z-50 animate-[popIn_150ms_ease-out]">
          <div className="px-3.5 py-2 border-b border-panel-border/60">
            <p className="text-[11px] font-mono text-panel-muted uppercase tracking-wider">Signed in as</p>
            <p className="text-[13px] font-semibold text-panel-text truncate">{user.email}</p>
          </div>

          <Link
            href="/profile"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-2 px-3.5 py-2 text-[13px] text-panel-text hover:bg-panel-2 hover:text-amber no-underline transition-colors"
          >
            <User size={15} className="text-panel-muted" />
            <span>Profile & Settings</span>
          </Link>

          <button
            onClick={() => {
              setIsOpen(false);
              onLogout();
            }}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-[13px] text-red-auth hover:bg-panel-2 border-none bg-transparent cursor-pointer transition-colors text-left"
          >
            <LogOut size={15} />
            <span>Log out</span>
          </button>
        </div>
      )}
    </div>
  );
}
