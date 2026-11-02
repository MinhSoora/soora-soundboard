import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as RKeyboardEvent } from 'react'
import { engine } from '../audio/engine'
import { useS, Player, LoopMode, Desks, curTrackId } from '../store/useStore'

export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
export const combo = (e: KeyboardEvent | RKeyboardEvent) => {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return ''
  return [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.key.length === 1 ? e.key.toUpperCase() : e.key === ' ' ? 'Space' : e.key].filter(Boolean).join('+')
}
const NEXT_LOOP: Record<LoopMode, LoopMode> = { off: '1', '1': '2', '2': 'timer', timer: 'off' }
const LOOP_LABEL: Record<LoopMode, string> = { off: '↻', '1': '↻1', '2': '↻2', timer: '↻⏱' }
const LOOP_HELP = 'Loop: tắt → lặp thêm 1 lần → lặp thêm 2 lần → lặp đến khi hết hẹn giờ tắt'

/** Real-signal meter: reads AnalyserNode peak every frame and writes straight to the DOM. */
function useMeter(id: string, extra?: () => void) {
  const fill = useRef<HTMLDivElement>(null), db = useRef<HTMLSpanElement>(null), clip = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const pk = engine.peak(id), d = pk > 0 ? 20 * Math.log10(pk) : -90
      if (fill.current) fill.current.style.width = Math.max(0, Math.min(100, (d + 60) / 60 * 100)) + '%'
      if (db.current) db.current.textContent = d > -89 ? d.toFixed(0) : '-∞'
      if (pk >= 0.99) clip.current?.classList.add('on')
      extra?.(); raf = requestAnimationFrame(loop)
    }
    loop(); return () => cancelAnimationFrame(raf)
  }, [id])
  return { fill, db, clip }
}
const Meter = ({ m }: { m: ReturnType<typeof useMeter> }) => (
  <div className="hmw">
    <div className="hm"><div ref={m.fill} className="hf" /></div>
    <span ref={m.db} className="db">-∞</span>
    <button ref={m.clip} className="clip" title="Clipping – bấm để reset" onClick={e => e.currentTarget.classList.remove('on')} />
  </div>
)

export function KeyBtn({ p }: { p: Player }) {
  const s = useS()
  return <button data-capture="1" className="cap" title="Bấm rồi nhấn phím (Esc để xóa)" onKeyDown={e => {
    if (e.key === 'Tab') return; e.preventDefault(); e.stopPropagation(); const k = combo(e); if (k) s.setKey(p.id, k === 'Escape' ? undefined : k)
  }}>{p.key ? `⌨ ${p.key}` : '⌨ Gán phím'}</button>
}

