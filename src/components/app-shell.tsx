import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Users, FileText, Sparkles, LogOut, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode } from "react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/prospeccao", label: "Prospecção", icon: Search },
  { to: "/demonstrativos", label: "Demonstrativos", icon: FileText },
] as const;

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background grid-bg">
      <div className="flex">
        <aside className="hidden md:flex w-64 shrink-0 flex-col gap-2 border-r border-border/60 bg-sidebar/60 backdrop-blur-xl min-h-screen p-4 sticky top-0">
          <Link to="/dashboard" className="flex items-center gap-2 px-2 py-3 mb-2">
            <div className="size-8 rounded-lg bg-gradient-primary grid place-items-center shadow-glow">
              <Sparkles className="size-4 text-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight">Contabil<span className="gradient-text">Connect</span></span>
          </Link>
          <nav className="flex-1 flex flex-col gap-1">
            {NAV.map(({ to, label, icon: Icon }) => {
              const active = pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all ${
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-elegant"
                      : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/40"
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
          <Button variant="ghost" onClick={signOut} className="justify-start gap-3 text-muted-foreground">
            <LogOut className="size-4" />
            Sair
          </Button>
        </aside>

        <main className="flex-1 min-w-0">
          <header className="md:hidden flex items-center justify-between border-b border-border/60 px-4 py-3 bg-background/80 backdrop-blur sticky top-0 z-10">
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="size-7 rounded-lg bg-gradient-primary grid place-items-center">
                <Sparkles className="size-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">Contabil<span className="gradient-text">Connect</span></span>
            </Link>
            <Button size="sm" variant="ghost" onClick={signOut}><LogOut className="size-4" /></Button>
          </header>

          <div className="flex md:hidden gap-1 px-3 py-2 border-b border-border/60 overflow-x-auto bg-background/60">
            {NAV.map(({ to, label, icon: Icon }) => {
              const active = pathname.startsWith(to);
              return (
                <Link key={to} to={to} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs whitespace-nowrap ${active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground"}`}>
                  <Icon className="size-3.5" />{label}
                </Link>
              );
            })}
          </div>

          {title && (
            <div className="px-6 pt-8 pb-4 md:px-10">
              <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            </div>
          )}
          <div className="px-6 pb-12 md:px-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
