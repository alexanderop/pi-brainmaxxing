# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-06-07

### Added

- First-class `ruminate` tool that mines past Pi sessions with guarded child Pi workers and returns proposed brain/skill updates for review.
- `/ruminate` now routes through the self-contained ruminate tool instead of only expanding skill markdown.

### Changed

- `brain/index.md` is now explicitly treated as generated output: built-in `edit`/`write` and the `brain` tool block direct root-index writes and ask agents to edit normal brain notes instead.
- Shared child-Pi process and transcript helpers between auto-reflect and ruminate flows.

## [0.1.2] - 2026-06-07

### Added

- `/brain init` now detects existing docs and asks the developer before creating a vault.
- `/brain init --mode=index` and `/brain migrate --mode=index` create `brain/external-docs.md` links to existing docs without moving or copying them.

## [0.1.1] - 2026-06-07

### Added

- Filesystem watcher that keeps `brain/index.md` updated when external editors, git operations, or shell scripts mutate `brain/` during a Pi session.

## [0.1.0] - 2026-06-07

### Added

- Project-local `brain/` vault bootstrap via `/brain init`.
- Automatic brain index injection into Pi sessions.
- Secret-scanned `brain` tool for safe committed memory writes.
- Auto-rebuilt Obsidian-style `brain/index.md` wikilink index.
- Learning-loop commands and skills: `/reflect`, `/ruminate`, `/meditate`, `/plan`, and `/review`.
- Background auto-reflection for corrections, periodic review, compaction, and shutdown.
- Lightweight `remember` tool for queueing possible durable memories for background review.
- Release-ready Pi package metadata for git and npm installation.

[0.1.3]: https://github.com/alexanderop/pi-brainmaxxing/releases/tag/v0.1.3
[0.1.2]: https://github.com/alexanderop/pi-brainmaxxing/releases/tag/v0.1.2
[0.1.1]: https://github.com/alexanderop/pi-brainmaxxing/releases/tag/v0.1.1
[0.1.0]: https://github.com/alexanderop/pi-brainmaxxing/releases/tag/v0.1.0
