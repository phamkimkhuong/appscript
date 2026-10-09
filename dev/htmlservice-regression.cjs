/** Regression from the actual v20 HTML response supplied on 2026-10-09. */
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const fixtures = require('./fixtures/htmlservice-url-corruption.json');
const html = fs.readFileSync('Scripts.html', 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const encode = s => s.replace(/https?:\/\//g, prefix => prefix.slice(0, -2) + '\\u002f\\u002f');
let count = 0;
function check(name, fn) { fn(); count++; console.log('PASS', name); }
function expression(source) {
  return source.startsWith('const defaultAvatar') ? '(function(){' + source + ';return defaultAvatar;})()' : '({' + source + '})';
}
check('observed response corruptions reproduce syntax errors', () => {
  assert.equal(fixtures.length, 3);
  for (const fixture of fixtures) {
    new vm.Script(expression(fixture.source));
    assert.throws(() => new vm.Script(expression(fixture.received)), SyntaxError);
  }
});
check('escaped URL literals preserve avatar and XLSX relationship values', () => {
  for (const fixture of fixtures) {
    const before = vm.runInNewContext(expression(fixture.source));
    const after = vm.runInNewContext(expression(encode(fixture.source)));
    assert.equal(JSON.stringify(after), JSON.stringify(before));
    if (fixture.source.startsWith("'_rels/.rels'")) {
      const line=script.split('\n').find(line=>line.trim().startsWith("'_rels/.rels'"));
      assert(line,'Missing workbook relationships');
      assert.equal(JSON.stringify(vm.runInNewContext(expression(line.trim()))),JSON.stringify(before));
    } else assert(script.includes(encode(fixture.source)), 'Missing repair for original line ' + fixture.line);
  }
});
check('client has no literal URL slash pairs for the HTML-service comment pass', () => {
  assert(!/https?:\/\//.test(script), 'Use Unicode-escaped slashes in client JS URL literals.');
  new vm.Script(script, { filename: 'Scripts.html' });
});
check('URL fixes survive the observed slash-pair truncation pattern', () => {
  // Reproduces only the transformation observed on the three supplied lines;
  // this does not emulate Google HTML Service or claim to test the live deployment.
  for (const fixture of fixtures) {
    const fixed = encode(fixture.source);
    const result = fixed.replace(/\/\/.*$/, '');
    assert.equal(result, fixed);
    new vm.Script(expression(result));
  }
});
console.log(count + ' HTML-service compatibility checks passed. Live deployment still requires verification.');
