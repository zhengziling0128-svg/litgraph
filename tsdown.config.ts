import { createRequire } from 'node:module'
import { defineConfig } from 'tsdown'

/** package version, baked into both halves so the UI can show what is running. */
const require = createRequire(import.meta.url)
const VERSION: string = require('./package.json').version

/**
 * dsh-litgraph build (preset mirrored from the shell's own dsh-web-ui client preset,
 * via @dsh-external/dsh-client-ui-skin-maid-atelier/build/tsdown.client.ts).
 *
 * Two halves in one package:
 *  - lib/index.js   ESM, platform node  -> host-half cordis entry (package "." export)
 *  - lib/client.js  CJS factory, browser -> web client bundle (package "./client" export)
 */
const ID = 'dsh-litgraph'

/** The shell's frozen module table: these specifiers stay external and are resolved by
 *  window.__ModuleLoader__'s injected require() at materialisation time. */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
] as const

const RUNTIME_STORE_EXEMPTION = '@deepseek-ai/dsh-client-runtime/client'
const CLIENT_EXTERNALS: string[] = [...PLATFORM_MODULES, RUNTIME_STORE_EXEMPTION]
const MODE = process.env.NODE_ENV ?? 'production'

export default defineConfig([
  {
    name: ID + '/node',
    entry: { index: 'src/host/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    // Native / WASM helpers stay external: they are resolved at runtime from
    // plugin/node_modules (sql.js for Zotero's zotero.sqlite, @napi-rs/canvas for
    // rendering scanned PDF pages to images before Windows OCR).
    external: ['@deepseek-ai/cordis', '@napi-rs/canvas', 'sql.js'],
    // Build stamp: surfaced via /api/litgraph/status so the running host can be
    // matched against the stamped file name in the profile patch.
    define: {
      __LITGRAPH_BUILD__: JSON.stringify(new Date().toISOString()),
      __LITGRAPH_VERSION__: JSON.stringify(VERSION),
    },
    // unpdf (pdf text extraction) is bundled into lib/index.js so the installed
    // plugin is self-contained and needs no runtime node_modules resolution.
    deps: { alwaysBundle: ['unpdf'] },
  },
  {
    name: ID + '/client',
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    define: {
      __LITGRAPH_VERSION__: JSON.stringify(VERSION),
      'process.env.NODE_ENV': JSON.stringify(MODE),
      'import.meta.env.MODE': JSON.stringify(MODE),
      'import.meta.env': JSON.stringify({ MODE }),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
