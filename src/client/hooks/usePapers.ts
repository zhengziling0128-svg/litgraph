/**
 * Fetch state for the library column. Aborts the in-flight request whenever the
 * query changes, so typing in the search box cannot render a stale page.
 */
import * as React from 'react'
import { fetchPapers } from '../api'
import type { PapersPage, PapersQuery, SortKey, SortOrder } from '../types'

export interface UsePapersInput {
  sort: SortKey
  order: SortOrder
  page: number
  cluster: string
  q: string
  pageSize: number
  refreshToken: number
  /** Host-side exact tag filter (undefined/null = every paper). */
  tag?: string | null
  /** Host-side starred-only filter. */
  starred?: boolean
  /** Host-side minimum rating filter (1..5). */
  minRating?: number | null
}

export interface UsePapersResult {
  pageData: PapersPage | null
  loading: boolean
  error: string | null
}

export function usePapers(input: UsePapersInput): UsePapersResult {
  const { sort, order, page, cluster, q, pageSize, refreshToken, tag, starred, minRating } = input
  const tagValue = tag === undefined || tag === null ? '' : tag
  const [pageData, setPageData] = React.useState<PapersPage | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    const query: PapersQuery = {
      sort,
      order,
      page,
      pageSize,
      q,
      cluster,
      starred: starred === true ? true : undefined,
      tag: tagValue === '' ? undefined : tagValue,
      minRating: typeof minRating === 'number' ? minRating : undefined,
    }
    fetchPapers(query, controller.signal)
      .then((result) => {
        if (!active) return
        setPageData(result)
        setLoading(false)
      })
      .catch((reason: any) => {
        if (!active) return
        if (reason && reason.name === 'AbortError') return
        setError(reason && reason.message ? reason.message : String(reason))
        setLoading(false)
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [sort, order, page, cluster, q, pageSize, refreshToken, tagValue, starred, minRating])

  return { pageData, loading, error }
}
