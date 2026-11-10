// 潮间 —— WebAudio 合成海浪（默认关）。
//
// 不加载任何素材：白噪声 → 带通（中心频率 400–1200 Hz 随"浪高"扫动）→ 增益；
// 再用 0.08 Hz 的 LFO 慢慢推增益，听感像潮水一层一层来。
//
// 浏览器自动播放策略：AudioContext 必须在一次用户手势里创建/resume。所以 `enable()`
// 只能由点击触发；`enable()` 里失败就安静地返回 false，绝不弹错。

const FADE_IN = 0.15
const FADE_OUT = 0.4

export function createSurfSound() {
  let ctx = null
  let source = null
  let gain = null
  let lfo = null
  let lfoGain = null
  let filter = null
  let enabled = false
  let volume = 0.35

  function ensureContext() {
    if (ctx) return ctx
    const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext
    if (!Ctor) return null
    try {
      ctx = new Ctor()
      return ctx
    } catch {
      return null
    }
  }

  /** 2 秒的白噪声缓冲，循环播放。 */
  function noiseBuffer(audio) {
    const length = Math.floor(audio.sampleRate * 2)
    const buffer = audio.createBuffer(1, length, audio.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1
      // 轻微低通，去掉最刺耳的高频嘶声
      last = last * 0.92 + white * 0.08
      data[i] = last * 3.2
    }
    return buffer
  }

  /** 在一次用户手势里调用。成功返回 true。 */
  function enable(nextVolume = volume) {
    const audio = ensureContext()
    if (!audio) return false
    try {
      volume = clampVolume(nextVolume)
      if (audio.state === 'suspended') void audio.resume()
      if (!source) {
        source = audio.createBufferSource()
        source.buffer = noiseBuffer(audio)
        source.loop = true

        filter = audio.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.value = 700
        filter.Q.value = 0.6

        gain = audio.createGain()
        gain.gain.value = 0

        // LFO：0.08 Hz，把带通中心频率在 400–1200 Hz 之间来回扫。
        lfo = audio.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = 0.08
        lfoGain = audio.createGain()
        lfoGain.gain.value = 400
        lfo.connect(lfoGain)
        lfoGain.connect(filter.frequency)
        lfo.start()

        source.connect(filter)
        filter.connect(gain)
        gain.connect(audio.destination)
        source.start()
      }
      const now = audio.currentTime
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(volume, now + FADE_IN)
      enabled = true
      return true
    } catch {
      return false
    }
  }

  function disable() {
    enabled = false
    const audio = ctx
    if (!audio || !gain) return
    try {
      const now = audio.currentTime
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(0, now + FADE_OUT)
    } catch {
      /* 忽略 */
    }
  }

  function setVolume(next) {
    volume = clampVolume(next)
    if (!ctx || !gain || !enabled) return
    try {
      const now = ctx.currentTime
      gain.gain.cancelScheduledValues(now)
      gain.gain.linearRampToValueAtTime(volume, now + FADE_IN)
    } catch {
      /* 忽略 */
    }
  }

  /** 卸载时调用：先淡出，再彻底拆掉。 */
  function dispose() {
    disable()
    const audio = ctx
    const nodes = { source, lfo }
    ctx = null
    source = null
    lfo = null
    filter = null
    lfoGain = null
    gain = null
    if (!audio) return
    setTimeout(() => {
      try {
        nodes.source?.stop()
      } catch {
        /* 已经停了 */
      }
      try {
        nodes.lfo?.stop()
      } catch {
        /* 已经停了 */
      }
      void audio.close?.().catch?.(() => {})
    }, 500)
  }

  return {
    enable,
    disable,
    setVolume,
    dispose,
    get enabled() {
      return enabled
    },
  }
}

function clampVolume(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0.35
  return Math.min(1, Math.max(0, n))
}