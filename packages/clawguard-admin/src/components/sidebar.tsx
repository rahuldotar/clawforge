"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/policies", label: "Policy Editor", icon: "shield" },
  { href: "/skills", label: "Skill Review", icon: "check-square" },
  { href: "/audit", label: "Audit Logs", icon: "file-text" },
  { href: "/kill-switch", label: "Kill Switch", icon: "power" },
  { href: "/users", label: "Users", icon: "users" },
  { href: "/settings", label: "Settings", icon: "gear" },
];

const ICONS: Record<string, string> = {
  grid: "\u25A6",
  shield: "\u26E8",
  "check-square": "\u2611",
  "file-text": "\u2637",
  power: "\u23FB",
  users: "\u263A",
  gear: "\u2699",
};

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-card border-r border-border min-h-screen p-4 flex flex-col">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-primary">ClawGuard</h1>
        <p className="text-xs text-muted-foreground mt-1">Admin Console</p>
      </div>
      <nav className="space-y-1 flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-foreground hover:bg-secondary"
              }`}
            >
              <span className="text-lg">{ICONS[item.icon] ?? ""}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="pt-4 border-t border-border">
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign out
        </Link>
      </div>
    </aside>
  );
}
