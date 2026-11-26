/**
 * PDF text extraction for the host half.
 *
 * Uses unpdf (pdf.js bundled, MIT) which is bundled into lib/index.js by tsdown, so
 * the installed plugin needs no runtime node_modules. Extraction is fast enough to
 * run inside the host process: measured ~220 ms for a 16-page two-column paper and
 * ~1.7 s for a 414-page report on this machine.
 */
import { definePDFJSModule, extractText, getDocumentProxy } from 'unpdf'
// Load pdf.js through a *static* import so bundlers can inline it into lib/index.js.
// unpdf's default path is a dynamic `import('unpdf/pdfjs')`, which tsdown leaves as a
// literal import specifier; an installed plugin has no node_modules to resolve that.
import * as pdfjsNamespace from '../../node_modules/unpdf/dist/pdfjs.mjs'
import type { LitgraphConfig } from './types.js'

// Register the bundled pdf.js with unpdf before any extraction happens.
definePDFJSModule(async () => pdfjsNamespace)

export class PdfError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'PdfError'
  }
}

export interface PdfExtraction {
  /** Concatenated text of all pages (paragraph-ish line breaks preserved). */
  text: string
  pages: number
  /** Non-whitespace characters per page — used for scan detection. */
  pageChars: number[]
  nonSpaceChars: number
  /** Pages with fewer than 50 non-space characters (no usable text layer). */
  lowTextPages: number
  /** pages - lowTextPages: pages that produced at least some text. */
  textPages: number
  /** Fraction of pages without a usable text layer (0..1). */
  emptyRatio: number
  truncatedForLlm?: string
  needsOcr: boolean
  note: string
}

/** A page with this many non-space characters or fewer has no usable text layer. */
const EMPTY_PAGE_CHARS = 50
/** Below this many non-space characters in total a PDF has essentially no text. */
const SCAN_TOTAL_CHARS = 100
/** Empty-page ratio from which OCR is worth trying even when other pages have text. */
const SCAN_EMPTY_RATIO = 0.7

function normalizePageText(raw: string): string {
  return raw
    .replace(/\u0000/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function isPasswordError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error)
  return /password|encrypt/i.test(text)
}

/**
 * Extract text + page statistics.
 *
 * Scan detection: a page with fewer than EMPTY_PAGE_CHARS non-space characters has
 * no usable text layer (scanned page, or a full-page figure). A PDF is flagged
 * needs_ocr when it is (almost) entirely made of such pages, when the average page is
 * nearly empty, or when it has essentially no text at all. The heuristic is
 * deliberately conservative: born-digital papers with a few figure pages must not be
 * sent through OCR, but a scan with a digital cover page must.
 *
 * needs_ocr only tells the import pipeline that local OCR (host/ocr.ts) is worth
 * trying; the pipeline decides what to persist when OCR yields nothing.
 */
export async function extractPdf(buffer: Uint8Array, _config?: LitgraphConfig): Promise<PdfExtraction> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>
  try {
    pdf = await getDocumentProxy(buffer)
  } catch (error) {
    if (isPasswordError(error)) throw new PdfError('ENCRYPTED', 'PDF is password protected: ' + String(error))
    throw new PdfError('INVALID_PDF', 'PDF could not be opened: ' + (error instanceof Error ? error.message : String(error)))
  }
  try {
    const result = await extractText(pdf, { mergePages: false })
    const rawPages: string[] = Array.isArray(result.text) ? result.text : [result.text]
    const totalPages = typeof result.totalPages === 'number' && result.totalPages > 0 ? result.totalPages : rawPages.length
    const pageTexts = rawPages.map(normalizePageText)
    const pageChars = pageTexts.map((page) => page.replace(/\s/g, '').length)
    const nonSpaceChars = pageChars.reduce((sum, count) => sum + count, 0)
    const lowTextPages = pageChars.filter((count) => count < EMPTY_PAGE_CHARS).length
    const avgChars = totalPages > 0 ? nonSpaceChars / totalPages : 0
    const emptyRatio = totalPages > 0 ? lowTextPages / totalPages : 1
    const textPages = totalPages - lowTextPages
    const needsOcr =
      nonSpaceChars < SCAN_TOTAL_CHARS ||
      (totalPages >= 3 && emptyRatio >= SCAN_EMPTY_RATIO) ||
      (avgChars < 50 && emptyRatio >= 0.4)
    const note =
      'pages=' + totalPages +
      ' nonSpaceChars=' + nonSpaceChars +
      ' avg=' + avgChars.toFixed(1) +
      ' lowTextPages=' + lowTextPages + '/' + totalPages +
      ' emptyRatio=' + emptyRatio.toFixed(2) +
      ' textPages=' + textPages
    return {
      text: pageTexts.filter((page) => page.length > 0).join('\n\n'),
      pages: totalPages,
      pageChars,
      nonSpaceChars,
      lowTextPages,
      textPages,
      emptyRatio,
      needsOcr,
      note,
    }
  } catch (error) {
    if (error instanceof PdfError) throw error
    throw new PdfError('EXTRACT_FAILED', 'PDF text extraction failed: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    try {
      await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.()
    } catch {
      // best effort cleanup
    }
  }
}
