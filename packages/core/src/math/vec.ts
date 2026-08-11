/** A point or vector in a 2D coordinate space. */
export interface Vec {
  x: number
  y: number
}

export const vec = (x: number, y: number): Vec => ({ x, y })

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y })

export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })

export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k })

export const length = (a: Vec): number => Math.hypot(a.x, a.y)

export const distance = (a: Vec, b: Vec): number => Math.hypot(b.x - a.x, b.y - a.y)

/** Angle of the vector from the origin, in radians, clockwise from the +X axis. */
export const angle = (a: Vec): number => Math.atan2(a.y, a.x)

/** Rotate `a` around `origin` by `radians` (clockwise, since +Y points down). */
export function rotateAround(a: Vec, origin: Vec, radians: number): Vec {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = a.x - origin.x
  const dy = a.y - origin.y
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  }
}
