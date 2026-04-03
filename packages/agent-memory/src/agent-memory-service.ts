import path from "node:path";
import { Effect, Layer, Schema, ServiceMap } from "effect";
import * as FileSystem from "effect/FileSystem";

export const MemoryCategory = Schema.Literals([
  "selector",
  "flow",
  "failure",
  "success",
  "insight",
] as const);
export type MemoryCategory = typeof MemoryCategory.Type;

export class MemoryEntry extends Schema.Class<MemoryEntry>("MemoryEntry")({
  id: Schema.String,
  category: MemoryCategory,
  content: Schema.String,
  metadata: Schema.Record(Schema.String, Schema.Unknown),
  url: Schema.optional(Schema.String),
  timestamp: Schema.Number,
  embedding: Schema.optional(Schema.Array(Schema.Number)),
}) {}

export interface MemoryQuery {
  query: string;
  category?: string;
  url?: string;
  limit?: number;
  minRelevance?: number;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  relevance: number;
}

export class MemoryStorageError extends Schema.ErrorClass<MemoryStorageError>("MemoryStorageError")(
  {
    _tag: Schema.tag("MemoryStorageError"),
    operation: Schema.String,
    cause: Schema.Unknown,
  },
) {
  message = `Memory storage error during ${this.operation}`;
}

export class MemoryNotFoundError extends Schema.ErrorClass<MemoryNotFoundError>(
  "MemoryNotFoundError",
)({
  _tag: Schema.tag("MemoryNotFoundError"),
  id: Schema.String,
}) {
  message = `Memory not found: ${this.id}`;
}

