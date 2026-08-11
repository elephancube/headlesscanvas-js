/**
 * Collision-resistant identifiers.
 *
 * Sequential integers are deliberately not used: `Editor.applyPatch` accepts
 * changes originating outside this instance (spec §5.2.7), and counters from two
 * sources always collide. Switching later would require migrating every stored
 * document, so this is settled up front.
 */

const ALPHABET = 'useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict'

/** 21 characters from a 62-character alphabet — ~125 bits of entropy. */
const DEFAULT_SIZE = 21

const cryptoObj: Crypto | undefined =
  typeof globalThis !== 'undefined' && 'crypto' in globalThis
    ? (globalThis.crypto as Crypto)
    : undefined

function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes)
    return bytes
  }
  // Environments without WebCrypto still need to work; uniqueness matters more
  // than unpredictability here, since these identifiers are not secrets.
  for (let i = 0; i < size; i++) bytes[i] = (Math.random() * 256) | 0
  return bytes
}

export function createId(size: number = DEFAULT_SIZE): string {
  const bytes = randomBytes(size)
  let out = ''
  for (let i = 0; i < size; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length]
  }
  return out
}
