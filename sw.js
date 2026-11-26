// CropPulse service worker. Precaches the app shell under this worker's scope
// so the workbench keeps working offline. Same-origin GET requests only; it
// never calls out to any external service. Bump the cache version when shipping
// changes so a mixed-version shell never serves.

const SCOPE_PATH = new URL('./', self.location.href).pathname;
const INDEX_URL = new URL('./', self.location.href).href;
const PREFIX = `croppulse:${SCOPE_PATH}:`;
const CACHE = `${PREFIX}v5`;

const SHELL = [
  './',
  'index.html',
  'styles.css',
  'icon.svg',
  'src/ui.js',
  'src/i18n.js',
  'src/physics.js',
  'src/scenarios.js',
  'src/planner.js',
  'src/exports.js',
  'src/quota-lab.js',
  'src/quota-lab-ui.js',
];

const SHELL_URLS = new Set(SHELL.map(path => new URL(path, self.location.href).href));

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll(SHELL.map(path => new Request(new URL(path, self.location.href), { cache: 'reload' })))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  url.search = '';
  const shellRoot = request.mode === 'navigate' && (url.href === INDEX_URL || url.href === new URL('index.html', INDEX_URL).href);
  if (!shellRoot && !SHELL_URLS.has(url.href)) return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(shellRoot ? INDEX_URL : url.href))
    .then(hit => hit || fetch(request)));
});
