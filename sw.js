/* QC Sync - Service Worker: kirim foto/temuan yang belum terkirim walau tab sudah ditutup.
   Taruh file ini di folder yang SAMA dengan index.html web (alamat harus https). */
const DB = 'qc_outbox';
function open_() {
  return new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('q'); r.result.createObjectStore('m'); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}
const req_ = (rq) => new Promise((ok, no) => { rq.onsuccess = () => ok(rq.result); rq.onerror = () => no(rq.error); });

async function flush() {
  const db = await open_();
  const url = await req_(db.transaction('m').objectStore('m').get('url'));
  const all = await req_(db.transaction('q').objectStore('q').getAll());
  if (!url || !all.length) return;
  all.sort((a, b) => (a.k.charAt(0) === 'f' ? 0 : 1) - (b.k.charAt(0) === 'f' ? 0 : 1));   // foto dulu, lalu temuan
  let i = 0;
  while (i < all.length) {
    const batch = []; let size = 0;
    while (i < all.length && batch.length < 50 && size < 600000) {
      const it = all[i++]; batch.push(it); size += (it.v ? it.v.length : 0) + 40;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ records: batch.map(b => ({ k: b.k, ts: b.ts, v: b.v })) })
    });
    const j = await res.json();
    if (!j || !j.ok) throw new Error('server menolak');          // gagal: browser akan mencoba lagi nanti
    const tx = db.transaction('q', 'readwrite'), os = tx.objectStore('q');
    for (const b of batch) {
      const cur = await req_(os.get(b.k));
      if (cur && cur.ts === b.ts) os.delete(b.k);                // hapus hanya jika belum diganti yang lebih baru
    }
  }
}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('sync', (e) => { if (e.tag === 'qc-outbox') e.waitUntil(flush()); });
