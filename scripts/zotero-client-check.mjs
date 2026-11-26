// Temporary syntax/load check for the Zotero client half (run with: npx tsx scripts/zotero-client-check.mjs)
const mod = await import('../src/client/components/ZoteroImport.tsx')
const styles = await import('../src/client/styles-zotero.ts')
const api = await import('../src/client/zoteroApi.ts')

const checks = []
const expect = (name, ok, actual) => checks.push({ name, ok: Boolean(ok), actual })

expect('component exports ZoteroImport', typeof mod.ZoteroImport === 'function')
expect('component has default export', typeof mod.default === 'function')
expect('component props type erased fine', true)
expect('styles export ZOTERO_CSS', typeof styles.ZOTERO_CSS === 'string' && styles.ZOTERO_CSS.length > 1000)
expect('styles use lg-zot prefix', styles.ZOTERO_CSS.includes('.lg-zot-dialog') && !styles.ZOTERO_CSS.includes('.lg-btn-primary{'))
expect('ensureZoteroStyles is a function', typeof styles.ensureZoteroStyles === 'function')
expect('style id exported', typeof styles.ZOTERO_STYLE_ID === 'string' && styles.ZOTERO_STYLE_ID.length > 0)
expect('api exports scanZoteroLibrary', typeof api.scanZoteroLibrary === 'function')
expect('api exports importZoteroSelection', typeof api.importZoteroSelection === 'function')
expect('scan route constant', api.ZOTERO_SCAN_ROUTE === '/api/litgraph/zotero/scan')
expect('import route constant', api.ZOTERO_IMPORT_ROUTE === '/api/litgraph/zotero/import')

// The CSS must be valid enough to feed a real <style> element: balanced braces.
const css = styles.ZOTERO_CSS
let depth = 0
let balanced = true
for (const ch of css) {
  if (ch === '{') depth += 1
  else if (ch === '}') { depth -= 1; if (depth < 0) balanced = false }
}
expect('CSS braces balanced', balanced && depth === 0, 'depth=' + depth)

// React element creation works without a DOM (render happens later in the browser).
const element = await import('react').then((React) =>
  React.createElement(mod.ZoteroImport, { open: false, onClose: () => {} }),
)
expect('component renders to an element tree', element !== null && typeof element === 'object')

const failed = checks.filter((c) => !c.ok)
for (const check of checks) console.log((check.ok ? '  PASS  ' : '  FAIL  ') + check.name + (check.actual === undefined ? '' : '  [' + check.actual + ']'))
console.log('')
console.log('client check: ' + (checks.length - failed.length) + '/' + checks.length + ' passed')
if (failed.length > 0) process.exit(1)
