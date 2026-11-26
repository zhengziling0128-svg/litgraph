# Changelog

All notable changes to LitGraph. Version numbers follow [semantic versioning](https://semver.org/):
`MAJOR` for breaking data/API changes, `MINOR` for new features, `PATCH` for fixes.

## 0.3.0 — 2026-11-26

### Changed (docs/showcase only — no behaviour change)

- README showcase: the screenshot table now features the **insight view** ("research trends inside this
  library") in the slot the timeline chart used to occupy. The insight view is the AI-centred one, so it
  represents the plugin better than a year axis.
- The app is unchanged: the centre view switch remains **star map / timeline / insight**, and the timeline
  view is still documented in the feature list.

## 0.2.0 — 2026-11-26

### Added

- **Insight view** (third tab next to star map / timeline, "research trends inside this library"):
  shared research objects, method radar (papers / first year / recent share / trend / average rating),
  evolution, solved vs. open limits, blank method×problem combinations and research questions.
  Scope (current cluster / same discipline / all papers) and recent window (3/5/10 years) are configurable
  in settings; one model call per scope, cached on disk under `<data root>/insights/`; evidence chips jump
  back to the star map; cards can be saved into the paper notes or exported as Markdown.
- **Collapsible detail sections**: every block in the left panel has a caret toggle and stays expanded by
  default; the section meta (save state, tag count, Zotero status, journal-metrics source) stays visible
  while collapsed.
- **Version display**: the footer shows the running build version (`v0.2.0`); `GET /api/litgraph/status`
  returns `version` next to `build` and `hostHash`.
- `scripts/install-desktop.mjs` prints the disk version and the running host version, so an update check
  no longer needs a manual look at the bundle.

### Changed

- Detail panel order: notes → tags → AI summary → contributions → method → abstract → keywords →
  journal metrics → Zotero → source. Analysis now sits before the abstract.
- Insight prompt v2: method names must be ≤ 12 characters (details go into the per-method note), which
  also invalidates the v1 insight cache.

## 0.1.0 — 2026-11-26

First public release.

### Added

- Star-map knowledge graph: galaxy → constellation → paper layout, force simulation with cluster gravity,
  greedy label placement, pan/zoom/re-layout, search highlight.
- Library panel: sorting, pagination, cluster / tag / starred / rating filters, batch select and delete,
  BibTeX export, read/unread state from Zotero, 1–5 star rating.
- Import: drag-and-drop or button PDF import with model extraction (metadata, Chinese abstract, keywords,
  taxonomy); scanned PDFs via model vision with local Windows OCR fallback; duplicate detection.
- Zotero integration: scan the local library, batch import PDFs or records only, write collections back,
  open PDFs through the Zotero reader, journal-metric lookup via easyScholar.
- Themes (follow system / dark / light) and font size 14/15/16; free/fixed taxonomy modes; cluster
  granularity 1/2/3; timeline view.
