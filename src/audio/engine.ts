// Chain: <audio> -> MediaElementSource -> fadeGain -> volGain -> Analyser -> masterGain -> masterAnalyser -> out
interface Ch { el: HTMLAudioElement; url: string; fade: GainNode; vol: GainNode; an: AnalyserNode; buf: Float32Array; timer?: number }
class Engine {
  ctx = new AudioContext()
  master = this.ctx.createGain()
  mAn = this.ctx.createAnalyser()
  private mBuf = new Float32Array(1024)
  private ch = new Map<string, Ch>()
  onEnded: (id: string) => void = () => {}
  onError: (id: string, msg: string) => void = () => {}
  constructor() { this.mAn.fftSize = 1024; this.master.connect(this.mAn); this.mAn.connect(this.ctx.destination) }
  private async wake() { if (this.ctx.state === 'suspended') await this.ctx.resume() }
  private ensure(id: string): Ch {
    let c = this.ch.get(id); if (c) return c
    const el = new Audio(); el.preload = 'auto'
    const src = this.ctx.createMediaElementSource(el)
    const fade = this.ctx.createGain(), vol = this.ctx.createGain(), an = this.ctx.createAnalyser()
    an.fftSize = 1024; src.connect(fade); fade.connect(vol); vol.connect(an); an.connect(this.master)
    el.onended = () => this.onEnded(id)
    el.onerror = () => this.onError(id, 'Không giải mã/phát được file này')
    c = { el, url: '', fade, vol, an, buf: new Float32Array(1024) }; this.ch.set(id, c); return c
  }
  load(id: string, blob: Blob) {
    const c = this.ensure(id); this.stop(id)
    if (c.url) URL.revokeObjectURL(c.url)
    c.url = URL.createObjectURL(blob); c.el.src = c.url; c.el.load()
  }
  async play(id: string) { const c = this.ch.get(id); if (!c?.url) return; await this.wake(); this.clr(c); try { await c.el.play() } catch { this.onError(id, 'Không phát được nguồn âm thanh') } }
  pause(id: string) { const c = this.ch.get(id); if (c) { this.clr(c); c.el.pause() } }
  stop(id: string) { const c = this.ch.get(id); if (c) { this.clr(c); c.el.pause(); c.el.currentTime = 0 } }
  seek(id: string, t: number) { const c = this.ch.get(id); if (c) c.el.currentTime = t }
  setVolume(id: string, v: number, muted: boolean) { const c = this.ch.get(id); if (c) c.vol.gain.setTargetAtTime(muted ? 0 : v, this.ctx.currentTime, 0.01) }
  setLoop(id: string, l: boolean) { const c = this.ch.get(id); if (c) c.el.loop = l }
  async fadeIn(id: string, s = 2) {
    const c = this.ch.get(id); if (!c?.url) return; await this.wake(); this.clr(c)
    const g = c.fade.gain, t = this.ctx.currentTime; g.setValueAtTime(0, t); g.linearRampToValueAtTime(1, t + s)
    try { await c.el.play() } catch { this.onError(id, 'Không phát được') }
  }
  fadeOut(id: string, s = 2) {
    const c = this.ch.get(id); if (!c || c.el.paused) return; this.clr(c)
    const g = c.fade.gain, t = this.ctx.currentTime; g.setValueAtTime(1, t); g.linearRampToValueAtTime(0, t + s)
    c.timer = window.setTimeout(() => { this.stop(id); this.onEnded(id) }, s * 1000)
  }
  private clr(c: Ch) { if (c.timer) { clearTimeout(c.timer); c.timer = undefined } c.fade.gain.cancelScheduledValues(0); c.fade.gain.value = 1 }
  info(id: string): [number, number] { const e = this.ch.get(id)?.el; return e ? [e.currentTime, isFinite(e.duration) ? e.duration : 0] : [0, 0] }
  peak(id: string): number { // real signal peak 0..1; 'master' = output
    const m = id === 'master'; const an = m ? this.mAn : this.ch.get(id)?.an; if (!an) return 0
    const b = m ? this.mBuf : this.ch.get(id)!.buf; an.getFloatTimeDomainData(b)
    let p = 0; for (let i = 0; i < b.length; i++) { const a = Math.abs(b[i]); if (a > p) p = a } return p
  }
  setMaster(v: number, muted: boolean) { this.master.gain.setTargetAtTime(muted ? 0 : v, this.ctx.currentTime, 0.01) }
  stopAll() { this.ch.forEach((_, id) => this.stop(id)) }
  remove(id: string) { const c = this.ch.get(id); if (!c) return; this.stop(id); c.el.removeAttribute('src'); if (c.url) URL.revokeObjectURL(c.url); c.fade.disconnect(); c.vol.disconnect(); c.an.disconnect(); this.ch.delete(id) }
}
export const engine = new Engine()
