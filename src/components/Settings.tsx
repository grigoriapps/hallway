import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useApp, useT } from '../state'
import { compareVersions, displayVersion, errorMessage, lastSeenLabel, platformLabel, statusLabel } from '../format'
import appIcon from '../assets/app-icon.png'
import {
  backgroundLabel,
  fontLabel,
  FONT_INFO,
  retentionAge,
  retentionLabel,
  themeLabel,
  THEME_INFO,
  type ThemeColors
} from '../appearance'
import { LOCALES, LOCALE_LABELS, type MessageKey, type Translator } from '../i18n'
import { playSound } from '../sounds'
import { whatsNewFor } from '../whats-new'
import { IconClose, IconPlay } from './Icons'
import {
  AUTO_ACCEPT_SIZES_MB,
  AUTO_AWAY_MINUTES,
  CHAT_BACKGROUNDS,
  FONTS,
  HISTORY_RETENTIONS,
  MESSAGE_FONT_SIZE,
  MESSAGE_TONES,
  THEMES,
  UI_SCALE,
  type AutoAcceptMode,
  type ColleagueView,
  type HistoryRetention,
  type MessageTone,
  type SettingsPatch,
  type ThemeId
} from '../types'

const MAX_NAME_LENGTH = 40
const IS_MAC = window.api.platform === 'darwin'
const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl'
const DEVELOPER_SITE = 'https://grigoriapps.com'

type TabId = 'profile' | 'appearance' | 'notifications' | 'chat' | 'system' | 'network' | 'about'

const TONE_KEYS: Record<MessageTone, MessageKey> = {
  chime: 'settings.tone.chime',
  birds: 'settings.tone.birds',
  whistle: 'settings.tone.whistle',
  drop: 'settings.tone.drop',
  marimba: 'settings.tone.marimba',
  pop: 'settings.tone.pop',
  harp: 'settings.tone.harp',
  none: 'settings.tone.none'
}

/** Своя мелодия у личных сообщений, групп и общего чата */
const TONE_CATEGORIES: Array<{ field: 'messageTone' | 'groupTone' | 'everyoneTone'; key: MessageKey }> = [
  { field: 'messageTone', key: 'settings.toneMessages' },
  { field: 'groupTone', key: 'settings.toneGroups' },
  { field: 'everyoneTone', key: 'settings.toneEveryone' }
]

const TABS: Array<{ id: TabId; key: MessageKey }> = [
  { id: 'profile', key: 'settings.tab.profile' },
  { id: 'appearance', key: 'settings.tab.appearance' },
  { id: 'notifications', key: 'settings.tab.notifications' },
  { id: 'chat', key: 'settings.tab.chat' },
  { id: 'system', key: 'settings.tab.system' },
  { id: 'network', key: 'settings.tab.network' },
  { id: 'about', key: 'settings.tab.about' }
]

const update = (patch: SettingsPatch) => {
  void window.api.updateSettings(patch)
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [tab, setTab] = useState<TabId>('profile')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const current = TABS.find((entry) => entry.id === tab)
  const title = current ? t(current.key) : ''

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-label={t('settings.title')}>
        <nav className="settings-nav">
          <div className="settings-title">{t('settings.title')}</div>
          {TABS.map((entry) => (
            <button
              key={entry.id}
              className={`settings-tab${tab === entry.id ? ' active' : ''}`}
              onClick={() => setTab(entry.id)}
            >
              {t(entry.key)}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          <div className="settings-content-header">
            <h2>{title}</h2>
            <button className="icon-button" onClick={onClose} aria-label={t('common.close')}>
              <IconClose />
            </button>
          </div>
          {/* key: новая вкладка открывается с начала, а не с прокруткой предыдущей */}
          <div className="settings-scroll" key={tab}>
            {tab === 'profile' && <ProfileTab />}
            {tab === 'appearance' && <AppearanceTab />}
            {tab === 'notifications' && <NotificationsTab />}
            {tab === 'chat' && <ChatTab />}
            {tab === 'system' && <SystemTab />}
            {tab === 'network' && <NetworkTab />}
            {tab === 'about' && <AboutTab />}
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h3>{title}</h3>
        {aside !== undefined && <span className="section-aside">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <label className={`toggle-row${disabled ? ' disabled' : ''}`}>
      <input
        type="checkbox"
        className="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-text">
        <span>{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </span>
    </label>
  )
}

// ─── профиль ────────────────────────────────────────────────────────────────────

function ProfileTab() {
  const { state } = useApp()
  const t = useT()
  const { settings } = state
  const [name, setName] = useState(settings.name)
  const [nameStatus, setNameStatus] = useState<{ error?: string; saved?: boolean }>({})

  const saveName = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await window.api.setName(name)
      setNameStatus({ saved: true })
    } catch (err) {
      setNameStatus({ error: errorMessage(err) })
    }
  }

  return (
    <>
      <Section title={t('settings.name')}>
        <form className="field-row" onSubmit={saveName}>
          <input
            className="input"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            onChange={(e) => {
              setName(e.target.value)
              setNameStatus({})
            }}
          />
          <button className="btn primary" type="submit" disabled={!name.trim() || name.trim() === settings.name}>
            {t('common.save')}
          </button>
        </form>
        {nameStatus.error && <div className="form-error">{nameStatus.error}</div>}
        {nameStatus.saved && <p className="hint">{t('settings.nameSaved')}</p>}
      </Section>

      <Section title={t('settings.autoAway')}>
        <select
          className="select"
          value={settings.autoAwayMinutes}
          onChange={(e) => update({ autoAwayMinutes: Number(e.target.value) })}
        >
          {AUTO_AWAY_MINUTES.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes === 0 ? t('common.never') : t('settings.autoAwayAfter', { n: minutes })}
            </option>
          ))}
        </select>
        <p className="hint">{t('settings.autoAwayHint')}</p>
      </Section>
    </>
  )
}

