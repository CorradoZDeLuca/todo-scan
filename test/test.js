'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
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
} = require('../src/index');

const { formatTerminal, formatJSON, COLORS } = require('../src/reporter');
const { parseArgs } = require('../src/cli');

// Helper: create a temp directory with test fixtures
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'todo-scan-test-'));
}

function writeFile(dir, relativePath, content) {
  const fullPath = path.join(dir, relativePath);
  const dirPath = path.dirname(fullPath);
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  return fullPath;
}

function removeTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ============================================================
// 1. Core Scanner Tests
// ============================================================

describe('scan() - basic scanning', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  it('should find TODO comments in JavaScript files', async () => {
    writeFile(tmpDir, 'app.js', '// TODO: Implement feature\nconst x = 1;\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].tag, 'TODO');
    assert.equal(result.items[0].message, 'Implement feature');
    assert.equal(result.items[0].line, 1);
  });

  it('should find FIXME comments', async () => {
    writeFile(tmpDir, 'fix.js', 'const a = 1;\n// FIXME: This is broken\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].tag, 'FIXME');
    assert.equal(result.items[0].line, 2);
  });

  it('should find HACK comments', async () => {
    writeFile(tmpDir, 'hack.js', '// HACK: Workaround for bug\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].tag, 'HACK');
  });

  it('should find XXX comments', async () => {
    writeFile(tmpDir, 'xxx.js', '// XXX: Dangerous code here\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].tag, 'XXX');
  });

  it('should find BUG comments', async () => {
    writeFile(tmpDir, 'bug.js', '// BUG: Off by one error\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].tag, 'BUG');
  });

  it('should find NOTE comments', async () => {
    writeFile(tmpDir, 'note.js', '// NOTE: This is important context\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].tag, 'NOTE');
  });

  it('should find multiple tags in one file', async () => {
    writeFile(tmpDir, 'multi.js', [
      '// TODO: First thing',
      'const x = 1;',
      '// FIXME: Second thing',
      '// HACK: Third thing',
      'const y = 2;',
    ].join('\n'));
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 3);
  });

  it('should return correct line numbers', async () => {
    writeFile(tmpDir, 'lines.js', [
      'const a = 1;',
      '',
      '// TODO: Line three',
      '',
      '',
      '// FIXME: Line six',
    ].join('\n'));
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items[0].line, 3);
    assert.equal(result.items[1].line, 6);
  });

  it('should handle empty directories', async () => {
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 0);
    assert.equal(result.summary.total, 0);
  });

  it('should handle files with no TODO comments', async () => {
    writeFile(tmpDir, 'clean.js', 'const x = 1;\nconst y = 2;\nconsole.log(x + y);\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 0);
  });

  it('should throw for non-existent directory', async () => {
    await assert.rejects(
      () => scan({ directory: path.join(tmpDir, 'nonexistent') }),
      { message: /Directory not found/ }
    );
  });

  it('should throw if target is a file not a directory', async () => {
    const filePath = writeFile(tmpDir, 'afile.txt', 'hello');
    await assert.rejects(
      () => scan({ directory: filePath }),
      { message: /Not a directory/ }
    );
  });
});

// ============================================================
// 2. Comment Style Tests
// ============================================================

describe('Comment styles', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  it('should match // style comments (JS, TS, Go, C, etc.)', async () => {
    writeFile(tmpDir, 'double-slash.js', '// TODO: double slash style\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].message, 'double slash style');
  });

  it('should match # style comments (Python, Ruby, Shell)', async () => {
    writeFile(tmpDir, 'hash.py', '# TODO: hash style comment\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].message, 'hash style comment');
  });

  it('should match /* style comments (CSS, C block)', async () => {
    writeFile(tmpDir, 'block.css', '/* TODO: block comment style */\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].message, 'block comment style');
  });

  it('should match -- style comments (SQL, Lua)', async () => {
    writeFile(tmpDir, 'sql.sql', '-- TODO: SQL style comment\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].message, 'SQL style comment');
  });

  it('should match ; style comments (Lisp, Assembly)', async () => {
    writeFile(tmpDir, 'lisp.el', '; TODO: semicolon style comment\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].message, 'semicolon style comment');
  });

  it('should match % style comments (LaTeX, Erlang)', async () => {
    writeFile(tmpDir, 'tex.tex', '% TODO: percent style comment\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].message, 'percent style comment');
  });

  it('should match <!-- style comments (HTML, XML)', async () => {
    writeFile(tmpDir, 'page.html', '<!-- TODO: HTML comment style -->\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].message, 'HTML comment style');
  });
});

// ============================================================
// 3. Author Parsing Tests
// ============================================================

describe('Author parsing', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  it('should extract author from TODO(author)', async () => {
    writeFile(tmpDir, 'auth.js', '// TODO(alice): Do the thing\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items[0].author, 'alice');
    assert.equal(result.items[0].message, 'Do the thing');
  });

  it('should extract author from FIXME(bob)', async () => {
    writeFile(tmpDir, 'auth2.js', '# FIXME(bob): Fix the issue\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items[0].author, 'bob');
    assert.equal(result.items[0].tag, 'FIXME');
  });

  it('should set author to null when no author is present', async () => {
    writeFile(tmpDir, 'noauth.js', '// TODO: No author here\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items[0].author, null);
  });

  it('should handle author with special characters', async () => {
    writeFile(tmpDir, 'special.js', '// TODO(john.doe): Handle edge case\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items[0].author, 'john.doe');
  });
});

// ============================================================
// 4. Ignore Pattern Tests
// ============================================================

describe('Ignore patterns', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  it('should ignore node_modules by default', async () => {
    writeFile(tmpDir, 'node_modules/pkg/index.js', '// TODO: Should be ignored\n');
    writeFile(tmpDir, 'app.js', '// TODO: Should be found\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].file, 'app.js');
  });

  it('should ignore .git by default', async () => {
    writeFile(tmpDir, '.git/hooks/pre-commit', '# TODO: git hook\n');
    writeFile(tmpDir, 'src.js', '// TODO: Source file\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
  });

  it('should ignore dist by default', async () => {
    writeFile(tmpDir, 'dist/bundle.js', '// TODO: Compiled code\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 0);
  });

  it('should respect custom ignore patterns', async () => {
    writeFile(tmpDir, 'vendor/lib.js', '// TODO: Vendor code\n');
    writeFile(tmpDir, 'app.js', '// TODO: App code\n');
    const result = await scan({ directory: tmpDir, ignore: ['vendor'] });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].file, 'app.js');
  });

  it('should support glob-like wildcard patterns', async () => {
    writeFile(tmpDir, 'test.min.js', '// TODO: Minified\n');
    writeFile(tmpDir, 'app.js', '// TODO: Regular\n');
    const result = await scan({ directory: tmpDir, ignore: ['*.min.js'] });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].file, 'app.js');
  });
});

// ============================================================
// 5. Custom Tags Tests
// ============================================================

describe('Custom tags (--tags)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  it('should only find specified tags', async () => {
    writeFile(tmpDir, 'mixed.js', [
      '// TODO: First',
      '// FIXME: Second',
      '// HACK: Third',
      '// NOTE: Fourth',
    ].join('\n'));
    const result = await scan({ directory: tmpDir, tags: ['TODO', 'FIXME'] });
    assert.equal(result.items.length, 2);
    assert.ok(result.items.every(i => ['TODO', 'FIXME'].includes(i.tag)));
  });

  it('should handle a single custom tag', async () => {
    writeFile(tmpDir, 'single.js', [
      '// TODO: One',
      '// FIXME: Two',
    ].join('\n'));
    const result = await scan({ directory: tmpDir, tags: ['FIXME'] });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].tag, 'FIXME');
  });

  it('should handle custom non-standard tags', async () => {
    writeFile(tmpDir, 'custom.js', '// OPTIMIZE: Make faster\n');
    const result = await scan({ directory: tmpDir, tags: ['OPTIMIZE'] });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].tag, 'OPTIMIZE');
    assert.equal(result.items[0].message, 'Make faster');
  });
});

// ============================================================
// 6. Sort Tests
// ============================================================

describe('Sorting (--sort)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  it('should sort by file (default)', async () => {
    writeFile(tmpDir, 'b.js', '// TODO: In B\n');
    writeFile(tmpDir, 'a.js', '// TODO: In A\n');
    const result = await scan({ directory: tmpDir, sort: 'file' });
    assert.equal(result.items[0].file, 'a.js');
    assert.equal(result.items[1].file, 'b.js');
  });

  it('should sort by tag', async () => {
    writeFile(tmpDir, 'tags.js', [
      '// HACK: Third',
      '// BUG: First',
      '// TODO: Fourth',
    ].join('\n'));
    const result = await scan({ directory: tmpDir, sort: 'tag' });
    assert.equal(result.items[0].tag, 'BUG');
    assert.equal(result.items[1].tag, 'HACK');
    assert.equal(result.items[2].tag, 'TODO');
  });

  it('should sort by line number', async () => {
    writeFile(tmpDir, 'a.js', '// TODO: A line 1\n');
    writeFile(tmpDir, 'b.js', 'x\nx\nx\n// TODO: B line 4\n');
    const result = await scan({ directory: tmpDir, sort: 'line' });
    assert.equal(result.items[0].line, 1);
    assert.equal(result.items[1].line, 4);
  });
});

