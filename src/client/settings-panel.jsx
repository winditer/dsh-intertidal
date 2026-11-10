// 潮间 —— 设置页（`settings.section`）。读写都走宿主 `/intertidal/settings`，改完即时生效。
//
// 这里刻意只做"表单 + 一次 POST"，不做本地乐观状态机：settings 的唯一真相在宿主（它还会做
// 范围钳制），客户端拿到返回值后由 runtime 广播。

import { useEffect, useState } from 'react'
import { CITIES } from '../cities.js'
import { DEFAULTS } from '../settings.js'

function Row({ label, hint, children, stack = false }) {
  return (
    <div className="it-row" data-stack={stack ? '1' : '0'}>
      <div className="it-row-label">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </div>
      <div className="it-row-control">{children}</div>
    </div>
  )
}

function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      className="it-switch"
      role="switch"
      aria-checked={checked ? 'true' : 'false'}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  )
}

const DURATIONS = [60, 180, 300, 600]
const INTERVALS = [15, 30, 60, 90, 120, 180, 240, 360, 480]

export default function SettingsPanel({ runtime, t = (k) => k, getLang = () => 'zh', subscribeLang, pickDirectory }) {
  const [state, setState] = useState(() => runtime.getState())
  const lang = typeof getLang === 'function' ? getLang() : 'zh'
  const [, bumpLang] = useState(0)
  useEffect(() => {
    if (typeof subscribeLang !== 'function') return undefined
    const unsub = subscribeLang(() => bumpLang((value) => value + 1))
    return () => unsub?.()
  }, [subscribeLang])
  const [custom, setCustom] = useState(false)
  const [scan, setScan] = useState(null)
  const [fetchNote, setFetchNote] = useState(null)


  useEffect(() => runtime.subscribe(setState), [runtime])

  const settings = state.settings ?? DEFAULTS
  const save = (patch) => void runtime.saveSettings(patch)
  const cityName = (city) => (lang === 'en' ? city.en : city.zh)

  const nextText = (() => {
    if (!settings.auto) return t('settings.next.off')
    const due = state.nextDueMs
    if (!due) return '—'
    const diff = due - Date.now()
    if (diff <= 0) return t('settings.next.soon')
    const mins = Math.round(diff / 60_000)
    return mins >= 60 ? `${Math.round(mins / 60)} ${lang === 'en' ? 'h' : '小时'}` : `${mins} ${t('unit.minutes')}`
  })()

  return (
    <div className="it-settings">
      <div className="it-group">
        <h4>{t('settings.group.rhythm')}</h4>
        <Row label={t('settings.auto')} hint={t('settings.auto.hint')}>
          <Switch checked={settings.auto} label={t('settings.auto')} onChange={(value) => save({ auto: value })} />
        </Row>
        <Row label={t('settings.interval')} hint={t('settings.interval.hint')}>
          <select
            value={settings.intervalMinutes}
            onChange={(event) => save({ intervalMinutes: Number(event.target.value) })}
          >
            {INTERVALS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} {t('unit.minutes')}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('settings.duration')} stack>
          <select
            value={DURATIONS.includes(settings.durationSeconds) ? settings.durationSeconds : 'custom'}
            onChange={(event) => {
              if (event.target.value === 'custom') return
              save({ durationSeconds: Number(event.target.value) })
            }}
          >
            {DURATIONS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds >= 60 ? `${seconds / 60} ${t('unit.minutes')}` : `${seconds} ${t('unit.seconds')}`}
              </option>
            ))}
            {DURATIONS.includes(settings.durationSeconds) ? null : (
              <option value="custom">
                {settings.durationSeconds} {t('unit.seconds')}
              </option>
            )}
          </select>
          <input
            type="number"
            min={30}
            max={1800}
            step={10}
            className="it-field-sm"
            value={settings.durationSeconds}
            onChange={(event) => save({ durationSeconds: Number(event.target.value) })}
          />
        </Row>
        <Row label={t('settings.firstDelay')} hint={t('settings.firstDelay.hint')}>
          <input
            type="number"
            min={0}
            max={120}
            step={5}
            className="it-field-sm"
            value={settings.firstDelayMinutes}
            onChange={(event) => save({ firstDelayMinutes: Number(event.target.value) })}
          />
        </Row>
        <Row label={t('settings.quiet')} hint={t('settings.quiet.hint')}>
          <Switch
            checked={settings.quietHours.enabled}
            label={t('settings.quiet')}
            onChange={(value) => save({ quietHours: { ...settings.quietHours, enabled: value } })}
          />
          <input
            type="time"
            value={settings.quietHours.start}
            onChange={(event) => save({ quietHours: { ...settings.quietHours, start: event.target.value } })}
          />
          <span style={{ opacity: 0.5 }}>–</span>
          <input
            type="time"
            value={settings.quietHours.end}
            onChange={(event) => save({ quietHours: { ...settings.quietHours, end: event.target.value } })}
          />
        </Row>
        <Row label={t('settings.deferTyping')} hint={t('settings.deferTyping.hint')}>
          <Switch
            checked={settings.deferOnTyping}
            label={t('settings.deferTyping')}
            onChange={(value) => save({ deferOnTyping: value })}
          />
        </Row>
        <Row label={t('settings.manualExtends')} hint={t('settings.manualExtends.hint')}>
          <Switch
            checked={settings.manualExtends}
            label={t('settings.manualExtends')}
            onChange={(value) => save({ manualExtends: value })}
          />
        </Row>
        <Row label={t('settings.next')}>
          <span className="it-hint">{nextText}</span>
        </Row>
      </div>

      <div className="it-group">
        <h4>{t('settings.group.form')}</h4>
        <Row label={t('settings.form')}>
          <select value={settings.form} onChange={(event) => save({ form: event.target.value })}>
            <option value="full">{t('settings.form.full')}</option>
            <option value="pip">{t('settings.form.pip')}</option>
          </select>
        </Row>
        <Row label={t('settings.rememberForm')}>
          <Switch
            checked={settings.rememberForm}
            label={t('settings.rememberForm')}
            onChange={(value) => save({ rememberForm: value })}
          />
        </Row>
        <Row label={t('settings.caption')} hint={t('settings.caption.hint')}>
          <Switch checked={settings.caption} label={t('settings.caption')} onChange={(value) => save({ caption: value })} />
        </Row>
      </div>

      <div className="it-group">
        <h4>{t('settings.group.media')}</h4>
        <Row label={t('settings.media.mode')} hint={t('settings.media.hint')}>
          <select
            value={settings.media.mode}
            onChange={(event) => save({ media: { ...settings.media, mode: event.target.value } })}
          >
            <option value="off">{t('settings.media.off')}</option>
            <option value="dir">{t('settings.media.dir')}</option>
            <option value="url">{t('settings.media.url')}</option>
          </select>
        </Row>

        {settings.media.mode === 'dir' ? (
          <>
            <Row label={t('settings.media.dir')} hint={t('settings.media.dir.hint')} stack>
              <input
                type="text"
                className="it-field"
                placeholder="/Users/you/Pictures/sea"
                value={settings.media.dir}
                onChange={(event) => save({ media: { ...settings.media, dir: event.target.value } })}
              />
              {typeof pickDirectory === 'function' ? (
                <button
                  type="button"
                  className="it-action"
                  onClick={async () => {
                    try {
                      const picked = await pickDirectory()
                      if (typeof picked === 'string' && picked) {
                        save({ media: { ...settings.media, dir: picked } })
                        const res = await runtime.scanMedia(picked)
                        setScan(res?.ok ? res.value : { ok: false })
                      }
                    } catch {
                      setScan({ ok: false })
                    }
                  }}
                >
                  {t('settings.media.pick')}
                </button>
              ) : null}
              <button
                type="button"
                className="it-action"
                onClick={async () => {
                  const res = await runtime.scanMedia(settings.media.dir)
                  setScan(res?.ok ? res.value : { ok: false })
                }}
              >
                {t('settings.media.scan')}
              </button>
            </Row>
            {scan ? (
              <div className="it-hint it-row-note" style={{ paddingBottom: 6 }}>
                {scan.ok
                  ? scan.count > 0
                    ? `${t('settings.media.scanOk')}：${scan.count}（${scan.images} / ${scan.videos}）`
                    : t('settings.media.scanEmpty')
                  : t('settings.media.scanFail')}
              </div>
            ) : null}
            <Row label={t('settings.media.shuffle')}>
              <Switch
                checked={settings.media.shuffle}
                label={t('settings.media.shuffle')}
                onChange={(value) => save({ media: { ...settings.media, shuffle: value } })}
              />
            </Row>
          </>
        ) : null}

        {settings.media.mode === 'url' ? (
          <>
            <Row label={t('settings.media.urls')} hint={t('settings.media.urls.hint')} stack>
              <textarea
                rows={4}
                className="it-field"
                value={settings.media.urls.join('\n')}
                onChange={(event) =>
                  save({ media: { ...settings.media, urls: event.target.value.split('\n') } })
                }
              />
            </Row>
            <Row label={t('settings.media.fetch')}>
              <button
                type="button"
                className="it-action"
                onClick={async () => {
                  setFetchNote(null)
                  const urls = settings.media.urls.slice(0, 8)
                  let ok = 0
                  for (const url of urls) {
                    const res = await runtime.resolveMedia(url)
                    if (res?.ok && res.value?.item) ok += 1
                  }
                  setFetchNote(ok > 0 ? t('settings.media.fetchOk') : t('settings.media.fetchFail'))
                }}
              >
                {t('settings.media.fetch')}
              </button>
              {fetchNote ? <span className="it-hint">{fetchNote}</span> : null}
            </Row>
          </>
        ) : null}

        {settings.media.mode !== 'off' ? (
          <>
            <Row label={t('settings.media.grade')} hint={t('settings.media.grade.hint')}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.media.grade}
                aria-label={t('settings.media.grade')}
                onChange={(event) => save({ media: { ...settings.media, grade: Number(event.target.value) } })}
              />
            </Row>
            <Row label={t('settings.media.motion')} hint={t('settings.media.motion.hint')}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.media.motion}
                aria-label={t('settings.media.motion')}
                onChange={(event) => save({ media: { ...settings.media, motion: Number(event.target.value) } })}
              />
            </Row>
          </>
        ) : null}
      </div>

      <div className="it-group">
        <h4>{t('settings.group.place')}</h4>
        <Row label={t('settings.city')}>
          <select
            value={custom ? '__custom__' : settings.location.city}
            onChange={(event) => {
              if (event.target.value === '__custom__') {
                setCustom(true)
                return
              }
              setCustom(false)
              const city = CITIES.find((item) => item.id === event.target.value)
              if (!city) return
              save({ location: { city: city.id, lat: city.lat, lon: city.lon, tz: city.tz } })
            }}
          >
            {CITIES.map((city) => (
              <option key={city.id} value={city.id}>
                {cityName(city)}
              </option>
            ))}
            <option value="__custom__">{t('settings.city.custom')}</option>
          </select>
        </Row>
        {custom ? (
          <Row label={t('settings.city.custom')} stack>
            <input
              type="number"
              step="0.01"
              className="it-field-sm"
              value={settings.location.lat}
              aria-label={t('settings.lat')}
              onChange={(event) =>
                save({ location: { ...settings.location, lat: Number(event.target.value) } })
              }
            />
            <input
              type="number"
              step="0.01"
              className="it-field-sm"
              value={settings.location.lon}
              aria-label={t('settings.lon')}
              onChange={(event) =>
                save({ location: { ...settings.location, lon: Number(event.target.value) } })
              }
            />
            <input
              type="text"
              className="it-field"
              value={settings.location.tz}
              aria-label={t('settings.tz')}
              onChange={(event) => save({ location: { ...settings.location, tz: event.target.value } })}
            />
          </Row>
        ) : null}
      </div>

      <div className="it-group">
        <h4>{t('settings.group.sound')}</h4>
        <Row label={t('settings.sound')} hint={t('settings.sound.hint')}>
          <Switch
            checked={settings.sound.enabled}
            label={t('settings.sound')}
            onChange={(value) => {
              if (value) runtime.unlockSound()
              save({ sound: { ...settings.sound, enabled: value } })
              if (!value) runtime.getState().sound?.disable?.()
            }}
          />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={settings.sound.volume}
            aria-label={t('settings.volume')}
            onChange={(event) => save({ sound: { ...settings.sound, volume: Number(event.target.value) } })}
          />
        </Row>
      </div>

      <div className="it-group">
        <h4>{t('settings.group.access')}</h4>
        <Row label={t('settings.reducedMotion')} hint={t('settings.reducedMotion.hint')}>
          <select
            value={settings.reducedMotion}
            onChange={(event) => save({ reducedMotion: event.target.value })}
          >
            <option value="auto">{t('settings.reducedMotion.auto')}</option>
            <option value="on">{t('settings.reducedMotion.on')}</option>
            <option value="off">{t('settings.reducedMotion.off')}</option>
          </select>
        </Row>
      </div>

      <div className="it-group">
        <div className="it-actions">
          <button type="button" className="it-action" data-primary="1" onClick={() => runtime.show('manual')}>
            {t('action.preview')}
          </button>
          <button type="button" className="it-action" onClick={() => void runtime.skipToday()}>
            {t('action.skip')}
          </button>
        </div>
        {state.offline ? <div className="it-warn">{t('hint.offline')}</div> : null}
        <div className="it-hint">
          {t('hint.keys')} · {t('settings.stateFile')}: ~/.dsh/intertidal/state.json
        </div>
      </div>
    </div>
  )
}