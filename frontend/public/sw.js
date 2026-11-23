const CACHE_NAME = 'numdum-cache-v1';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/static/js/', '/static/css/'];

let alarmsDB;
const activeTimers = new Map();

self.addEventListener('install', (event) => {
  console.log('SW install');
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
  // Do not skip waiting; let new SW activate on next navigation
});

self.addEventListener('activate', (event) => {
  console.log('SW activate');
  event.waitUntil(
    (async () => {
      alarmsDB = await openAlarmsDB();
      const alarms = await getAllAlarms();
      console.log('SW activated, alarms loaded:', alarms.length);
      alarms.forEach(scheduleAlarm);
    })()
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).catch(() => caches.match('/index.html')))
  );
});

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};
  console.log('SW received message:', type, payload);
  
  if (type === 'SKIP_WAITING') {
    // Handle skip waiting message from the page
    self.skipWaiting();
    return;
  }
  
  if (type === 'UPSERT_ALARM') {
    return handleUpsertAlarm(payload.alarm);
  }
  if (type === 'DELETE_ALARM') {
    return handleDeleteAlarm(payload.id);
  }
  if (type === 'TEST_NOTIFICATION') {
    return handleTestNotification();
  }
});
self.addEventListener('push', (event) => {
  console.log('Push notification received', event);
  let title = 'Clio';
  const options = {
    body: 'Default notification body',
    icon: '/favicon.ico',
    badge: '/favicon.ico'
  };
  if (event.data) {
    try {
      const payload = event.data.json();
      title = payload.title || title;
      options.body = payload.body || options.body;
      options.icon = payload.icon || options.icon;
      options.badge = payload.badge || options.badge;
      options.tag = payload.tag || 'push';
      options.data = Object.assign({}, payload.data || {}, payload.url ? { url: payload.url } : {});
      options.actions = payload.actions || [];
    } catch (err) {
      console.error('Error parsing push data', err);
    }
  }
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener('notificationclick', (event) => {
  const { action, reminderId } = event.notification.data || {};
  event.notification.close();

  if (action && action.startsWith('snooze-')) {
    const minutes = parseInt(action.split('-')[1], 10);
    const newTrigger = Date.now() + minutes * 60000;
    getAlarm(reminderId).then(alarm => {
      const updated = { ...alarm, triggerTime: newTrigger };
      upsertAlarmToDB(updated).then(() => {
        scheduleAlarm(updated);
        self.registration.showNotification('Snoozed', {
          body: `Reminder snoozed for ${minutes} minutes`,
          icon: '/favicon.ico'
        });
      });
    });
  } else {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        const target = (event.notification.data && event.notification.data.url) || '/';
        if (clients.length > 0) {
          const c = clients[0];
          if (target !== '/' && 'navigate' in c) return c.navigate(target).then(w => (w || c).focus());
          return c.focus();
        }
        return self.clients.openWindow(target);
      })
    );
  }
});

function handleTestNotification() {
  console.log('Showing test notification');
  if (!self.registration) {
    console.error('No registration available');
    return;
  }
  self.registration.showNotification('Test', {
    body: 'Test notification from service worker',
    icon: '/favicon.ico',
    badge: '/favicon.ico'
  }).catch(err => console.error('Notification failed:', err));
}

function openAlarmsDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('numdum-alarms', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('alarms')) db.createObjectStore('alarms',{ keyPath: 'id' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function getAllAlarms() {
  return new Promise((resolve, reject) => {
    const tx = alarmsDB.transaction('alarms', 'readonly');
    const store = tx.objectStore('alarms');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAlarm(id) {
  return new Promise((resolve, reject) => {
    const tx = alarmsDB.transaction('alarms', 'readonly');
    const store = tx.objectStore('alarms');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function upsertAlarmToDB(alarm) {
  return new Promise((resolve, reject) => {
    const tx = alarmsDB.transaction('alarms', 'readwrite');
    const store = tx.objectStore('alarms');
    store.put(alarm);
    tx.oncomplete = () => resolve(alarm);
    tx.onerror = () => reject(tx.error);
  });
}

function deleteAlarmFromDB(id) {
  return new Promise((resolve, reject) => {
    const tx = alarmsDB.transaction('alarms', 'readwrite');
    const store = tx.objectStore('alarms');
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function handleUpsertAlarm(alarm) {
  console.log('Upserting alarm:', alarm);
  await upsertAlarmToDB(alarm);
  if (activeTimers.has(alarm.id)) {
    clearTimeout(activeTimers.get(alarm.id));
    activeTimers.delete(alarm.id);
  }
  scheduleAlarm(alarm);
}

async function handleDeleteAlarm(id) {
  await deleteAlarmFromDB(id);
  if (activeTimers.has(id)) {
    clearTimeout(activeTimers.get(id));
    activeTimers.delete(id);
  }
}

function scheduleAlarm(alarm) {
  const now = Date.now();
  const delay = alarm.triggerTime - now;
  if (delay <= 0) {
    triggerNow(alarm);
    return;
  }
  const timerId = setTimeout(() => {
    triggerNow(alarm);
    activeTimers.delete(alarm.id);
    deleteAlarmFromDB(alarm.id);
  }, delay);
  activeTimers.set(alarm.id, timerId);
}

function triggerNow(alarm) {
  console.log('Triggering notification for alarm:', alarm);
  const title = alarm.title || 'Reminder';
  const body = alarm.description || 'Your reminder is due!';
  self.registration.showNotification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: alarm.id,
    requireInteraction: true,
    actions: [
      { action: 'snooze-10', title: 'Snooze 10 min' },
      { action: 'snooze-60', title: 'Snooze 1 hr' }
    ],
    data: { reminderId: alarm.id }
  }).catch(err => console.error('Show notification error:', err));
}

// Background Sync: ask every open window to flush its (encrypted) note outbox.
self.addEventListener('sync', (event) => {
  if (event.tag !== 'clio-outbox') return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((c) => c.postMessage({ type: 'FLUSH_OUTBOX' }));
    })
  );
});
