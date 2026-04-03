// ──────────────────────────────────────────────────────────────────────────────
// Artifact — LLM-generated code/UI artifacts (LibreChat-style)
// Stores, renders, and manages generated preview artifacts during sessions
// ──────────────────────────────────────────────────────────────────────────────

import * as path from "node:path";
import * as fs from "node:fs";

export type ArtifactType = "html" | "react" | "mermaid" | "svg" | "markdown" | "test-code" | "json";

export interface Artifact {
  id: string;
  sessionId: string;
  title: string;
  type: ArtifactType;
  content: string;
  metadata: {
    createdAt: string;
    model?: string;
    sourceAction?: string;
    wordCount: number;
  };
}

export class ArtifactStore {
  private artifacts: Map<string, Artifact> = new Map();
  private persistPath?: string;

  constructor(options?: { persistPath?: string }) {
    if (options?.persistPath) {
      this.persistPath = options.persistPath;
      this.loadFromDisk();
    }
  }

  create(
    sessionId: string,
    type: ArtifactType,
    title: string,
    content: string,
    metadata?: Partial<Artifact["metadata"]>,
  ): Artifact {
    const id = `artifact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const artifact: Artifact = {
      id,
      sessionId,
      title,
      type,
      content,
      metadata: {
        createdAt: new Date().toISOString(),
        wordCount: content.split(/\s+/).length,
        ...metadata,
      },
    };
    this.artifacts.set(id, artifact);
    this.persist();
    return artifact;
  }

  get(id: string): Artifact | undefined {
    return this.artifacts.get(id);
  }

  getBySession(sessionId: string): Artifact[] {
    return Array.from(this.artifacts.values()).filter((a) => a.sessionId === sessionId);
  }

  getAll(): Artifact[] {
    return Array.from(this.artifacts.values());
  }

  update(id: string, content: string): Artifact | undefined {
    const existing = this.artifacts.get(id);
    if (!existing) return undefined;
    const updated: Artifact = {
      ...existing,
      content,
      metadata: {
        ...existing.metadata,
        createdAt: new Date().toISOString(),
        wordCount: content.split(/\s+/).length,
      },
    };
    this.artifacts.set(id, updated);
    this.persist();
    return updated;
  }

  delete(id: string): boolean {
    const removed = this.artifacts.delete(id);
    if (removed) this.persist();
    return removed;
  }

  /** Render artifact to a displayable format (HTML iframe src, mermaid URL, etc.). */
  render(artifact: Artifact): string {
    switch (artifact.type) {
      case "html":
        return artifact.content;
      case "svg":
        return artifact.content;
      case "react":
        // Wrap React component in standalone HTML with Babel standalone transpiler
        return this.reactToHtml(artifact.content);
      case "mermaid":
        return this.mermaidToHtml(artifact.content);
      case "markdown":
        return this.markdownToHtml(artifact.content);
      case "test-code":
        return `<pre><code>${escapeHtml(artifact.content)}</code></pre>`;
      case "json":
        return `<pre><code>${escapeHtml(artifact.content)}</code></pre>`;
      default:
        return `<pre><code>${escapeHtml(artifact.content)}</code></pre>`;
    }
  }

  stats(): { total: number; byType: Record<string, number>; bySession: Record<string, number> } {
    const all = Array.from(this.artifacts.values());
    const byType: Record<string, number> = {};
    const bySession: Record<string, number> = {};
    for (const a of all) {
      byType[a.type] = (byType[a.type] ?? 0) + 1;
      bySession[a.sessionId] = (bySession[a.sessionId] ?? 0) + 1;
    }
    return { total: all.length, byType, bySession };
  }

  private persist(): void {
    if (!this.persistPath) return;
    const dir = path.dirname(this.persistPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = JSON.stringify(Array.from(this.artifacts.entries()), null, 2);
    fs.writeFileSync(this.persistPath, data);
  }

  private loadFromDisk(): void {
    if (!this.persistPath || !fs.existsSync(this.persistPath)) return;
    try {
      const data = fs.readFileSync(this.persistPath, "utf-8");
      const entries = JSON.parse(data) as Array<[string, Artifact]>;
      for (const [id, artifact] of entries) {
        this.artifacts.set(id, artifact);
      }
    } catch {
      // Corrupt file — start fresh
    }
  }

  private reactToHtml(jsx: string): string {
    return `<!DOCTYPE html>
<html><head>
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head><body><div id="root"></div>
<script type="text/babel">${jsx}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
</script></body></html>`;
  }

  private mermaidToHtml(diagram: string): string {
    return `<div class="mermaid">${diagram}</div>
<script type="module">import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';mermaid.initialize({ startOnLoad: true });</script>`;
  }

  private markdownToHtml(md: string): string {
    // Simple markdown → HTML (headings, paragraphs, code blocks, lists)
    return md
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
