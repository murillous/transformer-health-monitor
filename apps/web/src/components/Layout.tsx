import { ReactNode } from "react";
import { Link } from "react-router-dom";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between p-4">
          <Link to="/" className="text-xl font-bold">
            Transformer Health Monitor
          </Link>
          <nav className="flex gap-4">
            <Link to="/" className="hover:underline">Dashboard</Link>
            <Link to="/relatorio" className="hover:underline">Relatório</Link>
          </nav>
        </div>
      </header>
      <main className="container mx-auto p-4">{children}</main>
    </div>
  );
}
