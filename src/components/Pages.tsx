import { useEffect, useRef, useState } from 'react'
import { useS } from '../store/useStore'
import { Strip, MasterStrip, KeyBtn, fmt } from './Strip'
import { storageInfo } from '../storage/db'

export function Mixer() {
  const s = useS(); const list = s.players.filter(p => p.pageId === s.page)
  return (
    <div>
      <div className="tabs">
        {s.pages.map(g => <button key={g.id} className={g.id === s.page ? 'on' : ''} onClick={() => s.setPage(g.id)} title="Bấm đúp để đổi tên · thả Player lên đây để chuyển trang"
          onDoubleClick={() => { const n = prompt('Tên trang', g.name); if (n?.trim()) s.renamePage(g.id, n.trim()) }}
          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); s.movePlayerToPage(e.dataTransfer.getData('text/plain'), g.id) }}>{g.name}</button>)}
        <button onClick={s.addPage}>+ Trang</button>
        {s.pages.length > 1 && <button onClick={() => confirm('Xóa trang này và các Player trong đó?') && s.removePage(s.page)}>Xóa trang</button>}
      </div>
      <div className="mixer">
        <div className="strips">{list.map(p => <Strip key={p.id} p={p} />)}<button className="addp" onClick={() => s.addPlayer()}>+ Thêm Player</button></div>
        <MasterStrip />
      </div>
    </div>
  )
}

export function Playlists() {
  const s = useS(); const [sel, setSel] = useState(''); const pl = s.playlists.find(l => l.id === sel) ?? s.playlists[0]
  return (
    <div className="plwrap">
      <div className="pllist">
        {s.playlists.map(l => <button key={l.id} className={l.id === pl?.id ? 'on' : ''} onClick={() => setSel(l.id)}>♫ {l.name}</button>)}
        <button onClick={s.addPlaylist}>+ Playlist mới</button>
      </div>
      {pl ? <div className="plbody">
        <h2>{pl.name} <button onClick={() => { const n = prompt('Tên playlist', pl.name); if (n?.trim()) s.renamePlaylist(pl.id, n.trim()) }}>Đổi tên</button> <button onClick={() => confirm('Xóa playlist?') && s.removePlaylist(pl.id)}>Xóa</button></h2>
        <p className="muted">Kéo thả để đổi thứ tự. Gán playlist cho Player trong Mixer, Player sẽ tự chuyển bài; bật ↻ để lặp cả playlist.</p>
        <select value="" onChange={e => e.target.value && s.addToPlaylist(pl.id, e.target.value)}>
          <option value="">+ Thêm bài từ thư viện…</option>{s.tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <table><tbody>{pl.trackIds.map((tid, i) => <tr key={i} draggable onDragStart={e => e.dataTransfer.setData('text/pl', String(i))} onDragOver={e => e.preventDefault()}
          onDrop={e => s.moveInPlaylist(pl.id, +e.dataTransfer.getData('text/pl'), i)}>
          <td>⠿ {i + 1}</td><td>{s.tracks.find(t => t.id === tid)?.name}</td><td className="acts"><button onClick={() => s.removeFromPlaylist(pl.id, i)}>Xóa</button></td></tr>)}</tbody></table>
      </div> : <p className="muted">Chưa có playlist – bấm “+ Playlist mới”.</p>}
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

export function Shortcuts() {
  const s = useS()
  return (
    <div><h2>Phím tắt</h2>
      <p className="muted">Bấm vào ô rồi nhấn tổ hợp phím (Ctrl/Alt/Shift + phím). Esc trong ô để xóa. Phím <b>Esc</b> toàn cục = Stop All. Phím cũng hiện nổi trên từng Player.</p>
      <p className="warn">Giới hạn: phím tắt chỉ hoạt động khi tab SooraSound đang được focus. Trình duyệt không nhận phím khi chạy nền hoặc bị thu nhỏ.</p>
      <table><tbody>{s.players.map(p => <tr key={p.id}><td><span className="dot" style={{ background: p.color }} /> {p.name}</td><td className="muted">{s.pages.find(g => g.id === p.pageId)?.name}</td><td>Phát / Tạm dừng</td><td><KeyBtn p={p} /></td></tr>)}</tbody></table>
    </div>
  )
}