// ============================================================
// 7. Binary File Handling
// ============================================================

describe('Binary file handling', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  it('should skip binary files', async () => {
    // Create a binary file with null bytes
    const binPath = path.join(tmpDir, 'image.png');
    const buf = Buffer.alloc(256);
    buf.write('// TODO: Should not find this');
    buf[100] = 0; // null byte makes it binary
    fs.writeFileSync(binPath, buf);

    writeFile(tmpDir, 'real.js', '// TODO: Should find this\n');

    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].file, 'real.js');
  });

  it('should detect binary files correctly', () => {
    const tmpDir2 = createTempDir();
    try {
      const binPath = path.join(tmpDir2, 'bin.dat');
      const buf = Buffer.alloc(100);
      buf[50] = 0;
      fs.writeFileSync(binPath, buf);
      assert.equal(isBinaryFile(binPath), true);

      const textPath = path.join(tmpDir2, 'text.txt');
      fs.writeFileSync(textPath, 'Hello, world!\n');
      assert.equal(isBinaryFile(textPath), false);
    } finally {
      removeTempDir(tmpDir2);
    }
  });
});

// ============================================================
// 8. Deep Nested Directories
// ============================================================

describe('Deep nested directories', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  it('should scan deeply nested files', async () => {
    writeFile(tmpDir, 'a/b/c/d/e/deep.js', '// TODO: Deep nested todo\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.ok(result.items[0].file.includes('deep.js'));
  });

  it('should find items across multiple nested directories', async () => {
    writeFile(tmpDir, 'src/core/main.js', '// TODO: Core thing\n');
    writeFile(tmpDir, 'src/utils/helpers.js', '// FIXME: Helper bug\n');
    writeFile(tmpDir, 'lib/external/wrapper.js', '// HACK: Wrapper hack\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 3);
  });
});

// ============================================================
// 9. Summary Tests
// ============================================================

describe('Summary generation', () => {
  it('should produce correct summary counts', () => {
    const items = [
      { tag: 'TODO' },
      { tag: 'TODO' },
      { tag: 'FIXME' },
      { tag: 'HACK' },
      { tag: 'TODO' },
    ];
    const summary = buildSummary(items, DEFAULT_TAGS);
    assert.equal(summary.total, 5);
    assert.equal(summary.TODO, 3);
    assert.equal(summary.FIXME, 1);
    assert.equal(summary.HACK, 1);
    assert.equal(summary.XXX, 0);
    assert.equal(summary.BUG, 0);
    assert.equal(summary.NOTE, 0);
  });

  it('should handle empty items', () => {
    const summary = buildSummary([], DEFAULT_TAGS);
    assert.equal(summary.total, 0);
    assert.equal(summary.TODO, 0);
  });
});

// ============================================================
// 10. Utility Function Tests
// ============================================================

describe('matchesPattern()', () => {
  it('should match exact names', () => {
    assert.equal(matchesPattern('node_modules', 'node_modules'), true);
  });

  it('should match leading wildcard', () => {
    assert.equal(matchesPattern('test.min.js', '*.min.js'), true);
  });

  it('should match trailing wildcard', () => {
    assert.equal(matchesPattern('build-output', 'build*'), true);
  });

  it('should not match different names', () => {
    assert.equal(matchesPattern('src', 'dist'), false);
  });
});

describe('shouldIgnore()', () => {
  it('should ignore paths containing ignored segments', () => {
    assert.equal(shouldIgnore(path.join('node_modules', 'pkg', 'index.js'), ['node_modules']), true);
  });

  it('should not ignore regular paths', () => {
    assert.equal(shouldIgnore(path.join('src', 'index.js'), DEFAULT_IGNORE), false);
  });
});

describe('buildTagRegex()', () => {
  it('should build a valid regex', () => {
    const regex = buildTagRegex(['TODO', 'FIXME']);
    assert.ok(regex instanceof RegExp);
  });

  it('should match a basic TODO comment', () => {
    const regex = buildTagRegex(['TODO']);
    const match = '// TODO: Do something'.match(regex);
    assert.ok(match);
    assert.equal(match[1].toUpperCase(), 'TODO');
  });

  it('should be case insensitive', () => {
    const regex = buildTagRegex(['TODO']);
    const match = '// todo: lowercase'.match(regex);
    assert.ok(match);
  });
});

// ============================================================
// 11. Reporter Tests - Terminal
// ============================================================

describe('formatTerminal()', () => {
  it('should produce output with file headers', () => {
    const result = {
      items: [
        { file: 'src/app.js', line: 10, tag: 'TODO', author: null, message: 'Test message' },
      ],
      summary: { total: 1, TODO: 1, FIXME: 0, HACK: 0, XXX: 0, BUG: 0, NOTE: 0 },
    };
    const output = formatTerminal(result, { useColor: false, version: '1.0.0', tags: DEFAULT_TAGS });
    assert.ok(output.includes('src/app.js'));
    assert.ok(output.includes('L10'));
    assert.ok(output.includes('TODO'));
    assert.ok(output.includes('Test message'));
  });

  it('should show clean message when no items found', () => {
    const result = { items: [], summary: { total: 0 } };
    const output = formatTerminal(result, { useColor: false, version: '1.0.0' });
    assert.ok(output.includes('No tagged comments found'));
  });

  it('should include summary line', () => {
    const result = {
      items: [
        { file: 'a.js', line: 1, tag: 'TODO', author: null, message: 'x' },
        { file: 'b.js', line: 2, tag: 'FIXME', author: null, message: 'y' },
      ],
      summary: { total: 2, TODO: 1, FIXME: 1, HACK: 0, XXX: 0, BUG: 0, NOTE: 0 },
    };
    const output = formatTerminal(result, { useColor: false, version: '1.0.0', tags: DEFAULT_TAGS });
    assert.ok(output.includes('Summary: 2 items found'));
  });

  it('should show author in parentheses', () => {
    const result = {
      items: [
        { file: 'a.js', line: 1, tag: 'TODO', author: 'alice', message: 'Do it' },
      ],
      summary: { total: 1, TODO: 1, FIXME: 0, HACK: 0, XXX: 0, BUG: 0, NOTE: 0 },
    };
    const output = formatTerminal(result, { useColor: false, version: '1.0.0', tags: DEFAULT_TAGS });
    assert.ok(output.includes('(alice)'));
  });

  it('should include version in header', () => {
    const result = { items: [], summary: { total: 0 } };
    const output = formatTerminal(result, { useColor: false, version: '2.5.0' });
    assert.ok(output.includes('todo-scan v2.5.0'));
  });
});

// ============================================================
// 12. Reporter Tests - JSON
// ============================================================

describe('formatJSON()', () => {
  it('should produce valid JSON output', () => {
    const result = {
      items: [
        { file: 'a.js', line: 1, tag: 'TODO', author: null, message: 'Test' },
      ],
      summary: { total: 1, TODO: 1 },
      directory: '/tmp/test',
    };
    const output = formatJSON(result, { version: '1.0.0' });
    const parsed = JSON.parse(output);
    assert.equal(parsed.version, '1.0.0');
    assert.ok(parsed.scannedAt);
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.summary.total, 1);
  });

  it('should include the directory in JSON output', () => {
    const result = {
      items: [],
      summary: { total: 0 },
      directory: '/my/project',
    };
    const output = formatJSON(result, { version: '1.0.0' });
    const parsed = JSON.parse(output);
    assert.equal(parsed.directory, '/my/project');
  });

  it('should include scannedAt timestamp in ISO format', () => {
    const result = { items: [], summary: { total: 0 }, directory: '.' };
    const output = formatJSON(result, { version: '1.0.0' });
    const parsed = JSON.parse(output);
    // Validate ISO 8601 format
    const date = new Date(parsed.scannedAt);
    assert.ok(!isNaN(date.getTime()));
  });

  it('should include all item properties in JSON', () => {
    const result = {
      items: [
        { file: 'src/x.js', line: 42, tag: 'FIXME', author: 'bob', message: 'Fix this' },
      ],
      summary: { total: 1, FIXME: 1 },
      directory: '.',
    };
    const output = formatJSON(result, { version: '1.0.0' });
    const parsed = JSON.parse(output);
    const item = parsed.items[0];
    assert.equal(item.file, 'src/x.js');
    assert.equal(item.line, 42);
    assert.equal(item.tag, 'FIXME');
    assert.equal(item.author, 'bob');
    assert.equal(item.message, 'Fix this');
  });
});

