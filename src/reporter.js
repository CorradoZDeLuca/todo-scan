'use strict';

const { DEFAULT_TAGS } = require('./index');

// ANSI color codes
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
};

// Tag color mapping
const TAG_COLORS = {
  TODO: 'cyan',
  FIXME: 'red',
  HACK: 'yellow',
  XXX: 'magenta',
  BUG: 'red',
  NOTE: 'blue',
};

/**
 * Colorize a string if colors are enabled.
 */
function colorize(str, colorName, useColor) {
  if (!useColor) return str;
  const code = COLORS[colorName];
  return code ? `${code}${str}${COLORS.reset}` : str;
}

/**
 * Get the color for a tag.
 */
function getTagColor(tag) {
  return TAG_COLORS[tag] || 'white';
}

/**
 * Format the terminal report (human-readable, colorized).
 */
function formatTerminal(result, options = {}) {
  const { useColor = true, version = '1.0.0' } = options;
  const { items, summary } = result;
  const lines = [];

  // Header
  const header = `todo-scan v${version}`;
  lines.push('');
  lines.push(useColor ? `${COLORS.bold}${header}${COLORS.reset}` : header);
  lines.push('');

  if (items.length === 0) {
    lines.push(colorize('  No tagged comments found. Codebase is clean!', 'green', useColor));
    lines.push('');
    return lines.join('\n');
  }

  // Group items by file
  const grouped = {};
  for (const item of items) {
    if (!grouped[item.file]) grouped[item.file] = [];
    grouped[item.file].push(item);
  }

  // Render each file group
  for (const [file, fileItems] of Object.entries(grouped)) {
    lines.push(colorize(file, 'bold', useColor));

    for (const item of fileItems) {
      const lineNum = `L${item.line}`.padEnd(6);
      const tagColor = getTagColor(item.tag);
      const tagStr = item.tag.padEnd(8);
      const authorStr = item.author ? `(${item.author})` : '';
      const displayTag = authorStr
        ? colorize(`${tagStr}`, tagColor, useColor) + colorize(authorStr, 'dim', useColor)
        : colorize(tagStr, tagColor, useColor);
      const lineNumFormatted = colorize(lineNum, 'gray', useColor);
      const message = item.message;

      lines.push(`  ${lineNumFormatted} ${displayTag} ${message}`);
    }

    lines.push('');
  }

  // Summary line
  const tagCounts = (options.tags || DEFAULT_TAGS)
    .map(tag => {
      const count = summary[tag] || 0;
      return `${count} ${tag}`;
    })
    .join(', ');

  const summaryLine = `Summary: ${summary.total} item${summary.total !== 1 ? 's' : ''} found (${tagCounts})`;
  lines.push(colorize(summaryLine, 'bold', useColor));
  lines.push('');

  return lines.join('\n');
}

/**
 * Format the JSON report (machine-readable, for CI).
 */
function formatJSON(result, options = {}) {
  const { version = '1.0.0' } = options;
  const { items, summary, directory } = result;

  const output = {
    version,
    scannedAt: new Date().toISOString(),
    directory,
    items,
    summary,
  };

  return JSON.stringify(output, null, 2);
}

module.exports = {
  formatTerminal,
  formatJSON,
  colorize,
  COLORS,
  TAG_COLORS,
};
