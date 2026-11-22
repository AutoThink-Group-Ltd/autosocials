# HyperFrames: official rules, condensed (heygen-com/hyperframes skills + hyperframes.heygen.com docs)

## Core contract
- Root: data-composition-id, data-start="0", data-width, data-height and an explicit data-duration. The root data-duration IS the render length.
- Timed elements: stable id, class="clip", data-start, data-duration. data-track-index is only an editor lane: it does NOT decide what is on top. Stacking is CSS z-index only.
- One paused GSAP timeline registered as window.__timelines["<composition id>"], built synchronously. The framework seeks it frame by frame: every tween needs explicit from AND to values (fromTo), nothing may depend on wall-clock time, timers, randomness or self-running CSS animation.
- Do not animate x/y on an element that is centred with a CSS transform (translate(-50%,-50%)); wrap it or position with top/left.
- Media: the framework owns playback. Never set currentTime or call play().

## Composition craft (prompting guides)
- Frame one already shows the idea. No fade from black, no logo intro.
- One argument per film. Demonstrate cause and effect on the product (a state changes because of the product), do not cycle slogans.
- Hierarchy: one focal element per beat, one accent colour, sparse copy. If a line needs more than ~7 words on screen, it belongs in the voiceover.
- Reading holds: on-screen copy stays still at least 0.4s per word before it leaves.
- Transitions are named and purposeful (push, match-cut, mask wipe, scale-through). During an overlap only ONE headline is readable: the outgoing headline is gone or fading before the incoming one lands.
- Motion vocabulary: eased entrances (power3.out / expo.out), 12 to 40 px travel, staggered whole words, subtle 1 to 2 percent camera drift, parallax on two layers. Avoid bounce/elastic on text.
- End card: logo, one payoff line, one CTA, then everything holds perfectly still for the last 3 to 4 seconds.

## Text fit
- Every text block has a fixed width box inside the safe area, line-height 1.05 to 1.2 for display type, max 2 lines for headlines, max 3 for body.
- Never let text depend on the font happening to be narrow: size for the box (at 1080 wide: display 72 to 110px, titles 56 to 72, body 32 to 40, labels 26+).
- Captions are a separate reserved layer. Scene text never enters the caption strip.

## Anti-patterns that reviewers reject
- Slideshow of headlines over stock photos; every scene the same centred card.
- Two text layers readable at the same time in the same area.
- Text touching frame edges or platform UI zones.
- Typewriter, scramble or per-character effects.
- Rebuilding the same layout as a previous film instead of designing for this argument.

## AutoToast built-ins and look check (Oct 2026)
- GSAP, its plugins, Lottie, anime.js and three.js are served from `_lib/…`; 60 Google Fonts from `_fonts/<family>/index.css` (700.css bold). Never inline libraries.
- Film length is set with `durationSeconds` + `fps: 30` on the render job; the voiceover is not padded.
- Before rendering, Sam previews frames (`POST /v1/previews`), reviews them for clashes and repairs the HTML (max 2 rounds). After rendering, three stills from the finished film are checked and problems mark the card "needs review".
