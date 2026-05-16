import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Activity, FileText, Gauge } from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: Gauge },
  { to: "/relatorio", label: "Relatório", icon: FileText },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-10 w-56 border-r bg-card">
        <div className="flex items-center gap-2 px-6 py-4 border-b">
          <Activity className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">Transformer Monitor</span>
        </div>
        <nav className="flex flex-col gap-1 p-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  location.pathname === item.to
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="pl-56">
        <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
          <div className="flex items-center justify-between px-6 py-3">
            <h1 className="text-lg font-semibold">
              {navItems.find((i) => i.to === location.pathname)?.label ?? "Dashboard"}
            </h1>
          </div>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
