#!/usr/bin/env node
/**
 * Zotero integration probe (task-8).
 *
 * Proves, against the REAL Zotero 7 library on this machine, that LitGraph can:
 *   1. read the raw zotero.sqlite schema/rows through sql.js without touching the
 *      live data directory (private temp copy only);
 *   2. scan the library into ZoteroItemSummary records (SQLite fallback after the
 *      local API answers HTTP 403) with title/authors/year/venue/DOI/collection/PDF;
 *   3. resolve "storage:" attachments to real PDF bytes and report missing files;
 *   4. read the local API correctly when it is available (mock server) and fall
 *      back to SQLite when it errors (mock 500);
 *   5. import records end-to-end through the ZoteroDeps contract, both as PDF
 *      (importFile sees the exact original bytes) and as metadata-only records,
 *      including the PDF -> metadata fallback for items without an attachment;
 *   6. leave the real Zotero data directory byte-for-byte untouched and leak no
 *      temp directories.
 *
 * Run from the plugin directory:   node scripts/zotero-probe.mjs
 * Optional env: LITGRAPH_ZOTERO_DATA_DIR (default %USERPROFILE%\Zotero)
 * Exit code 0 = all checks passed, 1 = at least one failed / unexpected exception.
 *
 * Everything written by this script goes to a mkdtemp dir under the OS temp dir and
 * is deleted at the end. The real library is only read/copied out of.
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  importZoteroSelection,
  invalidateZoteroScanCache,
  parseZoteroYear,
  scanZoteroLibrary,
  ZoteroScanError,
} from '../src/host/zotero.ts'

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REAL_ZOTERO_DIR =
  process.env.LITGRAPH_ZOTERO_DATA_DIR || join(homedir(), 'Zotero')
const RECON_COPY = join(PLUGIN_ROOT, '.probe', 'zotero-copy.sqlite')
const TMPDIR = tmpdir()
const TMP_PREFIXES = ['litgraph-zotero-', 'litgraph-zotero-import-']
const EXPECTED_KEY = '9ZDZWV5H'
const EXPECTED_TITLE = 'An improved approach for automatic process plan generation of complex borings'
const EXPECTED_PDF_SIZE = 1498541

const checks = []
const tempDirs = []

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function expect(name, condition, detail) {
  const ok = Boolean(condition)
  checks.push({ name, ok, detail: detail === undefined ? '' : String(detail) })
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail === undefined || detail === '' ? '' : '  [' + detail + ']'))
  return ok
}

function section(title) {
  console.log('\n=== ' + title + ' ===')
}

function truncate(text, max) {
  const value = String(text === undefined || text === null ? '' : text)
  return value.length <= max ? value : value.slice(0, max) + '...'
}

async function statQuiet(path) {
  try {
    return await stat(path)
  } catch {
    return null
  }
}

async function loadSqlJs() {
  const require = createRequire(import.meta.url)
  const mainPath = require.resolve('sql.js')
  const wasmPath = join(dirname(mainPath), 'sql-wasm.wasm')
  const wasmBinary = new Uint8Array(await readFile(wasmPath))
  const moduleValue = await import('sql.js')
  const factory = typeof moduleValue.default === 'function' ? moduleValue.default : moduleValue
  return await factory({ wasmBinary })
}

async function listTmpLeftovers() {
  const entries = await readdir(TMPDIR)
  return entries.filter(
    (name) => !name.startsWith('litgraph-zotero-probe-') && TMP_PREFIXES.some((prefix) => name.startsWith(prefix)),
  )
}

/** Read-only inventory of the real Zotero data dir: relative path -> size. */
async function snapshotDataDir(root) {
  const map = new Map()
  async function walk(dir, relative) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const absolute = join(dir, entry.name)
      const path = relative === '' ? entry.name : relative + '/' + entry.name
      if (entry.isDirectory()) await walk(absolute, path)
      else if (entry.isFile()) {
        const info = await statQuiet(absolute)
        map.set(path, info === null ? 'missing' : String(info.size))
      } else map.set(path, 'other')
    }
  }
  await walk(root, '')
  return map
}

function compareSnapshots(before, after) {
  const differences = []
  for (const [path, size] of before) {
    if (!after.has(path)) differences.push('removed:' + path)
    else if (after.get(path) !== size) differences.push('changed:' + path + ' ' + size + '->' + after.get(path))
  }
  for (const path of after.keys()) if (!before.has(path)) differences.push('added:' + path)
  return differences
}

