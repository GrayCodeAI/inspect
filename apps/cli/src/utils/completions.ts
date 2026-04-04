/**
 * Generate shell completion scripts for the inspect CLI.
 * Supports bash, zsh, and fish shells.
 */

const COMMANDS = [
  "test",
  "run",
  "pr",
  "replay",
  "compare",
  "a11y",
  "lighthouse",
  "security",
  "chaos",
  "visual",
  "serve",
  "tunnel",
  "sessions",
  "mcp",
  "extract",
  "workflow",
  "credentials",
  "init",
  "doctor",
  "generate",
  "audit",
  "devices",
  "agents",
  "models",
  "completions",
];

const AGENTS = ["claude", "gpt", "gemini", "deepseek", "ollama"];
const MODES = ["dom", "hybrid", "cua"];
const BROWSERS = ["chromium", "firefox", "webkit"];
const TARGETS = ["unstaged", "branch", "changes"];
const DEVICES = [
  "desktop-chrome",
  "desktop-firefox",
  "iphone-15",
  "iphone-15-pro-max",
  "ipad-pro",
  "pixel-8",
  "galaxy-s24",
  "macbook-pro-16",
];

export function generateBashCompletions(): string {
  return `# inspect CLI bash completions
# Add to ~/.bashrc: eval "$(inspect completions bash)"

_inspect_completions() {
  local cur prev commands
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  commands="${COMMANDS.join(" ")}"

  case "\${prev}" in
    inspect)
      COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
      return 0
      ;;
    --agent|-a)
      COMPREPLY=( $(compgen -W "${AGENTS.join(" ")}" -- "\${cur}") )
      return 0
      ;;
    --mode)
      COMPREPLY=( $(compgen -W "${MODES.join(" ")}" -- "\${cur}") )
      return 0
      ;;
    --browser)
      COMPREPLY=( $(compgen -W "${BROWSERS.join(" ")}" -- "\${cur}") )
      return 0
      ;;
    --target|-t)
      COMPREPLY=( $(compgen -W "${TARGETS.join(" ")}" -- "\${cur}") )
      return 0
      ;;
    --devices)
      COMPREPLY=( $(compgen -W "${DEVICES.join(" ")}" -- "\${cur}") )
      return 0
      ;;
    --template)
      COMPREPLY=( $(compgen -W "default minimal comprehensive" -- "\${cur}") )
      return 0
      ;;
  esac

  if [[ "\${cur}" == -* ]]; then
    local opts="--help --version --verbose --config --message --agent --mode --url --devices --headed --target --browser --a11y --lighthouse --mock --fault --yes --json --dry-run"
    COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
    return 0
  fi

  COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
}

complete -F _inspect_completions inspect
`;
}

export function generateZshCompletions(): string {
  return `#compdef inspect
# inspect CLI zsh completions
# Add to ~/.zshrc: eval "$(inspect completions zsh)"

_inspect() {
  local -a commands agents modes browsers targets devices templates

  commands=(
${COMMANDS.map((c) => `    '${c}:${getCommandDescription(c)}'`).join("\n")}
  )

  agents=(${AGENTS.join(" ")})
  modes=(${MODES.join(" ")})
  browsers=(${BROWSERS.join(" ")})
  targets=(${TARGETS.join(" ")})
  devices=(${DEVICES.join(" ")})
  templates=(default minimal comprehensive)

  _arguments -C \\
    '(-h --help)'{-h,--help}'[Show help]' \\
    '(-v --version)'{-v,--version}'[Show version]' \\
    '--verbose[Enable verbose output]' \\
    '--config[Config file path]:file:_files' \\
    '1:command:->command' \\
    '*::arg:->args'

  case $state in
    command)
      _describe 'command' commands
      ;;
    args)
      case $words[1] in
        test)
          _arguments \\
            '(-m --message)'{-m,--message}'[Test instruction]:instruction:' \\
            '(-a --agent)'{-a,--agent}'[AI agent]:agent:(${AGENTS.join(" ")})' \\
            '(-t --target)'{-t,--target}'[Git scope]:target:(${TARGETS.join(" ")})' \\
            '--mode[Agent mode]:mode:(${MODES.join(" ")})' \\
            '--url[Target URL]:url:' \\
            '--devices[Device presets]:devices:(${DEVICES.join(" ")})' \\
            '--browser[Browser]:browser:(${BROWSERS.join(" ")})' \\
            '--headed[Visible browser]' \\
            '--a11y[Include a11y audit]' \\
            '--lighthouse[Include Lighthouse]' \\
            '--verbose[Verbose output]' \\
            '--json[JSON output]' \\
            '--dry-run[Preview without executing]'
          ;;
        init)
          _arguments '--template[Config template]:template:(default minimal comprehensive)' '-y[Overwrite]'
          ;;
        run)
          _arguments '1:file:_files -g "*.{yaml,yml,json}"' '--env[Env file]:file:_files' '--verbose[Verbose]'
          ;;
        pr)
          _arguments '1:pr:' '--repo[Repository]:repo:' '(-a --agent)'{-a,--agent}'[Agent]:agent:(${AGENTS.join(" ")})'
          ;;
      esac
      ;;
  esac
}

_inspect
`;
}

