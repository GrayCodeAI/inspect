import { writeFile } from "node:fs/promises";

export interface TraceSpan {
  id: string;
  name: string;
  parentId: string | null;
  startTime: number;
  endTime: number | null;
  status: "running" | "completed" | "error";
  attributes: Record<string, unknown>;
  children: string[];
  error?: string;
}

export interface TraceTree {
  root: string;
  spans: Map<string, TraceSpan>;
  metadata: Record<string, unknown>;
}

export class ExecutionTracer {
  private spans: Map<string, TraceSpan> = new Map();
  private rootSpanId: string | null = null;
  private metadata: Record<string, unknown> = {};
  private spanCounter = 0;

  private generateSpanId = (): string => {
    this.spanCounter += 1;
    return `span_${this.spanCounter}_${Date.now()}`;
  };

  startSpan = (name: string, parentId?: string, attributes?: Record<string, unknown>): string => {
    const id = this.generateSpanId();
    const span: TraceSpan = {
      id,
      name,
      parentId: parentId ?? null,
      startTime: Date.now(),
      endTime: null,
      status: "running",
      attributes: attributes ?? {},
      children: [],
    };

    this.spans.set(id, span);

    if (parentId) {
      const parent = this.spans.get(parentId);
      if (parent) {
        parent.children.push(id);
      }
    } else if (!this.rootSpanId) {
      this.rootSpanId = id;
    }

    return id;
  };

  endSpan = (spanId: string, error?: string): void => {
    const span = this.spans.get(spanId);
    if (!span) {
      return;
    }

    span.endTime = Date.now();
    span.status = error ? "error" : "completed";
    if (error) {
      span.error = error;
    }
  };

  addAttribute = (spanId: string, key: string, value: unknown): void => {
    const span = this.spans.get(spanId);
    if (span) {
      span.attributes[key] = value;
    }
  };

  getTree = (): TraceTree => {
    return {
      root: this.rootSpanId ?? "",
      spans: new Map(this.spans),
      metadata: { ...this.metadata },
    };
  };

  getTreeAsJson = (): string => {
    const tree = this.getTree();
    const serialized = {
      root: tree.root,
      spans: Array.from(tree.spans.entries()).map(([id, span]) => [
        id,
        {
          ...span,
          children: span.children,
        },
      ]),
      metadata: tree.metadata,
    };
    return JSON.stringify(serialized, null, 2);
  };

  exportToFile = async (path: string): Promise<void> => {
    const json = this.getTreeAsJson();
    await writeFile(path, json, "utf-8");
  };

  clear = (): void => {
    this.spans.clear();
    this.rootSpanId = null;
    this.metadata = {};
    this.spanCounter = 0;
  };

  getActiveSpans = (): TraceSpan[] => {
    return Array.from(this.spans.values()).filter((span) => span.status === "running");
  };

  setMetadata = (key: string, value: unknown): void => {
    this.metadata[key] = value;
  };
}

const formatSpanTree = (tree: TraceTree, spanId: string, indent: string): string => {
  const span = tree.spans.get(spanId);
  if (!span) {
    return "";
  }

  const duration = span.endTime ? span.endTime - span.startTime : "running";
  const statusIcon = span.status === "completed" ? "✓" : span.status === "error" ? "✗" : "○";
  const errorInfo = span.error ? `\n${indent}  **Error:** ${span.error}` : "";

  let result = `${indent}${statusIcon} **${span.name}** (${duration}ms)${errorInfo}\n`;

  for (const childId of span.children) {
    result += formatSpanTree(tree, childId, indent + "  ");
  }

  return result;
};

export const formatTraceAsMarkdown = (tree: TraceTree): string => {
  const lines: string[] = [];
  lines.push("# Execution Trace\n");

  if (tree.metadata && Object.keys(tree.metadata).length > 0) {
    lines.push("## Metadata\n");
    for (const [key, value] of Object.entries(tree.metadata)) {
      lines.push(`- **${key}:** ${JSON.stringify(value)}`);
    }
    lines.push("");
  }

  lines.push("## Spans\n");

  const rootSpan = tree.spans.get(tree.root);
  if (rootSpan) {
    lines.push(formatSpanTree(tree, tree.root, ""));
  } else {
    for (const [spanId, span] of tree.spans) {
      if (span.parentId === null) {
        lines.push(formatSpanTree(tree, spanId, ""));
      }
    }
  }

  lines.push("\n---\n");
  lines.push(`*Trace generated at ${new Date().toISOString()}*`);

  return lines.join("\n");
};