// ─── внешний вид ────────────────────────────────────────────────────────────────

function ThemeSwatchColors({ colors }: { colors: ThemeColors }) {
  return (
    <span className="theme-preview-inner" style={{ background: colors.bg }}>
      <span className="theme-preview-side" style={{ background: colors.sidebar }} />
      <span className="theme-preview-main">
        <span className="theme-preview-bubble" style={{ background: colors.bubble }} />
        <span className="theme-preview-bubble out" style={{ background: colors.accent }} />
      </span>
    </span>
  )
}

function ThemePreview({ id }: { id: ThemeId }) {
  return (
    <span className="theme-preview">
      {id === 'system' ? (
        <>
          <ThemeSwatchColors colors={THEME_INFO.light.colors} />
          <ThemeSwatchColors colors={THEME_INFO.dark.colors} />
        </>
      ) : (
        <ThemeSwatchColors colors={THEME_INFO[id].colors} />
      )}
    </span>
  )
}

/**
 * Значение ползунка. Применяется при отпускании (иначе масштаб менялся бы прямо под курсором),
 * а пока наше значение не подтверждено main-процессом, ответы с прежним значением его не сбивают —
 * при быстрых нажатиях иначе терялся шаг.
 */
function useSliderValue(external: number, commit: (value: number) => void) {
  const [value, setValue] = useState(external)
  const pending = useRef<number | null>(null)

  useEffect(() => {
    if (pending.current === null || pending.current === external) {
      pending.current = null
      setValue(external)
    }
  }, [external])

  return {
    value,
    setValue,
    commit: () => {
      if (value === external) return
      pending.current = value
      commit(value)
    }
  }
}