export function generateFishCompletions(): string {
  const lines = [
    "# inspect CLI fish completions",
    "# Add to fish: inspect completions fish | source",
    "",
    "# Disable file completions by default",
    "complete -c inspect -f",
    "",
    "# Commands",
  ];

  for (const cmd of COMMANDS) {
    lines.push(
      `complete -c inspect -n '__fish_use_subcommand' -a '${cmd}' -d '${getCommandDescription(cmd)}'`,
    );
  }

  lines.push("");
  lines.push("# Global options");
  lines.push("complete -c inspect -l help -s h -d 'Show help'");
  lines.push("complete -c inspect -l version -s v -d 'Show version'");
  lines.push("complete -c inspect -l verbose -d 'Verbose output'");
  lines.push("complete -c inspect -l config -d 'Config file' -r -F");
  lines.push("");
  lines.push("# test subcommand options");
  lines.push(
    `complete -c inspect -n '__fish_seen_subcommand_from test' -l message -s m -d 'Test instruction' -r`,
  );
  lines.push(
    `complete -c inspect -n '__fish_seen_subcommand_from test' -l agent -s a -d 'AI agent' -r -a '${AGENTS.join(" ")}'`,
  );
  lines.push(
    `complete -c inspect -n '__fish_seen_subcommand_from test' -l mode -d 'Agent mode' -r -a '${MODES.join(" ")}'`,
  );
  lines.push(
    `complete -c inspect -n '__fish_seen_subcommand_from test' -l target -s t -d 'Git scope' -r -a '${TARGETS.join(" ")}'`,
  );
  lines.push(
    `complete -c inspect -n '__fish_seen_subcommand_from test' -l browser -d 'Browser' -r -a '${BROWSERS.join(" ")}'`,
  );
  lines.push(
    `complete -c inspect -n '__fish_seen_subcommand_from test' -l devices -d 'Device presets' -r -a '${DEVICES.join(" ")}'`,
  );
  lines.push(`complete -c inspect -n '__fish_seen_subcommand_from test' -l url -d 'Target URL' -r`);
  lines.push(
    `complete -c inspect -n '__fish_seen_subcommand_from test' -l headed -d 'Visible browser'`,
  );
  lines.push(`complete -c inspect -n '__fish_seen_subcommand_from test' -l a11y -d 'A11y audit'`);
  lines.push(
    `complete -c inspect -n '__fish_seen_subcommand_from test' -l lighthouse -d 'Lighthouse audit'`,
  );
  lines.push(`complete -c inspect -n '__fish_seen_subcommand_from test' -l json -d 'JSON output'`);
  lines.push(
    `complete -c inspect -n '__fish_seen_subcommand_from test' -l dry-run -d 'Preview only'`,
  );
  lines.push("");
  lines.push("# init subcommand");
  lines.push(
    `complete -c inspect -n '__fish_seen_subcommand_from init' -l template -d 'Template' -r -a 'default minimal comprehensive'`,
  );
  lines.push(
    `complete -c inspect -n '__fish_seen_subcommand_from init' -s y -l yes -d 'Overwrite'`,
  );

  return lines.join("\n") + "\n";
}

function getCommandDescription(cmd: string): string {
  const descriptions: Record<string, string> = {
    test: "Run AI-powered browser tests",
    run: "Run YAML/JSON test file",
    pr: "Test a GitHub pull request",
    replay: "Replay a saved flow",
    compare: "Compare test results",
    a11y: "Accessibility audit",
    lighthouse: "Lighthouse audit",
    security: "Security scan",
    chaos: "Chaos/monkey testing",
    visual: "Visual regression testing",
    serve: "Start API server",
    tunnel: "Create localhost tunnel",
    sessions: "Manage browser sessions",
    mcp: "Start MCP server",
    extract: "Extract data from pages",
    workflow: "Manage workflows",
    credentials: "Manage credentials",
    init: "Initialize project",
    doctor: "Check environment",
    generate: "Generate tests with AI",
    audit: "Code quality audit",
    devices: "List device presets",
    agents: "List AI agents",
    models: "List LLM models",
    completions: "Generate shell completions",
  };
  return descriptions[cmd] ?? cmd;
}
