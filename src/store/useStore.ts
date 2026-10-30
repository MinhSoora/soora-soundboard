import { create } from 'zustand'
import { engine } from '../audio/engine'
import { db, Track } from '../storage/db'

export const COLORS = ['#2ee6a6', '#4da3ff', '#c77dff', '#ff7aa2', '#ff9f43', '#f6d743']
export interface Player { id: string; name: string; trackId?: string; volume: number; loop: boolean; muted: boolean; key?: string; color: string; pageId: string; playlistId?: string; idx: number }
export interface Playlist { id: string; name: string; trackIds: string[] }
export interface Page { id: string; name: string }
type Status = 'play' | 'pause' | 'stop'
const uid = () => crypto.randomUUID()
const timers = new Map<string, number>()
const getDuration = (blob: Blob) => new Promise<number>(res => {
  const a = new Audio(), u = URL.createObjectURL(blob); a.preload = 'metadata'
  a.onloadedmetadata = () => { res(isFinite(a.duration) ? a.duration : 0); URL.revokeObjectURL(u) }
  a.onerror = () => { res(-1); URL.revokeObjectURL(u) }; a.src = u
})
export const curTrackId = (st: { playlists: Playlist[] }, p: Player) => p.playlistId ? st.playlists.find(x => x.id === p.playlistId)?.trackIds[p.idx] : p.trackId
const loadCur = (p: Player) => { const st = useS.getState(); const t = st.tracks.find(x => x.id === curTrackId(st, p)); if (t) engine.load(p.id, t.blob) }

