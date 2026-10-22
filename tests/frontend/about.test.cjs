const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const elements = new Map();
const listeners = {};
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    innerHTML: '', textContent: '', classList: { toggle() {} },
    setAttribute() {}, removeAttribute() {}
  });
  return elements.get(id);
}
const context = {
  document: { getElementById: element, querySelectorAll: () => [], addEventListener() {} },
  location: { hash: '#about' }, localStorage: { getItem: () => null },
  history: { replaceState() {} }, scrollTo() {},
  matchMedia: () => ({ matches: true }),
  addEventListener: (name, callback) => { listeners[name] = callback; }
};
context.window = context;
vm.createContext(context);
for (const file of ['recommendation-ui.js', 'about.js', 'app.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'frontend/js', file), 'utf8'), context);
}
assert.equal(context.document.title, 'About us | Motor Vision');
assert.equal(element('breadcrumb').textContent, 'About us');
const content = element('page-content').innerHTML;
for (const heading of ['WHO WE ARE', 'OUR MISSION', 'OUR VISION', 'WHAT WE OFFER', 'HOW IT WORKS', 'TECHNOLOGY WITH PURPOSE', 'YOUR NEXT STEP']) assert(content.includes(heading), heading);
assert.equal((element('intro').innerHTML.match(/<h1>/g) || []).length, 1);
const routes = [...(content + element('intro').innerHTML).matchAll(/data-page="([^"]+)"/g)].map(match => match[1]);
for (const route of routes) {
  assert(vm.runInContext(`validPages.includes(${JSON.stringify(route)})`, context));
  vm.runInContext(`navigate(${JSON.stringify(route)})`, context);
  assert.notEqual(element('breadcrumb').textContent, undefined);
}
context.location.hash = '#about';
listeners.hashchange();
assert.equal(element('page-content').innerHTML, content, 'Hash navigation restores About');
const index = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
assert.equal((index.match(/data-page="about"/g) || []).length, 2, 'Header and footer links');

(async () => {
  const server = require('../../frontend/server').createServer();
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const [url, type] of [['/', 'text/html'], ['/css/about.css?v=about-1', 'text/css'], ['/js/about.js?v=about-1', 'text/javascript']]) {
      const response = await fetch(base + url);
      assert.equal(response.status, 200, url);
      assert(response.headers.get('content-type').startsWith(type));
      assert((await response.text()).length > 100);
    }
    console.log('PASS: About direct route, sections, CTA routes, reduced-motion navigation, hash return, navigation links and public assets');
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
