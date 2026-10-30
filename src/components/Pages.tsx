import { useEffect, useRef, useState } from 'react'
import { useS } from '../store/useStore'
import { Strip, MasterStrip, fmt } from './Strip'
import { storageInfo } from '../storage/db'

export function Mixer() {
  const s = useS()
  return (
    <div className="mixer">
      <div className="strips">
        {s.players.map(p => <Strip key={p.id} p={p} />)}
        <button className="addp" onClick={() => s.addPlayer()}>+ Thêm Player</button>
      </div>
      <MasterStrip />
    </div>
  )
}

export function Library() {
  const s = useS(); const [q, setQ] = useState(''); const [drag, setDrag] = useState(false)
  const prev = useRef<HTMLAudioElement | null>(null); const [pv, setPv] = useState('')
  const [st, setSt] = useState({ used: 0, quota: 0, persisted: false })
  useEffect(() => { storageInfo().then(setSt) }, [s.tracks.length])
  const preview = (id: string) => {
    prev.current?.pause(); if (pv === id) return setPv('')
    const t = s.tracks.find(t => t.id === id)!; const a = new Audio(URL.createObjectURL(t.blob)); a.onended = () => setPv(''); a.play(); prev.current = a; setPv(id)
  }
  const list = s.tracks.filter(t => t.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); s.importFiles(e.dataTransfer.files) }}>
      <div className={`drop ${drag ? 'on' : ''}`}>Kéo thả MP3, WAV, OGG, M4A, FLAC vào đây hoặc
        <label className="pick"> chọn file<input type="file" hidden multiple accept="audio/*,.flac" onChange={e => e.target.files && s.importFiles(e.target.files)} /></label></div>
      <input className="search" placeholder="Tìm bài hát…" value={q} onChange={e => setQ(e.target.value)} />
      {!st.persisted && <p className="warn">Trình duyệt chưa cho lưu bền vững – dữ liệu có thể bị xóa khi thiếu dung lượng. Hãy cài ứng dụng (PWA) hoặc cấp quyền lưu trữ.</p>}
      <p className="muted">Đã dùng {(st.used / 1e6).toFixed(0)} MB / {(st.quota / 1e9).toFixed(1)} GB</p>
      <table><thead><tr><th>Tên</th><th>Thời lượng</th><th>Dung lượng</th><th /></tr></thead><tbody>
        {list.map(t => <tr key={t.id}><td>{t.name}</td><td>{fmt(t.duration)}</td><td>{(t.size / 1e6).toFixed(1)} MB</td>
          <td className="acts"><button onClick={() => preview(t.id)}>{pv === t.id ? '■ Dừng' : '▶ Nghe thử'}</button>
            <button onClick={() => s.addPlayer(t.id)}>+ Player</button>
            <button onClick={() => { const n = prompt('Tên mới', t.name); if (n) s.renameTrack(t.id, n) }}>Đổi tên</button>
            <button onClick={() => confirm('Xóa bài này?') && s.removeTrack(t.id)}>Xóa</button></td></tr>)}
      </tbody></table>
      {!list.length && <p className="muted">Thư viện trống – hãy thêm nhạc.</p>}
    </div>
  )
}

export const combo = (e: KeyboardEvent | React.KeyboardEvent) => {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return ''
  return [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.key.length === 1 ? e.key.toUpperCase() : e.key === ' ' ? 'Space' : e.key].filter(Boolean).join('+')
}

export function Shortcuts() {
  const s = useS(); const [warn, setWarn] = useState('')
  const onKey = (id: string) => (e: React.KeyboardEvent) => {
    e.preventDefault(); e.stopPropagation(); const k = combo(e); if (!k) return
    if (k === 'Escape') return s.patch(id, { key: undefined })
    const dup = s.players.find(p => p.key === k && p.id !== id)
    if (dup || k === 'Escape') return setWarn(`Phím ${k} đã được gán cho "${dup!.name}"`)
    setWarn(''); s.patch(id, { key: k })
  }
  return (
    <div><h2>Phím tắt</h2>
      <p className="muted">Bấm vào ô rồi nhấn tổ hợp phím (Ctrl/Alt/Shift + phím). Escape trong ô để xóa. Phím <b>Esc</b> toàn cục = Stop All.</p>
      <p className="warn">Giới hạn: phím tắt chỉ hoạt động khi tab SooraSound đang được focus. Trình duyệt không nhận phím khi chạy nền hoặc bị thu nhỏ.</p>
      {warn && <p className="err">{warn}</p>}
      <table><tbody>{s.players.map(p => <tr key={p.id}><td>{p.name}</td><td>Phát / Tạm dừng</td>
        <td><button data-capture="1" className="cap" onKeyDown={onKey(p.id)}>{p.key ?? 'Bấm để gán phím'}</button></td></tr>)}</tbody></table>
    </div>
  )
}
