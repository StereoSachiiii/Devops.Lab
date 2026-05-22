"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Terminal, 
  BookOpen, 
  Trophy, 
  Settings, 
  PlusCircle,
  HelpCircle
} from "lucide-react";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: Terminal, label: "Challenges", href: "/challenges" },
  { icon: BookOpen, label: "Learning Paths", href: "/paths" },
  { icon: Trophy, label: "Leaderboard", href: "/leaderboard" },
];

const secondaryItems = [
  { icon: PlusCircle, label: "Contribute", href: "/contribute" },
  { icon: Settings, label: "Settings", href: "/settings" },
  { icon: HelpCircle, label: "Support", href: "/support" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 h-screen border-r border-neutral-800 p-6 flex flex-col justify-between">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-2">
          <Terminal size={20} />
          <span>DevOps.lab</span>
        </div>

        <nav className="flex flex-col gap-2">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 p-2 ${
                pathname === item.href ? "border border-neutral-700" : ""
              }`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex flex-col gap-2">
        {secondaryItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 p-2 ${
              pathname === item.href ? "border border-neutral-700" : ""
            }`}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </aside>
  );
}
