import { Effect, Layer, Schema, ServiceMap, Scope } from "effect";
import * as FileSystem from "effect/FileSystem";
import { CookieDatabaseCopyError, CookieReadError } from "./errors.js";

export class SqliteClient extends ServiceMap.Service<SqliteClient>()("@inspect/SqliteClient", {
  make: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const copyToTemp = (sourcePath: string, prefix: string, _suffix: string, _engine: string) =>
      Effect.gen(function* () {
        const tempDir = yield* fs.makeTempDirectory({ prefix });
        const tempDatabasePath = `${tempDir}/cookies.sqlite`;
        yield* fs.copy(sourcePath, tempDatabasePath);
        return { tempDatabasePath };
      }).pipe(
        Effect.catchTag("PlatformError", (cause) =>
          new CookieDatabaseCopyError({ cause: cause as unknown }).asEffect(),
        ),
      );

    const query = (_dbPath: string, _sql: string, _engine: string): Effect.Effect<Record<string, unknown>[], CookieReadError> =>
      Effect.succeed([]);

    return { copyToTemp, query };
  }),
}) {
  static layer = Layer.effect(this, this.make);
}
