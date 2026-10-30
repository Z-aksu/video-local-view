# Language configuration implementation plan

**Goal:** Match the PDF viewer's config-only English/Chinese support.

**Architecture:** `.video/config.json` accepts `language: "en" | "zh"`, defaulting missing values to English. Validate before writing or listening; preserve invalid files and list supported languages in startup errors. A shared translation module supplies server messages and Vue's injected language context. ArtPlayer uses its own matching locale.

**Tech stack:** Node.js, Express, Vue 3, ArtPlayer, node:test.

1. Add shared language constants, translations and validated Vue context. Extend config initialization and public config response; print language options on startup. Verify defaults, migration, invalid values and package inclusion.
2. Translate app, directory accessibility labels, theme names/descriptions, screenshots, player controls/errors and lock-screen calendar. Update document language and description after loading config. Keep language selection in config only.
3. Add regression tests for both API languages and CLI rejection, adapt existing complete-config fixtures, and document configuration/restart requirements.
4. Run the full test suite, production build and package dry run. Exercise both languages, player controls, themes, lock/password errors and mobile layout in a browser, then review the final diff.