// ============================================================
// 13. CLI Argument Parsing Tests
// ============================================================

describe('parseArgs()', () => {
  it('should parse --help flag', () => {
    const opts = parseArgs(['node', 'cli.js', '--help']);
    assert.equal(opts.help, true);
  });

  it('should parse -h flag', () => {
    const opts = parseArgs(['node', 'cli.js', '-h']);
    assert.equal(opts.help, true);
  });

  it('should parse --version flag', () => {
    const opts = parseArgs(['node', 'cli.js', '--version']);
    assert.equal(opts.version, true);
  });

  it('should parse -v flag', () => {
    const opts = parseArgs(['node', 'cli.js', '-v']);
    assert.equal(opts.version, true);
  });

  it('should parse --json flag', () => {
    const opts = parseArgs(['node', 'cli.js', '--json']);
    assert.equal(opts.json, true);
  });

  it('should parse --strict flag', () => {
    const opts = parseArgs(['node', 'cli.js', '--strict']);
    assert.equal(opts.strict, true);
  });

  it('should parse --no-color flag', () => {
    const opts = parseArgs(['node', 'cli.js', '--no-color']);
    assert.equal(opts.noColor, true);
  });

  it('should parse --tags with comma-separated values', () => {
    const opts = parseArgs(['node', 'cli.js', '--tags', 'TODO,FIXME,BUG']);
    assert.deepEqual(opts.tags, ['TODO', 'FIXME', 'BUG']);
  });

  it('should parse --ignore with comma-separated values', () => {
    const opts = parseArgs(['node', 'cli.js', '--ignore', 'vendor,tmp']);
    assert.deepEqual(opts.ignore, ['vendor', 'tmp']);
  });

  it('should parse --sort value', () => {
    const opts = parseArgs(['node', 'cli.js', '--sort', 'tag']);
    assert.equal(opts.sort, 'tag');
  });

  it('should parse positional directory argument', () => {
    const opts = parseArgs(['node', 'cli.js', './src']);
    assert.equal(opts.directory, './src');
  });

  it('should use default values when no flags provided', () => {
    const opts = parseArgs(['node', 'cli.js']);
    assert.equal(opts.help, false);
    assert.equal(opts.version, false);
    assert.equal(opts.json, false);
    assert.equal(opts.strict, false);
    assert.equal(opts.noColor, false);
    assert.equal(opts.tags, null);
    assert.equal(opts.ignore, null);
    assert.equal(opts.sort, 'file');
    assert.equal(opts.directory, '.');
  });

  it('should handle multiple flags combined', () => {
    const opts = parseArgs(['node', 'cli.js', '--json', '--strict', '--no-color', './my-project']);
    assert.equal(opts.json, true);
    assert.equal(opts.strict, true);
    assert.equal(opts.noColor, true);
    assert.equal(opts.directory, './my-project');
  });
});

