import { useState, type FormEvent } from 'react'
import { errorMessage } from '../format'
import { useT } from '../state'
import appIcon from '../assets/app-icon.png'

const MAX_NAME_LENGTH = 40

/** Первый запуск: ввод отображаемого имени */
export function SetupScreen() {
  const t = useT()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError(t('setup.enterName'))
      return
    }
    setSaving(true)
    try {
      await window.api.setName(name.trim())
    } catch (err) {
      setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <div className="setup">
      <form className="setup-card" onSubmit={submit}>
        <img className="setup-logo" src={appIcon} alt="" width={76} height={76} />
        <h1>Hallway</h1>
        <p className="setup-text">{t('setup.question')}</p>
        <input
          className="input"
          autoFocus
          placeholder={t('setup.yourName')}
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
        />
        {error && <div className="form-error">{error}</div>}
        <button className="btn primary large" type="submit" disabled={saving || !name.trim()}>
          {t('setup.continue')}
        </button>
        <p className="hint">{t('setup.changeLater')}</p>
      </form>
    </div>
  )
}
