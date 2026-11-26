/**
 * Configuration defaults for the host half.
 *
 * apply(ctx, config) receives the plugin config from cordis.patch.yml (currently
 * empty), so every knob may also come from the environment. The data root defaults
 * to <DSH_HOME>/litgraph, i.e. the user's own .dsh directory.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { LitgraphConfig } from './types.js'

function envString(name: string): string | undefined {
  const value = process.env[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

export function resolveDshHome(): string {
  return envString('DSH_HOME') ?? join(homedir(), '.dsh')
}

export function resolveConfig(input?: Partial<LitgraphConfig> | null): LitgraphConfig {
  const source = input !== null && typeof input === 'object' ? input : {}
  const dataRoot =
    (typeof source.dataRoot === 'string' && source.dataRoot.trim() !== '' ? source.dataRoot.trim() : undefined) ??
    envString('LITGRAPH_DATA_ROOT') ??
    join(resolveDshHome(), 'litgraph')
  const keepSourcePdf =
    typeof source.keepSourcePdf === 'boolean'
      ? source.keepSourcePdf
      : envString('LITGRAPH_KEEP_PDF') !== '0'
  const saveText = typeof source.saveText === 'boolean' ? source.saveText : envString('LITGRAPH_SAVE_TEXT') !== '0'
  const engineRaw = envString('LITGRAPH_OCR_ENGINE') ?? source.ocrEngine
  const ocrEngine: 'auto' | 'windows' | 'model' =
    engineRaw === 'windows' || engineRaw === 'model' || engineRaw === 'auto' ? engineRaw : 'auto'
  const metricsSecretKey =
    envString('LITGRAPH_EASYSCHOLAR_KEY') ??
    (typeof source.metricsSecretKey === 'string' && source.metricsSecretKey.trim() !== ''
      ? source.metricsSecretKey.trim()
      : undefined)
  const metricsEnabled =
    typeof source.metricsEnabled === 'boolean'
      ? source.metricsEnabled
      : envString('LITGRAPH_METRICS_DISABLE') !== '1'
  return {
    dataRoot,
    keepSourcePdf,
    saveText,
    maxUploadBytes:
      typeof source.maxUploadBytes === 'number' ? source.maxUploadBytes : 80 * 1024 * 1024,
    maxTextChars: typeof source.maxTextChars === 'number' ? source.maxTextChars : 8000,
    llmProvider: envString('LITGRAPH_LLM_PROVIDER') ?? source.llmProvider ?? 'deepseek-official',
    llmProviderExplicit: (envString('LITGRAPH_LLM_PROVIDER') ?? source.llmProvider) !== undefined,
    llmModel: envString('LITGRAPH_LLM_MODEL') ?? source.llmModel ?? null,
    llmMaxTokens: typeof source.llmMaxTokens === 'number' ? source.llmMaxTokens : 2400,
    maxParseRetries: typeof source.maxParseRetries === 'number' ? source.maxParseRetries : 1,
    concurrency: typeof source.concurrency === 'number' ? source.concurrency : 2,
    ocrEngine,
    metricsSecretKey,
    metricsEnabled,
  }
}