async function mirrorDataDir(sourceDir, label) {
  const target = await mkdtemp(join(TMPDIR, 'litgraph-zotero-probe-' + label + '-'))
  await copyFile(join(sourceDir, 'zotero.sqlite'), join(target, 'zotero.sqlite'))
  if (existsSync(join(sourceDir, 'storage'))) {
    await cp(join(sourceDir, 'storage'), join(target, 'storage'), { recursive: true })
  }
  return target
}

function rawInventory(db) {
  const exec = (sql) => {
    const result = db.exec(sql)
    if (result.length === 0) return { columns: [], values: [] }
    return result[0]
  }
  const typeResult = exec('SELECT itemID, itemTypeID, key FROM items ORDER BY itemID')
  const typeNames = new Map()
  const typesResult = exec('SELECT itemTypeID, typeName FROM itemTypes')
  for (const row of typesResult.values) typeNames.set(row[0], row[1])
  const items = typeResult.values.map((row) => ({
    itemID: row[0],
    itemType: typeNames.get(row[1]) || '?',
    key: row[2],
  }))
  const titleResult = exec(
    "SELECT itemID, value FROM itemData JOIN itemDataValues ON itemData.valueID = itemDataValues.valueID WHERE fieldID = 1",
  )
  const titles = new Map()
  for (const row of titleResult.values) titles.set(row[0], row[1])
  const attachmentResult = exec(
    'SELECT itemID, parentItemID, linkMode, contentType, path FROM itemAttachments',
  )
  const attachments = attachmentResult.values.map((row) => ({
    itemID: row[0],
    parentItemID: row[1],
    linkMode: row[2],
    contentType: row[3],
    path: row[4],
  }))
  const collectionResult = exec('SELECT collectionID, collectionName FROM collections')
  const collections = collectionResult.values.map((row) => ({ collectionID: row[0], name: row[1] }))
  const collectionItemsResult = exec('SELECT collectionID, itemID FROM collectionItems')
  const collectionItems = collectionItemsResult.values.map((row) => ({ collectionID: row[0], itemID: row[1] }))
  return {
    items: items.map((item) => ({ ...item, title: titles.get(item.itemID) || '' })),
    attachments,
    collections,
    collectionItems,
  }
}

function mockItem(key, itemType, data) {
  return { key, version: 1, library: { type: 'user', id: 1 }, data: { key, itemType, ...data } }
}

async function startMockZoteroApi(payload) {
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    const send = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    if (url.pathname === '/api/users/0/items') {
      const itemType = url.searchParams.get('itemType')
      const list = itemType === 'attachment' ? payload.attachments : payload.items
      send(200, list.slice(0, 100))
      return
    }
    if (url.pathname === '/api/users/0/collections') {
      send(200, payload.collections)
      return
    }
    send(404, { error: 'not found' })
  })
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  const base = 'http://127.0.0.1:' + address.port
  return {
    base,
    close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
  }
}

async function startBrokenApi() {
  const server = createServer((request, response) => {
    response.writeHead(500, { 'Content-Type': 'text/plain' })
    response.end('mock local API failure')
  })
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  return {
    base: 'http://127.0.0.1:' + address.port,
    close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
  }
}

function findItem(items, key) {
  return items.find((item) => item.key === key)
}

/** Read extensions.zotero.dataDir from the real Zotero profile (Zotero 7 uses a custom prefs.js dir). */
async function readZoteroPrefDataDir() {
  const appData = process.env.APPDATA
  if (appData === undefined || appData === '') return null
  const profilesRoot = join(appData, 'Zotero', 'Zotero', 'Profiles')
  let entries = []
  try {
    entries = await readdir(profilesRoot)
  } catch {
    return null
  }
  for (const entry of entries) {
    try {
      const content = await readFile(join(profilesRoot, entry, 'prefs.js'), 'utf8')
      const match = /user_pref\(\s*"extensions\.zotero\.dataDir"\s*,\s*("(?:[^"\\]|\\.)*")\s*\)/.exec(content)
      if (match === null) continue
      const value = JSON.parse(match[1])
      if (typeof value === 'string' && value.trim() !== '') return value
    } catch {
      // Try the next profile.
    }
  }
  return null
}

