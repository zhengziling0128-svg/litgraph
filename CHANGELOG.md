# Changelog

All notable changes to LitGraph. Version numbers follow [semantic versioning](https://semver.org/):
`MAJOR` for breaking data/API changes, `MINOR` for new features, `PATCH` for fixes.

## 0.4.1 — 2026-11-26

### Changed

- Notes with content now open in **Preview** instead of the editor, so text and pasted screenshots are visible
  together right away. Empty notes still open the editor. "Edit" is one click away when you want the markdown.

## 0.4.0 — 2026-11-26

### Added

- **Sort by "recently opened"**: opening a paper's PDF now stamps `lastOpenedAt`, and the library sort menu
  gains **Recently opened** next to title / year / added / rating. Only "Open PDF" counts as a read — clicking a
  row or a star-map node does not.
- **Screenshots in notes**: paste (Ctrl+V) or drop an image into the notes box; it is stored under
  `<data root>/notes-assets/<paperId>/` and inserted as its own markdown line
  (`![截图](/api/litgraph/notes-asset?paperId=…&f=…)`), so the note text stays portable. Notes gain an
  **Edit / Preview** switch that renders those images.
- Detail panel → source block shows **最近打开** next to **最近更新**.

### Changed

- The library sort label "修改时间" is now **最后修改** to separate edits from reads: opening a PDF and the
  background Zotero link sync no longer bump `updatedAt`.

## 0.3.1 — 2026-11-26

### Changed

- Detail panel order: **keywords** and **journal metrics** now sit directly under **tags**, before the AI
  summary. Notes → tags → keywords → metrics → AI summary → contributions → method → abstract → Zotero →
  source.

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
