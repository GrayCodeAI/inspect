// ──────────────────────────────────────────────────────────────────────────────
// @inspect/shared - Git Integration Types
// ──────────────────────────────────────────────────────────────────────────────

/** Git commit information */
export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  files?: string[];
}

/** Git scope for change detection */
export interface GitScope {
  target: 'unstaged' | 'staged' | 'branch' | 'commit' | 'pr';
  changedFiles: string[];
  diff: string;
  commits: GitCommit[];
  baseBranch?: string;
  currentBranch?: string;
  repoRoot?: string;
}

/** Pull request information */
export interface PRInfo {
  owner: string;
  repo: string;
  number: number;
  title?: string;
  branch?: string;
  baseBranch?: string;
  url?: string;
  previewUrl?: string;
}
