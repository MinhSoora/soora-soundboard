export interface Track { id: string; name: string; size: number; duration: number; blob: Blob }
let dbp: Promise<IDBDatabase> | null = null
const open = () => dbp ??= new Promise((res, rej) => {
  const r = indexedDB.open('soorasound', 1)
  r.onupgradeneeded = () => { r.result.createObjectStore('tracks', { keyPath: 'id' }); r.result.createObjectStore('kv') }
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
})
async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  const d = await open()
  return new Promise<T>((res, rej) => { const q = fn(d.transaction(store, mode).objectStore(store)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error) })
}
export const db = {
  tracks: () => tx<Track[]>('tracks', 'readonly', s => s.getAll()),
  putTrack: (t: Track) => tx('tracks', 'readwrite', s => s.put(t)),
  delTrack: (id: string) => tx('tracks', 'readwrite', s => s.delete(id)),
  get: <T,>(k: string) => tx<T | undefined>('kv', 'readonly', s => s.get(k)),
  set: (k: string, v: unknown) => tx('kv', 'readwrite', s => s.put(v, k)),
}
export async function storageInfo() {
  const e = await navigator.storage?.estimate?.(); const persisted = await navigator.storage?.persist?.()
  return { used: e?.usage ?? 0, quota: e?.quota ?? 0, persisted: !!persisted }
}