interface S {
  ready: boolean; tracks: Track[]; players: Player[]; pages: Page[]; page: string; playlists: Playlist[]
  status: Record<string, Status>; armed: Record<string, number>
  master: number; masterMuted: boolean; error: string
  init(): Promise<void>; importFiles(f: FileList | File[]): Promise<Track[]>
  renameTrack(id: string, name: string): void; removeTrack(id: string): void
  addPlayer(trackId?: string): void; dupPlayer(id: string): void; removePlayer(id: string): void
  patch(id: string, p: Partial<Player>): void; assign(pid: string, tid?: string): void; setKey(id: string, k?: string): void
  movePlayer(from: string, to: string): void; movePlayerToPage(id: string, page: string): void
  addPage(): void; renamePage(id: string, n: string): void; removePage(id: string): void; setPage(id: string): void
  addPlaylist(): void; renamePlaylist(id: string, n: string): void; removePlaylist(id: string): void
  addToPlaylist(id: string, tid: string): void; removeFromPlaylist(id: string, i: number): void; moveInPlaylist(id: string, from: number, to: number): void
  assignPlaylist(pid: string, plid?: string): void; playIndex(pid: string, i: number): void; next(pid: string): void; prev(pid: string): void
  schedule(id: string, sec: number): void
  setStatus(id: string, s: Status): void
  play(id: string): void; pause(id: string): void; stop(id: string): void; toggle(id: string): void
  stopAll(): void; pauseAll(): void; resumeAll(): void
  setMaster(v: number): void; toggleMaster(): void; clearError(): void
}
export const useS = create<S>((set, get) => ({
  ready: false, tracks: [], players: [], pages: [], page: '', playlists: [], status: {}, armed: {}, master: 0.9, masterMuted: false, error: '',
  async init() {
    const tracks = await db.tracks()
    const cfg = await db.get<{ players: Player[]; master: number; pages: Page[]; playlists: Playlist[] }>('cfg')
    const pages = cfg?.pages?.length ? cfg.pages : [{ id: uid(), name: 'Trang 1' }]
    const base = { volume: 0.8, loop: false, muted: false, idx: 0, pageId: pages[0].id }
    const raw: Player[] = cfg?.players ?? [{ id: uid(), name: 'Player 1', ...base, color: COLORS[0] }]
    const players: Player[] = raw.map((p, i) => ({ ...p, color: p.color ?? COLORS[i % COLORS.length], pageId: p.pageId ?? pages[0].id, idx: p.idx ?? 0 }))
    set({ tracks, players, pages, page: pages[0].id, playlists: cfg?.playlists ?? [], master: cfg?.master ?? 0.9, ready: true })
    players.forEach(p => { loadCur(p); engine.setVolume(p.id, p.volume, p.muted); engine.setLoop(p.id, p.loop && !p.playlistId) })
    engine.setMaster(get().master, false)
    engine.onStopped = id => get().setStatus(id, 'stop')
    engine.onEnded = id => { // natural end of a track
      const p = get().players.find(x => x.id === id); const pl = get().playlists.find(x => x.id === p?.playlistId)
      if (p && pl) { const n = p.idx + 1; if (n < pl.trackIds.length) return get().playIndex(id, n); if (p.loop && pl.trackIds.length) return get().playIndex(id, 0) }
      get().setStatus(id, 'stop')
    }
    engine.onError = (id, m) => { get().setStatus(id, 'stop'); set({ error: m }) }
  },
  async importFiles(files) {
    const ok = /\.(mp3|wav|ogg|m4a|flac)$/i; const added: Track[] = []
    for (const f of Array.from(files as ArrayLike<File>)) {
      if (!ok.test(f.name) && !f.type.startsWith('audio/')) { set({ error: `Bỏ qua ${f.name}: định dạng không hỗ trợ` }); continue }
      const duration = await getDuration(f); if (duration < 0) { set({ error: `Không giải mã được ${f.name}` }); continue }
      const t: Track = { id: uid(), name: f.name.replace(/\.[^.]+$/, ''), size: f.size, duration, blob: f }
      try { await db.putTrack(t); added.push(t) } catch { set({ error: 'Lưu thất bại: có thể đã hết dung lượng trình duyệt' }) }
    }
    set(s => ({ tracks: [...s.tracks, ...added] })); return added
  },
  renameTrack(id, name) { const t = get().tracks.find(t => t.id === id); if (!t || !name.trim()) return; const n = { ...t, name: name.trim() }; db.putTrack(n); set(s => ({ tracks: s.tracks.map(x => x.id === id ? n : x) })) },
  removeTrack(id) {
    get().players.filter(p => p.trackId === id).forEach(p => get().assign(p.id, undefined)); db.delTrack(id)
    set(s => ({ tracks: s.tracks.filter(t => t.id !== id), playlists: s.playlists.map(l => ({ ...l, trackIds: l.trackIds.filter(x => x !== id) })) }))
  },
  addPlayer(trackId) {
    const n = get().players.length
    const p: Player = { id: uid(), name: `Player ${n + 1}`, trackId, volume: 0.8, loop: false, muted: false, color: COLORS[n % COLORS.length], pageId: get().page, idx: 0 }
    set(s => ({ players: [...s.players, p] })); loadCur(p); engine.setVolume(p.id, p.volume, false)
  },
  dupPlayer(id) { const p = get().players.find(p => p.id === id); if (!p) return; get().addPlayer(p.trackId); const ps = get().players; const n = ps[ps.length - 1]; get().patch(n.id, { name: p.name + ' copy', volume: p.volume, loop: p.loop, color: p.color, pageId: p.pageId, playlistId: p.playlistId }); loadCur({ ...n, playlistId: p.playlistId }) },
  removePlayer(id) { engine.remove(id); set(s => ({ players: s.players.filter(p => p.id !== id) })) },
  patch(id, p) {
    set(s => ({ players: s.players.map(x => x.id === id ? { ...x, ...p } : x) }))
    const n = get().players.find(x => x.id === id)!; engine.setVolume(id, n.volume, n.muted); engine.setLoop(id, n.loop && !n.playlistId)
  },
  assign(pid, tid) { get().patch(pid, { trackId: tid, playlistId: undefined }); get().stop(pid); const t = get().tracks.find(t => t.id === tid); if (t) engine.load(pid, t.blob) },
  setKey(id, k) {
    const d = k && get().players.find(p => p.key === k && p.id !== id)
    if (d) return set({ error: `Phím ${k} đã được gán cho "${d.name}"` })
    get().patch(id, { key: k })
  },
  movePlayer(from, to) {
    if (from === to) return; const ps = [...get().players]; const a = ps.findIndex(p => p.id === from), b = ps.findIndex(p => p.id === to); if (a < 0 || b < 0) return
    const [m] = ps.splice(a, 1); m.pageId = ps.find(p => p.id === to)!.pageId; ps.splice(b, 0, m); set({ players: ps })
  },
  movePlayerToPage(id, page) { if (get().players.some(p => p.id === id)) get().patch(id, { pageId: page }) },
  addPage() { const g = { id: uid(), name: `Trang ${get().pages.length + 1}` }; set(s => ({ pages: [...s.pages, g], page: g.id })) },
  renamePage(id, n) { set(s => ({ pages: s.pages.map(g => g.id === id ? { ...g, name: n } : g) })) },
  removePage(id) {
    get().players.filter(p => p.pageId === id).forEach(p => engine.remove(p.id))
    const pages = get().pages.filter(g => g.id !== id); if (!pages.length) return
    set(s => ({ pages, players: s.players.filter(p => p.pageId !== id), page: pages[0].id }))
  },
  setPage(id) { set({ page: id }) },
  addPlaylist() { set(s => ({ playlists: [...s.playlists, { id: uid(), name: `Playlist ${s.playlists.length + 1}`, trackIds: [] }] })) },
  renamePlaylist(id, n) { set(s => ({ playlists: s.playlists.map(l => l.id === id ? { ...l, name: n } : l) })) },
  removePlaylist(id) { get().players.filter(p => p.playlistId === id).forEach(p => get().assignPlaylist(p.id, undefined)); set(s => ({ playlists: s.playlists.filter(l => l.id !== id) })) },
  addToPlaylist(id, tid) { set(s => ({ playlists: s.playlists.map(l => l.id === id ? { ...l, trackIds: [...l.trackIds, tid] } : l) })) },
  removeFromPlaylist(id, i) { set(s => ({ playlists: s.playlists.map(l => l.id === id ? { ...l, trackIds: l.trackIds.filter((_, k) => k !== i) } : l) })) },
  moveInPlaylist(id, from, to) { set(s => ({ playlists: s.playlists.map(l => { if (l.id !== id || to < 0 || to >= l.trackIds.length) return l; const t = [...l.trackIds]; const [m] = t.splice(from, 1); t.splice(to, 0, m); return { ...l, trackIds: t } }) })) },
  assignPlaylist(pid, plid) { get().stop(pid); get().patch(pid, { playlistId: plid, idx: 0, trackId: plid ? undefined : get().players.find(p => p.id === pid)?.trackId }); loadCur(get().players.find(p => p.id === pid)!) },
  playIndex(pid, i) {
    const p = get().players.find(x => x.id === pid); const pl = get().playlists.find(x => x.id === p?.playlistId)
    const t = get().tracks.find(x => x.id === pl?.trackIds[i]); if (!p || !t) return get().setStatus(pid, 'stop')
    get().patch(pid, { idx: i }); engine.load(pid, t.blob); engine.play(pid); get().setStatus(pid, 'play')
  },
  next(pid) { const p = get().players.find(x => x.id === pid); const n = get().playlists.find(x => x.id === p?.playlistId)?.trackIds.length; if (p && n) get().playIndex(pid, (p.idx + 1) % n) },
  prev(pid) { const p = get().players.find(x => x.id === pid); const n = get().playlists.find(x => x.id === p?.playlistId)?.trackIds.length; if (p && n) get().playIndex(pid, (p.idx - 1 + n) % n) },
  schedule(id, sec) {
    clearTimeout(timers.get(id)); timers.delete(id)
    const clear = () => set(s => { const a = { ...s.armed }; delete a[id]; return { armed: a } })
    if (sec <= 0) return clear()
    set(s => ({ armed: { ...s.armed, [id]: Date.now() + sec * 1000 } }))
    timers.set(id, window.setTimeout(() => { clear(); get().play(id) }, sec * 1000))
  },
  setStatus(id, s) { set(st => ({ status: { ...st.status, [id]: s } })) },
  play(id) { const p = get().players.find(p => p.id === id); if (!p || !curTrackId(get(), p)) return; engine.play(id); get().setStatus(id, 'play') },
  pause(id) { engine.pause(id); get().setStatus(id, 'pause') },
  stop(id) { engine.stop(id); get().setStatus(id, 'stop') },
  toggle(id) { get().status[id] === 'play' ? get().pause(id) : get().play(id) },
  stopAll() { engine.stopAll(); set(s => ({ status: Object.fromEntries(s.players.map(p => [p.id, 'stop' as Status])) })) },
  pauseAll() { get().players.forEach(p => get().status[p.id] === 'play' && get().pause(p.id)) },
  resumeAll() { get().players.forEach(p => get().status[p.id] === 'pause' && get().play(p.id)) },
  setMaster(v) { set({ master: v }); engine.setMaster(v, get().masterMuted) },
  toggleMaster() { set(s => ({ masterMuted: !s.masterMuted })); engine.setMaster(get().master, get().masterMuted) },
  clearError() { set({ error: '' }) },
}))
let timer: number
useS.subscribe(s => { if (!s.ready) return; clearTimeout(timer); timer = window.setTimeout(() => db.set('cfg', { players: s.players, master: s.master, pages: s.pages, playlists: s.playlists }), 300) })
