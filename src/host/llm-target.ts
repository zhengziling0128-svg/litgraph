/**
 * Provider/model route resolution for the host half.
 *
 * The plugin used to hard-code `deepseek-official` (the API-key adapter route). On a
 * desktop profile that is logged in through the DeepSeek account instead, that route
 * has no API key and every import fails with MISSING_CREDENTIAL, while the harness
 * default route (`deepseek-account` + `deepseek-flash`) works. So resolve routes at
 * call time: harness default first, then the configured provider, then every other
 * registered provider, and remember whichever route actually succeeded.
 */
import type { LitgraphConfig, LlmService } from './types.js'

export interface LlmTarget {
  provider: string
  model: string
}

export type DefaultSelectionReader = () => { provider?: string; model?: string } | null

const PREFERRED_MODELS = ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-pro']
const FALLBACK_PROVIDER = 'deepseek-official'
const FALLBACK_MODEL = 'deepseek-flash'

/**
 * Failure codes that mean "this route is not usable from here" (no credential, not
 * signed in, provider unknown) rather than "the request failed, retry it". The next
 * candidate route is tried instead.
 */
const ROUTE_UNAVAILABLE_PATTERN = /CREDENTIAL|AUTH|SIGN_?IN|UNAUTHORIZED|UNKNOWN_PROVIDER|NO_PROVIDER|PROVIDER_NOT_FOUND|NOT_REGISTERED/i

export function isCredentialFailure(code: string | undefined): boolean {
  return typeof code === 'string' && ROUTE_UNAVAILABLE_PATTERN.test(code)
}

function modelIds(models: unknown): string[] {
  if (!Array.isArray(models)) return []
  const ids: string[] = []
  for (const entry of models) {
    const id = typeof entry === 'string'
      ? entry
      : entry !== null && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string'
        ? ((entry as { id: string }).id)
        : ''
    if (id !== '' && !ids.includes(id)) ids.push(id)
  }
  return ids
}

function providerIds(providers: unknown): string[] {
  if (!Array.isArray(providers)) return []
  const ids: string[] = []
  for (const entry of providers) {
    const id = typeof entry === 'string'
      ? entry
      : entry !== null && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string'
        ? ((entry as { id: string }).id)
        : ''
    if (id !== '' && !ids.includes(id)) ids.push(id)
  }
  return ids
}

export class LlmTargetResolver {
  private good: LlmTarget | null = null
  private readonly bad = new Set<string>()
  private loggedHarness = false

  constructor(
    private readonly getLlm: () => LlmService | null,
    private readonly config: LitgraphConfig,
    private readonly readDefault: DefaultSelectionReader = () => null,
  ) {}

  markGood(target: LlmTarget): void {
    this.good = target
    this.bad.delete(target.provider)
  }

  markFailed(provider: string): void {
    this.bad.add(provider)
    if (this.good !== null && this.good.provider === provider) this.good = null
  }

  /** Routes to try, best first. Credential-failed providers are skipped. */
  async candidates(): Promise<LlmTarget[]> {
    const out: LlmTarget[] = []
    const seen = new Set<string>()
    const push = (provider: string | undefined, model: string | undefined): void => {
      if (typeof provider !== 'string' || provider === '') return
      if (this.bad.has(provider)) return
      const resolved = typeof model === 'string' && model !== '' ? model : FALLBACK_MODEL
      const key = provider + '/' + resolved
      if (seen.has(key)) return
      seen.add(key)
      out.push({ provider, model: resolved })
    }

    const llm = this.getLlm()
    const configuredModel = this.config.llmModel
    if (this.config.llmProviderExplicit) push(this.config.llmProvider, configuredModel ?? (await this.modelFor(this.config.llmProvider)))

    const harness = this.readDefault()
    if (harness !== null && typeof harness.provider === 'string' && harness.provider !== '') {
      if (!this.loggedHarness) {
        this.loggedHarness = true
        console.warn('[litgraph] harness default model route: ' + harness.provider + '/' + (harness.model ?? '?'))
      }
      push(harness.provider, harness.model ?? (await this.modelFor(harness.provider)))
    }

    push(this.config.llmProvider, configuredModel ?? (await this.modelFor(this.config.llmProvider)))

    if (llm !== null && typeof llm.listProviders === 'function') {
      try {
        const providers = await llm.listProviders()
        for (const provider of providerIds(providers)) {
          if (provider === this.config.llmProvider || provider === harness?.provider) continue
          push(provider, await this.modelFor(provider))
        }
      } catch (error) {
        console.warn('[litgraph] ctx.llm.listProviders failed: ' + (error instanceof Error ? error.message : String(error)))
      }
    }

    if (out.length === 0) push(FALLBACK_PROVIDER, configuredModel ?? FALLBACK_MODEL)
    if (this.good !== null && !this.bad.has(this.good.provider)) {
      const rest = out.filter((entry) => entry.provider !== this.good!.provider)
      return [this.good].concat(rest)
    }
    return out
  }

  /** First usable route (cached once a route has actually answered). */
  async resolve(): Promise<LlmTarget> {
    if (this.good !== null) return this.good
    const list = await this.candidates()
    const first = list[0] ?? { provider: FALLBACK_PROVIDER, model: FALLBACK_MODEL }
    this.good = first
    return first
  }

  private async modelFor(provider: string): Promise<string> {
    const llm = this.getLlm()
    if (llm === null || typeof llm.listModels !== 'function') return FALLBACK_MODEL
    try {
      const ids = modelIds(await llm.listModels(provider))
      const preferred = PREFERRED_MODELS.find((id) => ids.includes(id))
      if (preferred !== undefined) return preferred
      if (ids.length > 0) return ids[0]
    } catch (error) {
      // A route we cannot list is still worth trying with the fallback model id.
    }
    return FALLBACK_MODEL
  }
}
