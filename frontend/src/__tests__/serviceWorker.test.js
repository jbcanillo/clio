import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const source = fs.readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf8');

function loadWorker({ clients = [], allClients = [], fetchImpl = () => Promise.resolve(), cache = new Map() } = {}) {
  const handlers = {};
  const shown = [];
  const opened = [];
  const self = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    registration: { showNotification: (title, options) => { shown.push({ title, options }); return Promise.resolve(); } },
    clients: {
      matchAll: () => Promise.resolve(clients.length ? clients : allClients),
      openWindow: (url) => { opened.push(url); return Promise.resolve(); },
    },
    skipWaiting: () => {},
  };
  self.location = { origin: 'https://clio.test' };
  const cacheApi = {
    match: (req) => Promise.resolve(cache.get(typeof req === 'string' ? new URL(req, 'https://clio.test').href : req.url)),
    open: () => Promise.resolve({ addAll: () => Promise.resolve(), add: () => Promise.resolve(), put: (req, res) => { cache.set(typeof req === 'string' ? new URL(req, 'https://clio.test').href : req.url, res); return Promise.resolve(); } }),
    keys: () => Promise.resolve([]),
  };
  const sandbox = { self, URL, console: { log() {}, error() {} }, caches: cacheApi, indexedDB: {}, setTimeout, clearTimeout, Date, Map, Promise, fetch: (...a) => fetchImpl(...a) };
  vm.runInNewContext(source, sandbox); // throws SyntaxError if the file is broken
  return { handlers, shown, opened, cache };
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
  it('Background Sync tag "clio-outbox" asks every open window to flush the outbox', async () => {
    const posted = [];
    const client = { postMessage: (m) => posted.push(m) };
    const { handlers } = loadWorker({ allClients: [client] });
    const w = waitFor();
    handlers.sync({ tag: 'clio-outbox', ...w });
    await w.done();
    expect(posted).toEqual([{ type: 'FLUSH_OUTBOX' }]);
    const other = waitFor();
    handlers.sync({ tag: 'something-else', ...other });
    await other.done();
    expect(posted).toHaveLength(1);
  });

  describe('fetch strategy', () => {
    const req = (path, over = {}) => ({ method: 'GET', url: `https://clio.test${path}`, mode: 'cors', ...over });
    const ok = (body) => ({ ok: true, body, clone() { return this; } });
    const run = async (handlers, request) => {
      let responded = false;
      let promise;
      handlers.fetch({ request, respondWith: (p) => { responded = true; promise = Promise.resolve(p); } });
      return { responded, response: responded ? await promise : undefined };
    };

    it('never touches non-GET requests or /api calls, so offline API errors stay real network errors', async () => {
      const { handlers } = loadWorker({ fetchImpl: () => Promise.reject(new TypeError('offline')) });
      expect((await run(handlers, req('/api/sync/notes', { method: 'POST' }))).responded).toBe(false);
      expect((await run(handlers, req('/api/reminders'))).responded).toBe(false);
      expect((await run(handlers, { method: 'GET', url: 'https://other.example/x.js', mode: 'cors' })).responded).toBe(false);
    });
    it('navigations go to the network first so a new deploy is never hidden by an old cached page', async () => {
      const cache = new Map([['https://clio.test/index.html', ok('OLD PAGE')]]);
      const { handlers } = loadWorker({ cache, fetchImpl: () => Promise.resolve(ok('NEW PAGE')) });
      const { response } = await run(handlers, req('/', { mode: 'navigate' }));
      expect(response.body).toBe('NEW PAGE');
      await Promise.resolve();
      expect(cache.get('https://clio.test/index.html').body).toBe('NEW PAGE');
    });
    it('offline navigations fall back to the cached app shell', async () => {
      const cache = new Map([['https://clio.test/index.html', ok('SHELL')]]);
      const { handlers } = loadWorker({ cache, fetchImpl: () => Promise.reject(new TypeError('offline')) });
      expect((await run(handlers, req('/', { mode: 'navigate' }))).response.body).toBe('SHELL');
    });
    it('hashed build assets are cached on first use and then served from the cache', async () => {
      let network = 0;
      const { handlers, cache } = loadWorker({ fetchImpl: () => { network += 1; return Promise.resolve(ok('JS')); } });
      expect((await run(handlers, req('/assets/index-abc123.js'))).response.body).toBe('JS');
      await Promise.resolve();
      expect(cache.has('https://clio.test/assets/index-abc123.js')).toBe(true);
      expect((await run(handlers, req('/assets/index-abc123.js'))).response.body).toBe('JS');
      expect(network).toBe(1);
    });
  });
});
