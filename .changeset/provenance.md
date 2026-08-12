---
'@headless-canvas/core': patch
'@headless-canvas/ui': patch
'@headless-canvas/react': patch
---

Published with provenance. The code is identical to 0.1.0.

The 0.1.0 tarballs carry only npm's registry signature: the release workflow
asked for provenance through an environment variable that pnpm does not read.
An attestation cannot be added to a version after it is published, so this
release exists to carry one — npm will show which commit and workflow built
each tarball, and the packages are now published without any long-lived token.
