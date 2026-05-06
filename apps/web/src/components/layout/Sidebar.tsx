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
    <aside className="sidebar">
      <div>
        <div className="logo-container">
          <Terminal />
          <span>DevOps.lab</span>
        </div>

        <nav className="nav-menu">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? "active" : ""}
            >
              <item.icon />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="secondary-menu">
          {secondaryItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
            >
              <item.icon />
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}