function AppearanceTab() {
  const { state } = useApp()
  const t = useT()
  const { settings } = state
  const appearance = settings.appearance
  const scale = useSliderValue(appearance.uiScale, (uiScale) => update({ appearance: { uiScale } }))
  const fontSize = useSliderValue(appearance.messageFontSize, (messageFontSize) =>
    update({ appearance: { messageFontSize } })
  )

  return (
    <>
      <Section title={t('settings.language')}>
        <div className="lang-grid">
          {LOCALES.map((locale) => (
            <button
              key={locale}
              className={`lang-option${settings.language === locale ? ' selected' : ''}`}
              onClick={() => update({ language: locale })}
              aria-pressed={settings.language === locale}
            >
              {LOCALE_LABELS[locale]}
            </button>
          ))}
        </div>
        <p className="hint">{t('settings.languageHint')}</p>
      </Section>

      <Section title={t('settings.theme')}>
        <div className="theme-grid">
          {THEMES.map((id) => (
            <button
              key={id}
              className={`theme-swatch${appearance.theme === id ? ' selected' : ''}`}
              onClick={() => update({ appearance: { theme: id } })}
            >
              <ThemePreview id={id} />
              <span>{themeLabel(t, id)}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('settings.font')}>
        <div className="font-grid">
          {FONTS.map((id) => (
            <button
              key={id}
              className={`font-option${appearance.font === id ? ' selected' : ''}`}
              style={{ fontFamily: FONT_INFO[id].css }}
              onClick={() => update({ appearance: { font: id } })}
            >
              <span className="font-sample">Аа Bb</span>
              <span className="font-name">{fontLabel(t, id)}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('settings.uiScale')} aside={`${scale.value}%`}>
        <input
          type="range"
          className="range"
          min={UI_SCALE.min}
          max={UI_SCALE.max}
          step={UI_SCALE.step}
          value={scale.value}
          onChange={(e) => scale.setValue(Number(e.target.value))}
          onPointerUp={scale.commit}
          onKeyUp={scale.commit}
          onBlur={scale.commit}
        />
        <div className="range-labels">
          <span>{UI_SCALE.min}%</span>
          <button
            className="link"
            disabled={appearance.uiScale === UI_SCALE.default}
            onClick={() => update({ appearance: { uiScale: UI_SCALE.default } })}
          >
            {t('settings.reset')}
          </button>
          <span>{UI_SCALE.max}%</span>
        </div>
        <p className="hint">{t('settings.scaleHint', { mod: MOD_KEY })}</p>
      </Section>

      <Section title={t('settings.messageFontSize')} aside={`${fontSize.value} px`}>
        <input
          type="range"
          className="range"
          min={MESSAGE_FONT_SIZE.min}
          max={MESSAGE_FONT_SIZE.max}
          step={1}
          value={fontSize.value}
          onChange={(e) => fontSize.setValue(Number(e.target.value))}
          onPointerUp={fontSize.commit}
          onKeyUp={fontSize.commit}
          onBlur={fontSize.commit}
        />
        <div className="preview-bubble" style={{ fontSize: fontSize.value }}>
          {t('settings.previewBubble')}
        </div>
      </Section>

      <Section title={t('settings.chatBackground')}>
        <div className="bg-grid">
          {CHAT_BACKGROUNDS.map((id) => (
            <button
              key={id}
              className={`bg-swatch${appearance.chatBackground === id ? ' selected' : ''}`}
              onClick={() => update({ appearance: { chatBackground: id } })}
            >
              <span className="bg-preview">
                <span className={`bg-pattern-${id}`} />
              </span>
              <span>{backgroundLabel(t, id)}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('settings.compact')}>
        <Toggle
          checked={appearance.compact}
          onChange={(compact) => update({ appearance: { compact } })}
          label={t('settings.compactLabel')}
        />
      </Section>
    </>
  )
}

// ─── уведомления ────────────────────────────────────────────────────────────────

function NotificationsTab() {
  const { state } = useApp()
  const t = useT()
  const n = state.settings.notifications

  return (
    <>
      <Section title={t('settings.whenHappens')}>
        <div className="settings-stack">
          <Toggle
            checked={n.system}
            onChange={(system) => update({ notifications: { system } })}
            label={t('settings.systemNotifications')}
            hint={t('settings.systemNotificationsHint')}
          />
          <Toggle
            checked={n.messageSound}
            onChange={(messageSound) => update({ notifications: { messageSound } })}
            label={t('settings.messageSound')}
          />
          <Toggle
            checked={n.presenceSound}
            onChange={(presenceSound) => update({ notifications: { presenceSound } })}
            label={t('settings.presenceSound')}
            hint={t('settings.presenceSoundHint')}
          />
        </div>
      </Section>

      <Section title={t('settings.messageTone')}>
        <div className="tone-rows">
          {TONE_CATEGORIES.map(({ field, key }) => (
            <div className="tone-row" key={field}>
              <span className="tone-row-label">{t(key)}</span>
              <select
                className="select"
                aria-label={t(key)}
                value={n[field]}
                onChange={(e) => {
                  const tone = e.target.value as MessageTone
                  update({ notifications: { [field]: tone } })
                  if (tone !== 'none') playSound({ kind: 'message', tone }, { force: true })
                }}
              >
                {MESSAGE_TONES.map((tone) => (
                  <option key={tone} value={tone}>
                    {t(TONE_KEYS[tone])}
                  </option>
                ))}
              </select>
              <button
                className="btn with-icon"
                disabled={n[field] === 'none'}
                onClick={() => playSound({ kind: 'message', tone: n[field] }, { force: true })}
              >
                <IconPlay size={12} /> {t('settings.tonePlay')}
              </button>
            </div>
          ))}
        </div>
        <p className="hint">
          {t('settings.toneHint')}
          {n.messageSound ? '' : t('settings.toneOffHint')}
        </p>
      </Section>

      <Section title={t('settings.presencePreview')}>
        <div className="field-row wrap">
          <button
            className="btn with-icon"
            onClick={() => playSound({ kind: 'online', tone: n.messageTone }, { force: true })}
          >
            <IconPlay size={12} /> {t('settings.appeared')}
          </button>
          <button
            className="btn with-icon"
            onClick={() => playSound({ kind: 'offline', tone: n.messageTone }, { force: true })}
          >
            <IconPlay size={12} /> {t('settings.left')}
          </button>
        </div>
        <p className="hint">{t('settings.dndHint')}</p>
      </Section>
    </>
  )
}

// ─── чат и история ──────────────────────────────────────────────────────────────

function retentionHint(t: Translator, retention: HistoryRetention): string {
  if (retention === 'none') return t('settings.retentionHint.none')
  if (retention === 'forever') return t('settings.retentionHint.forever')
  return t('settings.retentionHint.age', { age: retentionAge(t, retention) })
}

const AUTO_ACCEPT_KEYS: Array<[AutoAcceptMode, MessageKey]> = [
  ['off', 'settings.autoAccept.off'],
  ['pinned', 'settings.autoAccept.pinned'],
  ['all', 'settings.autoAccept.all']
]

function autoAcceptHint(t: Translator, mode: AutoAcceptMode): string {
  switch (mode) {
    case 'off':
      return t('settings.autoAcceptHint.off')
    case 'pinned':
      return t('settings.autoAcceptHint.pinned')
    case 'all':
      return t('settings.autoAcceptHint.all')
  }
}

const sizeLabel = (t: Translator, mb: number) =>
  mb === 0 ? t('settings.sizeUnlimited') : mb >= 1000 ? `${mb / 1000} ${t('size.gb')}` : `${mb} ${t('size.mb')}`

function ChatTab() {
  const { state } = useApp()
  const t = useT()
  const { settings } = state

  return (
    <>
      <Section title={t('settings.sendKey')}>
        <div className="segmented">
          <button className={settings.sendKey === 'enter' ? 'active' : ''} onClick={() => update({ sendKey: 'enter' })}>
            Enter
          </button>
          <button
            className={settings.sendKey === 'mod-enter' ? 'active' : ''}
            onClick={() => update({ sendKey: 'mod-enter' })}
          >
            {MOD_KEY} + Enter
          </button>
        </div>
        <p className="hint">
          {settings.sendKey === 'enter'
            ? t('settings.sendKeyEnterHint')
            : t('settings.sendKeyModHint', { mod: MOD_KEY })}
        </p>
      </Section>

      <Section title={t('settings.presenceEvents')}>
        <Toggle
          checked={settings.presenceEvents}
          onChange={(presenceEvents) => update({ presenceEvents })}
          label={t('settings.presenceEventsLabel')}
          hint={t('settings.presenceEventsHint')}
        />
      </Section>

      <Section title={t('settings.readReceipts')}>
        <Toggle
          checked={settings.readReceipts}
          onChange={(readReceipts) => update({ readReceipts })}
          label={t('settings.readReceiptsLabel')}
          hint={t('settings.readReceiptsHint')}
        />
      </Section>

      <Section title={t('settings.autoAccept')}>
        <div className="segmented">
          {AUTO_ACCEPT_KEYS.map(([mode, key]) => (
            <button
              key={mode}
              className={settings.autoAccept.mode === mode ? 'active' : ''}
              onClick={() => update({ autoAccept: { mode } })}
            >
              {t(key)}
            </button>
          ))}
        </div>
        {settings.autoAccept.mode !== 'off' && (
          <div className="field-row" style={{ marginTop: 10 }}>
            <span className="field-label">{t('settings.sizeUpTo')}</span>
            <select
              className="select"
              value={settings.autoAccept.maxSizeMb}
              onChange={(e) => update({ autoAccept: { maxSizeMb: Number(e.target.value) } })}
            >
              {AUTO_ACCEPT_SIZES_MB.map((mb) => (
                <option key={mb} value={mb}>
                  {sizeLabel(t, mb)}
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="hint">{autoAcceptHint(t, settings.autoAccept.mode)}</p>
      </Section>

      <Section title={t('settings.history')}>
        <div className="field-row">
          <span className="field-label">{t('settings.historyKeep')}</span>
          <select
            className="select"
            value={settings.historyRetention}
            onChange={(e) => update({ historyRetention: e.target.value as HistoryRetention })}
          >
            {HISTORY_RETENTIONS.map((retention) => (
              <option key={retention} value={retention}>
                {retentionLabel(t, retention)}
              </option>
            ))}
          </select>
        </div>
        <p className="hint">{retentionHint(t, settings.historyRetention)}</p>
        <div className="field-row" style={{ marginTop: 12 }}>
          <button className="btn danger" onClick={() => void window.api.clearHistory(null)}>
            {t('settings.clearAll')}
          </button>
        </div>
        <p className="hint">{t('settings.clearAllHint')}</p>
      </Section>

      <Section title={t('settings.downloadDir')}>
        <div className="field-row">
          <div className="path" title={settings.downloadDir}>
            {settings.downloadDir}
          </div>
          <button className="btn" onClick={() => void window.api.chooseDownloadDir()}>
            {t('common.change')}
          </button>
        </div>
        <p className="hint">{t('settings.downloadDirHint', { mod: MOD_KEY })}</p>
      </Section>
    </>
  )
}

// ─── система ────────────────────────────────────────────────────────────────────

function SystemTab() {
  const { state } = useApp()
  const t = useT()
  const { settings, capabilities } = state

  return (
    <>
      <Section title={t('settings.background')}>
        {capabilities.tray ? (
          <Toggle
            checked={settings.runInBackground}
            onChange={(runInBackground) => update({ runInBackground })}
            label={t('settings.trayLabel')}
            hint={t('settings.trayHint')}
          />
        ) : (
          <p className="hint no-margin">{t(IS_MAC ? 'settings.backgroundMac' : 'settings.backgroundOther')}</p>
        )}
      </Section>

      <Section title={t('settings.openAtLogin')}>
        <Toggle
          checked={settings.openAtLogin}
          disabled={!capabilities.openAtLogin}
          onChange={(openAtLogin) => update({ openAtLogin })}
          label={t('settings.openAtLoginLabel')}
          hint={t(capabilities.openAtLogin ? 'settings.openAtLoginHint' : 'settings.openAtLoginDev')}
        />
      </Section>
    </>
  )
}

// ─── о программе ────────────────────────────────────────────────────────────────

function AboutTab() {
  const { state, dispatch } = useApp()
  const t = useT()
  const { appInfo } = state
  const [copied, setCopied] = useState(false)

  const version = appInfo.version ? displayVersion(appInfo.version) : '—'

  const summary = [
    `Hallway ${version}`,
    t('about.summaryDeveloper', { year: 2026 }),
    `${platformLabel(t, appInfo.platform)} ${appInfo.arch}, Electron ${appInfo.electron}`
  ].join('\n')

  const copy = async () => {
    await window.api.copyText(summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <section className="section about">
        <img src={appIcon} alt="" width={64} height={64} />
        <div className="about-name">Hallway</div>
        <div className="about-version">{t('about.version', { version })}</div>
        <p className="about-text">{t('about.tagline')}</p>
        {whatsNewFor(appInfo.version) && (
          <button className="btn" onClick={() => dispatch({ type: 'whatsNew', open: true })}>
            {t('whatsNew.open', { version })}
          </button>
        )}
      </section>

      <Section title={t('about.details')}>
        <dl className="kv">
          <dt>{t('about.developer')}</dt>
          <dd>
            <a
              className="link"
              href={DEVELOPER_SITE}
              onClick={(event) => {
                event.preventDefault()
                // main откроет ссылку во внешнем браузере
                window.open(DEVELOPER_SITE, '_blank')
              }}
            >
              grigoriapps.com
            </a>
          </dd>
          <dt>{t('about.email')}</dt>
          <dd className="selectable">grigoriapps@gmail.com</dd>
          <dt>{t('about.year')}</dt>
          <dd>2026</dd>
          <dt>{t('about.versionLabel')}</dt>
          <dd>{version}</dd>
          <dt>{t('about.system')}</dt>
          <dd>
            {platformLabel(t, appInfo.platform)} {appInfo.arch}
          </dd>
          <dt>Electron</dt>
          <dd>{appInfo.electron}</dd>
        </dl>
        <div className="field-row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => void copy()}>
            {copied ? t('about.copied') : t('about.copy')}
          </button>
        </div>
        <p className="hint">{t('about.copyHint')}</p>
      </Section>
    </>
  )
}

// ─── сеть ───────────────────────────────────────────────────────────────────────

function NetworkTab() {
  const { state } = useApp()
  const t = useT()
  const { settings, network, paths } = state
  const [host, setHost] = useState('')
  const [hostError, setHostError] = useState<string | null>(null)

  const addHost = async (event: FormEvent) => {
    event.preventDefault()
    const result = await window.api.addManualHost(host)
    if (result.ok) {
      setHost('')
      setHostError(null)
    } else {
      setHostError(result.error ?? t('settings.manualHostFailed'))
    }
  }

  return (
    <>
      <Section title={t('settings.manualHost')}>
        <form className="field-row" onSubmit={addHost}>
          <input
            className="input"
            placeholder={t('settings.manualHostPlaceholder')}
            value={host}
            onChange={(e) => {
              setHost(e.target.value)
              setHostError(null)
            }}
          />
          <button className="btn" type="submit" disabled={!host.trim()}>
            {t('common.add')}
          </button>
        </form>
        {hostError && <div className="form-error">{hostError}</div>}
        {settings.manualHosts.length > 0 && (
          <div className="chips">
            {settings.manualHosts.map((h) => (
              <span className="chip" key={h}>
                {h}
                <button aria-label={t('settings.manualHostRemove', { host: h })} onClick={() => void window.api.removeManualHost(h)}>
                  <IconClose size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="hint">{t('settings.manualHostHint')}</p>
      </Section>

      <ColleaguesSection />

      <Section title={t('settings.diagnostics')}>
        <dl className="kv">
          <dt>{t('settings.yourAddresses')}</dt>
          <dd>
            {network?.addresses.length
              ? network.addresses.map((a) => `${a.address} (${a.iface})`).join(', ')
              : t('common.none')}
          </dd>
          <dt>{t('settings.udp')}</dt>
          <dd>
            {network?.udpPort} — {t(network?.udpListening ? 'settings.working' : 'settings.notWorking')}
          </dd>
          <dt>{t('settings.tcp')}</dt>
          <dd>{network?.tcpPort ?? t('settings.tcpNotStarted')}</dd>
          <dt>{t('settings.configFile')}</dt>
          <dd>{paths.configFile}</dd>
        </dl>
        {network?.error && <div className="form-error">{network.error}</div>}
        <div className="field-row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => void window.api.openLogs()}>
            {t('settings.openLogs')}
          </button>
        </div>
        <p className="hint">{t('settings.portsHint')}</p>
      </Section>
    </>
  )
}

/**
 * Сводка «Коллеги и версии»: кто у кого стоит — удобно тому, кто раздаёт обновления.
 * Список берётся из known-peers.json и обновляется вместе со списком собеседников.
 */
function ColleaguesSection() {
  const { state } = useApp()
  const t = useT()
  const [list, setList] = useState<ColleagueView[] | null>(null)
  const mine = state.appInfo.version || null

  useEffect(() => {
    let alive = true
    void window.api.listColleagues().then((colleagues) => {
      if (alive) setList(colleagues)
    })
    return () => {
      alive = false
    }
  }, [state.peers])

  const isOlder = (version: string | null) => mine !== null && compareVersions(version, mine) < 0
  const outdated = list?.filter((c) => isOlder(c.version)).length ?? 0

  return (
    <Section
      title={t('settings.colleagues')}
      aside={list && list.length > 0 && outdated > 0 ? t('settings.colleaguesOutdated', { n: outdated }) : undefined}
    >
      {list !== null && list.length === 0 && <p className="hint no-margin">{t('settings.colleaguesEmpty')}</p>}
      {list !== null && list.length > 0 && (
        <div className="colleagues-wrap">
          <table className="colleagues">
            <tbody>
              {list.map((c) => {
                const cmp = mine === null ? 0 : compareVersions(c.version, mine)
                return (
                  <tr key={c.id} className={c.online ? undefined : 'colleague-offline'}>
                    <td>
                      <div className="colleague-name">
                        <span className={`status-dot status-${c.online ? c.status : 'offline'}`} />
                        <span>{c.name || t('common.peer')}</span>
                      </div>
                    </td>
                    <td>{platformLabel(t, c.platform)}</td>
                    <td
                      className={cmp < 0 ? 'colleague-version old' : 'colleague-version'}
                      title={cmp < 0 ? t('settings.versionOlder') : cmp > 0 ? t('settings.versionNewer') : undefined}
                    >
                      {c.version ? displayVersion(c.version) : t('settings.versionBefore')}
                    </td>
                    <td className="colleague-state">
                      {c.online
                        ? statusLabel(t, c.status).toLowerCase()
                        : c.lastSeenAt
                          ? lastSeenLabel(t, c.lastSeenAt)
                          : t('common.notInNetwork')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">{t('settings.colleaguesHint')}</p>
    </Section>
  )
}
