const assert = require('assert');
const { isHebrew } = require('../src/translate-hebrew');
const { filterByKeywords, sanitizeHTML, timeAgo } = require('../src/utils');

function runTests() {
  console.log('🧪 Running Basic Smoke Tests...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ ${name}`);
      console.error(`     ${e.message}`);
      failed++;
    }
  }

  // 1. Keyword Filtering
  test('filterByKeywords: basic match', () => {
    const articles = [{ title: 'Netanyahu visits Washington', contentSnippet: '...' }];
    const filtered = filterByKeywords(articles, ['netanyahu', 'gaza']);
    assert.strictEqual(filtered.length, 1);
  });

  test('filterByKeywords: no match', () => {
    const articles = [{ title: 'Economy grows 3%', contentSnippet: '...' }];
    const filtered = filterByKeywords(articles, ['netanyahu', 'gaza']);
    assert.strictEqual(filtered.length, 0);
  });

  // 2. Hebrew Detection
  test('isHebrew: true for Hebrew text', () => {
    assert.strictEqual(isHebrew('שלום עולם'), true);
  });

  test('isHebrew: false for English text', () => {
    assert.strictEqual(isHebrew('Hello World'), false);
  });

  // 3. HTML Sanitization
  test('sanitizeHTML: allows strong tags', () => {
    assert.strictEqual(sanitizeHTML('Hello <strong>world</strong>'), 'Hello <strong>world</strong>');
  });

  test('sanitizeHTML: strips script tags', () => {
    assert.strictEqual(sanitizeHTML('Hello <script>alert(1)</script>world'), 'Hello alert(1)world');
  });

  test('sanitizeHTML: strips inline event handlers', () => {
    assert.strictEqual(sanitizeHTML('<p onclick="alert(1)">Hello</p>'), '<p>Hello</p>');
  });

  // 4. timeAgo Edge Cases
  test('timeAgo: clamps future dates to just now', () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString(); // 1 hr in future
    assert.strictEqual(timeAgo(futureDate), 'just now');
  });

  // Print results
  console.log(`\n🎉 Passed: ${passed} | 💥 Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

runTests();