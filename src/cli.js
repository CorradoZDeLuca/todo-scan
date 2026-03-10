#!/usr/bin/env node
'use strict';

const { scan, DEFAULT_TAGS, DEFAULT_IGNORE } = require('./index');
const { formatTerminal, formatJSON } = require('./reporter');
const pkg = require('../package.json');

/**
 * Parse CLI arguments into a structured options object.
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    help: false,
    version: false,
    json: false,
    strict: false,
    noColor: false,
    tags: null,
    ignore: null,
    sort: 'file',
    directory: '.',
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--version':
      case '-v':
        options.version = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--strict':
        options.strict = true;
        break;
      case '--no-color':
        options.noColor = true;
        break;
      case '--tags':
        i++;
        if (i < args.length) {
          options.tags = args[i].split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
        }
        break;
      case '--ignore':
        i++;
        if (i < args.length) {
          options.ignore = args[i].split(',').map(p => p.trim()).filter(Boolean);
        }
        break;
      case '--sort':
        i++;
        if (i < args.length) {
          options.sort = args[i].trim().toLowerCase();
        }
        break;
      default:
        // Positional argument: directory
        if (!arg.startsWith('-')) {
          options.directory = arg;
        }
        break;
    }

    i++;
  }

  return options;
}

/**
 * Print help text.
 */
function printHelp() {
  const help = `
todo-scan v${pkg.version}
Scan your codebase for TODO, FIXME, HACK, and other comment tags.

Usage:
  todo-scan [directory] [options]

Arguments:
  directory          Directory to scan (default: current directory)

Options:
  -h, --help         Show this help message
  -v, --version      Show version number
  --json             Output results as JSON (for CI pipelines)
  --strict           Exit with code 1 if any tagged comments are found
  --no-color         Disable ANSI color output
  --tags <tags>      Comma-separated tags to scan for
                     (default: TODO,FIXME,HACK,XXX,BUG,NOTE)
  --ignore <dirs>    Comma-separated patterns to ignore
                     (default: node_modules,.git,dist,build,coverage,.next)
  --sort <field>     Sort results by: file, tag, line (default: file)

Examples:
  todo-scan                          Scan current directory
  todo-scan ./src                    Scan specific directory
  todo-scan --json                   Output as JSON
  todo-scan --strict                 Fail CI if TODOs found
  todo-scan --tags TODO,FIXME        Only scan for TODO and FIXME
  todo-scan --ignore vendor,tmp      Ignore vendor and tmp directories
  todo-scan --sort tag               Sort results by tag type
`;
  console.log(help.trim());
}

/**
 * Main CLI entry point.
 */
async function main() {
  const options = parseArgs(process.argv);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (options.version) {
    console.log(pkg.version);
    process.exit(0);
  }

  // Determine color support
  const useColor = !options.noColor && !options.json && process.stdout.isTTY !== false;

  try {
    const result = await scan({
      directory: options.directory,
      tags: options.tags || DEFAULT_TAGS,
      ignore: options.ignore || DEFAULT_IGNORE,
      sort: options.sort,
    });

    if (options.json) {
      console.log(formatJSON(result, { version: pkg.version }));
    } else {
      console.log(formatTerminal(result, {
        useColor,
        version: pkg.version,
        tags: options.tags || DEFAULT_TAGS,
      }));
    }

    // Strict mode: exit 1 if any items found
    if (options.strict && result.items.length > 0) {
      process.exit(1);
    }

    process.exit(0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
}

// Export for testing
module.exports = { parseArgs, main };

// Run if called directly
if (require.main === module) {
  main();
}
