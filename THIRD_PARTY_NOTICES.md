# Third-party software

Application dependencies are listed in `package.json` and pinned in `bun.lock`. The dependencies and their licence and notice files are obtained separately during installation. Preserve those terms and notices if you redistribute dependencies or a built application image.

The dependency tree includes DOMPurify (MPL-2.0 OR Apache-2.0), JSZip (MIT OR GPL-3.0-or-later) and `ffmpeg-static` (GPL-3.0-or-later). `ffmpeg-static` can download a separate FFmpeg binary during installation. This source repository includes no FFmpeg binary. Review the terms and corresponding-source obligations for the exact binary and libraries if you redistribute a container or build containing them.

Hosted providers, fonts served by third parties, and other external services are subject to their respective terms.
