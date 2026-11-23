import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const source = fs.readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf8');

function loadWorker({ clients = [] } = {}) {
  const handlers = {};
  const shown = [];
  const opened = [];
  const self = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    registration: { showNotification: (title, options) => { shown.push({ title, options }); return Promise.resolve(); } },
    clients: {
      matchAll: () => Promise.resolve(clients),
      openWindow: (url) => { opened.push(url); return Promise.resolve(); },
    },
    skipWaiting: () => {},
  };
  const sandbox = { self, console: { log() {}, error() {} }, caches: { open: () => Promise.resolve({ addAll: () => Promise.resolve() }) }, indexedDB: {}, setTimeout, clearTimeout, Date, Map, Promise, fetch: () => Promise.resolve() };
  vm.runInNewContext(source, sandbox); // throws SyntaxError if the file is broken
  return { handlers, shown, opened };
}
const waitFor = () => { const p = []; return { waitUntil: (x) => p.push(x), done: () => Promise.all(p) }; };

describe('public/sw.js', () => {
  it('is valid JavaScript and registers a push and a notificationclick handler', () => {
    const { handlers } = loadWorker();
    expect(typeof handlers.push).toBe('function');
    expect(typeof handlers.notificationclick).toBe('function');
  });
  it('shows the server payload (title, body, url) as a notification', async () => {
    const { handlers, shown } = loadWorker();
    const w = waitFor();
    handlers.push({ data: { json: () => ({ title: 'Good morning', body: 'Write today', url: '/?checkin=1' }) }, ...w });
    await w.done();
    expect(shown[0].title).toBe('Good morning');
    expect(shown[0].options.body).toBe('Write today');
    expect(shown[0].options.data.url).toBe('/?checkin=1');
  });
  it('still shows a notification when the push has no data', async () => {
    const { handlers, shown } = loadWorker();
    const w = waitFor();
    handlers.push({ data: null, ...w });
    await w.done();
    expect(shown[0].title).toBe('Clio');
  });
  it('clicking a check-in notification opens the check-in URL (no window open yet)', async () => {
    const { handlers, opened } = loadWorker();
    const w = waitFor();
    handlers.notificationclick({ notification: { data: { url: '/?checkin=1' }, close() {} }, action: '', ...w });
    await w.done();
    expect(opened).toEqual(['/?checkin=1']);
  });
  it('clicking navigates an already open window to the URL', async () => {
    const navigated = [];
    const client = { navigate: (u) => { navigated.push(u); return Promise.resolve({ focus: () => {} }); }, focus: () => {} };
    const { handlers } = loadWorker({ clients: [client] });
    const w = waitFor();
    handlers.notificationclick({ notification: { data: { url: '/?checkin=1' }, close() {} }, action: '', ...w });
    await w.done();
    expect(navigated).toEqual(['/?checkin=1']);
  });
});
