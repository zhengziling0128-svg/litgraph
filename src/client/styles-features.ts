
/**
 * LitGraph feature add-ons: notes / tags / star, library filters + export menu,
 * the settings dialog.
 *
 * Kept in its own stylesheet (injected once by ensureFeatureStyles) so the main
 * styles.ts stays owned by the theme work. Everything reads the shared --lg-*
 * design tokens, so it follows the dark and light palettes automatically.
 */

export const FEATURE_STYLE_ID = 'dsh-litgraph-feature-styles'

export const FEATURE_CSS = String.raw`
/* ================= library header extras: export / settings ================= */
.lgf-head-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; flex: 0 0 auto; }
.lgf-head-actions .lg-btn { margin-left: 0; }
.lgf-tool-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; min-width: 32px; padding: 0;
  border: 1px solid var(--lg-border); border-radius: var(--lg-radius-sm);
  background: var(--lg-btn-bg); color: var(--lg-muted);
  font-size: calc(16px * var(--lg-fs-scale)); line-height: 1; cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.lgf-tool-btn:hover { background: var(--lg-btn-bg-hover); color: var(--lg-text); border-color: var(--lg-border-strong); }
.lgf-tool-btn[aria-expanded='true'] { border-color: var(--lg-cyan); color: var(--lg-cyan); background: var(--lg-cyan-soft); }
.lgf-tool-btn[disabled] { opacity: 0.45; cursor: not-allowed; }
.lgf-tool-btn:focus-visible { outline: 2px solid var(--lg-ring); outline-offset: 1px; }

/* inline success/error banner (fallback for hosts that do not pass onToast) */
.lgf-notice {
  display: flex; align-items: center; gap: 6px; margin: 0 13px 8px; padding: 7px 10px;
  border-radius: var(--lg-radius-sm); border: 1px solid var(--lg-border);
  background: var(--lg-chip-bg); color: var(--lg-muted);
  font-size: calc(12px * var(--lg-fs-scale)); line-height: 1.5;
}
.lgf-notice[data-kind='success'] { border-color: var(--lg-success-border); background: var(--lg-success-soft); color: var(--lg-success); }
.lgf-notice[data-kind='error'] { border-color: var(--lg-danger-border); background: var(--lg-danger-soft); color: var(--lg-danger); }
.lgf-notice[data-kind='info'] { border-color: var(--lg-cyan-border); background: var(--lg-cyan-soft); color: var(--lg-cyan); }

/* dropdown menu shared by export + (future) bulk actions */
.lgf-menu-wrap { position: relative; display: inline-flex; }
.lgf-menu {
  position: absolute; z-index: 60; top: calc(100% + 6px); right: 0; min-width: 212px;
  display: flex; flex-direction: column; gap: 2px; padding: 5px;
  border-radius: var(--lg-radius); border: 1px solid var(--lg-border-strong);
  background: var(--lg-panel-solid); box-shadow: 0 18px 44px var(--lg-shadow-strong);
  animation: lg-fade-in 120ms ease-out;
}
.lgf-menu-item {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 9px;
  border: 0; border-radius: var(--lg-radius-sm); background: transparent;
  color: var(--lg-text); font-family: var(--lg-font); font-size: calc(12.5px * var(--lg-fs-scale));
  text-align: left; cursor: pointer; white-space: nowrap;
}
.lgf-menu-item:hover { background: var(--lg-hover); }
.lgf-menu-item:focus-visible { outline: 2px solid var(--lg-ring); outline-offset: -2px; }
.lgf-menu-item[disabled] { opacity: 0.5; cursor: not-allowed; }
.lgf-menu-item small { margin-left: auto; color: var(--lg-dim); font-size: calc(11px * var(--lg-fs-scale)); }
.lgf-menu-sep { height: 1px; margin: 3px 5px; background: var(--lg-border); }
.lgf-menu-note { padding: 5px 9px 4px; color: var(--lg-dim); font-size: calc(11px * var(--lg-fs-scale)); line-height: 1.55; }

/* ================= detail panel: star / notes / tags ================= */
.lgf-star-btn { color: var(--lg-muted); }
.lgf-star-btn.is-on { color: var(--lg-accent); border-color: var(--lg-accent-border); background: var(--lg-accent-soft); }
.lgf-section-head { display: flex; align-items: center; gap: 8px; }
.lgf-section-head h3 { flex: 1 1 auto; }
.lgf-save-state {
  display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto;
  font-size: calc(11px * var(--lg-fs-scale)); color: var(--lg-dim); white-space: nowrap;
}
.lgf-save-state[data-state='pending'] { color: var(--lg-warn); }
.lgf-save-state[data-state='saving'] { color: var(--lg-cyan); }
.lgf-save-state[data-state='saving']::before {
  content: ''; width: 6px; height: 6px; border-radius: 50%;
  background: currentColor; animation: lg-breathe 1.2s ease-in-out infinite;
}
.lgf-save-state[data-state='saved'] { color: var(--lg-success); }
.lgf-save-state[data-state='error'] { color: var(--lg-danger); }
.lgf-save-retry {
  padding: 0; border: 0; background: transparent; color: inherit;
  font: inherit; text-decoration: underline; cursor: pointer;
}
.lgf-textarea {
  width: 100%; min-height: 92px; max-height: 280px; resize: vertical; box-sizing: border-box;
  padding: 9px 10px; border-radius: var(--lg-radius-sm);
  border: 1px solid var(--lg-input-border); background: var(--lg-input-bg); color: var(--lg-text);
  font-family: var(--lg-font); font-size: calc(12.5px * var(--lg-fs-scale)); line-height: 1.65;
  outline: none;
  transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease;
}
.lgf-textarea::placeholder { color: var(--lg-dim); }
.lgf-textarea:focus { border-color: var(--lg-cyan); background: var(--lg-input-bg-focus); box-shadow: 0 0 0 3px var(--lg-cyan-soft); }
.lgf-tag-editor {
  display: flex; flex-wrap: wrap; align-items: center; gap: 5px; box-sizing: border-box;
  min-height: 36px; padding: 6px 7px; border-radius: var(--lg-radius-sm);
  border: 1px solid var(--lg-input-border); background: var(--lg-input-bg);
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.lgf-tag-editor:focus-within { border-color: var(--lg-cyan); box-shadow: 0 0 0 3px var(--lg-cyan-soft); }
.lgf-tag {
  display: inline-flex; align-items: center; gap: 2px; max-width: 100%;
  padding: 1px 3px 1px 8px; border-radius: 999px;
  border: 1px solid var(--lg-cyan-border); background: var(--lg-cyan-soft); color: var(--lg-muted);
  font-size: calc(11px * var(--lg-fs-scale));
}
.lgf-tag-label {
  max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 0; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer;
}
span.lgf-tag-label { cursor: default; }
.lgf-tag-label:hover { color: var(--lg-text); }
.lgf-tag-x {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; padding: 0; border: 0; border-radius: 50%;
  background: transparent; color: var(--lg-dim);
  font-size: calc(13px * var(--lg-fs-scale)); line-height: 1; cursor: pointer;
}
.lgf-tag-x:hover { color: var(--lg-danger); background: var(--lg-danger-soft); }
.lgf-tag-input {
  flex: 1 1 86px; min-width: 86px; height: 22px; padding: 0 2px;
  border: 0; background: transparent; color: var(--lg-text); outline: none;
  font-family: var(--lg-font); font-size: calc(12px * var(--lg-fs-scale));
}
.lgf-tag-input::placeholder { color: var(--lg-dim); }
.lgf-tag-input[disabled] { cursor: not-allowed; }
.lgf-hint { font-size: calc(11px * var(--lg-fs-scale)); line-height: 1.55; color: var(--lg-dim); }
.lgf-hint.is-error { color: var(--lg-danger); }

/* ================= library rows: star + tag chips ================= */
.lgf-paper-row { font-family: var(--lg-font); }
.lgf-paper-row:focus-visible { outline: 2px solid var(--lg-ring); outline-offset: -1px; }
.lgf-row-star {
  flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; margin: -2px -3px 0 0; padding: 0;
  border: 0; border-radius: 50%; background: transparent; color: var(--lg-dim);
  font-size: calc(15px * var(--lg-fs-scale)); line-height: 1; cursor: pointer;
  transition: color 120ms ease, background 120ms ease, transform 120ms ease;
}
.lgf-row-star:hover { color: var(--lg-accent); background: var(--lg-accent-soft); transform: scale(1.1); }
.lgf-row-star.is-on { color: var(--lg-accent); text-shadow: 0 0 9px var(--lg-accent-border); }
.lgf-row-star[disabled] { opacity: 0.5; cursor: not-allowed; }
.lgf-row-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 1px; }
.lgf-row-tag {
  display: inline-flex; align-items: center; max-width: 104px; height: 17px; padding: 0 6px;
  border: 1px solid var(--lg-border); border-radius: 999px;
  background: var(--lg-chip-bg); color: var(--lg-dim);
  font-family: var(--lg-font); font-size: calc(10.5px * var(--lg-fs-scale));
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;
}
.lgf-row-tag:hover { color: var(--lg-cyan); border-color: var(--lg-cyan-border); }
.lgf-row-tag.is-more { border-style: dashed; cursor: default; }
.lgf-filter-label {
  display: inline-flex; align-items: center; flex: 0 0 auto; padding-right: 1px;
  font-size: calc(10.5px * var(--lg-fs-scale)); color: var(--lg-dim);
}
.lgf-star-filter.is-active { border-color: var(--lg-accent-border); color: var(--lg-accent); background: var(--lg-accent-soft); }

/* ================= settings dialog ================= */
.lgf-modal-backdrop {
  position: fixed; inset: 0; z-index: 90;
  display: flex; align-items: center; justify-content: center; padding: 20px;
  background: rgba(4, 8, 18, 0.55); backdrop-filter: blur(2px);
  animation: lg-fade-in 140ms ease-out;
}
.lgf-modal {
  display: flex; flex-direction: column; width: min(460px, 100%); max-height: min(82vh, 600px);
  overflow: auto; border-radius: var(--lg-radius-lg);
  border: 1px solid var(--lg-border-strong); background: var(--lg-panel-solid);
  box-shadow: 0 28px 72px var(--lg-shadow-strong);
}
.lgf-modal-head { display: flex; align-items: center; gap: 10px; padding: 13px 15px 11px; border-bottom: 1px solid var(--lg-border); }
.lgf-modal-title { flex: 1 1 auto; font-size: calc(14px * var(--lg-fs-scale)); font-weight: 650; color: var(--lg-text); }
.lgf-modal-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px;
  background: transparent; color: var(--lg-dim); font-size: calc(18px * var(--lg-fs-scale));
  line-height: 1; cursor: pointer;
}
.lgf-modal-close:hover { color: var(--lg-text); background: var(--lg-hover); }
.lgf-modal-body { display: flex; flex-direction: column; gap: 12px; padding: 14px 15px; }
.lgf-modal-section-title { font-size: calc(12px * var(--lg-fs-scale)); font-weight: 600; color: var(--lg-muted); }
.lgf-radio-row {
  display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 10px 11px;
  border-radius: var(--lg-radius-sm); border: 1px solid var(--lg-border);
  background: var(--lg-panel-raised); color: inherit;
  font-family: var(--lg-font); text-align: left; cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}
.lgf-radio-row:hover { border-color: var(--lg-border-strong); }
.lgf-radio-row.is-active { border-color: var(--lg-cyan); background: var(--lg-cyan-soft); }
.lgf-radio-row:focus-visible { outline: 2px solid var(--lg-ring); outline-offset: 1px; }
.lgf-radio-dot {
  position: relative; flex: 0 0 auto; width: 15px; height: 15px; margin-top: 2px;
  border-radius: 50%; border: 1.5px solid var(--lg-border-strong);
}
.lgf-radio-row.is-active .lgf-radio-dot { border-color: var(--lg-cyan); }
.lgf-radio-row.is-active .lgf-radio-dot::after {
  content: ''; position: absolute; inset: 3px; border-radius: 50%; background: var(--lg-cyan);
}
.lgf-radio-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.lgf-radio-label { font-size: calc(13px * var(--lg-fs-scale)); color: var(--lg-text); }
.lgf-radio-hint { font-size: calc(11.5px * var(--lg-fs-scale)); line-height: 1.5; color: var(--lg-dim); }
.lgf-modal-note {
  padding: 8px 10px; border-radius: var(--lg-radius-sm);
  border: 1px solid var(--lg-warn-border); background: var(--lg-warn-soft);
  color: var(--lg-warn); font-size: calc(11.5px * var(--lg-fs-scale)); line-height: 1.6;
}
.lgf-modal-loading, .lgf-modal-error { font-size: calc(12px * var(--lg-fs-scale)); color: var(--lg-dim); line-height: 1.6; }
.lgf-modal-error { color: var(--lg-danger); }
.lgf-modal-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 11px 15px 13px; border-top: 1px solid var(--lg-border); }

/* ================= 5-star rating + journal metrics ================= */
.lgf-rating { display: inline-flex; align-items: center; gap: 1px; margin-right: 2px; }
.lgf-rating-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0;
  border: 0; border-radius: var(--lg-radius-sm); background: transparent;
  color: var(--lg-dim); font-family: var(--lg-font);
  font-size: calc(15px * var(--lg-fs-scale)); line-height: 1; cursor: pointer;
  transition: color 120ms ease, background 120ms ease, transform 120ms ease;
}
.lgf-rating-btn:hover { color: var(--lg-accent); background: var(--lg-accent-soft); transform: translateY(-1px); }
.lgf-rating-btn.is-on { color: var(--lg-accent); text-shadow: 0 0 8px var(--lg-accent-border); }
.lgf-rating-btn:focus-visible { outline: 2px solid var(--lg-ring); outline-offset: -2px; }
.lgf-rating-btn[disabled] { opacity: 0.55; cursor: not-allowed; transform: none; }
.lgf-rating-label { margin-left: 6px; font-size: calc(11px * var(--lg-fs-scale)); color: var(--lg-dim); white-space: nowrap; }

.lgf-metrics-source {
  flex: 0 0 auto; padding: 1px 7px; border-radius: 999px;
  border: 1px solid var(--lg-cyan-border); background: var(--lg-cyan-soft); color: var(--lg-cyan);
  font-size: calc(10.5px * var(--lg-fs-scale)); letter-spacing: 0.3px; white-space: nowrap;
}
.lgf-metrics-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  gap: 8px; margin: 0; padding: 0;
}
.lgf-metric {
  display: flex; flex-direction: column; gap: 3px; min-width: 0;
  padding: 8px 10px; border-radius: var(--lg-radius-sm);
  border: 1px solid var(--lg-border); background: var(--lg-panel-raised);
}
.lgf-metric dt { font-size: calc(10.5px * var(--lg-fs-scale)); color: var(--lg-dim); }
.lgf-metric dd {
  display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin: 0;
  font-family: var(--lg-font); font-size: calc(14px * var(--lg-fs-scale));
  font-weight: 600; color: var(--lg-text); line-height: 1.35;
}
.lgf-metric-value {
  display: flex; align-items: center; flex-wrap: wrap; gap: 4px;
  font-family: var(--lg-font); font-size: calc(14px * var(--lg-fs-scale));
  font-weight: 600; color: var(--lg-text);
}
.lgf-metrics-top {
  padding: 0 5px; border-radius: 4px;
  border: 1px solid var(--lg-accent-border); background: var(--lg-accent-soft);
  color: var(--lg-accent-text);
  font-size: calc(9.5px * var(--lg-fs-scale)); font-weight: 700;
  letter-spacing: 0.6px; line-height: 1.6;
}
.lgf-metric-sub {
  font-size: calc(10.5px * var(--lg-fs-scale)); font-weight: 400;
  color: var(--lg-dim); line-height: 1.45;
}
.lgf-metrics .lgf-hint { margin-top: 2px; }
.lgf-metrics-query {
  align-self: flex-start; display: inline-flex; align-items: center; gap: 6px;
  margin-top: 8px; padding: 6px 12px; border-radius: var(--lg-radius-sm);
  border: 1px solid var(--lg-border); background: var(--lg-btn-bg); color: var(--lg-muted);
  font-family: var(--lg-font); font-size: calc(12px * var(--lg-fs-scale)); cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.lgf-metrics-query:hover:not([disabled]) {
  background: var(--lg-btn-bg-hover); color: var(--lg-text); border-color: var(--lg-border-strong);
}
.lgf-metrics-query[disabled] { opacity: 0.55; cursor: progress; }
.lgf-metrics-query:focus-visible { outline: 2px solid var(--lg-ring); outline-offset: 1px; }

.lgf-row-stats { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 3px; }
.lgf-row-metrics { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 0; }
.lgf-row-metric {
  display: inline-flex; align-items: center; max-width: 132px; height: 16px; padding: 0 6px;
  border: 1px solid var(--lg-border); border-radius: 999px;
  background: var(--lg-chip-bg); color: var(--lg-muted);
  font-family: var(--lg-font); font-size: calc(10px * var(--lg-fs-scale));
  line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.lgf-row-metric:first-child { border-color: var(--lg-cyan-border); color: var(--lg-cyan); }
.lgf-row-rating {
  flex: 0 0 auto; display: inline-flex; align-items: center;
  color: var(--lg-accent); font-size: calc(11px * var(--lg-fs-scale));
  letter-spacing: 0.5px; white-space: nowrap;
}
.lgf-rating-filter.is-active {
  border-color: var(--lg-accent-border); color: var(--lg-accent); background: var(--lg-accent-soft);
}
.lgf-sort-hint {
  flex: 0 0 auto; font-size: calc(10.5px * var(--lg-fs-scale));
  color: var(--lg-dim); white-space: nowrap;
}
/* --- Zotero read state (detail header + library rows) -------------------- */
/* Outer rail + solid icon badge: unmistakable at a glance, still on-token. */
.lgf-paper-row { position: relative; }
.lgf-read-rail {
  position: absolute; left: 0; top: 7px; bottom: 7px; width: 4px;
  border-radius: 999px; pointer-events: none;
}
.lgf-row-read .lgf-read-rail { background: linear-gradient(180deg, #46c07a, #2f9e5f); }
.lgf-row-unread .lgf-read-rail {
  background: linear-gradient(180deg, #ffcf5c, #e0a92b);
  animation: lgf-read-glow 2.8s ease-in-out infinite;
}
@keyframes lgf-read-glow {
  0%, 100% { box-shadow: 0 0 0 rgba(224, 169, 43, 0); }
  50% { box-shadow: 0 0 10px rgba(224, 169, 43, 0.55); }
}
@media (prefers-reduced-motion: reduce) {
  .lgf-row-unread .lgf-read-rail { animation: none; }
}
/* Unread rows get a warm wash so the eye finds them while scrolling. */
.lgf-row-unread { background: rgba(230, 176, 40, 0.05); border-color: rgba(230, 176, 40, 0.14); }
.lgf-row-unread:hover { background: rgba(230, 176, 40, 0.09); }
.lgf-row-read { background: transparent; }
.lgf-paper-row.is-selected .lgf-read-rail { top: 6px; bottom: 6px; }
.lgf-read-pill {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: calc(12px * var(--lg-fs-scale)); font-weight: 700; letter-spacing: 0.4px;
  line-height: 1; padding: 4px 11px 4px 9px; border-radius: 999px;
  border: 1px solid transparent; white-space: nowrap;
}
.lgf-read-icon {
  width: 15px; height: 15px; border-radius: 50%; flex: 0 0 auto;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 800; color: #fff; letter-spacing: 0;
}
.lgf-read-pill.is-read {
  color: #1c7d49; background: rgba(47, 158, 95, 0.18);
  border-color: rgba(47, 158, 95, 0.55);
}
.lgf-read-pill.is-read .lgf-read-icon { background: #2f9e5f; box-shadow: 0 0 0 2px rgba(47, 158, 95, 0.2); }
.lgf-read-pill.is-unread {
  color: #8a5c00; background: rgba(230, 176, 40, 0.22);
  border-color: rgba(214, 160, 32, 0.65);
}
.lgf-read-pill.is-unread .lgf-read-icon { background: #e0a92b; color: #3a2a00; box-shadow: 0 0 0 2px rgba(224, 169, 43, 0.22); }
[data-lg-theme='dark'] .lgf-read-pill.is-read { color: #63e8a0; background: rgba(47, 158, 95, 0.24); border-color: rgba(99, 232, 160, 0.5); }
[data-lg-theme='dark'] .lgf-read-pill.is-unread { color: #ffd465; background: rgba(230, 176, 40, 0.2); border-color: rgba(255, 212, 101, 0.55); }
[data-lg-theme='dark'] .lgf-row-unread { background: rgba(230, 176, 40, 0.08); border-color: rgba(255, 212, 101, 0.16); }
[data-lg-theme='dark'] .lgf-row-unread:hover { background: rgba(230, 176, 40, 0.14); }
.lg-paper-meta > .lgf-read-pill { flex: 0 0 auto; overflow: visible; text-overflow: clip; margin-left: auto; }
.lg-paper-meta > .lg-paper-cat { flex: 1 1 auto; min-width: 0; }
/* Detail: big badge in the header + colored accent edge on the panel. */
.lg-detail.is-read { box-shadow: inset 3px 0 0 rgba(47, 158, 95, 0.75); }
.lg-detail.is-unread { box-shadow: inset 3px 0 0 rgba(224, 169, 43, 0.8); }
.lg-detail-eyebrow .lgf-read-pill { margin-left: auto; font-size: calc(13px * var(--lg-fs-scale)); padding: 5px 13px 5px 10px; gap: 7px; }
.lg-detail-eyebrow .lgf-read-icon { width: 17px; height: 17px; font-size: 10px; }

/* --- Zotero sync (detail panel) ------------------------------------------ */
.lgf-zotero-status {
  font-size: calc(10px * var(--lg-fs-scale)); color: var(--lg-dim);
  border: 1px solid var(--lg-border); border-radius: 999px; padding: 1px 8px;
}
.lgf-zotero-meta {
  display: flex; flex-wrap: wrap; gap: 4px 12px;
  font-size: calc(10.5px * var(--lg-fs-scale)); color: var(--lg-dim);
}
.lgf-zotero-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.lgf-zotero-chip {
  font-size: calc(10.5px * var(--lg-fs-scale)); color: var(--lg-accent-text);
  background: var(--lg-accent-soft); border: 1px solid var(--lg-accent-border);
  border-radius: 999px; padding: 1px 8px; white-space: nowrap;
}
.lgf-zotero-list {
  display: flex; flex-direction: column; gap: 2px;
  max-height: 180px; overflow: auto; padding: 4px 2px;
  border: 1px solid var(--lg-border); border-radius: var(--lg-radius-sm);
  background: var(--lg-input-bg);
}
.lgf-zotero-option {
  display: flex; align-items: center; gap: 6px; cursor: pointer;
  font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-text);
  padding: 2px 4px; border-radius: var(--lg-radius-sm);
}
.lgf-zotero-option:hover { background: var(--lg-hover); }
.lgf-zotero-option input { accent-color: var(--lg-accent); }
.lgf-zotero-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.lgf-zotero-btn {
  font: inherit; font-size: calc(11px * var(--lg-fs-scale)); color: var(--lg-text);
  background: var(--lg-btn-bg); border: 1px solid var(--lg-border-strong);
  border-radius: var(--lg-radius-sm); padding: 4px 10px; cursor: pointer;
}
.lgf-zotero-btn:hover:not(:disabled) { background: var(--lg-btn-bg-hover); }
.lgf-zotero-btn:disabled { opacity: 0.55; cursor: default; }
.lgf-zotero-btn.is-primary {
  color: var(--lg-accent-text); border-color: var(--lg-accent-border);
  background: var(--lg-accent-soft);
}

/* ================= detail panel: collapsible sections ================= */
.lgf-section-title { flex: 1 1 auto; min-width: 0; }
.lgf-collapse-toggle {
  display: inline-flex; align-items: center; gap: 6px; margin: 0; padding: 0;
  border: 0; background: transparent; font: inherit; color: inherit;
  letter-spacing: inherit; text-transform: inherit; text-align: left; cursor: pointer;
}
.lgf-collapse-toggle:hover { color: var(--lg-cyan); }
.lgf-collapse-toggle:focus-visible { outline: 2px solid var(--lg-ring); outline-offset: 2px; border-radius: 3px; }
.lgf-collapse-caret { width: 10px; font-size: 10px; line-height: 1; color: var(--lg-dim); }
.lgf-collapse-toggle:hover .lgf-collapse-caret { color: var(--lg-cyan); }
.lgf-collapse-body { display: block; }
.lgf-collapsible.is-collapsed { gap: 0; }

`

let featureStyleElement: HTMLStyleElement | null = null

/** Inject the feature stylesheet once; returns a disposer that removes it. */
export function ensureFeatureStyles(): () => void {
  if (typeof document === 'undefined' || !document.head) return () => {}
  if (typeof document.getElementById === 'function' && document.getElementById(FEATURE_STYLE_ID)) {
    return () => {}
  }
  const element = document.createElement('style')
  element.id = FEATURE_STYLE_ID
  element.setAttribute('data-plugin', 'dsh-litgraph')
  element.textContent = FEATURE_CSS
  document.head.appendChild(element)
  featureStyleElement = element
  return () => {
    if (featureStyleElement === element && element.parentNode) element.parentNode.removeChild(element)
    if (featureStyleElement === element) featureStyleElement = null
  }
}
