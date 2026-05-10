/**
 * Theme toggle. Persists to `localStorage["sc.theme"]`. Default dark.
 *
 * The initial theme is set in a tiny inline script in index.html (so there's
 * no flash); this module owns the runtime toggle button and keeps the DOM
 * + storage in sync.
 */

const STORAGE_KEY = "sc.theme";

export type Theme = "dark" | "light";

export function getTheme(): Theme {
  try {
    return (localStorage.getItem(STORAGE_KEY) as Theme | null) || "dark";
  } catch {
    return "dark";
  }
}

export function setTheme(t: Theme): void {
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    // private mode / blocked — ignore
  }
}

export function bindThemeToggle(button: HTMLButtonElement): void {
  const render = () => {
    const t = getTheme();
    button.innerHTML = t === "dark" ? sunSvg() : moonSvg();
    button.setAttribute(
      "aria-label",
      t === "dark" ? "Switch to light mode" : "Switch to dark mode",
    );
    button.setAttribute("title", t === "dark" ? "Light mode" : "Dark mode");
  };
  button.addEventListener("click", () => {
    const next: Theme = getTheme() === "dark" ? "light" : "dark";
    setTheme(next);
    render();
  });
  render();
}

function sunSvg(): string {
  return `
<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
  <circle cx="8" cy="8" r="3"></circle>
  <line x1="8" y1="1.5" x2="8" y2="3"></line>
  <line x1="8" y1="13" x2="8" y2="14.5"></line>
  <line x1="1.5" y1="8" x2="3" y2="8"></line>
  <line x1="13" y1="8" x2="14.5" y2="8"></line>
  <line x1="3.4" y1="3.4" x2="4.5" y2="4.5"></line>
  <line x1="11.5" y1="11.5" x2="12.6" y2="12.6"></line>
  <line x1="3.4" y1="12.6" x2="4.5" y2="11.5"></line>
  <line x1="11.5" y1="4.5" x2="12.6" y2="3.4"></line>
</svg>`.trim();
}

function moonSvg(): string {
  return `
<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
  <path d="M13.5 9.5 A6 6 0 0 1 6.5 2.5 A6 6 0 1 0 13.5 9.5 Z"></path>
</svg>`.trim();
}
