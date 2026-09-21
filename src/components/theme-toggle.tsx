import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { applyTheme, storeTheme, type Theme } from "@/lib/theme";

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");

  // O script inline no <head> já aplicou a classe antes da hidratação —
  // aqui só lemos o resultado pra sincronizar o ícone/rótulo do botão.
  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    storeTheme(next);
  }

  return (
    <Button variant="outline" className={cn(className)} onClick={toggle}>
      {theme === "dark" ? <Sun /> : <Moon />}
      {theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
    </Button>
  );
}
