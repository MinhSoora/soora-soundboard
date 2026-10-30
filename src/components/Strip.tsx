import { useEffect, useRef } from 'react'
import type { CSSProperties, KeyboardEvent as RKeyboardEvent } from 'react'
import { engine } from '../audio/engine'
import { useS, Player, curTrackId } from '../store/useStore'

export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
export const combo = (e: KeyboardEvent | RKeyboardEvent) => {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return ''
  return [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.key.length === 1 ? e.key.toUpperCase() : e.key === ' ' ? 'Space' : e.key].filter(Boolean).join('+')
}

/** Real-signal meter: reads AnalyserNode peak each frame and writes straight to the DOM. */
function useMeter(id: string, extra?: () => void) {
  const fill = useRef<HTMLDivElement>(null), db = useRef<HTMLSpanElement>(null), clip = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const pk = engine.peak(id), d = pk > 0 ? 20 * Math.log10(pk) : -90
      if (fill.current) fill.current.style.height = Math.max(0, Math.min(100, (d + 60) / 60 * 100)) + '%'
      if (db.current) db.current.textContent = d > -89 ? d.toFixed(1) : '-∞'
      if (pk >= 0.99) clip.current?.classList.add('on')
      extra?.(); raf = requestAnimationFrame(loop)
    }
    loop(); return () => cancelAnimationFrame(raf)
  }, [id])
  return { fill, db, clip }
}
const Meter = ({ m }: { m: ReturnType<typeof useMeter> }) => (
  <div className="meterwrap">
    <button ref={m.clip} className="clip" title="Clipping – bấm để reset" onClick={e => e.currentTarget.classList.remove('on')} />
    <div className="meter"><div ref={m.fill} className="fill" /></div>
    <span ref={m.db} className="db">-∞</span>
  </div>
)

export function KeyBtn({ p }: { p: Player }) {
  const s = useS()
  return <button data-capture="1" className="cap" title="Bấm rồi nhấn phím (Esc để xóa)" onKeyDown={e => {
    if (e.key === 'Tab') return; e.preventDefault(); e.stopPropagation(); const k = combo(e); if (k) s.setKey(p.id, k === 'Escape' ? undefined : k)
  }}>{p.key ? `⌨ ${p.key}` : '⌨ Gán phím'}</button>
}

