---
'@headless-canvas/core': patch
---

Resizing a group now resizes its contents.

A shape's transform is a translation and a rotation with no scale factor, which
is what makes grouping and ungrouping exact — and it also meant a group had
nowhere to record that it had been resized. Dragging a handle on a group moved
the handles and the selection box and left the drawing untouched.

The factor is now written into each descendant instead, recursively through
nested groups, for pointer drags, multi-selection resizes and keyboard nudges
alike. Rotated children keep their rotation and scale on the group's axes, the
same compromise a multi-selection resize already made.