function Settings({ p, onClose }: { p: Player; onClose: () => void }) {
  const s = useS(); const [url, setUrl] = useState(''); const [busy, setBusy] = useState(false)
  const [on, setOn] = useState('10'), [off, setOff] = useState('60')
  const armed = s.armed[p.id], offAt = s.offAt[p.id]
  return (
    <div className="modal" onClick={onClose}><div className="mbox" onClick={e => e.stopPropagation()}>
      <h3>⚙ Cài đặt – {p.name}</h3>
      <div className="mrow"><label>Tên Player</label><input value={p.name} onChange={e => s.patch(p.id, { name: e.target.value })} /></div>
      <div className="mrow"><label>Tên speaker</label><input value={p.speaker} placeholder="VD: Loa sân khấu" onChange={e => s.patch(p.id, { speaker: e.target.value })} /></div>
      <div className="mrow"><label>Fade in (giây)</label><input type="number" min={0} step={0.5} value={p.fadeIn} onChange={e => s.patch(p.id, { fadeIn: Math.max(0, +e.target.value) })} /></div>
      <div className="mrow"><label>Fade out (giây)</label><input type="number" min={0} step={0.5} value={p.fadeOut} onChange={e => s.patch(p.id, { fadeOut: Math.max(0, +e.target.value) })} /></div>
      <div className="mrow"><label>Loop</label><select value={p.loopMode} onChange={e => s.patch(p.id, { loopMode: e.target.value as LoopMode })}>
        <option value="off">Tắt</option><option value="1">Lặp thêm 1 lần</option><option value="2">Lặp thêm 2 lần</option><option value="timer">Lặp đến khi hết hẹn giờ tắt</option></select></div>
      <div className="mrow"><label>Playlist</label><select value={p.playlistId ?? ''} onChange={e => s.assignPlaylist(p.id, e.target.value || undefined)}>
        <option value="">Không dùng playlist</option>{s.playlists.map(l => <option key={l.id} value={l.id}>♫ {l.name}</option>)}</select></div>
      <div className="mrow"><label>Bài tiếp theo</label><select value={p.nextTrackId ?? ''} onChange={e => s.patch(p.id, { nextTrackId: e.target.value || undefined })}>
        <option value="">— Không hẹn —</option>{s.tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      <div className="mrow"><label>URL file MP3</label><input value={url} placeholder="https://…/file.mp3" onChange={e => setUrl(e.target.value)} />
        <button disabled={!url.trim() || busy} onClick={async () => { setBusy(true); const t = await s.importUrl(url.trim()); setBusy(false); if (t) { s.assign(p.id, t.id); setUrl('') } }}>{busy ? '…' : 'Tải'}</button></div>
      <div className="mrow"><label>Hẹn giờ phát sau</label><input type="number" min={1} value={on} onChange={e => setOn(e.target.value)} /><span>giây</span>
        <button className={armed ? 'warnb' : ''} onClick={() => armed ? s.schedule(p.id, 0) : +on > 0 && s.schedule(p.id, +on)}>{armed ? 'Hủy' : 'Đặt'}</button></div>
      <div className="mrow"><label>Hẹn giờ tắt sau</label><input type="number" min={1} value={off} onChange={e => setOff(e.target.value)} /><span>giây</span>
        <button className={offAt ? 'warnb' : ''} onClick={() => offAt ? s.scheduleOff(p.id, 0) : +off > 0 && s.scheduleOff(p.id, +off)}>{offAt ? 'Hủy' : 'Đặt'}</button></div>
      <div className="mrow"><label>Màu / Phím</label><input type="color" className="color" value={p.color} onChange={e => s.patch(p.id, { color: e.target.value })} /><KeyBtn p={p} /></div>
      <div className="mrow"><button onClick={() => { if (confirm('Làm trống desk này?')) { s.clearDesk(p.id); onClose() } }}>Làm trống desk</button><button className="act" onClick={onClose}>Xong</button></div>
    </div></div>
  )
}

export function Desk({ p }: { p: Player }) {
  const s = useS(); const st = s.status[p.id] ?? 'stop'; const armed = s.armed[p.id], offAt = s.offAt[p.id]
  const [open, setOpen] = useState(false)
  const armedRef = useRef(armed), offRef = useRef(offAt), stRef = useRef(st); armedRef.current = armed; offRef.current = offAt; stRef.current = st
  const time = useRef<HTMLSpanElement>(null), seek = useRef<HTMLInputElement>(null), cd = useRef<HTMLSpanElement>(null), drag = useRef(false)
  const m = useMeter(p.id, () => {
    const [c, d] = engine.info(p.id)
    if (time.current) time.current.textContent = `${fmt(c)} / ${fmt(d)}`
    if (seek.current && !drag.current) { seek.current.max = String(d || 1); seek.current.value = String(c) }
    if (cd.current) {
      const parts: string[] = []; const now = Date.now()
      if (armedRef.current) parts.push('⏱ phát ' + fmt(Math.max(0, (armedRef.current - now) / 1000)))
      if (offRef.current) parts.push('⏹ tắt ' + fmt(Math.max(0, (offRef.current - now) / 1000)))
      cd.current.textContent = parts.length ? parts.join(' · ') : stRef.current === 'play' ? '● ĐANG PHÁT' : ''
    }
  })
  const pl = s.playlists.find(x => x.id === p.playlistId)
  const track = s.tracks.find(t => t.id === curTrackId(s, p))
  return (
    <div className={`desk ${st} ${armed ? 'armed' : ''} ${p.nextTrackId ? 'queued' : ''}`} style={{ '--c': p.color } as CSSProperties}
      onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); s.movePlayer(e.dataTransfer.getData('text/plain'), p.id) }}>
      {p.key && <div className="kb">{p.key}</div>}
      <div className="dh">
        <span className="grip" draggable title="Kéo để đổi vị trí / thả lên tab để chuyển trang"
          onDragStart={e => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.setDragImage(e.currentTarget.closest('.desk')!, 20, 20) }}>⠿</span>
        <b className="dn" title="Bấm để đổi tên" onClick={() => { const n = prompt('Tên Player', p.name); if (n?.trim()) s.patch(p.id, { name: n.trim() }) }}>{p.name}</b>
        <button className="gear" title="Cài đặt" onClick={() => setOpen(true)}>⚙</button>
      </div>
      <div className="sp">🔊 {p.speaker || 'Chưa đặt speaker'}</div>
      <div className="now"><span>{track ? (pl ? `${p.idx + 1}. ` : '') + track.name : 'Trống'}</span>
        <label className="fl" title="Chọn file từ máy">📁<input type="file" hidden accept="audio/*,.flac" onChange={async e => {
          const f = e.target.files; if (f?.length) { const t = await s.importFiles(f); if (t[0]) s.assign(p.id, t[0].id) } e.target.value = ''
        }} /></label></div>
      <input ref={seek} type="range" className="seek" min={0} max={1} step={0.1} defaultValue={0} title="Kéo để tua"
        onPointerDown={() => { drag.current = true; window.addEventListener('pointerup', () => { drag.current = false }, { once: true }) }}
        onChange={e => engine.seek(p.id, +e.target.value)} />
      <div className="trow"><span ref={time} className="time">0:00 / 0:00</span><span ref={cd} className="cd" /></div>
      <div className="vrow"><span>🔈</span><input type="range" className="vol" min={0} max={100} value={Math.round(p.volume * 100)} onChange={e => s.patch(p.id, { volume: +e.target.value / 100 })} /><span className="vp">{p.muted ? 'MUTE' : Math.round(p.volume * 100) + '%'}</span></div>
      <Meter m={m} />
      <div className="btns">
        {pl && <button onClick={() => s.prev(p.id)}>⏮</button>}
        <button className="go" onClick={() => s.toggle(p.id)}>{st === 'play' ? '❚❚' : '▶'}</button>
        <button onClick={() => s.stop(p.id)}>■</button>
        {(pl || p.nextTrackId) && <button onClick={() => s.next(p.id)}>⏭</button>}
        <button className={p.muted ? 'act' : ''} onClick={() => s.patch(p.id, { muted: !p.muted })}>M</button>
        <button className={p.loopMode !== 'off' ? 'act' : ''} title={LOOP_HELP} onClick={() => s.patch(p.id, { loopMode: NEXT_LOOP[p.loopMode] })}>{LOOP_LABEL[p.loopMode]}</button>
      </div>
      <select className={`nxsel ${p.nextTrackId ? 'set' : ''}`} value={p.nextTrackId ?? ''} onChange={e => s.patch(p.id, { nextTrackId: e.target.value || undefined })}>
        <option value="">⏭ Hẹn bài tiếp theo…</option>{s.tracks.map(t => <option key={t.id} value={t.id}>⏭ {t.name}</option>)}
      </select>
      {open && <Settings p={p} onClose={() => setOpen(false)} />}
    </div>
  )
}

export function MasterBar() {
  const s = useS(); const m = useMeter('master')
  return (
    <div className="mbar">
      <b>MASTER</b>
      <input type="range" className="vol" min={0} max={100} value={Math.round(s.master * 100)} onChange={e => s.setMaster(+e.target.value / 100)} />
      <span className="vp">{s.masterMuted ? 'MUTE' : Math.round(s.master * 100) + '%'}</span>
      <div className="mm"><Meter m={m} /></div>
      <button className={s.masterMuted ? 'act' : ''} onClick={s.toggleMaster}>M</button>
      <button onClick={s.stopAll}>■ Stop all</button><button onClick={s.pauseAll}>❚❚ Pause all</button><button onClick={s.resumeAll}>▶ Resume all</button>
      <span className="seg">{([12, 16, 24] as Desks[]).map(n => <button key={n} className={s.desks === n ? 'act' : ''} onClick={() => s.setDesks(n)}>{n} desk</button>)}</span>
    </div>
  )
}