export function Strip({ p }: { p: Player }) {
  const s = useS(); const st = s.status[p.id] ?? 'stop'; const armed = s.armed[p.id]
  const armedRef = useRef(armed); armedRef.current = armed
  const time = useRef<HTMLSpanElement>(null), seek = useRef<HTMLInputElement>(null), cd = useRef<HTMLSpanElement>(null)
  const m = useMeter(p.id, () => {
    const [c, d] = engine.info(p.id)
    if (time.current) time.current.textContent = `${fmt(c)} / ${fmt(d)}`
    if (seek.current && document.activeElement !== seek.current) { seek.current.max = String(d || 1); seek.current.value = String(c) }
    if (cd.current && armedRef.current) cd.current.textContent = '⏱ ' + fmt(Math.max(0, (armedRef.current - Date.now()) / 1000))
  })
  const pl = s.playlists.find(x => x.id === p.playlistId)
  const track = s.tracks.find(t => t.id === curTrackId(s, p))
  return (
    <div className={`strip ${st} ${armed ? 'armed' : ''}`} style={{ '--c': p.color } as CSSProperties}
      onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); s.movePlayer(e.dataTransfer.getData('text/plain'), p.id) }}>
      {p.key && <div className="kb">{p.key}</div>}
      <div className="head">
        <span className="grip" draggable title="Kéo để đổi vị trí / thả lên tab để chuyển trang"
          onDragStart={e => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.setDragImage(e.currentTarget.closest('.strip')!, 20, 20) }}>⠿</span>
        <b className="pname" title="Bấm để đổi tên" onClick={() => { const n = prompt('Tên Player', p.name); if (n?.trim()) s.patch(p.id, { name: n.trim() }) }}>{p.name} ✎</b>
        <input type="color" className="color" value={p.color} title="Chọn màu" onChange={e => s.patch(p.id, { color: e.target.value })} />
      </div>
      <div className="now">{track ? (pl ? `${p.idx + 1}. ` : '') + track.name : 'Chưa có nhạc'}</div>
      <input ref={seek} type="range" className="seek" min={0} max={1} step={0.1} defaultValue={0} onChange={e => engine.seek(p.id, +e.target.value)} />
      <div className="trow"><span ref={time} className="time">0:00 / 0:00</span><span ref={cd} className="cd">{armed ? '' : st === 'play' ? 'ĐANG PHÁT' : ''}</span></div>
      <div className="faderrow">
        <input type="range" className="fader" min={0} max={100} value={Math.round(p.volume * 100)} onChange={e => s.patch(p.id, { volume: +e.target.value / 100 })} />
        <Meter m={m} />
      </div>
      <div className="pct">{p.muted ? 'MUTE' : Math.round(p.volume * 100) + '%'}</div>
      <div className="btns">
        {pl && <button onClick={() => s.prev(p.id)}>⏮</button>}
        <button className="go" onClick={() => s.toggle(p.id)}>{st === 'play' ? '❚❚' : '▶'}</button>
        <button onClick={() => s.stop(p.id)}>■</button>
        {pl && <button onClick={() => s.next(p.id)}>⏭</button>}
        <button className={p.muted ? 'act' : ''} onClick={() => s.patch(p.id, { muted: !p.muted })}>M</button>
        <button className={p.loop ? 'act' : ''} title={pl ? 'Lặp playlist' : 'Lặp bài'} onClick={() => s.patch(p.id, { loop: !p.loop })}>↻</button>
      </div>
      <div className="btns sm">
        <button onClick={() => { engine.fadeIn(p.id); s.setStatus(p.id, 'play') }}>Fade in</button>
        <button onClick={() => engine.fadeOut(p.id)}>Fade out</button>
      </div>
      <label className="filebtn">📁 Chọn file MP3<input type="file" hidden accept="audio/*,.flac" onChange={async e => {
        const f = e.target.files; if (f?.length) { const t = await s.importFiles(f); if (t[0]) s.assign(p.id, t[0].id) } e.target.value = ''
      }} /></label>
      <select value={p.trackId ?? ''} disabled={!!pl} onChange={e => s.assign(p.id, e.target.value || undefined)}>
        <option value="">— Chọn từ thư viện —</option>{s.tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <select value={p.playlistId ?? ''} onChange={e => s.assignPlaylist(p.id, e.target.value || undefined)}>
        <option value="">Không dùng playlist</option>{s.playlists.map(l => <option key={l.id} value={l.id}>♫ {l.name}</option>)}
      </select>
      <div className="btns sm">
        <KeyBtn p={p} />
        <button className={armed ? 'warnb' : ''} onClick={() => { if (armed) return s.schedule(p.id, 0); const n = parseFloat(prompt('Phát sau bao nhiêu giây?', '10') ?? ''); if (n > 0) s.schedule(p.id, n) }}>{armed ? 'Hủy hẹn' : '⏱ Hẹn giờ'}</button>
      </div>
      <div className="btns sm"><button onClick={() => s.dupPlayer(p.id)}>Nhân bản</button><button onClick={() => confirm(`Xóa ${p.name}?`) && s.removePlayer(p.id)}>Xóa</button></div>
    </div>
  )
}

export function MasterStrip() {
  const s = useS(); const m = useMeter('master')
  return (
    <div className="strip master">
      <div className="head"><b>MASTER</b></div>
      <div className="faderrow">
        <input type="range" className="fader" min={0} max={100} value={Math.round(s.master * 100)} onChange={e => s.setMaster(+e.target.value / 100)} />
        <Meter m={m} />
      </div>
      <div className="pct">{s.masterMuted ? 'MUTE' : Math.round(s.master * 100) + '%'}</div>
      <div className="btns"><button className={s.masterMuted ? 'act' : ''} onClick={s.toggleMaster}>M</button></div>
      <div className="btns sm col"><button onClick={s.stopAll}>Stop all (Esc)</button><button onClick={s.pauseAll}>Pause all</button><button onClick={s.resumeAll}>Resume all</button></div>
    </div>
  )
}
