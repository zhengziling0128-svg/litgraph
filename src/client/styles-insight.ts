
/**
 * Insight (洞察) stylesheet. Injected once by ensureInsightStyles(); all classes
 * use the lgi- prefix, and colours come from the shared --lg-* tokens so the
 * view follows the dark / light palette and the font-size scale.
 */
export const INSIGHT_STYLE_ID = 'dsh-litgraph-insight-styles'

export const INSIGHT_CSS = String.raw`
.lgi-root { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.lgi-toolbar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  /* The workbench tab pill floats at top-left of the center panel; keep the
     insight controls below it. */
  flex: 0 0 auto; padding: 58px 14px 9px; border-bottom: 1px solid var(--lg-border);
}
.lgi-seg {
  display: inline-flex; flex: 0 0 auto; overflow: hidden;
  border: 1px solid var(--lg-border); border-radius: var(--lg-radius-sm);
  background: var(--lg-panel-raised);
}
.lgi-seg-btn {
  padding: 5px 11px; border: 0; border-right: 1px solid var(--lg-border);
  background: transparent; color: var(--lg-muted);
  font-family: var(--lg-font); font-size: calc(11.5px * var(--lg-fs-scale));
  cursor: pointer; transition: background 120ms ease, color 120ms ease;
}
.lgi-seg-btn:last-child { border-right: 0; }
.lgi-seg-btn:hover { background: var(--lg-hover); color: var(--lg-text); }
.lgi-seg-btn.is-active { background: var(--lg-cyan-soft); color: var(--lg-text); box-shadow: inset 0 -2px 0 var(--lg-cyan); }
.lgi-seg-btn:focus-visible { outline: 2px solid var(--lg-ring); outline-offset: -2px; }
.lgi-select {
  flex: 0 0 auto; padding: 5px 8px;
  border: 1px solid var(--lg-border); border-radius: var(--lg-radius-sm);
  background: var(--lg-panel-raised); color: var(--lg-text);
  font-family: var(--lg-font); font-size: calc(11.5px * var(--lg-fs-scale));
}
.lgi-select:focus-visible { outline: 2px solid var(--lg-ring); outline-offset: 1px; }
.lgi-spacer { flex: 1 1 auto; }
.lgi-meta { font-size: calc(10.5px * var(--lg-fs-scale)); color: var(--lg-dim); white-space: nowrap; }
.lgi-scroll {
  flex: 1 1 auto; min-height: 0; overflow: auto;
  display: flex; flex-direction: column; gap: 16px;
  padding: 14px 16px 26px; box-sizing: border-box;
}
.lgi-hero { display: flex; flex-direction: column; gap: 3px; }
.lgi-hero-title {
  display: flex; align-items: center; gap: 8px;
  font-size: calc(16px * var(--lg-fs-scale)); font-weight: 650; color: var(--lg-text);
}
.lgi-hero-badge {
  padding: 1px 7px; border-radius: 999px;
  border: 1px solid var(--lg-cyan-border); background: var(--lg-cyan-soft); color: var(--lg-cyan);
  font-size: calc(10px * var(--lg-fs-scale)); font-weight: 500; letter-spacing: 0.3px;
}
.lgi-hero-sub { font-size: calc(11px * var(--lg-fs-scale)); color: var(--lg-dim); line-height: 1.6; }
.lgi-note {
  padding: 8px 10px; border-radius: var(--lg-radius-sm);
  border: 1px solid var(--lg-warn-border); background: var(--lg-warn-soft);
  color: var(--lg-warn); font-size: calc(11.5px * var(--lg-fs-scale)); line-height: 1.65;
}
.lgi-section { display: flex; flex-direction: column; gap: 7px; }
.lgi-section-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; }
.lgi-section-title { font-size: calc(13px * var(--lg-fs-scale)); font-weight: 650; color: var(--lg-text); letter-spacing: 0.3px; }
.lgi-section-hint { font-size: calc(10.5px * var(--lg-fs-scale)); color: var(--lg-dim); }
.lgi-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.lgi-chip {
  max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 2px 8px; border-radius: 999px; border: 1px solid var(--lg-border);
  background: var(--lg-chip-bg); color: var(--lg-muted);
  font-family: var(--lg-font); font-size: calc(10.5px * var(--lg-fs-scale)); cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
}
.lgi-chip:hover { color: var(--lg-text); border-color: var(--lg-cyan-border); background: var(--lg-cyan-soft); }
.lgi-chip:focus-visible { outline: 2px solid var(--lg-ring); outline-offset: 1px; }
.lgi-chip.is-static { cursor: default; }
.lgi-method {
  display: grid; grid-template-columns: minmax(130px, 1.05fr) minmax(80px, 1fr) auto;
  gap: 10px; align-items: center; padding: 8px 10px;
  border: 1px solid var(--lg-border); border-radius: var(--lg-radius-sm);
  background: var(--lg-panel-raised);
}
.lgi-method-name {
  display: flex; flex-direction: column; gap: 2px; min-width: 0;
  font-size: calc(12.5px * var(--lg-fs-scale)); color: var(--lg-text); font-weight: 550;
}
.lgi-method-title {
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; overflow-wrap: anywhere;
}
.lgi-method-note {
  font-size: calc(10px * var(--lg-fs-scale)); font-weight: 400; color: var(--lg-dim);
  line-height: 1.45; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.lgi-bar { position: relative; height: 7px; border-radius: 999px; background: var(--lg-chip-bg); overflow: hidden; }
.lgi-bar-fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, var(--lg-cyan), var(--lg-accent));
  transition: width 220ms ease;
}
.lgi-method-meta {
  display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 6px;
  font-size: calc(10px * var(--lg-fs-scale)); color: var(--lg-dim); white-space: nowrap;
}
.lgi-trend {
  padding: 0 6px; border-radius: 999px; border: 1px solid var(--lg-border);
  font-size: calc(9.5px * var(--lg-fs-scale)); line-height: 1.7;
}
.lgi-trend[data-trend='new'] { border-color: var(--lg-accent-border); background: var(--lg-accent-soft); color: var(--lg-accent); }
.lgi-trend[data-trend='rising'] { border-color: var(--lg-success-border); background: var(--lg-success-soft); color: var(--lg-success); }
.lgi-trend[data-trend='cooling'] { border-color: var(--lg-border); background: var(--lg-chip-bg); color: var(--lg-dim); }
.lgi-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
.lgi-list {
  margin: 0; padding-left: 18px;
  display: flex; flex-direction: column; gap: 4px;
  font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-muted); line-height: 1.65;
}
.lgi-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 8px; }
.lgi-card {
  display: flex; flex-direction: column; gap: 6px; padding: 10px 11px;
  border: 1px solid var(--lg-border); border-radius: var(--lg-radius);
  background: var(--lg-panel-raised);
}
.lgi-card-title { font-size: calc(12.5px * var(--lg-fs-scale)); font-weight: 600; color: var(--lg-text); line-height: 1.45; }
.lgi-card-body { font-size: calc(11px * var(--lg-fs-scale)); color: var(--lg-muted); line-height: 1.65; }
.lgi-card-foot { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; margin-top: auto; }
.lgi-text-btn {
  border: 0; background: transparent; padding: 2px 3px;
  color: var(--lg-cyan); font-family: var(--lg-font);
  font-size: calc(10.5px * var(--lg-fs-scale)); cursor: pointer;
}
.lgi-text-btn:hover { text-decoration: underline; }
.lgi-text-btn:disabled { color: var(--lg-dim); cursor: progress; text-decoration: none; }
.lgi-empty {
  flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 30px; text-align: center;
}
.lgi-empty-title { font-size: calc(14px * var(--lg-fs-scale)); color: var(--lg-muted); }
.lgi-empty-hint { max-width: 400px; font-size: calc(12px * var(--lg-fs-scale)); color: var(--lg-dim); line-height: 1.7; }
.lgi-loading { display: flex; align-items: center; gap: 8px; padding: 22px 4px; color: var(--lg-muted); font-size: calc(12px * var(--lg-fs-scale)); }
.lgi-spin {
  width: 13px; height: 13px; border-radius: 50%;
  border: 2px solid var(--lg-border); border-top-color: var(--lg-cyan);
  animation: lgi-spin 900ms linear infinite;
}
@keyframes lgi-spin { to { transform: rotate(360deg); } }
.lgi-error { font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-danger); line-height: 1.6; }
.lgi-error-row { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 18px 4px; }
@media (max-width: 900px) {
  .lgi-scroll { padding: 11px 12px 22px; }
  .lgi-method { grid-template-columns: minmax(110px, 1fr) auto; }
  .lgi-method .lgi-bar { display: none; }
}
`

let insightStyleElement: HTMLStyleElement | null = null

/** Inject the insight stylesheet once; returns a disposer that removes it. */
export function ensureInsightStyles(): () => void {
  if (typeof document === 'undefined' || !document.head) return () => {}
  if (typeof document.getElementById === 'function' && document.getElementById(INSIGHT_STYLE_ID)) {
    return () => {}
  }
  const element = document.createElement('style')
  element.id = INSIGHT_STYLE_ID
  element.setAttribute('data-plugin', 'dsh-litgraph')
  element.textContent = INSIGHT_CSS
  document.head.appendChild(element)
  insightStyleElement = element
  return () => {
    if (insightStyleElement === element && element.parentNode) element.parentNode.removeChild(element)
    if (insightStyleElement === element) insightStyleElement = null
  }
}
