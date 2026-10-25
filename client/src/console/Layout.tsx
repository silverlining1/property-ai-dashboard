import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { useMe, useSession } from "./session";
import { label } from "./format";

const NAV = [
  { href: "/approvals", text: "Approvals" },
  { href: "/conversations", text: "Conversations" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const me = useMe();
  const { logout } = useSession();
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <Logo />
            <nav className="flex items-center gap-1" aria-label="Main">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm",
                    location.startsWith(n.href) ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {n.text}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline text-muted-foreground truncate max-w-[16rem]">
              {me.org.name} · {me.user.name || me.user.email} ({label(me.role)})
            </span>
            <Button variant="outline" size="sm" onClick={() => logout()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
