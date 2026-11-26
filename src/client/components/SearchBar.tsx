/** Top search bar: live highlighting, keyboard submit, suggestion dropdown. */
import * as React from 'react'
import type { GraphNode } from '../types'
import { SearchIcon, CloseIcon } from './icons'

export interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  onPick: (id: string) => void
  suggestions: GraphNode[]
  matchCount: number
  total: number
  inputRef?: React.MutableRefObject<HTMLInputElement | null>
}

export function SearchBar(props: SearchBarProps) {
  const { value, onChange, onSubmit, onPick, suggestions, matchCount, total, inputRef } = props
  const [focused, setFocused] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const localRef = React.useRef<HTMLInputElement | null>(null)
  const ref = inputRef ?? localRef
  const query = value.trim()
  const open = focused && query.length > 0 && suggestions.length > 0

  React.useEffect(() => {
    setActive(0)
  }, [query])

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (open && suggestions[active]) onPick(suggestions[active].id)
      else onSubmit(value)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onChange('')
      return
    }
    if (!open) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((current) => (current + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => (current - 1 + suggestions.length) % suggestions.length)
    }
  }

  return (
    <div className={'lg-search' + (open ? ' is-open' : '')}>
      <span className="lg-search-icon">
        <SearchIcon size={15} />
      </span>
      <input
        ref={(element) => {
          ref.current = element
        }}
        className="lg-search-input"
        type="search"
        value={value}
        placeholder="搜索标题、作者、关键词、方法…"
        aria-label="搜索文献"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // delay so a click on a suggestion still lands
          window.setTimeout(() => setFocused(false), 120)
        }}
      />
      {query.length > 0 ? (
        <button type="button" className="lg-search-clear" aria-label="清空搜索" onClick={() => { onChange(''); ref.current && ref.current.focus() }}>
          <CloseIcon size={11} />
        </button>
      ) : null}
      {query.length > 0 ? (
        <span className="lg-search-count">{matchCount}/{total} 命中</span>
      ) : null}

      {open ? (
        <div className="lg-suggest" role="listbox">
          {suggestions.map((node, index) => (
            <button
              key={node.id}
              type="button"
              role="option"
              aria-selected={index === active}
              className={'lg-suggest-row' + (index === active ? ' is-active' : '')}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => {
                event.preventDefault()
                onPick(node.id)
              }}
            >
              <span className="lg-suggest-title">{node.title}</span>
              <span className="lg-suggest-meta">
                {node.clusterLabel}
                {node.year ? ' · ' + node.year : ''}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
