/**
 * Out-of-band channel for problems the caller should know about but which do
 * not stop the editor: a failed image load, a document containing a shape type
 * that is not registered, a rejected export.
 *
 * These are reported rather than thrown because every one of them is
 * recoverable — the editor keeps working, just with something missing
 * (spec §5.11, §14.4).
 */
export interface Notification {
  level: 'warning' | 'error'
  code: 'resource-load-failed' | 'unknown-shape-type' | 'export-failed' | 'schema-migration-failed'
  message: string
  detail?: unknown
}

export class NotificationEmitter {
  private readonly listeners = new Set<(n: Notification) => void>()

  subscribe(listener: (n: Notification) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(notification: Notification): void {
    for (const listener of this.listeners) listener(notification)
  }
}
