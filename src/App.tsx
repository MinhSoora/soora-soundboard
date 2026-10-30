import { useEffect, useState } from 'react'
import { useS } from './store/useStore'
import { Mixer, Library, Shortcuts, combo } from './components/Pages'

const NAV = [['mixer', 'Mixer'], ['library', 'Music Library'], ['keys', 'Phím tắt']] as const
export default function App() {
  const s = useS(); const [page, setPage] = useState<(typeof NAV)[number][0]>('mixer')
  useEffect(() => { s.init() }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && (t as HTMLInputElement).type !== 'range') return
      if (t.dataset.capture || t.isContentEditable) return
      const k = combo(e); if (!k) return
      if (k === 'Escape') return useS.getState().stopAll()
      const p = useS.getState().players.find(p => p.key === k); if (p) { e.preventDefault(); useS.getState().toggle(p.id) }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])
  if (!s.ready) return <div className="boot">SooraSound…</div>
  return (
    <div className="app">
      <aside><div className="logo">Soora<span>Sound</span></div>
        {NAV.map(([k, l]) => <button key={k} className={page === k ? 'on' : ''} onClick={() => setPage(k)}>{l}</button>)}</aside>
      <main key={page}>
        {s.error && <div className="toast" onClick={s.clearError}>{s.error} ✕</div>}
        {page === 'mixer' ? <Mixer /> : page === 'library' ? <Library /> : <Shortcuts />}
      </main>
      <footer>Made by CNGL for free 2026</footer>
    </div>
  )
}
