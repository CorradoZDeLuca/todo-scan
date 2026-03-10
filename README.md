# todo-scan

[![npm version](https://img.shields.io/npm/v/todo-scan.svg)](https://www.npmjs.com/package/todo-scan)
[![license](https://img.shields.io/npm/l/todo-scan.svg)](https://github.com/agent20usd/todo-scan/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/todo-scan.svg)](https://nodejs.org)

Scan your codebase for TODO, FIXME, HACK, and other comment tags. Zero dependencies. CI/CD ready.

## Install

```bash
# Run instantly with npx (no install)
npx todo-scan

# Or install globally
npm i -g todo-scan
```

## Usage

```bash
# Scan current directory
todo-scan

# Scan a specific directory
todo-scan ./src

# Output as JSON (for CI pipelines)
todo-scan --json

# Fail CI if any TODOs are found
todo-scan --strict

# Only look for specific tags
todo-scan --tags TODO,FIXME,BUG

# Ignore additional directories
todo-scan --ignore vendor,tmp,generated

# Sort by tag type instead of file
todo-scan --sort tag
```

## Terminal Output

```
todo-scan v1.0.0

src/index.js
  L42   TODO     Refactor this to use async iteration
  L87   FIXME    Race condition when concurrent writes happen
  L155  HACK     Workaround for Node 18 bug, remove after v20

src/cli.js
  L12   TODO(alex)  Add --exclude flag for file extensions
  L98   NOTE        This could be optimized with a worker pool

Summary: 5 items found (3 TODO, 1 FIXME, 1 HACK, 0 XXX, 0 BUG, 1 NOTE)
```

## JSON Output

```bash
todo-scan --json
```

```json
{
  "version": "1.0.0",
  "scannedAt": "2026-03-10T12:00:00.000Z",
  "directory": "/path/to/project",
  "items": [
    {
      "file": "src/index.js",
      "line": 42,
      "tag": "TODO",
      "author": null,
      "message": "Refactor this to use async iteration"
    },
    {
      "file": "src/cli.js",
      "line": 12,
      "tag": "TODO",
      "author": "alex",
      "message": "Add --exclude flag for file extensions"
    }
  ],
  "summary": {
    "total": 2,
    "TODO": 2,
    "FIXME": 0,
    "HACK": 0,
    "XXX": 0,
    "BUG": 0,
    "NOTE": 0
  }
}
```

## CLI Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--help` | `-h` | Show usage information |
| `--version` | `-v` | Show version number |
| `--json` | | Output as JSON (for CI pipelines) |
| `--strict` | | Exit with code 1 if any tagged comments found |
| `--no-color` | | Disable ANSI color output |
| `--tags <tags>` | | Comma-separated tags to scan (default: `TODO,FIXME,HACK,XXX,BUG,NOTE`) |
| `--ignore <patterns>` | | Comma-separated patterns to ignore (default: `node_modules,.git,dist,build,coverage,.next`) |
| `--sort <field>` | | Sort by: `file`, `tag`, or `line` (default: `file`) |

The first positional argument is the directory to scan (defaults to `.`).

## Supported Comment Styles

todo-scan recognizes tagged comments across many languages:

| Style | Languages |
|-------|-----------|
| `// TODO: ...` | JavaScript, TypeScript, Go, Rust, C, C++, Java, Swift |
| `# TODO: ...` | Python, Ruby, Shell, YAML, Dockerfile |
| `/* TODO: ... */` | CSS, C, C++, Java |
| `-- TODO: ...` | SQL, Lua, Haskell |
| `; TODO: ...` | Lisp, Assembly, INI files |
| `% TODO: ...` | LaTeX, Erlang, MATLAB |
| `<!-- TODO: ... -->` | HTML, XML, Markdown |

## Author Tags

Supports optional author attribution in parentheses:

```
// TODO(alice): Implement caching layer
// FIXME(bob): This breaks on Windows
# HACK(carol): Temporary workaround for API rate limit
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Check TODOs
on: [push, pull_request]

jobs:
  todo-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Scan for TODOs
        run: npx todo-scan --strict
```

### As a JSON report

```yaml
      - name: Generate TODO report
        run: npx todo-scan --json > todo-report.json
      - uses: actions/upload-artifact@v4
        with:
          name: todo-report
          path: todo-report.json
```

### Pre-commit hook

```bash
#!/bin/sh
# .git/hooks/pre-commit
npx todo-scan --strict --tags FIXME,BUG
```

## Programmatic API

```js
const { scan } = require('todo-scan');

const result = await scan({
  directory: './src',
  tags: ['TODO', 'FIXME'],
  ignore: ['node_modules', 'dist'],
  sort: 'tag',
});

console.log(result.items);   // Array of found items
console.log(result.summary); // { total: N, TODO: N, FIXME: N, ... }
```

## Requirements

- Node.js 18 or higher
- Zero external dependencies

## License

[MIT](LICENSE)
