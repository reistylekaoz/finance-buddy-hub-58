export type Theme = "light" | "dark";

const STORAGE_KEY = "fluxora-theme";

// Preferência de tema é do dispositivo/navegador, não da conta — por isso
// localStorage em vez de profiles (não precisa seguir o usuário entre
// aparelhos, e evita round-trip ao banco só pra pintar a tela).
export function getStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* localStorage indisponível (aba anônima etc.) — tema só não persiste */
  }
}

// Script inline injetado no <head>, antes do CSS terminar de carregar, pra
// aplicar a classe "dark" no <html> antes da primeira pintura — sem isso a
// tela pisca clara e só escurece depois que o React hidrata.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark");}}catch(e){}})();`;
