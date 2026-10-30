import { useEffect, useRef } from 'react'
import { engine } from '../audio/engine'
import { useS, Player, curTrackId } from '../store/useStore'
import { fmt } from './Strip'

function Chip({ p }: { p: Player }) {
  const s = useS(); const st = s.status[p.id]; const armed = s.armed[p.id]
  const rem = useRef<HTMLSpanElement>(null), bar = useRef<HTMLDivElement>(null)
  const ar = useRef(armed); ar.current = armed
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const [c, d] = engine.info(p.id)
      if (rem.current) rem.current.textContent = ar.current ? '⏱ ' + fmt(Math.max(0, (ar.current - Date.now()) / 1000)) : '-' + fmt(Math.max(0, d - c))
      if (bar.current) bar.current.style.width = (d ? c / d * 100 : 0) + '%'
      raf = requestAnimationFrame(loop)
    }
    loop(); return () => cancelAnimationFrame(raf)
  }, [p.id])
  const t = s.tracks.find(x => x.id === curTrackId(s, p))
  return (
    <div className={`chip ${armed ? 'armed' : st}`} style={{ '--c': p.color } as React.CSSProperties}>
      <div className="ctop"><span className="dot" /><b>{p.name}</b><span className="cs">{armed ? 'Sắp phát' : st === 'play' ? 'Đang phát' : 'Tạm dừng'}</span><span ref={rem} className="rem" /></div>
      <div className="ctrk">{t?.name ?? '—'}</div><div className="cbar"><div ref={bar} /></div>
    </div>
  )
}

export default function NowPlaying() {
  const s = useS(); const act = s.players.filter(p => s.status[p.id] === 'play' || s.status[p.id] === 'pause' || s.armed[p.id])
  const n = s.players.filter(p => s.status[p.id] === 'play').length
  return (
    <div className="np">
      <div className="npinfo"><b>{n}</b> đang phát<br /><span className="muted">{s.players.length} player</span></div>
      <div className="chips">{act.length ? act.map(p => <Chip key={p.id} p={p} />) : <span className="muted">Chưa có âm thanh nào đang phát</span>}</div>
      <button onClick={s.stopAll}>■ Stop all</button>
    </div>
  )
}
