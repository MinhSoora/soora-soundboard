import { useEffect, useState } from 'react'

/** Shows a warning when the device is held in portrait on a small screen. */
export default function RotateWarning() {
  const q = '(orientation: portrait) and (max-width: 900px)'
  const [portrait, setPortrait] = useState(() => window.matchMedia(q).matches)
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    const m = window.matchMedia(q); const h = () => { setPortrait(m.matches); if (!m.matches) setDismissed(false) }
    m.addEventListener('change', h); return () => m.removeEventListener('change', h)
  }, [])
  if (!portrait || dismissed) return null
  return (
    <div className="rotate">
      <div className="rbox">
        <div className="phone" />
        <h3>Hãy xoay ngang thiết bị</h3>
        <p>SooraSound cho trải nghiệm tốt nhất trên máy tính hoặc điện thoại xoay ngang. Ở chế độ xoay dọc, bảng Mixer sẽ bị chật và khó thao tác.</p>
        <button onClick={() => setDismissed(true)}>Vẫn tiếp tục</button>
      </div>
    </div>
  )
}