export class MemoryImportError extends Schema.ErrorClass<MemoryImportError>("MemoryImportError")({
  _tag: Schema.tag("MemoryImportError"),
  path: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Failed to import memories from ${this.path}`;
}

export class MemoryExportError extends Schema.ErrorClass<MemoryExportError>("MemoryExportError")({
  _tag: Schema.tag("MemoryExportError"),
  path: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Failed to export memories to ${this.path}`;
}

const DEFAULT_STORAGE_DIR = ".inspect/agent-memory";
const DEFAULT_LIMIT = 10;
const DEFAULT_MIN_RELEVANCE = 0.1;

const generateId = (): string => {
  return `mem_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
};

const calculateKeywordRelevance = (query: string, content: string): number => {
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);
  const contentLower = content.toLowerCase();

  if (queryWords.length === 0) return 0;

  const matches = queryWords.filter((word) => contentLower.includes(word)).length;
  return matches / queryWords.length;
};

export class AgentMemoryService extends ServiceMap.Service<AgentMemoryService>()(
  "@inspect/AgentMemoryService",
  {
    make: Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;

      const storageDir = path.join(process.cwd(), DEFAULT_STORAGE_DIR);
      const memories = new Map<string, MemoryEntry>();

      const ensureStorageDir = Effect.fn("AgentMemoryService.ensureStorageDir")(function* () {
        const exists = yield* fileSystem.exists(storageDir);
        if (!exists) {
          yield* fileSystem.makeDirectory(storageDir, { recursive: true });
        }
      });

      const persistToDisk = Effect.fn("AgentMemoryService.persistToDisk")(function* () {
        yield* ensureStorageDir();
        const data = JSON.stringify(Array.from(memories.values()), null, 2);
        const filePath = path.join(storageDir, "memories.json");
        yield* fileSystem.writeFileString(filePath, data);
      });

      const loadFromDisk = Effect.fn("AgentMemoryService.loadFromDisk")(function* () {
        const filePath = path.join(storageDir, "memories.json");
        const exists = yield* fileSystem.exists(filePath);

        if (!exists) {
          return;
        }

        const data = yield* fileSystem.readFileString(filePath);
        const parsed = JSON.parse(data) as unknown[];

        memories.clear();
        for (const item of parsed) {
          const decodeResult = yield* Schema.decodeUnknownEffect(MemoryEntry)(item).pipe(
            Effect.matchEffect({
              onFailure: () => Effect.succeed(null),
              onSuccess: (entry) => Effect.succeed(entry),
            }),
          );
          if (decodeResult) {
            memories.set(decodeResult.id, decodeResult);
          }
        }
      });

      const add = Effect.fn("AgentMemoryService.add")(function* (
        entryInput: Omit<typeof MemoryEntry.Type, "id" | "timestamp">,
      ) {
        const entry = new MemoryEntry({
          ...entryInput,
          id: generateId(),
          timestamp: Date.now(),
        });

        memories.set(entry.id, entry);
        yield* persistToDisk();

        yield* Effect.logInfo("Memory added", {
          id: entry.id,
          category: entry.category,
          contentPreview: entry.content.slice(0, 100),
        });

        return entry;
      });

      const search = Effect.fn("AgentMemoryService.search")(function* (query: MemoryQuery) {
        yield* Effect.logDebug("Searching memories", {
          query: query.query,
          category: query.category,
        });

        const limit = query.limit ?? DEFAULT_LIMIT;
        const minRelevance = query.minRelevance ?? DEFAULT_MIN_RELEVANCE;

        const results: MemorySearchResult[] = [];

        for (const entry of memories.values()) {
          if (query.category && entry.category !== query.category) {
            continue;
          }

          if (query.url && entry.url !== query.url) {
            continue;
          }

          const relevance = calculateKeywordRelevance(query.query, entry.content);

          if (relevance >= minRelevance) {
            results.push({ entry, relevance });
          }
        }

        results.sort((left, right) => right.relevance - left.relevance);

        yield* Effect.logDebug("Memory search completed", {
          query: query.query,
          resultsFound: results.length,
        });

        return results.slice(0, limit);
      });

      const getByCategory = Effect.fn("AgentMemoryService.getByCategory")(function* (
        category: string,
        limit?: number,
      ) {
        const maxResults = limit ?? DEFAULT_LIMIT;

        const filtered = Array.from(memories.values())
          .filter((entry) => entry.category === category)
          .sort((left, right) => right.timestamp - left.timestamp);

        return filtered.slice(0, maxResults);
      });

      const getForUrl = Effect.fn("AgentMemoryService.getForUrl")(function* (
        url: string,
        limit?: number,
      ) {
        const maxResults = limit ?? DEFAULT_LIMIT;

        const filtered = Array.from(memories.values())
          .filter((entry) => entry.url === url)
          .sort((left, right) => right.timestamp - left.timestamp);

        return filtered.slice(0, maxResults);
      });

      const getLatest = Effect.fn("AgentMemoryService.getLatest")(function* (limit?: number) {
        const maxResults = limit ?? DEFAULT_LIMIT;

        const sorted = Array.from(memories.values()).sort(
          (left, right) => right.timestamp - left.timestamp,
        );

        return sorted.slice(0, maxResults);
      });

      const getById = Effect.fn("AgentMemoryService.getById")(function* (id: string) {
        const entry = memories.get(id);
        return entry ?? null;
      });

      const deleteEntry = Effect.fn("AgentMemoryService.delete")(function* (id: string) {
        const existed = memories.has(id);
        memories.delete(id);

        if (existed) {
          yield* persistToDisk();
          yield* Effect.logInfo("Memory deleted", { id });
        }
      });

      const clear = Effect.fn("AgentMemoryService.clear")(function* () {
        const count = memories.size;
        memories.clear();
        yield* persistToDisk();
        yield* Effect.logInfo("All memories cleared", { count });
      });

      const exportToFile = Effect.fn("AgentMemoryService.export")(function* (exportPath: string) {
        const data = JSON.stringify(Array.from(memories.values()), null, 2);
        yield* fileSystem.writeFileString(exportPath, data);
        yield* Effect.logInfo("Memories exported", { path: exportPath, count: memories.size });
      });

      const importFromFile = Effect.fn("AgentMemoryService.import")(function* (importPath: string) {
        const exists = yield* fileSystem.exists(importPath);

        if (!exists) {
          return yield* new MemoryImportError({
            path: importPath,
            cause: "File does not exist",
          }).asEffect();
        }

        const data = yield* fileSystem.readFileString(importPath);
        const parsed = JSON.parse(data) as unknown[];

        for (const item of parsed) {
          const decodeResult = yield* Schema.decodeUnknownEffect(MemoryEntry)(item).pipe(
            Effect.matchEffect({
              onFailure: () => Effect.succeed(null),
              onSuccess: (entry) => Effect.succeed(entry),
            }),
          );
          if (decodeResult) {
            memories.set(decodeResult.id, decodeResult);
          }
        }

        yield* persistToDisk();
        yield* Effect.logInfo("Memories imported", { path: importPath, count: parsed.length });
      });

      const getStats = Effect.fn("AgentMemoryService.getStats")(function* () {
        const byCategory: Record<string, number> = {};
        const byUrl: Record<string, number> = {};

        for (const entry of memories.values()) {
          byCategory[entry.category] = (byCategory[entry.category] ?? 0) + 1;

          if (entry.url) {
            byUrl[entry.url] = (byUrl[entry.url] ?? 0) + 1;
          }
        }

        return {
          total: memories.size,
          byCategory,
          byUrl,
        };
      });

      yield* loadFromDisk();

      return {
        add,
        search,
        getByCategory,
        getForUrl,
        getLatest,
        getById,
        delete: deleteEntry,
        clear,
        export: exportToFile,
        import: importFromFile,
        getStats,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
