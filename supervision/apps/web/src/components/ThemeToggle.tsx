import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";

export default function ThemeToggle() {
  const { tema, alternar } = useTheme();

  return (
    <Button variant="ghost" size="icon" onClick={alternar} title={tema === "dark" ? "Modo claro" : "Modo escuro"}>
      {tema === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
