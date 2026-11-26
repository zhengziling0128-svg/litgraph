/**
 * Cross-feature integration styles (Lead-owned glue).
 *
 * Not part of styles.ts (theme tokens/layout) nor styles-features.ts (feature
 * panels): this file only styles the workbench-level controls that switch
 * between features — the graph/timeline tabs and the Zotero entry button.
 */
export const INTEGRATION_STYLE_ID = 'dsh-litgraph-integration-styles'

export const INTEGRATION_CSS = `
/* ================= view switch (graph / timeline) ================= */
.lg-view-toggle {
  position: absolute; top: 12px; left: 12px; z-index: 6;
  display: flex; align-items: center; gap: 2px; padding: 3px;
  border-radius: 999px; border: 1px solid var(--lg-border);
  background: var(--lg-hud-bg); backdrop-filter: blur(10px);
  box-shadow: 0 6px 20px var(--lg-shadow);
}
.lg-view-btn {
  appearance: none; border: 0; margin: 0; cursor: pointer;
  padding: 4px 12px; border-radius: 999px; background: transparent;
  color: var(--lg-muted); font-family: var(--lg-font);
  font-size: calc(12px * var(--lg-fs-scale)); font-weight: 560;
  transition: background 140ms ease, color 140ms ease;
}
.lg-view-btn:hover { color: var(--lg-text); background: var(--lg-hover); }
.lg-view-btn.is-active {
  color: var(--lg-accent-text); background: var(--lg-accent-soft);
  box-shadow: inset 0 0 0 1px var(--lg-accent-border);
}
.lg-view-btn:focus-visible { outline: 2px solid var(--lg-accent); outline-offset: 1px; }

/* ================= Zotero entry button ================= */
.lg-zotero-btn { gap: 6px; }
.lg-zotero-glyph {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: 4px;
  background: var(--lg-accent-soft); border: 1px solid var(--lg-accent-border);
  color: var(--lg-accent-text); font-size: 10px; font-weight: 800; line-height: 1;
}
.lg-zotero-text { font-size: calc(12px * var(--lg-fs-scale)); font-weight: 560; }

/* timeline replaces the graph, so it has to own the center column height */
.lg-col-center > .lgf-timeline { flex: 1 1 auto; min-height: 0; }

@media (max-width: 900px) {
  .lg-zotero-text { display: none; }
}
`

let styleElement: HTMLStyleElement | null = null

/** Inject the integration stylesheet once; returns a disposer that removes it. */
export function ensureIntegrationStyles(): () => void {
  if (typeof document === 'undefined' || !document.head) return () => {}
  if (typeof document.getElementById === 'function' && document.getElementById(INTEGRATION_STYLE_ID)) {
    return () => {}
  }
  const element = document.createElement('style')
  element.id = INTEGRATION_STYLE_ID
  element.setAttribute('data-plugin', 'dsh-litgraph')
  element.textContent = INTEGRATION_CSS
  document.head.appendChild(element)
  styleElement = element
  return () => {
    if (styleElement === element && element.parentNode) element.parentNode.removeChild(element)
    if (styleElement === element) styleElement = null
  }
}
