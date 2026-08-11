/**
 * Development-only build flag.
 *
 * Validation and long error messages are guarded by this so a bundler can strip
 * them from production builds — the bundle budget is tight enough that the
 * mechanism has to exist from the start rather than be retrofitted
 * (spec §14.4).
 *
 * Browsers without a bundler see `process` as undefined and get the developer
 * experience, which is the safer default.
 */
declare const process: { env?: { NODE_ENV?: string } } | undefined

export const DEV: boolean = !(
  typeof process !== 'undefined' && process?.env?.NODE_ENV === 'production'
)

/** Throws in development, no-op in production. */
export function invariant(condition: unknown, message: string): asserts condition {
  if (DEV && !condition) {
    throw new Error(`[headless-canvas] ${message}`)
  }
}