// ============================================================
// 14. Edge Cases
// ============================================================

describe('Edge cases', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  it('should handle TODO without colon', async () => {
    writeFile(tmpDir, 'nocolon.js', '// TODO implement this later\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].tag, 'TODO');
    assert.ok(result.items[0].message.includes('implement'));
  });

  it('should handle TODO with colon', async () => {
    writeFile(tmpDir, 'colon.js', '// TODO: implement this later\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].message, 'implement this later');
  });

  it('should handle trailing */ in block comments', async () => {
    writeFile(tmpDir, 'block.css', '/* FIXME: fix this thing */\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].message, 'fix this thing');
  });

  it('should handle trailing --> in HTML comments', async () => {
    writeFile(tmpDir, 'page.html', '<!-- TODO: Add footer -->\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].message, 'Add footer');
  });

  it('should handle case insensitive tags', async () => {
    writeFile(tmpDir, 'case.js', '// todo: lowercase tag\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].tag, 'TODO');
  });

  it('should use forward slashes in file paths', async () => {
    writeFile(tmpDir, 'src/deep/file.js', '// TODO: Forward slashes\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.ok(result.items[0].file.includes('/'));
    assert.ok(!result.items[0].file.includes('\\'));
  });

  it('should handle files with mixed line endings', async () => {
    writeFile(tmpDir, 'mixed.js', '// TODO: First\r\nconst x = 1;\r\n// FIXME: Second\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 2);
  });

  it('should handle empty message after tag', async () => {
    writeFile(tmpDir, 'empty.js', '// TODO:\n');
    const result = await scan({ directory: tmpDir });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].message, '');
  });
});

// ============================================================
// 15. sortItems() direct tests
// ============================================================

describe('sortItems()', () => {
  it('should sort by file then line by default', () => {
    const items = [
      { file: 'z.js', line: 1, tag: 'TODO' },
      { file: 'a.js', line: 5, tag: 'FIXME' },
      { file: 'a.js', line: 1, tag: 'HACK' },
    ];
    const sorted = sortItems(items, 'file');
    assert.equal(sorted[0].file, 'a.js');
    assert.equal(sorted[0].line, 1);
    assert.equal(sorted[1].file, 'a.js');
    assert.equal(sorted[1].line, 5);
    assert.equal(sorted[2].file, 'z.js');
  });

  it('should sort by tag then file', () => {
    const items = [
      { file: 'b.js', line: 1, tag: 'TODO' },
      { file: 'a.js', line: 1, tag: 'BUG' },
      { file: 'c.js', line: 1, tag: 'FIXME' },
    ];
    const sorted = sortItems(items, 'tag');
    assert.equal(sorted[0].tag, 'BUG');
    assert.equal(sorted[1].tag, 'FIXME');
    assert.equal(sorted[2].tag, 'TODO');
  });
});

// ============================================================
// 16. collectFiles() tests
// ============================================================

describe('collectFiles()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  it('should collect all files recursively', () => {
    writeFile(tmpDir, 'a.js', 'x');
    writeFile(tmpDir, 'sub/b.js', 'y');
    writeFile(tmpDir, 'sub/deep/c.js', 'z');
    const files = collectFiles(tmpDir, [], tmpDir);
    assert.equal(files.length, 3);
  });

  it('should respect ignore patterns', () => {
    writeFile(tmpDir, 'src/app.js', 'x');
    writeFile(tmpDir, 'node_modules/pkg.js', 'y');
    const files = collectFiles(tmpDir, ['node_modules'], tmpDir);
    assert.equal(files.length, 1);
  });
});
