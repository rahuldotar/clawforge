"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/dashboard/clients", label: "Clients", icon: "monitor" },
  { href: "/policies", label: "Policy Editor", icon: "shield" },
  { href: "/skills", label: "Skill Review", icon: "check-square" },
  { href: "/audit", label: "Audit Logs", icon: "file-text" },
  { href: "/kill-switch", label: "Kill Switch", icon: "power" },
  { href: "/users", label: "Users", icon: "users" },
  { href: "/enrollment", label: "Enrollment", icon: "key" },
  { href: "/settings", label: "Settings", icon: "gear" },
];

const ICONS: Record<string, string> = {
  grid: "\u25A6",
  monitor: "\u25C9",
  shield: "\u26E8",
  "check-square": "\u2611",
  "file-text": "\u2637",
  power: "\u23FB",
  users: "\u263A",
  key: "\u2386",
  gear: "\u2699",
};

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <div className="mb-8">
        <h1 className="text-xl font-bold text-primary">ClawForge</h1>
        <p className="text-xs text-muted-foreground mt-1">Admin Console</p>
      </div>
      <nav className="space-y-1 flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
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
          onClick={onNavigate}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign out
        </Link>
      </div>
    </>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Hamburger button - mobile only */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 left-4 z-40 md:hidden p-2 rounded-md bg-card border border-border shadow-sm"
        aria-label="Open menu"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <rect y="3" width="20" height="2" rx="1" />
          <rect y="9" width="20" height="2" rx="1" />
          <rect y="15" width="20" height="2" rx="1" />
        </svg>
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 bg-card border-r border-border min-h-screen p-4 flex-col shrink-0">
        <NavContent />
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-card border-r border-border p-4 flex flex-col animate-slide-in-left">
            <NavContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
