import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "thm-theme";

export function useTheme() {
  const [tema, setTema] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem(STORAGE_KEY) as "dark" | "light") ?? "dark";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", tema === "dark");
    localStorage.setItem(STORAGE_KEY, tema);
  }, [tema]);

  const alternar = useCallback(() => {
    setTema((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return { tema, alternar };
}
