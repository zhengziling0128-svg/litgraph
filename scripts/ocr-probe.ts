#!/usr/bin/env tsx
/**
 * OCR probe CLI for the LitGraph host half.
 *
 *   npx tsx scripts/ocr-probe.ts <pdf> [--max-pages 40] [--scale 2] [--timeout-ms 180000]
 *                               [--sample 1500] [--out .probe/name.txt] [--extract] [--json]
 *   npx tsx scripts/ocr-probe.ts --probe
 *
 * Prints ASCII diagnostics only (console encoding on Windows is unreliable) and
 * writes the full OCR text / sample to UTF-8 files that can be opened directly.
 */
import { readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { probeOcr, ocrPdfBuffer } from '../src/host/ocr.js'
import { extractPdf } from '../src/host/pdf.js'

interface Options {
  file: string
  maxPages?: number
  scale?: number
  timeoutMs?: number
  sample: number
  out?: string
  extract: boolean
  probeOnly: boolean
  noOcr: boolean
  json: boolean
}

const HERE = dirname(fileURLToPath(import.meta.url))
const PROBE_DIR = resolve(HERE, '..', '.probe')

function usage(): never {
  console.error('usage: npx tsx scripts/ocr-probe.ts <pdf> [--max-pages N] [--scale N] [--timeout-ms N] [--sample N] [--out FILE] [--extract] [--json] | --probe')
  process.exit(2)
}

function parseOptions(argv: string[]): Options {
  const options: Options = { file: '', sample: 1500, extract: false, probeOnly: false, noOcr: false, json: false }
  const positional: string[] = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    switch (arg) {
      case '--probe':
        options.probeOnly = true
        break
      case '--extract':
        options.extract = true
        break
      case '--no-ocr':
        options.noOcr = true
        break
      case '--json':
        options.json = true
        break
      case '--max-pages':
        options.maxPages = Number(argv[++i] ?? '0')
        break
      case '--scale':
        options.scale = Number(argv[++i] ?? '0')
        break
      case '--timeout-ms':
        options.timeoutMs = Number(argv[++i] ?? '0')
        break
      case '--sample':
        options.sample = Number(argv[++i] ?? '0')
        break
      case '--out':
        options.out = argv[++i] ?? ''
        break
      default:
        if (arg.startsWith('--')) usage()
        positional.push(arg)
    }
  }
  options.file = positional[0] ?? ''
  return options
}

function pad(value: number | string, width: number): string {
  return String(value).padStart(width, ' ')
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2))
  const started = Date.now()
  const report: Record<string, unknown> = { at: new Date().toISOString(), argv: process.argv.slice(2) }

  const probe = await probeOcr()
  report['probe'] = probe
  if (options.probeOnly) {
    console.log('probe: available=' + probe.available + ' engine=' + probe.engine + ' languages=' + JSON.stringify(probe.languages))
    await writeJson(join(PROBE_DIR, 'probe.json'), report)
    return
  }
  if (options.file === '') usage()

  const filePath = resolve(options.file)
  const fileStat = await stat(filePath)
  const buffer = await readFile(filePath)
  report['file'] = { path: filePath, bytes: fileStat.size }

  let extractionInfo: Record<string, unknown> | null = null
  if (options.extract) {
    const t0 = Date.now()
    try {
      const extraction = await extractPdf(new Uint8Array(buffer))
      extractionInfo = {
        ms: Date.now() - t0,
        pages: extraction.pages,
        nonSpaceChars: extraction.nonSpaceChars,
        pageChars: extraction.pageChars,
        lowTextPages: extraction.lowTextPages,
        emptyRatio: extraction.pages > 0 ? extraction.lowTextPages / extraction.pages : 0,
        avgChars: extraction.pages > 0 ? extraction.nonSpaceChars / extraction.pages : 0,
        needsOcr: extraction.needsOcr,
        note: extraction.note,
        textSample: extraction.text.slice(0, 600),
      }
      report['extract'] = extractionInfo
    } catch (error) {
      report['extract'] = { ms: Date.now() - t0, error: String((error as Error).message ?? error) }
    }
  }

  if (options.noOcr) {
    report['totalMs'] = Date.now() - started
    const outPath = resolve(options.out ?? join(PROBE_DIR, 'extract-' + Date.now() + '.txt'))
    await writeFile(outPath, extractionInfo?.['textSample'] as string ?? '', 'utf8')
    await writeJson(outPath + '.json', report)
    if (options.json) console.log(JSON.stringify(report, null, 2))
    if (extractionInfo !== null) {
      const ext = extractionInfo as Record<string, unknown>
      console.log('extract: pages=' + ext['pages'] + ' nonSpace=' + ext['nonSpaceChars'] + ' lowText=' + ext['lowTextPages'] + ' emptyRatio=' + Number(ext['emptyRatio']).toFixed(2) + ' avg=' + Number(ext['avgChars']).toFixed(1) + ' needsOcr=' + ext['needsOcr'] + ' ms=' + ext['ms'])
      console.log('extract.note: ' + ext['note'])
    } else {
      console.log('extract failed')
    }
    console.log('out: ' + outPath)
    return
  }

  const t0 = Date.now()
  const result = await ocrPdfBuffer(new Uint8Array(buffer), {
    maxPages: options.maxPages,
    scale: options.scale,
    timeoutMs: options.timeoutMs,
  })
  const ocrMs = Date.now() - t0
  const sample = result.text.slice(0, options.sample)
  report['ocr'] = {
    ms: result.ms,
    wallMs: ocrMs,
    pages: result.pages,
    ocrPages: result.ocrPages,
    engine: result.engine,
    language: result.language,
    chars: result.text.length,
    nonSpaceChars: result.text.replace(/\s/g, '').length,
    note: result.note,
    sample,
  }

  const outPath = resolve(options.out ?? join(PROBE_DIR, 'ocr-' + Date.now() + '.txt'))
  await writeFile(outPath, result.text, 'utf8')
  report['out'] = outPath
  report['totalMs'] = Date.now() - started
  await writeJson(outPath + '.json', report)

  if (options.json) console.log(JSON.stringify(report, null, 2))
  console.log('file: ' + filePath + ' (' + fileStat.size + ' bytes)')
  if (extractionInfo !== null) {
    const ext = extractionInfo as Record<string, unknown>
    console.log('extract: pages=' + ext['pages'] + ' nonSpace=' + ext['nonSpaceChars'] + ' needsOcr=' + ext['needsOcr'] + ' ms=' + ext['ms'])
    console.log('extract.note: ' + ext['note'])
  }
  console.log('probe: available=' + probe.available + ' languages=' + JSON.stringify(probe.languages))
  console.log('ocr: engine=' + result.engine + ' lang=' + result.language + ' pages=' + result.pages + ' ocrPages=' + result.ocrPages + ' ms=' + result.ms)
  console.log('ocr.chars(nonSpace)=' + ((report['ocr'] as Record<string, unknown>)['nonSpaceChars'] ?? 0))
  console.log('ocr.note: ' + (result.note ?? ''))
  console.log('out: ' + outPath)
  const lines = result.text.split('\n')
  console.log('text.lines=' + lines.length + ' first.line=' + JSON.stringify(lines[0] ?? ''))
  const cjk = (result.text.match(/[\u4e00-\u9fff]/g) ?? []).length
  console.log('text.cjk=' + cjk + ' latin=' + (result.text.match(/[A-Za-z]/g) ?? []).length)
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8')
}

main().catch((error) => {
  console.error('probe failed: ' + (error instanceof Error ? error.stack ?? error.message : String(error)))
  process.exitCode = 1
})
