/**
 * Zotero import dialog styles.
 *
 * Self-contained: the component injects this stylesheet under its own <style id>
 * and the dialog portals to <body>, i.e. outside .lg-root, so page theme
 * variables do not reach it. The tokens below are therefore defined on the
 * overlay itself (dark by default, light via [data-lg-theme='light']) and the
 * overlay attribute mirrors .lg-root's data-lg-theme.
 */
export const ZOTERO_STYLE_ID = 'dsh-litgraph-zotero'

export const ZOTERO_CSS = String.raw`
.lg-zot-backdrop {
  color-scheme: dark;
  /* self-contained dark tokens (portal escapes .lg-root) */
  --lg-panel-solid: #0b1222;
  --lg-border: rgba(120, 150, 200, 0.2);
  --lg-border-strong: rgba(120, 150, 200, 0.3);
  --lg-text: #e9effb;
  --lg-muted: #a9b6cf;
  --lg-dim: #8391ab;
  --lg-accent: #ffd166;
  --lg-cyan: #7fd1ff;
  --lg-cyan-soft: rgba(127, 209, 255, 0.2);
  --lg-cyan-border: rgba(127, 209, 255, 0.32);
  --lg-danger: #ff7a85;
  --lg-success: #7ee787;
  --lg-success-soft: rgba(126, 231, 135, 0.08);
  --lg-success-border: rgba(126, 231, 135, 0.36);
  --lg-warn: #ffd166;
  --lg-warn-soft: rgba(255, 209, 102, 0.08);
  --lg-warn-border: rgba(255, 209, 102, 0.34);
  --lg-radius-lg: 16px;
  --lg-scrim: rgba(4, 8, 18, 0.64);
  --lg-foot-bg: rgba(7, 12, 24, 0.68);
  --lg-dialog-shadow: 0 30px 90px rgba(0, 0, 0, 0.66), inset 0 0 0 1px rgba(127, 209, 255, 0.04);
  --lg-input-bg: rgba(10, 17, 32, 0.85);
  --lg-input-border: rgba(120, 150, 200, 0.24);
  --lg-btn-bg: rgba(18, 28, 48, 0.85);
  --lg-btn-bg-hover: rgba(32, 48, 78, 0.9);
  --lg-hover: rgba(30, 44, 72, 0.42);
  --lg-hover-strong: rgba(30, 44, 72, 0.72);
  --lg-selected-bg: rgba(127, 209, 255, 0.08);
  --lg-selected-border: rgba(127, 209, 255, 0.34);
  --lg-chip-bg: rgba(127, 209, 255, 0.06);
  --lg-scrollbar: rgba(120, 150, 200, 0.35);
  --lg-mark-bg: rgba(127, 209, 255, 0.26);
  --lg-glyph-bg: linear-gradient(135deg, rgba(127, 209, 255, 0.22), rgba(255, 209, 102, 0.16));
  --lg-glyph-border: rgba(127, 209, 255, 0.32);
  --lg-primary-bg: linear-gradient(180deg, rgba(255, 209, 102, 0.94), rgba(240, 184, 66, 0.94));
  --lg-primary-bg-hover: linear-gradient(180deg, #ffd980, #f5c253);
  --lg-primary-border: rgba(255, 209, 102, 0.5);
  --lg-primary-text: #1a1405;
  --lg-mode-active-text: #ffffff;
  --lg-focus-ring: rgba(127, 209, 255, 0.35);
  --lg-search-focus-border: rgba(127, 209, 255, 0.45);
}
.lg-zot-backdrop[data-lg-theme='light'] {
  color-scheme: light;
  --lg-panel-solid: #ffffff;
  --lg-border: #d3dbe8;
  --lg-border-strong: #a9b8ce;
  --lg-text: #1b2537;
  --lg-muted: #566480;
  --lg-dim: #69758f;
  --lg-accent: #9a6b00;
  --lg-cyan: #1f6a8f;
  --lg-cyan-soft: rgba(31, 106, 143, 0.12);
  --lg-cyan-border: rgba(31, 106, 143, 0.38);
  --lg-danger: #b02a45;
  --lg-success: #0f7a4f;
  --lg-success-soft: rgba(15, 122, 79, 0.1);
  --lg-success-border: rgba(15, 122, 79, 0.35);
  --lg-warn: #8a5a00;
  --lg-warn-soft: rgba(185, 132, 20, 0.12);
  --lg-warn-border: rgba(154, 107, 0, 0.34);
  --lg-scrim: rgba(30, 44, 66, 0.32);
  --lg-foot-bg: #f4f7fc;
  --lg-dialog-shadow: 0 24px 70px rgba(37, 56, 88, 0.28), inset 0 0 0 1px rgba(31, 106, 143, 0.1);
  --lg-input-bg: rgba(255, 255, 255, 0.92);
  --lg-input-border: #cbd6e4;
  --lg-btn-bg: rgba(246, 249, 253, 0.95);
  --lg-btn-bg-hover: #e7eef8;
  --lg-hover: rgba(31, 106, 143, 0.08);
  --lg-hover-strong: rgba(31, 106, 143, 0.12);
  --lg-selected-bg: rgba(31, 106, 143, 0.1);
  --lg-selected-border: rgba(31, 106, 143, 0.4);
  --lg-chip-bg: rgba(31, 106, 143, 0.08);
  --lg-scrollbar: rgba(95, 117, 148, 0.38);
  --lg-mark-bg: rgba(31, 106, 143, 0.22);
  --lg-glyph-bg: linear-gradient(135deg, rgba(31, 106, 143, 0.14), rgba(217, 155, 0, 0.12));
  --lg-glyph-border: rgba(31, 106, 143, 0.3);
  --lg-primary-bg: linear-gradient(180deg, #ffd166, #efb83e);
  --lg-primary-bg-hover: linear-gradient(180deg, #ffdb85, #f5c253);
  --lg-primary-border: rgba(154, 107, 0, 0.45);
  --lg-primary-text: #241a00;
  --lg-mode-active-text: #1f6a8f;
  --lg-focus-ring: rgba(31, 106, 143, 0.3);
  --lg-search-focus-border: rgba(31, 106, 143, 0.45);
}
.lg-zot-backdrop {
  position: fixed; inset: 0; z-index: 1200;
  display: flex; align-items: center; justify-content: center;
  padding: 24px; background: var(--lg-scrim); backdrop-filter: blur(6px);
}
.lg-zot-dialog {
  display: flex; flex-direction: column;
  width: min(980px, 94vw); max-height: min(88vh, 920px);
  background: var(--lg-panel-solid);
  border: 1px solid var(--lg-border-strong);
  border-radius: var(--lg-radius-lg, 16px);
  box-shadow: var(--lg-dialog-shadow);
  color: var(--lg-text); font-size: 13px; line-height: 1.5; overflow: hidden;
  animation: lg-zot-pop 0.18s ease-out;
}
@keyframes lg-zot-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.99); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.lg-zot-head {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 16px 18px 12px; border-bottom: 1px solid var(--lg-border);
  flex: 0 0 auto;
}
.lg-zot-glyph {
  flex: 0 0 auto; width: 32px; height: 32px; border-radius: 9px;
  display: inline-flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 15px; font-family: Georgia, 'Times New Roman', serif;
  color: var(--lg-cyan);
  background: var(--lg-glyph-bg);
  border: 1px solid var(--lg-glyph-border);
}
.lg-zot-heading { flex: 1 1 auto; min-width: 0; }
.lg-zot-title { font-size: 15px; font-weight: 600; letter-spacing: 0.3px; }
.lg-zot-sub {
  margin-top: 2px; font-size: 11px; color: var(--lg-dim);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.lg-zot-icon-btn {
  flex: 0 0 auto; width: 28px; height: 28px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid transparent; background: transparent; color: var(--lg-muted);
  cursor: pointer; padding: 0;
}
.lg-zot-icon-btn:hover { background: var(--lg-hover-strong); color: var(--lg-text); }
.lg-zot-icon-btn[disabled] { opacity: 0.4; cursor: not-allowed; }
.lg-zot-toolbar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 10px 18px; border-bottom: 1px solid var(--lg-border);
  flex: 0 0 auto;
}
.lg-zot-search {
  flex: 1 1 240px; display: flex; align-items: center; gap: 6px; height: 30px;
  padding: 0 9px; border-radius: 8px;
  border: 1px solid var(--lg-input-border);
  background: var(--lg-input-bg); color: var(--lg-dim);
}
.lg-zot-search:focus-within { border-color: var(--lg-search-focus-border); }
.lg-zot-search input {
  flex: 1 1 auto; min-width: 0; height: 100%; border: none; outline: none; background: transparent;
  color: var(--lg-text); font-size: 12px; font-family: inherit;
}
.lg-zot-search input::placeholder { color: var(--lg-dim); }
.lg-zot-mode { display: inline-flex; border: 1px solid var(--lg-border); border-radius: 8px; overflow: hidden; }
.lg-zot-mode-btn {
  height: 30px; padding: 0 11px; border: none; background: transparent;
  color: var(--lg-muted); font-size: 11.5px; font-family: inherit; cursor: pointer; white-space: nowrap;
}
.lg-zot-mode-btn:hover { background: var(--lg-hover-strong); color: var(--lg-text); }
.lg-zot-mode-btn.is-active { background: var(--lg-cyan-soft); color: var(--lg-mode-active-text); box-shadow: inset 0 0 0 1px var(--lg-cyan-border); }
.lg-zot-btn {
  height: 30px; padding: 0 13px; border-radius: 8px;
  border: 1px solid var(--lg-border-strong);
  background: var(--lg-btn-bg); color: var(--lg-text);
  font-size: 12px; font-family: inherit; cursor: pointer; white-space: nowrap;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.lg-zot-btn:hover { background: var(--lg-btn-bg-hover); border-color: var(--lg-cyan-border); }
.lg-zot-btn[disabled] { opacity: 0.42; cursor: not-allowed; }
.lg-zot-btn.is-primary {
  border-color: var(--lg-primary-border);
  background: var(--lg-primary-bg);
  color: var(--lg-primary-text); font-weight: 600;
}
.lg-zot-btn.is-primary:hover { background: var(--lg-primary-bg-hover); border-color: var(--lg-primary-border); }
.lg-zot-btn.is-primary[disabled] { filter: grayscale(0.5); }
.lg-zot-link {
  border: none; background: transparent; color: var(--lg-cyan);
  font-size: 11px; font-family: inherit; cursor: pointer; padding: 0 2px;
}
.lg-zot-link:hover { text-decoration: underline; }
.lg-zot-warnings {
  flex: 0 0 auto; margin: 8px 18px 0; padding: 7px 11px;
  border-radius: 8px; border: 1px solid var(--lg-warn-border);
  background: var(--lg-warn-soft); color: var(--lg-warn);
  font-size: 11px; line-height: 1.65; max-height: 76px; overflow-y: auto;
}
.lg-zot-warnings-title { font-weight: 600; margin-right: 6px; }
.lg-zot-warnings div { word-break: break-word; }
.lg-zot-loading, .lg-zot-empty, .lg-zot-error {
  flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 48px 24px; text-align: center; color: var(--lg-muted); font-size: 12.5px;
}
.lg-zot-loading-hint, .lg-zot-empty-hint { color: var(--lg-dim); font-size: 11px; line-height: 1.75; max-width: 440px; }
.lg-zot-error-text { color: var(--lg-danger); font-size: 12px; line-height: 1.7; max-width: 560px; word-break: break-word; }
.lg-zot-spinner {
  width: 22px; height: 22px; border-radius: 50%;
  border: 2px solid var(--lg-cyan-soft); border-top-color: var(--lg-cyan);
  animation: lg-zot-spin 0.8s linear infinite;
}
@keyframes lg-zot-spin { to { transform: rotate(360deg); } }
.lg-zot-list-head {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 8px 18px; font-size: 11px; color: var(--lg-dim);
  border-bottom: 1px dashed var(--lg-border); flex: 0 0 auto;
}
.lg-zot-check-label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; color: var(--lg-muted); }
.lg-zot-check-label input, .lg-zot-check { accent-color: var(--lg-cyan); width: 13px; height: 13px; cursor: pointer; }
.lg-zot-list-count { color: var(--lg-muted); }
.lg-zot-list {
  flex: 1 1 auto; min-height: 200px; overflow-y: auto; overscroll-behavior: contain;
  padding: 4px 10px 10px; scrollbar-width: thin; scrollbar-color: var(--lg-scrollbar) transparent;
}
.lg-zot-list::-webkit-scrollbar { width: 8px; }
.lg-zot-list::-webkit-scrollbar-thumb { background: var(--lg-scrollbar); border-radius: 4px; }
.lg-zot-row {
  display: flex; align-items: flex-start; gap: 10px; padding: 9px 10px; margin-top: 2px;
  border-radius: 9px; border: 1px solid transparent; cursor: pointer; outline: none;
}
.lg-zot-row:hover { background: var(--lg-hover); }
.lg-zot-row.is-checked { border-color: var(--lg-selected-border); background: var(--lg-selected-bg); }
.lg-zot-row:focus-visible { box-shadow: 0 0 0 2px var(--lg-focus-ring); }
.lg-zot-check { margin-top: 2px; flex: 0 0 auto; }
.lg-zot-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.lg-zot-row-title {
  font-size: 12.5px; line-height: 1.45; color: var(--lg-text);
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word;
}
.lg-zot-row-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 10.5px; color: var(--lg-dim); }
.lg-zot-row-meta > span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lg-zot-authors { color: var(--lg-muted); max-width: 46% !important; }
.lg-zot-venue { max-width: 34% !important; }
.lg-zot-badge {
  flex: 0 0 auto; padding: 0 6px; border-radius: 999px; font-size: 10px; line-height: 17px;
  border: 1px solid var(--lg-border); color: var(--lg-muted);
}
.lg-zot-badge.is-pdf { color: var(--lg-success); border-color: var(--lg-success-border); background: var(--lg-success-soft); }
.lg-zot-badge.is-missing { color: var(--lg-warn); border-color: var(--lg-warn-border); background: var(--lg-warn-soft); }
.lg-zot-badge.is-none { color: var(--lg-dim); }
.lg-zot-chip {
  flex: 0 0 auto; padding: 0 6px; border-radius: 999px; font-size: 10px; line-height: 17px;
  border: 1px solid var(--lg-border); background: var(--lg-chip-bg);
  color: var(--lg-cyan); max-width: 160px !important;
}
.lg-zot-mark { background: var(--lg-mark-bg); color: inherit; border-radius: 2px; padding: 0 1px; }
.lg-zot-more { padding: 12px 10px 4px; text-align: center; font-size: 11px; color: var(--lg-dim); }
.lg-zot-foot {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 12px 18px; border-top: 1px solid var(--lg-border);
  background: var(--lg-foot-bg); flex: 0 0 auto;
}
.lg-zot-foot-info { font-size: 11.5px; color: var(--lg-muted); }
.lg-zot-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.lg-zot-result { flex: 1 1 auto; overflow-y: auto; padding: 20px 22px; display: flex; flex-direction: column; gap: 16px; }
.lg-zot-result-summary { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 10px; background: var(--lg-cyan-soft); border: 1px solid var(--lg-cyan-border); }
.lg-zot-result-num { font-size: 26px; font-weight: 700; color: var(--lg-cyan); line-height: 1.1; }
.lg-zot-result-text { font-size: 12.5px; color: var(--lg-text); }
.lg-zot-result-hint { font-size: 11px; color: var(--lg-dim); line-height: 1.7; }
.lg-zot-result-section { display: flex; flex-direction: column; gap: 6px; }
.lg-zot-result-title { font-size: 12px; font-weight: 600; color: var(--lg-muted); }
.lg-zot-result-item { display: flex; align-items: flex-start; gap: 8px; padding: 7px 2px; border-bottom: 1px dashed var(--lg-border); font-size: 12px; }
.lg-zot-result-item:last-child { border-bottom: none; }
.lg-zot-result-item-title { flex: 1 1 auto; min-width: 0; color: var(--lg-text); word-break: break-word; }
.lg-zot-skip { color: var(--lg-warn); font-size: 11px; word-break: break-word; }
.lg-zot-error-inline { color: var(--lg-danger); font-size: 11.5px; line-height: 1.7; word-break: break-word; }
@media (max-width: 640px) {
  .lg-zot-backdrop { padding: 10px; }
  .lg-zot-dialog { width: 100%; max-height: 94vh; }
  .lg-zot-toolbar { padding: 8px 12px; }
  .lg-zot-head { padding: 12px 14px 10px; }
  .lg-zot-list, .lg-zot-result { padding-left: 8px; padding-right: 8px; }
  .lg-zot-foot { padding: 10px 12px; }
  .lg-zot-authors { max-width: 100% !important; }
  .lg-zot-venue { max-width: 100% !important; }
}
`

let styleElement: HTMLStyleElement | null = null

/** Inject the dialog stylesheet once; returns a disposer that leaves it in place for other mounts. */
export function ensureZoteroStyles(): () => void {
  if (typeof document === 'undefined' || !document.head) return () => {}
  if (styleElement !== null && styleElement.isConnected) return () => {}
  const existing = typeof document.getElementById === 'function' ? document.getElementById(ZOTERO_STYLE_ID) : null
  if (existing !== null) {
    styleElement = existing as HTMLStyleElement
    return () => {}
  }
  const element = document.createElement('style')
  element.id = ZOTERO_STYLE_ID
  element.setAttribute('data-plugin', 'dsh-litgraph-zotero')
  element.textContent = ZOTERO_CSS
  document.head.appendChild(element)
  styleElement = element
  return () => {}
}
