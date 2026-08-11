/**
 * Fixed-precision numbers without the trailing zeros `toFixed` leaves behind.
 *
 * Serialised output is full of coordinates, and `String(0.1 + 0.2)` in a path
 * would put seventeen significant digits in a file a person may well open.
 */
export function formatNumber(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '0'
  const rounded = Number(value.toFixed(digits))
  // -0 serialises as "0"; the sign carries no meaning here and reads as noise.
  return String(Object.is(rounded, -0) ? 0 : rounded)
}
