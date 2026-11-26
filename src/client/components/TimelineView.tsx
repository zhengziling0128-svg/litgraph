/**
 * Timeline view: one horizontal year axis, one lane per cluster, one dot per paper.
 *
 * Layout maths lives in ../timeline (pure, unit-testable); this component only
 * turns it into SVG-free absolutely positioned DOM so it follows the theme
 * tokens and stays keyboard accessible.
 *
 * Vertical layout: the view owns the whole center column, so the lane area
 * flexes to fill the available height (chart >= ~55% of the panel on desktop),
 * the axis sits right below the lanes and the "year unknown" section is pinned
 * under the chart. The head is pushed right of the floating graph/timeline tab
 * switch that the workbench renders over the center column.
 */
import * as React from 'react'
import type { TimelineNode } from '../timeline'
import {
  buildTimelineLanes,
  computeYearDomain,
  computeYearTicks,
  timelineSummary,
  unknownYearNodes,
  yearToPercent,
} from '../timeline'
import { ensureFeatureStyles } from '../styles-features'

ensureFeatureStyles()

export type { TimelineNode } from '../timeline'
export { buildTimelineNodes } from '../timeline'

export interface TimelineViewProps {
  nodes: TimelineNode[]
  selectedId: string | null
  onSelect: (id: string) => void
  onClear?: () => void
}

interface HoverState {
  id: string
  percent: number
  offset: number
}

const STAGGER_ROWS = 3
const STAGGER_PERCENT = 10

export function TimelineView(props: TimelineViewProps) {
  const { nodes, selectedId, onSelect, onClear } = props
  const domain = React.useMemo(() => computeYearDomain(nodes), [nodes])
  const ticks = React.useMemo(() => computeYearTicks(domain), [domain])
  const lanes = React.useMemo(() => buildTimelineLanes(nodes), [nodes])
  const unknowns = React.useMemo(() => unknownYearNodes(nodes), [nodes])
  const [hover, setHover] = React.useState<HoverState | null>(null)

  const empty = nodes.length === 0

  if (empty) {
    return (
      <div className="lgf-timeline" data-litgraph="timeline">
        <TimelineHead summary="暂无文献" selected={false} onClear={onClear} />
        <div className="lgf-timeline-empty">
          <div className="lgf-timeline-empty-title">时间轴还没有数据</div>
          <div className="lgf-timeline-empty-hint">
            导入论文后，这里会按年份排布每篇文献；AI 没能识别年份的文献会单独列在下方。
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="lgf-timeline" data-litgraph="timeline">
      <TimelineHead summary={timelineSummary(nodes)} selected={selectedId !== null} onClear={onClear} />

      <div className="lgf-timeline-body lg-scroll">
        <div className="lgf-timeline-plot" style={{ minWidth: 560 }}>
          {lanes.length > 0 ? (
            <>
              <div className="lgf-lanes">
                {lanes.map((lane) => (
                  <div className="lgf-lane" key={lane.label}>
                    <div className="lgf-lane-label" title={lane.label}>
                      <i className="lgf-lane-dot" style={{ background: lane.color, color: lane.color }} />
                      <span>{lane.label}</span>
                      <em className="lgf-lane-count">{lane.items.length}</em>
                    </div>
                    <div className="lgf-lane-track">
                      <span className="lgf-lane-line" aria-hidden="true" />
                      {ticks.map((year) => (
                        <span
                          key={'grid-' + year}
                          className="lgf-grid-line"
                          style={{ left: yearToPercent(year, domain) + '%' }}
                          aria-hidden="true"
                        />
                      ))}
                      {lane.items.map((node, index) => {
                        const percent = yearToPercent(node.year === null ? domain.min : node.year, domain)
                        const rows = Math.min(STAGGER_ROWS, lane.items.length)
                        const offset = rows === 1 ? 0 : ((index % rows) - (rows - 1) / 2) * STAGGER_PERCENT
                        const selected = node.id === selectedId
                        const hovered = hover !== null && hover.id === node.id
                        return (
                          <React.Fragment key={node.id}>
                            <button
                              type="button"
                              className={'lgf-point' + (selected ? ' is-selected' : '')}
                              style={{
                                left: percent + '%',
                                top: 'calc(50% + ' + offset + '%)',
                                background: node.color || '#7fd1ff',
                                color: node.color || '#7fd1ff',
                              }}
                              aria-label={pointLabel(node)}
                              aria-pressed={selected}
                              title={pointLabel(node)}
                              onMouseEnter={() => setHover({ id: node.id, percent, offset })}
                              onMouseLeave={() => setHover((current) => (current && current.id === node.id ? null : current))}
                              onFocus={() => setHover({ id: node.id, percent, offset })}
                              onBlur={() => setHover((current) => (current && current.id === node.id ? null : current))}
                              onClick={() => onSelect(node.id)}
                            />
                            {hovered ? (
                              <div
                                className="lg-tooltip lgf-timeline-tip"
                                style={{ left: percent + '%', top: 'calc(50% + ' + offset + '%)' }}
                                role="tooltip"
                              >
                                <div className="lg-tooltip-title">{node.title}</div>
                                <div className="lg-tooltip-meta">
                                  {node.year === null ? '年份未知' : node.year + ' 年'}
                                  {node.clusterLabel ? ' · ' + node.clusterLabel : ''}
                                </div>
                              </div>
                            ) : null}
                          </React.Fragment>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="lgf-axis" aria-hidden="true">
                <div className="lgf-axis-spacer" />
                <div className="lgf-axis-track">
                  {ticks.map((year, index) => {
                    const percent = yearToPercent(year, domain)
                    const isFirst = index === 0
                    const isLast = index === ticks.length - 1
                    return (
                      <span
                        key={'tick-' + year}
                        className="lgf-axis-label"
                        style={{
                          left: percent + '%',
                          transform: isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                        }}
                      >
                        {year}
                      </span>
                    )
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="lgf-timeline-empty" style={{ flex: '0 0 auto', padding: '18px 8px' }}>
              <div className="lgf-timeline-empty-title">暂无可定位年份的文献</div>
              <div className="lgf-timeline-empty-hint">AI 没有从这些论文中识别出年份，已列在下方「年份未知」中。</div>
            </div>
          )}

          {unknowns.length > 0 ? (
            <div className="lgf-unknown">
              <div className="lgf-unknown-title">年份未知（{unknowns.length} 篇）</div>
              <div className="lgf-unknown-list">
                {unknowns.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    className={'lgf-unknown-chip' + (node.id === selectedId ? ' is-selected' : '')}
                    title={node.title}
                    onClick={() => onSelect(node.id)}
                  >
                    {node.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function TimelineHead(props: { summary: string; selected: boolean; onClear?: () => void }) {
  const { summary, selected, onClear } = props
  return (
    <div className="lgf-timeline-head">
      <div className="lgf-timeline-heading">
        <div className="lgf-timeline-title">时间轴</div>
        <div className="lgf-timeline-sub">{summary}</div>
      </div>
      <div className="lgf-timeline-actions">
        {selected && onClear ? (
          <button type="button" className="lg-btn lg-btn-sm" onClick={onClear}>
            清除选中
          </button>
        ) : null}
      </div>
    </div>
  )
}

function pointLabel(node: TimelineNode): string {
  const year = node.year === null ? '年份未知' : node.year + ' 年'
  return node.title + '（' + year + '）'
}
