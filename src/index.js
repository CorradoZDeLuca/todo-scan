'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const DEFAULT_TAGS = ['TODO', 'FIXME', 'HACK', 'XXX', 'BUG', 'NOTE'];
const DEFAULT_IGNORE = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next'];

// Binary file detection: check first 8KB for null bytes
const BINARY_CHECK_SIZE = 8192;

/**
 * Check if a file is likely binary by reading the first chunk
 * and looking for null bytes.
 */
function isBinaryFile(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(BINARY_CHECK_SIZE);
    const bytesRead = fs.readSync(fd, buf, 0, BINARY_CHECK_SIZE, 0);
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0) return true;
    }
    return false;
  } catch {
    return true; // If we can't read it, treat as binary
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Check if a path segment matches a glob-like ignore pattern.
 * Supports simple patterns: exact match, leading *, trailing *, and *.ext
 */
function matchesPattern(name, pattern) {
  if (pattern === name) return true;
  if (pattern.startsWith('*') && pattern.endsWith('*')) {
    return name.includes(pattern.slice(1, -1));
  }
  if (pattern.startsWith('*')) {
    return name.endsWith(pattern.slice(1));
  }
  if (pattern.endsWith('*')) {
    return name.startsWith(pattern.slice(0, -1));
  }
  return false;
}

/**
 * Check if a file or directory should be ignored.
 */
function shouldIgnore(itemPath, ignorePatterns) {
  const segments = itemPath.split(path.sep);
  for (const segment of segments) {
    for (const pattern of ignorePatterns) {
      if (matchesPattern(segment, pattern)) return true;
    }
  }
  return false;
}

/**
 * Recursively collect all file paths in a directory tree,
 * respecting ignore patterns.
 */
function collectFiles(dirPath, ignorePatterns, baseDir) {
  const files = [];

  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (shouldIgnore(relativePath, ignorePatterns)) continue;

    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, ignorePatterns, baseDir));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Build a regex that matches comment-tag patterns.
 *
 * Supported comment prefixes:
 *   //  #  /*  --  ;  %  <!--
 *
 * Pattern: <comment_prefix> <whitespace?> TAG <(author)>? <:?> <message>
 */
function buildTagRegex(tags) {
  const tagGroup = tags.map(t => escapeRegex(t)).join('|');
  // Match comment markers followed by optional space, then a tag,
  // optional (author), optional colon, then the message.
  // Comment markers: // | # | /* | -- | ; | % | <!--
  return new RegExp(
    `(?:^|\\s)(?:\\/\\/|#|\\/\\*|--|;|%|<!--)\\s*(${tagGroup})(?:\\(([^)]+)\\))?\\s*:?\\s*(.*)$`,
    'i'
  );
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Scan a single file for tagged comments using streaming line-by-line reads.
 * Returns an array of match objects.
 */
function scanFile(filePath, tagRegex, baseDir) {
  return new Promise((resolve, reject) => {
    const items = [];
    const relativePath = path.relative(baseDir, filePath);
    let lineNumber = 0;

    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    rl.on('line', (line) => {
      lineNumber++;
      const match = line.match(tagRegex);
      if (match) {
        const tag = match[1].toUpperCase();
        const author = match[2] || null;
        let message = match[3] ? match[3].trim() : '';
        // Strip trailing comment closers: */ or -->
        message = message.replace(/\s*(\*\/|-->)\s*$/, '').trim();
        items.push({
          file: relativePath.split(path.sep).join('/'),
          line: lineNumber,
          tag,
          author,
          message,
        });
      }
    });

    rl.on('close', () => resolve(items));
    rl.on('error', (err) => {
      // On read errors, resolve with empty (skip the file)
      resolve([]);
    });
    stream.on('error', () => resolve([]));
  });
}

/**
 * Sort items based on the specified field.
 */
function sortItems(items, sortBy) {
  switch (sortBy) {
    case 'tag':
      return items.sort((a, b) => a.tag.localeCompare(b.tag) || a.file.localeCompare(b.file) || a.line - b.line);
    case 'line':
      return items.sort((a, b) => a.line - b.line || a.file.localeCompare(b.file));
    case 'file':
    default:
      return items.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  }
}

/**
 * Build a summary object counting each tag type.
 */
function buildSummary(items, tags) {
  const summary = { total: items.length };
  for (const tag of tags) {
    summary[tag] = 0;
  }
  for (const item of items) {
    if (summary[item.tag] !== undefined) {
      summary[item.tag]++;
    } else {
      summary[item.tag] = 1;
    }
  }
  return summary;
}

/**
 * Main scan function.
 *
 * @param {Object} options
 * @param {string} options.directory - Directory to scan (default: '.')
 * @param {string[]} options.tags - Tags to look for
 * @param {string[]} options.ignore - Patterns to ignore
 * @param {string} options.sort - Sort field: 'file', 'tag', or 'line'
 * @returns {Promise<{items: Array, summary: Object, directory: string}>}
 */
async function scan(options = {}) {
  const {
    directory = '.',
    tags = DEFAULT_TAGS,
    ignore = DEFAULT_IGNORE,
    sort = 'file',
  } = options;

  const absDir = path.resolve(directory);

  if (!fs.existsSync(absDir)) {
    throw new Error(`Directory not found: ${absDir}`);
  }

  const stat = fs.statSync(absDir);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${absDir}`);
  }

  const tagRegex = buildTagRegex(tags);
  const filePaths = collectFiles(absDir, ignore, absDir);

  // Filter out binary files
  const textFiles = filePaths.filter(fp => !isBinaryFile(fp));

  // Scan all text files concurrently
  const results = await Promise.all(
    textFiles.map(fp => scanFile(fp, tagRegex, absDir))
  );

  let items = results.flat();
  items = sortItems(items, sort);

  const summary = buildSummary(items, tags);

  return {
    items,
    summary,
    directory: absDir,
  };
}

module.exports = {
  scan,
  DEFAULT_TAGS,
  DEFAULT_IGNORE,
  buildTagRegex,
  isBinaryFile,
  shouldIgnore,
  matchesPattern,
  collectFiles,
  sortItems,
  buildSummary,
};
