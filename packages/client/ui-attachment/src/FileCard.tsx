import { ActionButton, ProgressBar, Spinner } from '@deepseek-ai/dsh-client-ui-primitives'
import { fileExtension, FileTypeIcon, fileSizeText, IconCloseFillRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './FileCard.module.css'

/** Localized strings consumed by one pending-file card. */
export interface FileCardLabels {
  /** Card body announcement, e.g. "Pending file {name}". */
  readonly label: string
  /** Remove-button label. */
  readonly remove: string
  /** Status line while the upload is in flight. */
  readonly uploading: string
  /** Status line and retry affordance after a failed upload. */
  readonly failed: string
  /** Retry-button label. */
  readonly retry: string
}

/** Upload display state resolved by the owner. */
export type FileCardState = 'uploading' | 'ready' | 'error'

/** One pending file card: type glyph, name, size or upload status, remove, retry. */
export function FileCard({
  name, bytes, state, progress, labels, onRemove, onRetry,
}: {
  name: string
  bytes: number
  state: FileCardState
  progress?: number
  labels: FileCardLabels
  onRemove: () => void
  onRetry: () => void
}) {
  const extension = fileExtension(name).toUpperCase().slice(0, 8)
  const meta = state === 'uploading'
    ? labels.uploading
    : state === 'error'
      ? labels.failed
      : [extension, fileSizeText(bytes)].filter(part => part !== '').join(' ')
  const retryable = state === 'error'
  return (
    <div
      className={`${css.card}${retryable ? ` ${css.failed}` : ''}`}
      title={name}
      data-upload-state={state}
    >
      <span className={css.icon} aria-hidden>
        {state === 'uploading'
          ? <Spinner size="sm" />
          : <FileTypeIcon path={name} />}
      </span>
      {retryable
        ? (
          <ActionButton type="button" className={`${css.body} ${css.retry}`} aria-label={labels.retry} onClick={onRetry}>
            <span className={css.name}>{name}</span>
            <span className={`${css.meta} ${css.metaFailed}`}>{meta}</span>
          </ActionButton>
        )
        : (
          <span className={css.body} aria-label={labels.label}>
            <span className={css.name}>{name}</span>
            <span className={css.meta}>{meta}</span>
          </span>
        )}
      <ActionButton
        type="button"
        className={retryable ? `${css.remove} ${css.removeFailed}` : css.remove}
        aria-label={labels.remove}
        onClick={onRemove}
      >
        <IconCloseFillRegular size={12} />
      </ActionButton>
      {state === 'uploading' && (
        <ProgressBar aria-label={labels.uploading} className={css.progressTrack ?? ''} isIndeterminate={progress === undefined}
          value={Math.min(1, Math.max(0, progress ?? 0)) * 100}>
          <ProgressBar.Track className="tz-upload-track"><ProgressBar.Fill className="tz-upload-fill" /></ProgressBar.Track>
        </ProgressBar>
      )}
    </div>
  )
}
