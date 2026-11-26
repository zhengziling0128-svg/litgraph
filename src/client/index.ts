/**
 * dsh-litgraph · client half.
 *
 * Registers one keyed main panel + its sidebar entry. The panel owns the whole
 * central area, so the workbench draws its own three columns and stays completely
 * inside the shipped shell chrome (sidebar navigation, theme, session handling are
 * untouched).
 */
import type { Context } from '@deepseek-ai/cordis'
import * as React from 'react'
import { Workbench } from './Workbench'
import { ConstellationIcon } from './components/icons'
import { ensureStyles } from './styles'
import { initTheme } from './theme'

export const name = 'litgraph-client'
export const inject = ['slots']

const PANEL_ID = 'litgraph'

function PanelIcon(props: { size?: number; active?: boolean }) {
  return React.createElement(
    'span',
    {
      className: 'lg-panel-icon' + (props.active ? ' is-active' : ''),
      style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: props.size || 18, height: props.size || 18 },
    },
    React.createElement(ConstellationIcon, { size: props.size || 18 }),
  )
}

export function apply(ctx: Context): void {
  // The stylesheet is a data string inside this bundle; it is injected once and
  // removed when the plugin unloads (ctx.effect owns the disposer).
  ctx.effect(() => ensureStyles(), 'litgraph: stylesheet')

  // Follow shell skin switches (light/dark) even before the panel mounts; the
  // workbench binds the resolved palette to its own root through theme.ts.
  ctx.effect(() => initTheme(), 'litgraph: theme')

  ctx.slots.inject('main', () =>
    ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        label: () => 'LitGraph',
        order: 40,
      },
      Workbench,
    ),
  )

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 40,
        label: () => 'LitGraph',
      },
      PanelIcon,
    ),
  )
}
