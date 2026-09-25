import { EVERYONE_ID, type FileItem, type FilePart } from '../types'
import { fileExtension, formatBytes, formatSpeed, formatTime, revealLabel } from '../format'
import { useT } from '../state'
import type { Translator } from '../i18n'
import { RichText, type Highlight } from '../rich-text'
import { IconReply } from './Icons'

function statusText(t: Translator, item: FileItem): string {
  const out = item.direction === 'out'
  // общий чат: карточка у всех, а скачивает каждый сам
  if (item.peerId === EVERYONE_ID) {
    if (out && item.status === 'offering') return t('everyone.filePreparing')
    if (out && item.status === 'done') {
      const n = item.downloadedBy?.length ?? 0
      return n ? t('everyone.fileDownloadedBy', { n }) : t('everyone.fileNobodyDownloaded')
    }
    if (!out && item.status === 'pending') return t('everyone.fileAvailable')
  }
  switch (item.status) {
    case 'offering':
      return t('file.statusOffering')
    case 'pending':
      return out ? t('file.statusWaitingOut') : t('file.statusWaitingIn')
    case 'connecting':
      return t('file.statusConnecting')
    case 'transferring':
      return t('file.statusProgress', {
        done: formatBytes(t, item.transferred),
        total: formatBytes(t, item.size),
        speed: formatSpeed(t, item.speed)
      })
    case 'done':
      return out ? t('file.statusDoneOut') : t('file.statusDoneIn')
    case 'declined':
      return out ? t('file.statusDeclinedOut') : t('file.statusDeclinedIn')
    case 'canceled':
      return t('file.statusCanceled')
    case 'failed':
      return item.error ?? t('file.statusFailed')
  }
}

/** Итог по рассылке в группу: «Принято: 2 из 4», «Отправляется участникам: 1 из 4» */
function groupStatusText(t: Translator, parts: FilePart[]): string {
  const done = parts.filter((p) => p.status === 'done').length
  const failed = parts.filter((p) => p.status === 'failed' || p.status === 'canceled' || p.status === 'declined').length
  const active = parts.length - done - failed
  const head = active
    ? t('file.groupSending', { done, total: parts.length })
    : t('file.groupAccepted', { done, total: parts.length })
  return failed ? `${head} · ${t('file.groupFailed', { count: failed })}` : head
}

function partStatusText(t: Translator, part: FilePart, size: number): string {
  switch (part.status) {
    case 'offering':
      return t('file.statusOffering')
    case 'pending':
      return t('file.partPending')
    case 'connecting':
      return t('file.statusConnecting')
    case 'transferring':
      return size > 0 ? `${Math.min(100, Math.floor((part.transferred / size) * 100))}%` : t('file.statusConnecting')
    case 'done':
      return t('file.statusDoneOut')
    case 'declined':
      return t('file.statusDeclinedOut')
    case 'canceled':
      return t('file.statusCanceled')
    case 'failed':
      return part.error ?? t('file.statusFailed')
  }
}

