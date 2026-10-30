import { create } from 'zustand'
import { engine } from '../audio/engine'
import { db, Track } from '../storage/db'

export interface Player { id: string; name: string; trackId?: string; volume: number; loop: boolean; muted: boolean; key?: string }
type Status = 'play' | 'pause' | 'stop'
const uid = () => crypto.randomUUID()
const getDuration = (blob: Blob) => new Promise<number>(res => {
  const a = new Audio(), u = URL.createObjectURL(blob); a.preload = 'metadata'
  a.onloadedmetadata = () => { res(isFinite(a.duration) ? a.duration : 0); URL.revokeObjectURL(u) }
  a.onerror = () => { res(-1); URL.revokeObjectURL(u) }; a.src = u
})
interface S {
  ready: boolean; tracks: Track[]; players: Player[]; status: Record<string, Status>
  master: number; masterMuted: boolean; error: string
  init(): Promise<void>; importFiles(f: FileList | File[]): Promise<void>
  renameTrack(id: string, name: string): void; removeTrack(id: string): void
  addPlayer(trackId?: string): void; dupPlayer(id: string): void; removePlayer(id: string): void
  patch(id: string, p: Partial<Player>): void; assign(pid: string, tid?: string): void
  setStatus(id: string, s: Status): void
  play(id: string): void; pause(id: string): void; stop(id: string): void; toggle(id: string): void
  stopAll(): void; pauseAll(): void; resumeAll(): void
  setMaster(v: number): void; toggleMaster(): void; clearError(): void
}
export const useS = create<S>((set, get) => ({
  ready: false, tracks: [], players: [], status: {}, master: 0.9, masterMuted: false, error: '',
  async init() {
    const tracks = await db.tracks(); const cfg = await db.get<{ players: Player[]; master: number }>('cfg')
    const players = cfg?.players ?? [{ id: uid(), name: 'Player 1', volume: 0.8, loop: false, muted: false }]
    set({ tracks, players, master: cfg?.master ?? 0.9, ready: true })
    players.forEach(p => { const t = tracks.find(t => t.id === p.trackId); if (t) engine.load(p.id, t.blob); engine.setVolume(p.id, p.volume, p.muted); engine.setLoop(p.id, p.loop) })
    engine.setMaster(get().master, false)
    engine.onEnded = id => get().setStatus(id, 'stop')
    engine.onError = (id, m) => { get().setStatus(id, 'stop'); set({ error: m }) }
  },
  async importFiles(files) {
    const ok = /\.(mp3|wav|ogg|m4a|flac)$/i; const added: Track[] = []
    for (const f of Array.from(files)) {
      if (!ok.test(f.name) && !f.type.startsWith('audio/')) { set({ error: `Bỏ qua ${f.name}: định dạng không hỗ trợ` }); continue }
      const duration = await getDuration(f); if (duration < 0) { set({ error: `Không giải mã được ${f.name}` }); continue }
      const t: Track = { id: uid(), name: f.name.replace(/\.[^.]+$/, ''), size: f.size, duration, blob: f }
      try { await db.putTrack(t); added.push(t) } catch { set({ error: 'Lưu thất bại: có thể đã hết dung lượng trình duyệt' }) }
    }
    set(s => ({ tracks: [...s.tracks, ...added] }))
  },
  renameTrack(id, name) { const t = get().tracks.find(t => t.id === id); if (!t || !name.trim()) return; const n = { ...t, name: name.trim() }; db.putTrack(n); set(s => ({ tracks: s.tracks.map(x => x.id === id ? n : x) })) },
  removeTrack(id) { get().players.filter(p => p.trackId === id).forEach(p => get().assign(p.id, undefined)); db.delTrack(id); set(s => ({ tracks: s.tracks.filter(t => t.id !== id) })) },
  addPlayer(trackId) {
    const p: Player = { id: uid(), name: `Player ${get().players.length + 1}`, trackId, volume: 0.8, loop: false, muted: false }
    set(s => ({ players: [...s.players, p] })); const t = get().tracks.find(t => t.id === trackId); if (t) engine.load(p.id, t.blob); engine.setVolume(p.id, p.volume, false)
  },
  dupPlayer(id) { const p = get().players.find(p => p.id === id); if (!p) return; get().addPlayer(p.trackId); const n = get().players.at(-1)!; get().patch(n.id, { name: p.name + ' copy', volume: p.volume, loop: p.loop }) },
  removePlayer(id) { engine.remove(id); set(s => ({ players: s.players.filter(p => p.id !== id) })) },
  patch(id, p) {
    set(s => ({ players: s.players.map(x => x.id === id ? { ...x, ...p } : x) }))
    const n = get().players.find(x => x.id === id)!; engine.setVolume(id, n.volume, n.muted); engine.setLoop(id, n.loop)
  },
  assign(pid, tid) { get().patch(pid, { trackId: tid }); get().stop(pid); const t = get().tracks.find(t => t.id === tid); if (t) engine.load(pid, t.blob) },
  setStatus(id, s) { set(st => ({ status: { ...st.status, [id]: s } })) },
  play(id) { if (!get().players.find(p => p.id === id)?.trackId) return; engine.play(id); get().setStatus(id, 'play') },
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
useS.subscribe(s => { if (!s.ready) return; clearTimeout(timer); timer = window.setTimeout(() => db.set('cfg', { players: s.players, master: s.master }), 300) })
