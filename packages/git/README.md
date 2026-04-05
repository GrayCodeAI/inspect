# @inspect/git

Git integration for inspect. Reads unstaged changes, branch diffs, and commit history to determine what code changes need testing.

## Usage

```ts
import { GitClient } from "@inspect/git/git-client.js";
```

## Key Exports

- `GitClient` — git operations via simple-git
- `DiffReader` — reads and parses git diffs for change detection
