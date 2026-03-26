import { getDevices } from "../lib/api.js";

export async function renderDevices(container: HTMLElement): Promise<void> {
  let devices: Array<{ key: string; name: string; width: number; height: number; dpr: number; mobile: boolean }> = [];

  try {
    const data = await getDevices();
    devices = data.devices;
  } catch { /* empty */ }

  const mobile = devices.filter((d) => d.mobile);
  const desktop = devices.filter((d) => !d.mobile);

  container.innerHTML = `
    <div class="page-header">
      <h2>Device Presets</h2>
      <p>${devices.length} devices — ${mobile.length} mobile, ${desktop.length} desktop</p>
    </div>

    <div class="card-grid">
      ${devices.map((d) => `
        <div class="card">
          <div class="card-label">${d.mobile ? "Mobile" : "Desktop"}</div>
          <div style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">${d.name}</div>
          <div style="font-family: var(--font-mono); font-size: 13px; color: var(--text-dim);">
            ${d.width} x ${d.height} @${d.dpr}x
          </div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px; font-family: var(--font-mono);">${d.key}</div>
        </div>
      `).join("")}
    </div>

    ${devices.length === 0 ? '<div class="empty-state"><h3>No devices</h3><p>Start the API server with <code>inspect serve</code></p></div>' : ""}
  `;
}