export function FileCard({
  item,
  peerOnline,
  highlights,
  readOnly = false,
  showAuthor = false,
  nameOf,
  onReply
}: {
  item: FileItem
  /** есть у кого взять файл: собеседник в сети (в общем чате — хоть кто-то в сети) */
  peerOnline: boolean
  highlights?: Highlight[]
  /** переписка в архиве: принимать и отменять уже нечего */
  readOnly?: boolean
  showAuthor?: boolean
  /** имена по id — для подсказки «кто скачал» в общем чате */
  nameOf?: (id: string) => string
  onReply: () => void
}) {
  const api = window.api
  const t = useT()
  const everyone = item.peerId === EVERYONE_ID
  const downloaders = (item.downloadedBy ?? []).map((id) => nameOf?.(id) ?? id)
  // скачать (ещё раз) можно, пока файл не у нас: не начинали, не вышло или отменили
  const canDownload =
    everyone && item.direction === 'in' && (item.status === 'pending' || item.status === 'failed' || item.status === 'canceled')
  const parts = item.parts ?? []
  const failedParts = parts.filter((p) => p.status === 'failed' || p.status === 'canceled')
  const percent = item.size > 0 ? Math.min(100, Math.floor((item.transferred / item.size) * 100)) : 0
  const cancelable = everyone
    ? item.direction === 'in' && (item.status === 'connecting' || item.status === 'transferring')
    : item.status === 'offering' ||
      item.status === 'connecting' ||
      item.status === 'transferring' ||
      (item.direction === 'out' && item.status === 'pending')
  // открыть можно полученный файл или свой исходный
  const canOpen = item.direction === 'out' || item.status === 'done'

  return (
    <div className={`row ${item.direction}`} data-item-id={item.id}>
      <div className="bubble-line">
        <div className={`file-card file-${item.status}`}>
          {showAuthor && item.direction === 'in' && item.authorName && (
            <div className="bubble-author">{item.authorName}</div>
          )}
          {item.thumbnail && (
            <button
              className="file-thumb"
              disabled={!canOpen}
              title={canOpen ? t('file.open') : t('file.acceptToOpen')}
              onClick={() => void api.openFile(item.id)}
            >
              <img src={item.thumbnail} alt={item.name} draggable={false} />
            </button>
          )}
          <div className="file-main">
            <div className="file-icon">{fileExtension(item.name)}</div>
            <div className="file-info">
              <div className="file-name" title={item.name}>
                <RichText text={item.name} highlights={highlights} linkify={false} />
              </div>
              <div className="file-size">{formatBytes(t, item.size)}</div>
            </div>
          </div>

          {item.status === 'connecting' && (
            <div className="progress indeterminate">
              <div className="progress-bar" />
            </div>
          )}
          {item.status === 'transferring' && (
            <div className="progress">
              <div className="progress-bar" style={{ width: `${percent}%` }} />
            </div>
          )}

          <div
            className={`file-status${item.status === 'failed' ? ' error' : ''}`}
            title={everyone && item.direction === 'out' && downloaders.length ? downloaders.join(', ') : undefined}
          >
            {item.status === 'transferring' && <strong>{percent}% · </strong>}
            {parts.length
              ? groupStatusText(t, parts)
              : item.queued && item.status === 'offering'
                ? peerOnline
                  ? t('outbox.retrying')
                  : t('outbox.fileWaiting', { name: nameOf?.(item.peerId) ?? '' })
                : statusText(t, item)}
          </div>

          {parts.length > 0 && (
            <div className="file-parts">
              {parts.map((part) => (
                <div className="file-part" key={part.peerId}>
                  <span className="file-part-name">{part.name || t('common.peer')}</span>
                  <span className={`file-part-status${part.status === 'failed' ? ' error' : ''}`}>
                    {partStatusText(t, part, item.size)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="file-actions">
            {failedParts.length > 0 && !readOnly && (
              <button className="btn" onClick={() => void api.retryFile(item.id)}>
                {t('file.retryFailed')}
              </button>
            )}
            {canDownload && !readOnly && (
              <button
                className="btn primary"
                disabled={!peerOnline}
                title={peerOnline ? undefined : t('everyone.fileNoSource')}
                onClick={() => void api.acceptFile(item.id)}
              >
                {item.status === 'pending' ? t('everyone.fileDownload') : t('everyone.fileDownloadAgain')}
              </button>
            )}
            {!readOnly && !everyone && item.direction === 'in' && item.status === 'pending' && (
              <>
                <button
                  className="btn primary"
                  disabled={!peerOnline}
                  title={peerOnline ? undefined : t('file.senderOffline')}
                  onClick={() => void api.acceptFile(item.id)}
                >
                  {t('file.accept')}
                </button>
                <button className="btn" onClick={() => void api.declineFile(item.id)}>
                  {t('file.decline')}
                </button>
              </>
            )}
            {cancelable && !readOnly && (
              <button className="btn" onClick={() => void api.cancelFile(item.id)}>
                {t('file.cancel')}
              </button>
            )}
            {item.direction === 'in' && item.status === 'done' && (
              <>
                <button className="btn primary" onClick={() => void api.openFile(item.id)}>
                  {t('file.open')}
                </button>
                <button className="btn" onClick={() => void api.showFileInFolder(item.id)}>
                  {revealLabel(t, api.platform)}
                </button>
              </>
            )}
          </div>

          <div className="meta">{formatTime(t.locale, item.timestamp)}</div>
        </div>
        <button className="row-action" title={t('common.reply')} aria-label={t('common.reply')} onClick={onReply}>
          <IconReply size={15} />
        </button>
      </div>
    </div>
  )
}
