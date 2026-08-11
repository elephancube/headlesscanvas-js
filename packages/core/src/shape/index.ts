import type { ShapeUtil } from './shape-util'
import { ellipseShapeUtil } from './shapes/ellipse'
import { groupShapeUtil } from './shapes/group'
import { imageShapeUtil } from './shapes/image'
import { lineShapeUtil } from './shapes/line'
import { pathShapeUtil } from './shapes/path'
import { rectShapeUtil } from './shapes/rect'
import { textShapeUtil } from './shapes/text'

export * from './geometry'
export * from './paint'
export * from './shape-util'
export { ellipseShapeUtil } from './shapes/ellipse'
export { groupShapeUtil } from './shapes/group'
export { imageShapeUtil } from './shapes/image'
export { lineShapeUtil } from './shapes/line'
export { pathShapeUtil } from './shapes/path'
export { rectShapeUtil } from './shapes/rect'
export { fontString, textShapeUtil } from './shapes/text'
export * from './types'

/** Registered when `EditorOptions.shapeUtils` is not supplied. */
export const defaultShapeUtils: ShapeUtil<any>[] = [
  rectShapeUtil,
  ellipseShapeUtil,
  lineShapeUtil,
  pathShapeUtil,
  textShapeUtil,
  imageShapeUtil,
  groupShapeUtil,
]
