import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { canManageTeam } from "./api";
import { useMe, useSession } from "./session";
import { label } from "./format";

const NAV = [
  { href: "/approvals", text: "Approvals" },
  { href: "/conversations", text: "Conversations" },
  { href: "/work-orders", text: "Work orders" },
  { href: "/knowledge", text: "Knowledge" },
  { href: "/connectors", text: "Connectors", adminOnly: true },
  { href: "/team", text: "Team", adminOnly: true },
  { href: "/settings", text: "Settings", adminOnly: true },
  { href: "/account", text: "Account" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const me = useMe();
  const { logout } = useSession();
  const [location] = useLocation();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function signOut() {
    setSignOutError(null);
    try {
      await logout();
    } catch {
      setSignOutError("Couldn't sign out — check your connection and try again.");
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <div className="shrink-0">
              <Logo />
            </div>
            <nav className="flex items-center gap-1 overflow-x-auto" aria-label="Main">
              {NAV.filter((n) => !n.adminOnly || canManageTeam(me.role)).map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm whitespace-nowrap",
                    location.startsWith(n.href) ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {n.text}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm shrink-0">
            {/* Only on wide screens, where it fits beside every link; the Account page shows it too. */}
            <span className="hidden 2xl:inline text-muted-foreground truncate max-w-[16rem]">
              {me.org.name} · {me.user.name || me.user.email} ({label(me.role)})
            </span>
            {signOutError && (
              <span role="alert" className="text-destructive text-xs">
                {signOutError}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
