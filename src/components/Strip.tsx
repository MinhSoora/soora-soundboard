import { useEffect, useRef } from 'react'
import { engine } from '../audio/engine'
import { useS, Player } from '../store/useStore'

export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Real-signal meter: reads AnalyserNode peak each frame, writes straight to DOM (no React re-render). */
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

export function Strip({ p }: { p: Player }) {
  const s = useS(); const st = s.status[p.id] ?? 'stop'
  const time = useRef<HTMLSpanElement>(null), seek = useRef<HTMLInputElement>(null)
  const m = useMeter(p.id, () => {
    const [c, d] = engine.info(p.id)
    if (time.current) time.current.textContent = `${fmt(c)} / ${fmt(d)}`
    if (seek.current && document.activeElement !== seek.current) { seek.current.max = String(d || 1); seek.current.value = String(c) }
  })
  const track = s.tracks.find(t => t.id === p.trackId)
  return (
    <div className={`strip ${st}`}>
      <div className="head">
        <b className="pname" title="Đổi tên" onClick={() => { const n = prompt('Tên Player', p.name); if (n?.trim()) s.patch(p.id, { name: n.trim() }) }}>{p.name}</b>
        <span className="led" />
      </div>
      <select value={p.trackId ?? ''} onChange={e => s.assign(p.id, e.target.value || undefined)}>
        <option value="">— Chọn nhạc —</option>{s.tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <div className="now">{track ? track.name : 'Chưa có nhạc'}</div>
      <input ref={seek} type="range" className="seek" min={0} max={1} step={0.1} defaultValue={0} onChange={e => engine.seek(p.id, +e.target.value)} />
      <span ref={time} className="time">0:00 / 0:00</span>
      <div className="faderrow">
        <input type="range" className="fader" min={0} max={100} value={Math.round(p.volume * 100)} onChange={e => s.patch(p.id, { volume: +e.target.value / 100 })} />
        <Meter m={m} />
      </div>
      <div className="pct">{p.muted ? 'MUTE' : Math.round(p.volume * 100) + '%'}</div>
      <div className="btns">
        <button className="go" onClick={() => s.toggle(p.id)}>{st === 'play' ? '❚❚' : '▶'}</button>
        <button onClick={() => s.stop(p.id)}>■</button>
        <button className={p.muted ? 'act' : ''} onClick={() => s.patch(p.id, { muted: !p.muted })}>M</button>
        <button className={p.loop ? 'act' : ''} onClick={() => s.patch(p.id, { loop: !p.loop })}>↻</button>
      </div>
      <div className="btns sm">
        <button onClick={() => { engine.fadeIn(p.id); s.setStatus(p.id, 'play') }}>Fade in</button>
        <button onClick={() => engine.fadeOut(p.id)}>Fade out</button>
        <button onClick={() => s.dupPlayer(p.id)}>Nhân bản</button>
        <button onClick={() => confirm(`Xóa ${p.name}?`) && s.removePlayer(p.id)}>Xóa</button>
      </div>
      <div className="key">{p.key ? `Phím: ${p.key}` : 'Chưa gán phím'}</div>
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
      <div className="btns sm col">
        <button onClick={s.stopAll}>Stop all (Esc)</button><button onClick={s.pauseAll}>Pause all</button><button onClick={s.resumeAll}>Resume all</button>
      </div>
    </div>
  )
}
