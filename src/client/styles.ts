/**
 * LitGraph workbench stylesheet.
 *
 * Theme independence is the point of this file: the panel used to borrow the shell's
 * label colours (`--dsw-alias-label-*`), so a light shell skin painted dark ink on our
 * dark starry surface ("背景和字都是黑的看不清"). Instead both palettes are declared
 * here as self-contained `--lg-*` tokens, selected with `.lg-root[data-lg-theme]`, and
 * only neutral things (font stack, radii) still come from the shell.
 *
 * The font step (14 / 15 / 16px, persisted by theme.ts) scales every text size through
 * `--lg-fs-scale`; the panel widths scale with `--lg-layout-scale` so the three columns
 * keep breathing room when the type grows.
 *
 * The client bundle has no CSS pipeline: the stylesheet is injected once as a
 * <style data-plugin="dsh-litgraph"> element from apply(ctx) and removed on disposal.
 */

export const STYLE_ID = 'dsh-litgraph-styles'

const FONT_STACK =
  'var(--dsw-font-family, var(--dsh-font-family-text, "Noto Sans SC", "PingFang SC", system-ui, -apple-system, "Segoe UI", sans-serif))'

export const CSS = String.raw`
/* ================= design tokens: layout, type scale, palettes ================= */
.lg-root {
  --lg-font: ${FONT_STACK};
  --lg-fs-scale: 1;
  --lg-layout-scale: 1;
  --lg-detail-width: calc(330px * var(--lg-layout-scale));
  --lg-library-width: calc(350px * var(--lg-layout-scale));
  --lg-radius-sm: var(--dsw-radius-sm, 8px);
  --lg-radius: var(--dsw-radius-md, 10px);
  --lg-radius-lg: var(--dsw-radius-lg, 14px);

  /* dark palette (default) */
  --lg-bg-top: #0c1426;
  --lg-bg-mid: #0a1020;
  --lg-bg-bottom: #070c18;
  --lg-glow-1: rgba(96, 138, 214, 0.22);
  --lg-glow-2: rgba(128, 92, 204, 0.18);
  --lg-panel: rgba(10, 16, 30, 0.96);
  --lg-panel-solid: #0b1222;
  --lg-panel-raised: #121c30;
  --lg-header-bg: linear-gradient(180deg, rgba(11, 18, 34, 0.98), rgba(9, 14, 26, 0.92));
  --lg-border: rgba(126, 156, 206, 0.26);
  --lg-border-strong: rgba(150, 186, 244, 0.46);
  --lg-text: #dfe7f5;
  --lg-muted: #a8b6cf;
  --lg-dim: #7d8ca8;
  --lg-accent: #ffd166;
  --lg-accent-soft: rgba(255, 209, 102, 0.16);
  --lg-accent-text: #ffe2a1;
  --lg-accent-border: rgba(255, 209, 102, 0.44);
  --lg-cyan: #7fd1ff;
  --lg-cyan-soft: rgba(127, 209, 255, 0.15);
  --lg-cyan-border: rgba(127, 209, 255, 0.4);
  --lg-danger: #ff8a9d;
  --lg-danger-soft: rgba(255, 122, 144, 0.1);
  --lg-danger-border: rgba(255, 122, 144, 0.4);
  --lg-success: #55dda4;
  --lg-success-soft: rgba(72, 213, 151, 0.12);
  --lg-success-border: rgba(72, 213, 151, 0.4);
  --lg-warn: #ffc06b;
  --lg-warn-soft: rgba(255, 180, 84, 0.1);
  --lg-warn-border: rgba(255, 180, 84, 0.38);
  --lg-input-bg: rgba(13, 21, 40, 0.94);
  --lg-input-bg-focus: rgba(16, 26, 48, 0.98);
  --lg-input-border: rgba(126, 156, 206, 0.3);
  --lg-btn-bg: rgba(22, 33, 56, 0.9);
  --lg-btn-bg-hover: rgba(36, 52, 82, 0.96);
  --lg-hover: rgba(34, 49, 78, 0.6);
  --lg-selected-bg: rgba(127, 209, 255, 0.12);
  --lg-selected-border: rgba(127, 209, 255, 0.4);
  --lg-chip-bg: rgba(127, 209, 255, 0.08);
  --lg-clear-bg: rgba(148, 172, 210, 0.16);
  --lg-clear-bg-hover: rgba(148, 172, 210, 0.3);
  --lg-tooltip-bg: rgba(8, 14, 27, 0.98);
  --lg-toast-bg: rgba(9, 16, 30, 0.98);
  --lg-legend-bg: rgba(9, 15, 28, 0.82);
  --lg-hud-bg: rgba(10, 17, 32, 0.82);
  --lg-drop-bg: rgba(7, 14, 28, 0.78);
  --lg-drop-card-bg: rgba(9, 16, 32, 0.94);
  --lg-error-bg: rgba(46, 16, 26, 0.94);
  --lg-warn-bg: rgba(38, 26, 10, 0.88);
  --lg-shadow: rgba(0, 0, 0, 0.55);
  --lg-shadow-strong: rgba(0, 0, 0, 0.66);
  --lg-selection: rgba(255, 209, 102, 0.28);
  --lg-scrollbar: rgba(148, 172, 210, 0.38);
  --lg-scrollbar-hover: rgba(174, 198, 236, 0.56);
  --lg-skeleton-lo: rgba(148, 172, 210, 0.08);
  --lg-skeleton-hi: rgba(148, 172, 210, 0.2);
  --lg-star: #cfe0ff;
  --lg-graph-bg: radial-gradient(900px 520px at 50% 40%, rgba(34, 54, 94, 0.42), transparent 70%);
  --lg-nebula-opacity: 0.22;
  --lg-nebula-blend: normal;
  --lg-cluster-label-halo: rgba(4, 8, 18, 0.65);
  --lg-node-label: #dbe7fa;
  --lg-node-label-halo: rgba(5, 9, 18, 0.94);
  --lg-node-stroke: rgba(4, 8, 18, 0.55);
  --lg-node-stroke-selected: #ffffff;
  --lg-mark-bg: radial-gradient(60% 60% at 50% 40%, rgba(255, 209, 102, 0.2), rgba(255, 209, 102, 0.04));
  --lg-mark-border: rgba(255, 209, 102, 0.28);
  --lg-mark-glow: rgba(255, 209, 102, 0.35);
  --lg-ring: var(--lg-cyan);

  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color-scheme: dark;
  container-type: inline-size;
  color: var(--lg-text);
  font-family: var(--lg-font);
  font-size: calc(14px * var(--lg-fs-scale));
  line-height: 1.52;
  background:
    radial-gradient(1200px 620px at 72% -10%, var(--lg-glow-1), transparent 62%),
    radial-gradient(900px 520px at 8% 112%, var(--lg-glow-2), transparent 60%),
    linear-gradient(180deg, var(--lg-bg-top) 0%, var(--lg-bg-mid) 48%, var(--lg-bg-bottom) 100%);
  outline: none;
}
.lg-root[data-lg-font='15'] { --lg-fs-scale: 1.0714; --lg-layout-scale: 1.045; }
.lg-root[data-lg-font='16'] { --lg-fs-scale: 1.1429; --lg-layout-scale: 1.09; }
.lg-root[data-lg-theme='dark'] { color-scheme: dark; }

/* ---- light / paper palette ---- */
.lg-root[data-lg-theme='light'] {
  color-scheme: light;
  --lg-bg-top: #f8fafd;
  --lg-bg-mid: #eef2f8;
  --lg-bg-bottom: #e5ebf4;
  --lg-glow-1: rgba(160, 190, 235, 0.4);
  --lg-glow-2: rgba(255, 214, 140, 0.22);
  --lg-panel: rgba(255, 255, 255, 0.94);
  --lg-panel-solid: #ffffff;
  --lg-panel-raised: #f5f8fd;
  --lg-header-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(244, 247, 252, 0.93));
  --lg-border: #d3dbe8;
  --lg-border-strong: #a9b8ce;
  --lg-text: #1b2537;
  --lg-muted: #566480;
  --lg-dim: #69758f;
  --lg-accent: #9a6b00;
  --lg-accent-soft: rgba(217, 155, 0, 0.14);
  --lg-accent-text: #6b4a00;
  --lg-accent-border: rgba(154, 107, 0, 0.42);
  --lg-cyan: #1f6a8f;
  --lg-cyan-soft: rgba(31, 106, 143, 0.12);
  --lg-cyan-border: rgba(31, 106, 143, 0.38);
  --lg-danger: #b02a45;
  --lg-danger-soft: rgba(176, 42, 69, 0.08);
  --lg-danger-border: rgba(176, 42, 69, 0.35);
  --lg-success: #0f7a4f;
  --lg-success-soft: rgba(15, 122, 79, 0.1);
  --lg-success-border: rgba(15, 122, 79, 0.35);
  --lg-warn: #8a5a00;
  --lg-warn-soft: rgba(185, 132, 20, 0.12);
  --lg-warn-border: rgba(154, 107, 0, 0.34);
  --lg-input-bg: rgba(255, 255, 255, 0.92);
  --lg-input-bg-focus: #ffffff;
  --lg-input-border: #cbd6e4;
  --lg-btn-bg: rgba(246, 249, 253, 0.95);
  --lg-btn-bg-hover: #e7eef8;
  --lg-hover: rgba(31, 106, 143, 0.08);
  --lg-selected-bg: rgba(31, 106, 143, 0.1);
  --lg-selected-border: rgba(31, 106, 143, 0.4);
  --lg-chip-bg: rgba(31, 106, 143, 0.08);
  --lg-clear-bg: rgba(95, 117, 148, 0.14);
  --lg-clear-bg-hover: rgba(95, 117, 148, 0.26);
  --lg-tooltip-bg: rgba(255, 255, 255, 0.99);
  --lg-toast-bg: rgba(255, 255, 255, 0.99);
  --lg-legend-bg: rgba(255, 255, 255, 0.84);
  --lg-hud-bg: rgba(255, 255, 255, 0.84);
  --lg-drop-bg: rgba(238, 242, 248, 0.85);
  --lg-drop-card-bg: rgba(255, 255, 255, 0.96);
  --lg-error-bg: rgba(255, 240, 243, 0.97);
  --lg-warn-bg: rgba(255, 246, 230, 0.96);
  --lg-shadow: rgba(37, 56, 88, 0.18);
  --lg-shadow-strong: rgba(37, 56, 88, 0.26);
  --lg-selection: rgba(255, 209, 102, 0.38);
  --lg-scrollbar: rgba(95, 117, 148, 0.38);
  --lg-scrollbar-hover: rgba(70, 92, 124, 0.55);
  --lg-skeleton-lo: rgba(120, 140, 170, 0.1);
  --lg-skeleton-hi: rgba(120, 140, 170, 0.22);
  --lg-star: rgba(96, 115, 145, 0.52);
  --lg-graph-bg: radial-gradient(900px 520px at 50% 40%, rgba(188, 207, 234, 0.55), transparent 72%);
  --lg-nebula-opacity: 0.16;
  --lg-nebula-blend: multiply;
  --lg-cluster-label-halo: rgba(255, 255, 255, 0.92);
  --lg-node-label: #1b2537;
  --lg-node-label-halo: rgba(255, 255, 255, 0.94);
  --lg-node-stroke: rgba(255, 255, 255, 0.85);
  --lg-node-stroke-selected: #1b2537;
  --lg-mark-bg: radial-gradient(60% 60% at 50% 40%, rgba(217, 155, 0, 0.18), rgba(217, 155, 0, 0.04));
  --lg-mark-border: rgba(154, 107, 0, 0.3);
  --lg-mark-glow: rgba(154, 107, 0, 0.35);
  --lg-ring: var(--lg-cyan);
}

.lg-root *, .lg-root *::before, .lg-root *::after { box-sizing: border-box; }
.lg-root ::selection { background: var(--lg-selection); }
.lg-root button, .lg-root input, .lg-root select, .lg-root a, .lg-root textarea { font: inherit; }
.lg-root :focus-visible { outline: 2px solid var(--lg-ring); outline-offset: 2px; }

/* ---------- scrollbars ---------- */
.lg-scroll { scrollbar-width: thin; scrollbar-color: var(--lg-scrollbar) transparent; }
.lg-scroll::-webkit-scrollbar { width: 9px; height: 9px; }
.lg-scroll::-webkit-scrollbar-track { background: transparent; }
.lg-scroll::-webkit-scrollbar-thumb { background: var(--lg-scrollbar); border-radius: 8px; }
.lg-scroll::-webkit-scrollbar-thumb:hover { background: var(--lg-scrollbar-hover); }
.lg-scroll-x { overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.lg-scroll-x::-webkit-scrollbar { height: 0; }

/* ---------- header / search ---------- */
.lg-header {
  position: relative;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
  padding: 10px 16px;
  border-bottom: 1px solid var(--lg-border);
  background: var(--lg-header-bg);
}
.lg-brand { display: flex; align-items: center; gap: 9px; flex: 0 0 auto; user-select: none; }
.lg-brand-mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 9px;
  color: var(--lg-accent);
  border: 1px solid var(--lg-mark-border);
  background: var(--lg-mark-bg);
  filter: drop-shadow(0 0 8px var(--lg-mark-glow));
}
.lg-brand-text { display: flex; flex-direction: column; line-height: 1.16; }
.lg-brand-name { font-weight: 700; letter-spacing: 0.5px; font-size: calc(15px * var(--lg-fs-scale)); }
.lg-brand-sub { font-size: calc(11px * var(--lg-fs-scale)); color: var(--lg-dim); letter-spacing: 0.4px; white-space: nowrap; }

.lg-search { position: relative; flex: 1 1 auto; max-width: 660px; min-width: 150px; }
.lg-search-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--lg-dim); pointer-events: none; display: inline-flex; }
.lg-search-input {
  width: 100%; height: 38px; padding: 0 96px 0 36px;
  border-radius: 999px;
  border: 1px solid var(--lg-input-border);
  background: var(--lg-input-bg);
  color: var(--lg-text);
  outline: none;
  appearance: none;
  transition: border-color 140ms ease, box-shadow 140ms ease, background 140ms ease;
}
.lg-search-input::-webkit-search-cancel-button { display: none; }
.lg-search-input::placeholder { color: var(--lg-dim); }
.lg-search-input:hover { border-color: var(--lg-border-strong); }
.lg-search-input:focus { border-color: var(--lg-cyan); box-shadow: 0 0 0 3px var(--lg-cyan-soft); background: var(--lg-input-bg-focus); }
.lg-search-clear {
  position: absolute; right: 9px; top: 50%; transform: translateY(-50%);
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border: 0; border-radius: 50%;
  background: var(--lg-clear-bg); color: var(--lg-muted); cursor: pointer;
}
.lg-search-clear:hover { background: var(--lg-clear-bg-hover); color: var(--lg-text); }
.lg-search-count { position: absolute; right: 37px; top: 50%; transform: translateY(-50%); font-size: calc(11px * var(--lg-fs-scale)); color: var(--lg-dim); pointer-events: none; white-space: nowrap; }
.lg-suggest {
  position: absolute; z-index: 40; left: 0; right: 0; top: calc(100% + 7px);
  border-radius: var(--lg-radius); overflow: hidden;
  border: 1px solid var(--lg-border-strong);
  background: var(--lg-panel-solid);
  box-shadow: 0 18px 44px var(--lg-shadow);
}
.lg-suggest-row {
  display: flex; align-items: baseline; gap: 8px; width: 100%;
  padding: 9px 12px; border: 0; background: transparent; color: var(--lg-text);
  text-align: left; cursor: pointer;
}
.lg-suggest-row:hover, .lg-suggest-row.is-active { background: var(--lg-cyan-soft); }
.lg-suggest-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: calc(13.5px * var(--lg-fs-scale)); }
.lg-suggest-meta { flex: 0 0 auto; font-size: calc(11px * var(--lg-fs-scale)); color: var(--lg-dim); white-space: nowrap; }

.lg-header-meta { display: flex; align-items: center; gap: 8px; margin-left: auto; flex: 0 0 auto; }
.lg-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 999px; font-size: calc(11px * var(--lg-fs-scale)); color: var(--lg-muted);
  border: 1px solid var(--lg-border); background: var(--lg-chip-bg); white-space: nowrap;
}
.lg-badge i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 6px currentColor; }
.lg-badge.is-online { color: var(--lg-success); border-color: var(--lg-success-border); }
.lg-badge.is-offline { color: var(--lg-warn); border-color: var(--lg-warn-border); }
.lg-meta-text { font-size: calc(12px * var(--lg-fs-scale)); color: var(--lg-dim); white-space: nowrap; }
.lg-icon-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 32px; min-width: 32px; min-height: 32px; padding: 0 9px;
  border: 1px solid var(--lg-border);
  border-radius: var(--lg-radius-sm);
  background: var(--lg-btn-bg); color: var(--lg-muted); cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.lg-icon-btn:hover { background: var(--lg-btn-bg-hover); color: var(--lg-text); border-color: var(--lg-border-strong); }
.lg-icon-btn:active { background: var(--lg-btn-bg-hover); }
.lg-theme-btn { gap: 7px; padding: 0 10px; }
.lg-theme-text { font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-muted); line-height: 1; }
.lg-theme-btn:hover .lg-theme-text { color: var(--lg-text); }
.lg-font-btn { gap: 4px; padding: 0 8px; }
.lg-font-glyph { font-size: calc(12px * var(--lg-fs-scale)); font-weight: 700; letter-spacing: 0.2px; line-height: 1; }
.lg-font-value { font-size: calc(10.5px * var(--lg-fs-scale)); color: var(--lg-dim); line-height: 1; }
.lg-font-btn:hover .lg-font-value { color: var(--lg-text); }
.lg-mobile-toggle { display: none; }

/* ---------- columns ---------- */
.lg-columns { position: relative; display: flex; flex: 1 1 auto; min-height: 0; }
.lg-col-detail {
  position: relative; display: flex; flex-direction: column; min-height: 0;
  width: var(--lg-detail-width); flex: 0 0 auto;
  border-right: 1px solid var(--lg-border);
  background: var(--lg-panel);
  z-index: 12;
}
.lg-col-center { position: relative; flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.lg-col-library {
  position: relative; display: flex; flex-direction: column; min-height: 0;
  width: var(--lg-library-width); flex: 0 0 auto;
  border-left: 1px solid var(--lg-border);
  background: var(--lg-panel);
  z-index: 12;
}

/* ---------- detail panel ---------- */
.lg-detail { height: 100%; overflow-y: auto; padding: 16px 16px 20px; display: flex; flex-direction: column; gap: 13px; }
.lg-detail-eyebrow { display: flex; align-items: center; gap: 8px; font-size: calc(11.5px * var(--lg-fs-scale)); letter-spacing: 0.9px; text-transform: uppercase; color: var(--lg-dim); }
.lg-detail-dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; box-shadow: 0 0 8px currentColor; }
.lg-detail-year { margin-left: auto; letter-spacing: normal; }
.lg-detail-title { margin: 0; font-size: calc(17px * var(--lg-fs-scale)); line-height: 1.35; font-weight: 650; color: var(--lg-text); }
.lg-detail-sub { font-size: calc(12.5px * var(--lg-fs-scale)); color: var(--lg-muted); line-height: 1.6; }
.lg-detail-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.lg-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 9px; border-radius: 999px; font-size: calc(11.5px * var(--lg-fs-scale));
  border: 1px solid var(--lg-border); background: var(--lg-chip-bg); color: var(--lg-muted);
  white-space: nowrap;
}
.lg-chip-cluster { background: var(--lg-chip-bg); }
.lg-chip-warn { color: var(--lg-warn); border-color: var(--lg-warn-border); background: var(--lg-warn-soft); }
.lg-chip-danger { color: var(--lg-danger); border-color: var(--lg-danger-border); background: var(--lg-danger-soft); }
.lg-detail-actions { display: flex; flex-wrap: wrap; gap: 7px; }
.lg-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 32px; min-height: 32px; padding: 0 12px; border-radius: var(--lg-radius-sm);
  border: 1px solid var(--lg-border);
  background: var(--lg-btn-bg); color: var(--lg-text); cursor: pointer;
  font-size: calc(13px * var(--lg-fs-scale)); text-decoration: none; white-space: nowrap;
  transition: background 120ms ease, border-color 120ms ease, transform 80ms ease;
}
.lg-btn:hover { background: var(--lg-btn-bg-hover); border-color: var(--lg-border-strong); }
.lg-btn:active { transform: translateY(1px); }
.lg-btn[disabled] { opacity: 0.42; cursor: not-allowed; transform: none; }
.lg-btn-primary { background: var(--lg-accent-soft); border-color: var(--lg-accent-border); color: var(--lg-accent-text); }
.lg-btn-primary:hover { background: var(--lg-accent-soft); filter: brightness(1.15); }
.lg-btn-danger { color: var(--lg-danger); border-color: var(--lg-danger-border); background: var(--lg-danger-soft); }
.lg-btn-danger:hover { background: var(--lg-danger-soft); filter: brightness(1.12); }
.lg-btn-ghost { background: transparent; }
.lg-btn-sm { height: 30px; min-height: 30px; padding: 0 10px; font-size: calc(12.5px * var(--lg-fs-scale)); }
.lg-detail-note {
  display: flex; align-items: flex-start; gap: 7px; padding: 9px 11px;
  border-radius: var(--lg-radius-sm); font-size: calc(12px * var(--lg-fs-scale)); line-height: 1.55;
  color: var(--lg-warn); background: var(--lg-warn-soft); border: 1px solid var(--lg-warn-border);
}
.lg-detail-section { display: flex; flex-direction: column; gap: 6px; }
.lg-detail-section h3 {
  margin: 0; display: flex; align-items: center; gap: 8px;
  font-size: calc(11.5px * var(--lg-fs-scale)); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--lg-dim);
}
.lg-detail-section h3::after { content: ''; flex: 1 1 auto; height: 1px; background: linear-gradient(90deg, var(--lg-border), transparent); }
.lg-detail-prose { margin: 0; font-size: calc(13.5px * var(--lg-fs-scale)); line-height: 1.65; color: var(--lg-muted); white-space: pre-wrap; overflow-wrap: anywhere; }
.lg-detail-bullets { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
.lg-detail-bullets li { font-size: calc(13.5px * var(--lg-fs-scale)); line-height: 1.65; color: var(--lg-muted); }
.lg-meta-grid { display: grid; grid-template-columns: auto 1fr; gap: 5px 12px; margin: 0; font-size: calc(12.5px * var(--lg-fs-scale)); }
.lg-meta-grid dt { color: var(--lg-dim); }
.lg-meta-grid dd { margin: 0; color: var(--lg-muted); text-align: right; overflow-wrap: anywhere; }
.lg-detail-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; height: 100%; padding: 24px 16px; text-align: center; }
.lg-detail-empty-title { color: var(--lg-muted); font-size: calc(14px * var(--lg-fs-scale)); }
.lg-detail-empty-hint { font-size: calc(12.5px * var(--lg-fs-scale)); line-height: 1.75; color: var(--lg-dim); max-width: 240px; }

/* ---------- skeleton ---------- */
.lg-skeleton {
  border-radius: var(--lg-radius-sm);
  background: linear-gradient(100deg, var(--lg-skeleton-lo) 20%, var(--lg-skeleton-hi) 42%, var(--lg-skeleton-lo) 64%);
  background-size: 240% 100%;
  animation: lg-shimmer 1.5s ease-in-out infinite;
}
@keyframes lg-shimmer { 0% { background-position: 140% 0; } 100% { background-position: -40% 0; } }
.lg-detail-skeleton { display: flex; flex-direction: column; gap: 10px; }
.lg-skeleton-eyebrow { width: 46%; height: 10px; }
.lg-skeleton-title { width: 96%; height: 17px; }
.lg-skeleton-title-short { width: 70%; }
.lg-skeleton-line { width: 100%; height: 12px; }
.lg-skeleton-line-short { width: 62%; }
.lg-skeleton-block { width: 100%; height: 104px; }
.lg-skeleton-row { height: 50px; margin-bottom: 4px; }

/* ---------- star map ---------- */
.lg-graph { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; touch-action: none; cursor: grab; background: var(--lg-graph-bg); }
.lg-graph-dragging { cursor: grabbing; }
.lg-graph-svg { position: absolute; inset: 0; display: block; }
.lg-graph-svg text { user-select: none; }
.lg-stars { pointer-events: none; }
.lg-star { fill: var(--lg-star); animation: lg-twinkle 7s ease-in-out infinite; }
.lg-nebula { pointer-events: none; opacity: var(--lg-nebula-opacity); mix-blend-mode: var(--lg-nebula-blend); filter: blur(38px); }
.lg-cluster-label {
  font-size: var(--lg-graph-cluster-size);
  font-weight: 650;
  letter-spacing: 1.4px;
  opacity: 0.82;
  paint-order: stroke;
  stroke: var(--lg-cluster-label-halo);
  stroke-width: 3px;
  stroke-linejoin: round;
  pointer-events: none;
}
.lg-cluster-captions { position: absolute; z-index: 2; inset: 0; overflow: hidden; pointer-events: none; }
.lg-cluster-caption {
  position: absolute;
  transform: translate(-50%, -100%);
  font-weight: 650;
  letter-spacing: 1.4px;
  opacity: 0.82;
  white-space: nowrap;
  paint-order: stroke;
  text-shadow: 0 0 10px var(--lg-cluster-label-halo), 0 0 4px var(--lg-cluster-label-halo);
}
.lg-galaxy-nebula {
  pointer-events: none;
  opacity: 0.14;
  mix-blend-mode: var(--lg-nebula-blend);
  filter: blur(64px);
}
.lg-galaxy-caption {
  position: absolute;
  transform: translate(-50%, -100%);
  font-weight: 700;
  letter-spacing: 2.4px;
  opacity: 0.8;
  white-space: nowrap;
  paint-order: stroke;
  text-shadow: 0 0 14px var(--lg-cluster-label-halo, rgba(4, 8, 18, 0.6)), 0 0 5px var(--lg-cluster-label-halo, rgba(4, 8, 18, 0.6));
}
.lg-edge { fill: none; pointer-events: none; transition: opacity 160ms ease; }
.lg-edge.is-active { filter: drop-shadow(0 0 4px currentColor); }
.lg-node { cursor: pointer; transition: opacity 160ms ease; }
.lg-node-match { opacity: 0.24; animation: lg-breathe 2.6s ease-in-out infinite; pointer-events: none; }
.lg-node-halo { pointer-events: none; }
.lg-node-dot { stroke: var(--lg-node-stroke); stroke-width: 0.8px; transition: r 120ms ease; }
.lg-node.is-selected .lg-node-dot { stroke: var(--lg-node-stroke-selected); stroke-width: 1.6px; }
.lg-node.is-processing .lg-node-dot { animation: lg-breathe 2s ease-in-out infinite; }
.lg-node-pulse { fill: none; transform-box: fill-box; transform-origin: center; animation: lg-pulse 2.2s ease-out infinite; }
.lg-node-label {
  pointer-events: none; fill: var(--lg-node-label); font-size: var(--lg-graph-label-size); opacity: 0.94;
  paint-order: stroke; stroke: var(--lg-node-label-halo); stroke-width: 3px; stroke-linejoin: round;
}
@keyframes lg-twinkle { 0%, 100% { opacity: 0.82; } 50% { opacity: 0.32; } }
@keyframes lg-pulse { 0% { transform: scale(1); opacity: 0.85; } 80% { transform: scale(2.3); opacity: 0; } 100% { transform: scale(2.3); opacity: 0; } }
@keyframes lg-breathe { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
@keyframes lg-fade-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }

.lg-hud { position: absolute; z-index: 5; top: 14px; right: 16px; display: flex; align-items: center; gap: 6px; padding: 4px; border-radius: var(--lg-radius); border: 1px solid var(--lg-border); background: var(--lg-hud-bg); }
.lg-hud-btn {
  height: 32px; min-height: 32px; padding: 0 11px; border-radius: var(--lg-radius-sm);
  border: 1px solid var(--lg-border); background: var(--lg-btn-bg); color: var(--lg-muted);
  font-size: calc(12.5px * var(--lg-fs-scale)); cursor: pointer; white-space: nowrap;
}
.lg-hud-btn:hover { color: var(--lg-text); border-color: var(--lg-border-strong); background: var(--lg-btn-bg-hover); }
.lg-legend {
  position: absolute; z-index: 4; left: 16px; bottom: 16px; max-width: 260px;
  display: flex; flex-wrap: wrap; gap: 4px 10px; padding: 9px 11px;
  border-radius: var(--lg-radius); border: 1px solid var(--lg-border);
  background: var(--lg-legend-bg);
}
.lg-legend-item { display: inline-flex; align-items: center; gap: 5px; font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-muted); white-space: nowrap; }
.lg-legend-item i { width: 7px; height: 7px; border-radius: 50%; box-shadow: 0 0 6px currentColor; }
.lg-tooltip {
  position: absolute; z-index: 30; max-width: 320px; pointer-events: none;
  display: flex; flex-direction: column; gap: 4px; padding: 10px 12px;
  border-radius: var(--lg-radius); border: 1px solid var(--lg-border-strong);
  background: var(--lg-tooltip-bg); box-shadow: 0 16px 38px var(--lg-shadow);
}
.lg-tooltip-title { font-size: calc(13.5px * var(--lg-fs-scale)); font-weight: 650; line-height: 1.4; color: var(--lg-text); }
.lg-tooltip-meta { display: flex; flex-wrap: wrap; gap: 7px; font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-dim); }
.lg-tooltip-tags { font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-muted); }
.lg-graph-empty {
  position: absolute; inset: 0; z-index: 6; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 10px; text-align: center; padding: 28px;
}
.lg-graph-empty-title { font-size: calc(18px * var(--lg-fs-scale)); font-weight: 650; letter-spacing: 0.5px; }
.lg-graph-empty-hint { max-width: 440px; font-size: calc(13px * var(--lg-fs-scale)); line-height: 1.8; color: var(--lg-muted); }
.lg-graph-loading { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; font-size: calc(13px * var(--lg-fs-scale)); color: var(--lg-dim); }
.lg-spinner { width: 28px; height: 28px; border-radius: 50%; border: 2px solid var(--lg-cyan-soft); border-top-color: var(--lg-cyan); animation: lg-spin 0.9s linear infinite; }
@keyframes lg-spin { to { transform: rotate(360deg); } }
.lg-graph-error { position: absolute; z-index: 20; top: 58px; left: 50%; transform: translateX(-50%); padding: 9px 13px; border-radius: var(--lg-radius); border: 1px solid var(--lg-danger-border); background: var(--lg-error-bg); color: var(--lg-danger); font-size: calc(13px * var(--lg-fs-scale)); max-width: 90%; }
.lg-graph-retry { position: absolute; z-index: 21; top: 104px; left: 50%; transform: translateX(-50%); }
.lg-search-empty {
  position: absolute; z-index: 18; left: 50%; bottom: 18px; transform: translateX(-50%);
  padding: 7px 13px; border-radius: 999px; font-size: calc(12.5px * var(--lg-fs-scale)); color: var(--lg-warn);
  border: 1px solid var(--lg-warn-border); background: var(--lg-warn-bg);
  white-space: nowrap; max-width: calc(100% - 28px); overflow: hidden; text-overflow: ellipsis;
}

/* ---------- drop overlay ---------- */
.lg-drop-overlay {
  position: absolute; inset: 10px; z-index: 45; display: flex; align-items: center; justify-content: center;
  border-radius: var(--lg-radius-lg);
  border: 1.5px dashed var(--lg-cyan-border);
  background: var(--lg-drop-bg);
  pointer-events: none;
  animation: lg-fade-in 120ms ease-out;
}
.lg-drop-card {
  display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 24px 32px;
  border-radius: var(--lg-radius-lg); border: 1px solid var(--lg-cyan-border);
  background: var(--lg-drop-card-bg); box-shadow: 0 24px 60px var(--lg-shadow-strong);
}
.lg-drop-title { font-size: calc(16px * var(--lg-fs-scale)); font-weight: 650; color: var(--lg-cyan); letter-spacing: 0.5px; }
.lg-drop-hint { font-size: calc(12.5px * var(--lg-fs-scale)); color: var(--lg-muted); }
.lg-file-input { display: none; }
.lg-footer-hint {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 6px 16px; flex: 0 0 auto;
  border-top: 1px solid var(--lg-border);
  font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-dim);
  background: var(--lg-panel);
}

/* ---------- jobs + toasts ---------- */
.lg-toast-stack { position: absolute; z-index: 50; right: 16px; bottom: 46px; display: flex; flex-direction: column; gap: 8px; width: min(380px, calc(100% - 32px)); pointer-events: none; }
.lg-toast {
  display: flex; align-items: flex-start; gap: 9px; padding: 11px 13px;
  border-radius: var(--lg-radius); border: 1px solid var(--lg-border-strong);
  background: var(--lg-toast-bg); box-shadow: 0 16px 40px var(--lg-shadow);
  font-size: calc(13px * var(--lg-fs-scale)); pointer-events: auto; animation: lg-toast-in 160ms ease-out;
}
@keyframes lg-toast-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
.lg-toast[data-kind='success'] { border-color: var(--lg-success-border); }
.lg-toast[data-kind='error'] { border-color: var(--lg-danger-border); }
.lg-toast-icon { flex: 0 0 auto; margin-top: 1px; color: var(--lg-cyan); }
.lg-toast[data-kind='success'] .lg-toast-icon { color: var(--lg-success); }
.lg-toast[data-kind='error'] .lg-toast-icon { color: var(--lg-danger); }
.lg-toast-text { flex: 1 1 auto; min-width: 0; color: var(--lg-text); line-height: 1.55; overflow-wrap: anywhere; }
.lg-toast-close { flex: 0 0 auto; border: 0; background: transparent; color: var(--lg-dim); cursor: pointer; padding: 0 2px; display: inline-flex; }
.lg-toast-close:hover { color: var(--lg-text); }
.lg-job {
  display: flex; flex-direction: column; gap: 6px; padding: 11px 13px;
  border-radius: var(--lg-radius); border: 1px solid var(--lg-border-strong);
  background: var(--lg-toast-bg); box-shadow: 0 16px 40px var(--lg-shadow);
  pointer-events: auto; animation: lg-fade-in 140ms ease-out;
}
.lg-job-head { display: flex; align-items: center; gap: 8px; font-size: calc(13px * var(--lg-fs-scale)); }
.lg-job-title { flex: 1 1 auto; color: var(--lg-text); }
.lg-job-value { flex: 0 0 auto; font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-cyan); }
.lg-job-message { font-size: calc(12px * var(--lg-fs-scale)); color: var(--lg-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lg-job-track { height: 5px; border-radius: 4px; background: var(--lg-clear-bg); overflow: hidden; }
.lg-job-bar { height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--lg-cyan), var(--lg-accent)); transition: width 300ms ease; }
.lg-job[data-state='done'] .lg-job-title { color: var(--lg-success); }
.lg-job[data-state='done'] .lg-job-bar { background: linear-gradient(90deg, var(--lg-success), var(--lg-cyan)); }
.lg-job[data-state='failed'] { border-color: var(--lg-danger-border); }
.lg-job[data-state='failed'] .lg-job-title { color: var(--lg-danger); }

/* ---------- library ---------- */
.lg-library { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.lg-library-head { display: flex; align-items: center; gap: 8px; padding: 12px 13px 10px; border-bottom: 1px solid var(--lg-border); flex: 0 0 auto; }
.lg-library-title { font-size: calc(14px * var(--lg-fs-scale)); font-weight: 650; letter-spacing: 0.4px; }
.lg-library-sub { font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-dim); margin-top: 1px; }
.lg-library-head .lg-btn { margin-left: auto; flex: 0 0 auto; }
.lg-library-toolbar { display: flex; align-items: center; gap: 6px; padding: 9px 13px 0; flex: 0 0 auto; }
.lg-select-wrap { flex: 1 1 auto; min-width: 0; display: flex; }
.lg-select {
  width: 100%; height: 32px; min-height: 32px; padding: 0 9px;
  border-radius: var(--lg-radius-sm); border: 1px solid var(--lg-input-border);
  background: var(--lg-input-bg); color: var(--lg-text); outline: none; cursor: pointer;
}
.lg-select:hover { border-color: var(--lg-border-strong); }
.lg-select:focus { border-color: var(--lg-cyan); box-shadow: 0 0 0 3px var(--lg-cyan-soft); }
.lg-order-btn { width: 32px; height: 32px; min-width: 32px; padding: 0; }
.lg-filter-row { display: flex; flex-wrap: wrap; gap: 5px; padding: 9px 13px; flex: 0 0 auto; }
.lg-filter-row.lg-scroll-x {
  flex-wrap: nowrap; cursor: grab; overscroll-behavior-x: contain;
  scrollbar-width: thin; scrollbar-color: var(--lg-border-strong) transparent;
}
.lg-filter-row.lg-scroll-x::-webkit-scrollbar { height: 6px; }
.lg-filter-row.lg-scroll-x::-webkit-scrollbar-track { background: transparent; }
.lg-filter-row.lg-scroll-x::-webkit-scrollbar-thumb { background: var(--lg-border); border-radius: 999px; }
.lg-filter-row.lg-scroll-x::-webkit-scrollbar-thumb:hover { background: var(--lg-border-strong); }
.lg-filter-chip {
  border: 1px solid var(--lg-border); background: var(--lg-chip-bg); color: var(--lg-muted);
  border-radius: 999px; padding: 3px 9px; font-size: calc(11.5px * var(--lg-fs-scale)); cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; flex: 0 0 auto;
}
.lg-filter-chip:hover { color: var(--lg-text); border-color: var(--lg-border-strong); }
.lg-filter-chip.is-active { color: var(--lg-text); border-color: var(--lg-cyan); background: var(--lg-cyan-soft); }
.lg-filter-chip i { width: 6px; height: 6px; border-radius: 50%; box-shadow: 0 0 5px currentColor; }
.lg-paper-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 2px 9px 9px; display: flex; flex-direction: column; gap: 3px; }
.lg-select-bar {
  display: flex; align-items: center; gap: 8px; padding: 0 13px 8px; flex: 0 0 auto;
  font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-muted);
}
.lg-check { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; user-select: none; white-space: nowrap; }
.lg-check input { width: 13px; height: 13px; margin: 0; accent-color: var(--lg-accent); cursor: pointer; }
.lg-select-all-btn {
  border: none; background: none; padding: 0; font: inherit; color: var(--lg-cyan);
  cursor: pointer; white-space: nowrap; text-decoration: underline dotted; text-underline-offset: 2px;
}
.lg-select-all-btn:disabled { opacity: 0.5; cursor: default; }
.lg-select-gap { flex: 1 1 auto; }
.lg-select-count { color: var(--lg-text); font-weight: 600; white-space: nowrap; }
.lg-select-hint { opacity: 0.6; white-space: nowrap; }
.lg-row-check { width: 13px; height: 13px; margin: 3px 0 0; flex: 0 0 auto; accent-color: var(--lg-accent); cursor: pointer; }
.lg-paper-row {
  display: flex; align-items: flex-start; gap: 7px; width: 100%;
  padding: 9px 10px; border-radius: var(--lg-radius-sm);
  border: 1px solid transparent; background: transparent; color: var(--lg-text);
  text-align: left; cursor: pointer;
  transition: background 110ms ease, border-color 110ms ease;
}
.lg-paper-row:hover { background: var(--lg-hover); }
.lg-paper-row.is-selected { background: var(--lg-selected-bg); border-color: var(--lg-selected-border); }
.lg-paper-dot { flex: 0 0 auto; width: 7px; height: 7px; margin-top: 6px; border-radius: 50%; background: var(--lg-dim); }
.lg-paper-dot.is-processing { animation: lg-breathe 1.4s ease-in-out infinite; }
.lg-paper-dot[data-status='failed'] { background: var(--lg-danger); box-shadow: 0 0 6px var(--lg-danger); }
.lg-paper-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.lg-paper-title { font-size: calc(15px * var(--lg-fs-scale)); line-height: 1.35; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.lg-paper-meta { display: flex; align-items: center; gap: 6px; font-size: calc(12.5px * var(--lg-fs-scale)); color: var(--lg-dim); white-space: nowrap; overflow: hidden; }
.lg-paper-meta > span { overflow: hidden; text-overflow: ellipsis; }
.lg-paper-cat { color: var(--lg-muted); }
.lg-paper-status.is-failed { color: var(--lg-danger); }
.lg-paper-status.is-processing { color: var(--lg-warn); }
.lg-library-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 34px 18px; text-align: center; color: var(--lg-dim); font-size: calc(13px * var(--lg-fs-scale)); }
.lg-library-empty-hint { font-size: calc(12px * var(--lg-fs-scale)); line-height: 1.7; max-width: 250px; }
.lg-pagination { display: flex; align-items: center; gap: 3px; justify-content: center; flex-wrap: wrap; padding: 9px; border-top: 1px solid var(--lg-border); flex: 0 0 auto; }
.lg-page-btn {
  min-width: 28px; height: 28px; padding: 0 6px; border-radius: 6px;
  border: 1px solid transparent; background: transparent; color: var(--lg-muted);
  font-size: calc(12.5px * var(--lg-fs-scale)); cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
}
.lg-page-btn:hover { background: var(--lg-hover); color: var(--lg-text); }
.lg-page-btn.is-active { border-color: var(--lg-cyan-border); background: var(--lg-cyan-soft); color: var(--lg-text); }
.lg-page-btn[disabled] { opacity: 0.35; cursor: not-allowed; }
.lg-page-info { margin: 0 4px; font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-dim); white-space: nowrap; }

/* sidebar entry glyph */
.lg-panel-icon { color: inherit; display: inline-flex; align-items: center; justify-content: center; }
.lg-panel-icon.is-active { color: var(--lg-accent, #ffd166); }

/* ---------- compact main-column layouts (shell may dock both sidebars) ---------- */
@container (max-width: 1080px) {
  .lg-col-detail { display: none; }
  .lg-col-detail.is-open {
    display: flex; position: absolute; left: 0; top: 0; bottom: 0;
    width: min(340px, 88%); box-shadow: 24px 0 60px var(--lg-shadow-strong);
  }
  .lg-mobile-toggle { display: inline-flex; }
}
@container (max-width: 900px) {
  .lg-col-library { display: none; }
  .lg-col-library.is-open {
    display: flex; position: absolute; right: 0; top: 0; bottom: 0;
    width: min(360px, 92%); box-shadow: -24px 0 60px var(--lg-shadow-strong);
  }
  .lg-header-meta .lg-badge, .lg-meta-text { display: none; }
  .lg-theme-text { display: none; }
  .lg-theme-btn { width: 32px; min-width: 32px; padding: 0; }
}
@container (max-width: 680px) {
  .lg-brand-sub { display: none; }
  .lg-legend { display: none; }
  .lg-footer-hint { display: none; }
  .lg-font-btn { display: none; }
}
`

let styleElement: HTMLStyleElement | null = null

/** Inject the plugin stylesheet once; returns a disposer that removes it. */
export function ensureStyles(): () => void {
  if (typeof document === 'undefined' || !document.head) return () => {}
  if (typeof document.getElementById === 'function' && document.getElementById(STYLE_ID)) {
    return () => {}
  }
  const element = document.createElement('style')
  element.id = STYLE_ID
  element.setAttribute('data-plugin', 'dsh-litgraph')
  element.textContent = CSS
  document.head.appendChild(element)
  styleElement = element
  return () => {
    if (styleElement === element && element.parentNode) element.parentNode.removeChild(element)
    if (styleElement === element) styleElement = null
  }
}
