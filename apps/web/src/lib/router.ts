// ============================================================================
// Simple hash-based router
// ============================================================================

export type PageRenderer = (container: HTMLElement) => void | Promise<void>;

const routes = new Map<string, PageRenderer>();
let currentPage = "";

export function registerPage(path: string, renderer: PageRenderer): void {
  routes.set(path, renderer);
}

export function navigateTo(path: string): void {
  window.location.hash = path;
}

export function startRouter(): void {
  const handleRoute = async () => {
    const hash = window.location.hash.slice(1) || "/";
    const page = hash.split("/")[1] || "dashboard";

    if (page === currentPage) return;
    currentPage = page;

    // Update active nav link
    document.querySelectorAll(".nav-link").forEach((link) => {
      const linkPage = (link as HTMLElement).dataset.page;
      link.classList.toggle("active", linkPage === page);
    });

    // Render page
    const container = document.getElementById("page-container");
    if (!container) return;

    const renderer = routes.get(page);
    if (renderer) {
      container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
      try {
        await renderer(container);
      } catch (err) {
        container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err instanceof Error ? err.message : "Failed to load page"}</p></div>`;
      }
    } else {
      container.innerHTML = '<div class="empty-state"><h3>Page Not Found</h3><p>This page does not exist.</p></div>';
    }
  };

  window.addEventListener("hashchange", handleRoute);
  handleRoute();
}