async function main() {
  const startedAt = Date.now()
  console.log('LitGraph · Zotero probe')
  console.log('plugin root : ' + PLUGIN_ROOT)
  console.log('reference lib: ' + REAL_ZOTERO_DIR)
  console.log('tmp dir     : ' + TMPDIR)
  const prefDataDir = await readZoteroPrefDataDir()
  console.log('prefs dataDir: ' + (prefDataDir === null ? '(not configured)' : prefDataDir))

  if (!existsSync(join(REAL_ZOTERO_DIR, 'zotero.sqlite'))) {
    throw new Error('real Zotero library not found: ' + REAL_ZOTERO_DIR)
  }
  const leftoverBefore = new Set(await listTmpLeftovers())
  console.log('tmp leftovers before: ' + (leftoverBefore.size === 0 ? 'none' : [...leftoverBefore].join(', ')))
  const mainTempDir = await mkdtemp(join(TMPDIR, 'litgraph-zotero-probe-main-'))
  tempDirs.push(mainTempDir)

  const realSqlitePath = join(REAL_ZOTERO_DIR, 'zotero.sqlite')
  const realSqliteBytes = await readFile(realSqlitePath)
  const realSqliteSha = sha256(realSqliteBytes)
  const beforeSnapshot = await snapshotDataDir(REAL_ZOTERO_DIR)
  const liveDbPath =
    prefDataDir !== null && existsSync(join(prefDataDir, 'zotero.sqlite')) ? join(prefDataDir, 'zotero.sqlite') : null
  const liveDbBefore = liveDbPath === null ? null : await statQuiet(liveDbPath)

  /* ---------------------------------------------------------------------- */
  section('1. sql.js loads and the task reference zotero.sqlite is readable (copy only)')

  const SQL = await loadSqlJs()
  expect('sql.js wasm loads from plugin node_modules', typeof SQL.Database === 'function')

  const rawTempCopy = join(mainTempDir, 'raw-copy.sqlite')
  await copyFile(realSqlitePath, rawTempCopy)
  const rawDb = new SQL.Database(new Uint8Array(await readFile(rawTempCopy)))
  const inventory = rawInventory(rawDb)
  rawDb.close()
  console.log('  raw items:')
  for (const item of inventory.items) {
    console.log('    #' + item.itemID + '  ' + item.key + '  ' + item.itemType + '  ' + truncate(item.title, 90))
  }
  console.log('  raw attachments: ' + JSON.stringify(inventory.attachments))
  console.log('  raw collections: ' + JSON.stringify(inventory.collections))
  console.log('  raw collectionItems: ' + JSON.stringify(inventory.collectionItems))
  expect('reference library has exactly 4 raw items', inventory.items.length === 4, inventory.items.length + ' items')
  expect('real library contains the expected journalArticle key', findItem(inventory.items, EXPECTED_KEY) !== undefined, EXPECTED_KEY)
  expect(
    'real library has exactly one PDF attachment row',
    inventory.attachments.length === 1 && /^application\/pdf/.test(inventory.attachments[0].contentType),
    inventory.attachments.length + ' row(s)',
  )
  expect(
    'real library has the 智能加工 collection mapped to the article',
    inventory.collections.some((collection) => collection.name === '智能加工') &&
      inventory.collectionItems.length === 1,
    JSON.stringify(inventory.collections),
  )

  /* ---------------------------------------------------------------------- */
  section('2. local API reachability + SQLite fallback scan of the real library')

  let localApiEnabled = false
  try {
    const ping = await fetch('http://127.0.0.1:23119/api/users/0/items?limit=1&format=json', {
      headers: { 'Zotero-API-Version': '3' },
      signal: AbortSignal.timeout(2000),
    })
    if (ping.status === 200) localApiEnabled = true
    console.log('  local API status: HTTP ' + ping.status)
  } catch (error) {
    console.log('  local API unreachable: ' + error.message)
  }

  const liveScan = await scanZoteroLibrary()
  console.log('  live scan source: ' + liveScan.source + '  dataDir: ' + liveScan.dataDir)
  console.log('  live scan warnings: ' + JSON.stringify(liveScan.warnings))
  console.log('  live scan items: ' + liveScan.items.length + ' (notes/attachments/software are intentionally skipped)')
  for (const item of liveScan.items.slice(0, 6)) {
    console.log(
      '    - ' + item.key + ' | ' + item.itemType + ' | ' + truncate(item.title, 62) + ' | year=' + item.year + (item.attachment === null ? ' | 无PDF' : ' | PDF'),
    )
  }
  const liveResolved = liveScan.items.filter((item) => item.attachment !== null && item.attachment.path !== '')
  const liveMissing = liveScan.items.filter((item) => item.attachment !== null && item.attachment.path === '')
  const liveBrokenPaths = liveResolved.filter((item) => !existsSync(item.attachment.path))
  console.log('  live scan attachments: ' + liveResolved.length + ' resolved, ' + liveMissing.length + ' missing on disk')
  expect('live scan resolves the data dir from the Zotero profile prefs', prefDataDir === null || resolve(liveScan.dataDir) === resolve(prefDataDir), liveScan.dataDir)
  expect('live scan falls back to zotero.sqlite when the local API is disabled', localApiEnabled || liveScan.source === 'sqlite', liveScan.source)
  expect('live scan returns importable paper records', liveScan.items.length >= 4, liveScan.items.length + ' item(s)')
  expect('live scan resolves every PDF attachment to an existing file', liveBrokenPaths.length === 0, liveBrokenPaths.length + ' broken path(s)')
  expect(
    'live scan warns about skipped non-paper items',
    liveScan.warnings.some((warning) => warning.indexOf('非论文型') >= 0),
    truncate(liveScan.warnings.join(' | '), 140),
  )
  if (!localApiEnabled) {
    expect(
      'fallback is explained in warnings (local API disabled)',
      liveScan.warnings.some((warning) => /403|本地 API|没有开启/.test(warning)),
      truncate(liveScan.warnings.join(' | '), 160),
    )
  } else {
    console.log('  NOTE: Zotero local API is enabled on this machine; SQLite-fallback assertions are skipped')
  }
  if (existsSync(join(liveScan.dataDir, 'zotero.sqlite-wal'))) {
    expect(
      'live scan warns that WAL content may be missing from the copy',
      liveScan.warnings.some((warning) => warning.indexOf('WAL') >= 0),
      truncate(liveScan.warnings.join(' | '), 140),
    )
  }

  /* ---------------------------------------------------------------------- */
  section('2b. scan the task reference library (4 raw items) through explicit dataDir')

  const realScan = await scanZoteroLibrary({ dataDir: REAL_ZOTERO_DIR, preferLocalApi: false })
  console.log('  reference scan source: ' + realScan.source + '  dataDir: ' + realScan.dataDir)
  console.log('  reference scan warnings: ' + JSON.stringify(realScan.warnings))
  console.log('  reference scan items: ' + realScan.items.length)
  expect('reference scan returns exactly one paper record', realScan.items.length === 1, realScan.items.length + ' item(s)')
  const article = findItem(realScan.items, EXPECTED_KEY)
  expect('reference article key is present', article !== undefined, EXPECTED_KEY)
  if (article !== undefined) {
    console.log('  parsed article JSON:')
    console.log('    ' + truncate(JSON.stringify(article), 1600))
    expect('title parsed exactly', article.title === EXPECTED_TITLE, truncate(article.title, 60))
    expect(
      'authors parsed in order (4 names)',
      article.creators.length === 4 &&
        article.creators[0] === 'Alain Etienne' &&
        article.creators[3] === 'Patrick Martin',
      article.creators.join(' / '),
    )
    expect('year parsed from Zotero 7 multipart date', article.year === 2006, String(article.year))
    expect('venue parsed (Zotero 7 multipart date)', article.venue === 'Computers in Industry', article.venue)
    expect('DOI parsed and normalised', article.doi === '10.1016/j.compind.2006.03.002', article.doi)
    expect('collection path parsed', article.collections.length === 1 && article.collections[0] === '智能加工', JSON.stringify(article.collections))
    expect('tags empty as in the real library', Array.isArray(article.tags) && article.tags.length === 0, JSON.stringify(article.tags))
    const attachment = article.attachment
    console.log('  attachment: ' + JSON.stringify(attachment))
    expect('PDF attachment path resolved to a real absolute file', attachment !== null && existsSync(attachment.path), attachment === null ? 'null' : attachment.path)
    expect(
      'PDF attachment size matches the file on disk',
      attachment !== null && attachment.size === EXPECTED_PDF_SIZE,
      attachment === null ? 'null' : String(attachment.size),
    )
    expect(
      'PDF attachment file name preserved',
      attachment !== null && /Etienne/.test(attachment.fileName) && /\.pdf$/i.test(attachment.fileName),
      attachment === null ? 'null' : attachment.fileName,
    )
  }
  /* ---------------------------------------------------------------------- */
  section('3. temp mirror of the reference library (dataDir override + storage attachment resolution)')

  const mirrorDir = await mirrorDataDir(REAL_ZOTERO_DIR, 'mirror')
  tempDirs.push(mirrorDir)
  const mirrorScan = await scanZoteroLibrary({ dataDir: mirrorDir, preferLocalApi: false })
  expect('mirror scan source is sqlite', mirrorScan.source === 'sqlite', mirrorScan.source)
  expect('mirror scan uses the requested dataDir', resolve(mirrorScan.dataDir) === resolve(mirrorDir), mirrorScan.dataDir)
  const mirrorArticle = findItem(mirrorScan.items, EXPECTED_KEY)
  expect(
    'mirror attachment resolves inside the mirror dataDir',
    mirrorArticle !== undefined &&
      mirrorArticle.attachment !== null &&
      resolve(mirrorArticle.attachment.path).toLowerCase().startsWith(resolve(mirrorDir).toLowerCase()) &&
      mirrorArticle.attachment.size === EXPECTED_PDF_SIZE,
    mirrorArticle === undefined || mirrorArticle.attachment === null ? 'null' : mirrorArticle.attachment.path,
  )

  if (existsSync(RECON_COPY)) {
    const reconSha = sha256(await readFile(RECON_COPY))
    expect('_recon zotero-copy.sqlite equals the reference database', reconSha === realSqliteSha, truncate(reconSha, 16))
    const reconDir = await mkdtemp(join(TMPDIR, 'litgraph-zotero-probe-recon-'))
    tempDirs.push(reconDir)
    await copyFile(RECON_COPY, join(reconDir, 'zotero.sqlite'))
    const reconScan = await scanZoteroLibrary({ dataDir: reconDir, preferLocalApi: false })
    const reconArticle = findItem(reconScan.items, EXPECTED_KEY)
    expect('_recon copy is readable as a dataDir', reconArticle !== undefined, reconDir)
    expect(
      '_recon copy proves missing-PDF handling (path empty + warning)',
      reconArticle !== undefined &&
        reconArticle.attachment !== null &&
        reconArticle.attachment.path === '' &&
        reconScan.warnings.some((warning) => warning.indexOf('PDF 附件') >= 0),
      reconArticle === undefined || reconArticle.attachment === null ? 'null' : reconArticle.attachment.path,
    )
  } else {
    console.log('  _recon copy not found, skipping copy-only check')
  }

  /* ---------------------------------------------------------------------- */
  section('4. local API mapping (mock Zotero API) + broken-API fallback')

  const storageFile = join(
    mirrorDir,
    'storage',
    'KFR8C9ZE',
    'Etienne 等 - 2006 - An improved approach for automatic process plan generation of complex borings.pdf',
  )
  const mockApi = await startMockZoteroApi({
    items: [
      mockItem('MOCKART1', 'journalArticle', {
        title: 'Mock Journal Article from Local API',
        creators: [
          { creatorType: 'author', firstName: 'Ada', lastName: 'Lovelace' },
          { creatorType: 'author', firstName: 'Alan', lastName: 'Turing' },
        ],
        date: '2019-05-01 5/2019',
        publicationTitle: 'Journal of Mocking',
        DOI: 'https://doi.org/10.1000/mock.1',
        abstractNote: 'Mock abstract from the local API.',
        tags: [{ tag: 'mock-tag' }],
        collections: ['COLL0001'],
      }),
      mockItem('MOCKBOOK', 'book', {
        title: 'Mock Book Without Attachment',
        creators: [{ creatorType: 'author', firstName: 'Grace', lastName: 'Hopper' }],
        date: '2001',
        publisher: 'Mock Press',
        collections: ['COLL0002'],
      }),
    ],
    attachments: [
      {
        key: 'KFR8C9ZE',
        version: 1,
        data: {
          key: 'KFR8C9ZE',
          itemType: 'attachment',
          parentItem: 'MOCKART1',
          linkMode: 'imported_url',
          contentType: 'application/pdf',
          path: 'storage:Etienne 等 - 2006 - An improved approach for automatic process plan generation of complex borings.pdf',
          filename: 'Etienne 等 - 2006 - An improved approach for automatic process plan generation of complex borings.pdf',
        },
      },
    ],
    collections: [
      { key: 'COLL0001', version: 1, data: { key: 'COLL0001', name: '模拟分类', parentCollection: false } },
      { key: 'COLL0002', version: 1, data: { key: 'COLL0002', name: '子分类', parentCollection: 'COLL0001' } },
    ],
  })
  try {
    const apiScan = await scanZoteroLibrary({
      dataDir: mirrorDir,
      apiBaseUrl: mockApi.base,
      localApiTimeoutMs: 2000,
      preferLocalApi: true,
    })
    console.log('  mock API scan source: ' + apiScan.source + '  items: ' + apiScan.items.length)
    console.log('  mock API scan warnings: ' + JSON.stringify(apiScan.warnings))
    expect('local API mode is used when the API answers', apiScan.source === 'local-api', apiScan.source)
    expect('local API returns both top-level paper items', apiScan.items.length === 2, apiScan.items.length + ' item(s)')
    const mockArticle = findItem(apiScan.items, 'MOCKART1')
    const mockBook = findItem(apiScan.items, 'MOCKBOOK')
    expect('mock journalArticle mapped with creators', mockArticle !== undefined && mockArticle.creators.join('|') === 'Ada Lovelace|Alan Turing', mockArticle === undefined ? 'missing' : mockArticle.creators.join(' / '))
    expect('mock date year parsed', mockArticle !== undefined && mockArticle.year === 2019, mockArticle === undefined ? 'missing' : String(mockArticle.year))
    expect('mock DOI prefix stripped', mockArticle !== undefined && mockArticle.doi === '10.1000/mock.1', mockArticle === undefined ? 'missing' : mockArticle.doi)
    expect('mock venue mapped', mockArticle !== undefined && mockArticle.venue === 'Journal of Mocking', mockArticle === undefined ? 'missing' : mockArticle.venue)
    expect('mock tag mapped', mockArticle !== undefined && mockArticle.tags.join('|') === 'mock-tag', mockArticle === undefined ? 'missing' : JSON.stringify(mockArticle.tags))
    expect('mock collection path mapped', mockArticle !== undefined && mockArticle.collections.join('|') === '模拟分类', mockArticle === undefined ? 'missing' : JSON.stringify(mockArticle.collections))
    expect(
      'nested local API collection path is joined with >',
      mockBook !== undefined && mockBook.collections.join('|') === '模拟分类 > 子分类',
      mockBook === undefined ? 'missing' : JSON.stringify(mockBook.collections),
    )
    expect(
      'mock attachment resolved through storage/<key>/ (real PDF bytes)',
      mockArticle !== undefined &&
        mockArticle.attachment !== null &&
        mockArticle.attachment.size === EXPECTED_PDF_SIZE &&
        existsSync(mockArticle.attachment.path) &&
        resolve(mockArticle.attachment.path) === resolve(storageFile),
      mockArticle === undefined || mockArticle.attachment === null ? 'null' : mockArticle.attachment.path,
    )
    expect('mock book has no attachment', mockBook !== undefined && mockBook.attachment === null, mockBook === undefined ? 'missing' : JSON.stringify(mockBook.attachment))
    const exactBytes = mockArticle !== undefined ? await readFile(mockArticle.attachment.path) : Buffer.alloc(0)
    expect('mock attachment bytes are the original PDF', exactBytes.length > 0 && /^%PDF-/.test(exactBytes.subarray(0, 5).toString('latin1')), exactBytes.length + ' bytes')

    const brokenApi = await startBrokenApi()
    try {
      const brokenScan = await scanZoteroLibrary({
        dataDir: mirrorDir,
        apiBaseUrl: brokenApi.base,
        localApiTimeoutMs: 2000,
        preferLocalApi: true,
      })
      expect('HTTP 500 local API falls back to SQLite', brokenScan.source === 'sqlite', brokenScan.source)
      expect(
        'HTTP 500 fallback is explained in warnings',
        brokenScan.warnings.some((warning) => warning.indexOf('500') >= 0),
        truncate(brokenScan.warnings.join(' | '), 160),
      )
      expect('fallback scan still finds the real article', findItem(brokenScan.items, EXPECTED_KEY) !== undefined, brokenScan.items.length + ' item(s)')
    } finally {
      await brokenApi.close()
    }
  } finally {
    await mockApi.close()
  }

  /* ---------------------------------------------------------------------- */
  section('5. import pipeline (ZoteroDeps contract)')

  const captured = { files: [], metas: [] }
  const deps = {
    async importFile(tmpPath, fileName, size) {
      const bytes = await readFile(tmpPath)
      captured.files.push({ tmpPath, fileName, size, bytes: bytes.length, sha256: sha256(bytes) })
      return { jobId: 'job-mock-1', paperId: 'p-mock-pdf', duplicate: false }
    },
    async importMetadata(item) {
      captured.metas.push({
        key: item.key,
        title: item.title,
        creators: item.creators,
        year: item.year,
        venue: item.venue,
        doi: item.doi,
        collections: item.collections,
        attachmentPath: item.attachment === null ? '' : item.attachment.path,
      })
      return { paperId: 'p-mock-meta', duplicate: false }
    },
  }

  const realPdfSha = sha256(await readFile(storageFile))
  const pdfImport = await importZoteroSelection([EXPECTED_KEY], 'pdf', deps, { dataDir: mirrorDir })
  console.log('  pdf import result: ' + JSON.stringify(pdfImport))
  expect('pdf import accepted exactly one item', pdfImport.accepted.length === 1 && pdfImport.skipped.length === 0, JSON.stringify(pdfImport))
  expect('pdf import returned the pipeline paperId and jobId', pdfImport.accepted[0] !== undefined && pdfImport.accepted[0].paperId === 'p-mock-pdf' && pdfImport.accepted[0].jobId === 'job-mock-1', JSON.stringify(pdfImport.accepted[0]))
  expect('deps.importFile received the copied PDF', captured.files.length === 1, captured.files.length + ' call(s)')
  if (captured.files.length === 1) {
    const file = captured.files[0]
    expect('importFile file name is the Zotero attachment name', /\.pdf$/i.test(file.fileName) && /Etienne/.test(file.fileName), file.fileName)
    expect('importFile size matches the original PDF', file.size === EXPECTED_PDF_SIZE && file.bytes === EXPECTED_PDF_SIZE, file.size + ' / ' + file.bytes)
    expect('importFile bytes are byte-identical to the Zotero PDF', file.sha256 === realPdfSha, truncate(file.sha256, 16))
    expect('temp copy handed to importFile no longer exists afterwards', !existsSync(file.tmpPath), file.tmpPath)
  }

  captured.files.length = 0
  captured.metas.length = 0
  const metaImport = await importZoteroSelection([EXPECTED_KEY], 'meta', deps, { dataDir: mirrorDir })
  console.log('  meta import result: ' + JSON.stringify(metaImport))
  expect('metadata import accepted exactly one item', metaImport.accepted.length === 1 && metaImport.skipped.length === 0, JSON.stringify(metaImport))
  expect('deps.importMetadata received the parsed record', captured.metas.length === 1 && captured.metas[0].title === EXPECTED_TITLE && captured.metas[0].doi === '10.1016/j.compind.2006.03.002', JSON.stringify(captured.metas[0] === undefined ? null : truncate(JSON.stringify(captured.metas[0]), 220)))
  expect('metadata import did not touch importFile', captured.files.length === 0, captured.files.length + ' call(s)')

  const unknownImport = await importZoteroSelection(['NOT_A_REAL_KEY'], 'pdf', deps, { dataDir: mirrorDir })
  expect('unknown key is reported in skipped[]', unknownImport.accepted.length === 0 && unknownImport.skipped.length === 1 && unknownImport.skipped[0].key === 'NOT_A_REAL_KEY', JSON.stringify(unknownImport.skipped))

  expect('empty selection returns an empty ok result', (await importZoteroSelection([], 'pdf', deps, { dataDir: mirrorDir })).accepted.length === 0, 'empty keys')

  let invalidModeError = null
  try {
    await importZoteroSelection([EXPECTED_KEY], 'nope', deps, { dataDir: mirrorDir })
  } catch (error) {
    invalidModeError = error
  }
  expect('invalid mode throws ZoteroScanError(INVALID_MODE)', invalidModeError instanceof ZoteroScanError && invalidModeError.code === 'INVALID_MODE', invalidModeError === null ? 'no error' : invalidModeError.code)

  // PDF -> metadata fallback: same DB with all attachments removed.
  const noAttachmentDir = join(mirrorDir, 'no-attachment')
  await mkdir(noAttachmentDir, { recursive: true })
  const patchedDb = new SQL.Database(new Uint8Array(realSqliteBytes))
  patchedDb.exec('DELETE FROM itemAttachments')
  patchedDb.exec("DELETE FROM items WHERE itemTypeID = (SELECT itemTypeID FROM itemTypes WHERE typeName = 'attachment')")
  await writeFile(join(noAttachmentDir, 'zotero.sqlite'), patchedDb.export())
  patchedDb.close()
  const noAttachmentScan = await scanZoteroLibrary({ dataDir: noAttachmentDir, preferLocalApi: false })
  expect('attachment-less DB scans the article without attachment', noAttachmentScan.items.length === 1 && noAttachmentScan.items[0].attachment === null, JSON.stringify(noAttachmentScan.items.map((item) => ({ key: item.key, attachment: item.attachment }))))
  captured.files.length = 0
  captured.metas.length = 0
  const fallbackImport = await importZoteroSelection([EXPECTED_KEY], 'pdf', deps, { dataDir: noAttachmentDir })
  expect(
    'pdf mode falls back to metadata when no PDF exists',
    fallbackImport.accepted.length === 1 && captured.files.length === 0 && captured.metas.length === 1 && captured.metas[0].key === EXPECTED_KEY,
    JSON.stringify(fallbackImport),
  )

  /* ---------------------------------------------------------------------- */
  section('6. real Zotero data dirs untouched + no leaked temp dirs')

  invalidateZoteroScanCache()
  expect('invalidateZoteroScanCache is exported for tests', typeof invalidateZoteroScanCache === 'function')

  const afterSnapshot = await snapshotDataDir(REAL_ZOTERO_DIR)
  const differences = compareSnapshots(beforeSnapshot, afterSnapshot)
  expect('reference Zotero data dir file set/sizes unchanged', differences.length === 0, differences.slice(0, 6).join(', '))
  const realSqliteAfter = sha256(await readFile(realSqlitePath))
  expect('reference zotero.sqlite sha256 unchanged (no write)', realSqliteAfter === realSqliteSha, realSqliteAfter.slice(0, 16))
  expect('reference storage PDF sha256 unchanged', sha256(await readFile(join(REAL_ZOTERO_DIR, 'storage', 'KFR8C9ZE', basename(storageFile)))) === realPdfSha, realPdfSha.slice(0, 16))

  if (liveDbPath !== null && liveDbBefore !== null) {
    const liveAfter = await statQuiet(liveDbPath)
    expect(
      'live Zotero database size/mtime untouched by the probe',
      liveAfter !== null && liveAfter.size === liveDbBefore.size && liveAfter.mtimeMs === liveDbBefore.mtimeMs,
      liveAfter === null ? 'missing' : liveAfter.size + 'B',
    )
    expect('live Zotero database still readable after scans', sha256(await readFile(liveDbPath)).length === 64, liveDbPath)
  } else {
    console.log('  live Zotero data dir not available, skipping live read-only check')
  }

  const leftoverAfter = new Set(await listTmpLeftovers())
  const leaked = [...leftoverAfter].filter((name) => !leftoverBefore.has(name))
  expect('no litgraph-zotero-* temp dirs leaked', leaked.length === 0, leaked.join(', '))

  /* ---------------------------------------------------------------------- */
  section('7. year parser unit checks')

  expect('year: Zotero 7 multipart date', parseZoteroYear('2006-09-00 9/2006') === 2006, '2006-09-00 9/2006')
  expect('year: raw month/year', parseZoteroYear('9/2006') === 2006, '9/2006')
  expect('year: bare year', parseZoteroYear('2019') === 2019, '2019')
  expect('year: human readable date', parseZoteroYear('September 2006') === 2006, 'September 2006')
  expect('year: not a date', parseZoteroYear('n.d.') === null, 'n.d.')
  expect('year: empty', parseZoteroYear('  ') === null, '(empty)')

  const failed = checks.filter((check) => !check.ok)
  const duration = Date.now() - startedAt
  console.log('\n============================================================')
  console.log('checks: ' + (checks.length - failed.length) + '/' + checks.length + ' passed in ' + duration + 'ms')
  if (failed.length > 0) {
    console.log('FAILED:')
    for (const failure of failed) console.log('  - ' + failure.name + (failure.detail === '' ? '' : ' [' + failure.detail + ']'))
    process.exitCode = 1
  } else {
    console.log('RESULT: OK — Zotero scan + import verified against the real library')
  }
  return failed.length
}

main()
  .catch((error) => {
    console.error('\nPROBE CRASHED: ' + (error && error.stack ? error.stack : error))
    process.exitCode = 1
  })
  .finally(async () => {
    for (const dir of tempDirs) await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })
