/** Small dependency-free icon set drawn on a 24x24 grid. */
import * as React from 'react'

interface IconProps {
  size?: number
  className?: string
  style?: any
}

function svgProps(size: number, className?: string, style?: any) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
    className,
    style,
  }
}

export function SearchIcon({ size = 14, className, style }: IconProps) {
  return (
    <svg {...svgProps(size, className, style)}>
      <circle cx="11" cy="11" r="6.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15.6 15.6 20 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function CloseIcon({ size = 12, className, style }: IconProps) {
  return (
    <svg {...svgProps(size, className, style)}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

/** The LitGraph mark: a tiny constellation. */
export function ConstellationIcon({ size = 18, className, style }: IconProps) {
  return (
    <svg {...svgProps(size, className, style)}>
      <path
        d="M4.5 16.5 9 8.2l5.2 3.1 5.3-5.1M9 8.2l1.6 8.3 4.4-2 3.8 4.4"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.75"
      />
      <circle cx="4.5" cy="16.5" r="1.55" fill="currentColor" />
      <circle cx="9" cy="8.2" r="1.9" fill="currentColor" />
      <circle cx="14.2" cy="11.3" r="1.35" fill="currentColor" />
      <circle cx="19.5" cy="6.2" r="1.75" fill="currentColor" />
      <circle cx="10.6" cy="16.5" r="1.2" fill="currentColor" opacity="0.8" />
      <circle cx="18.8" cy="18.9" r="1.45" fill="currentColor" opacity="0.9" />
    </svg>
  )
}

export function LayoutIcon({ size = 14, className, style }: IconProps) {
  return (
    <svg {...svgProps(size, className, style)}>
      <rect x="3.2" y="4.2" width="17.6" height="15.6" rx="2.4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" />
      <circle cx="15" cy="9" r="1.1" fill="currentColor" />
      <circle cx="13" cy="15" r="1.3" fill="currentColor" />
      <path d="M9 10l6-1M9 10l4 5M15 9l-2 6" stroke="currentColor" strokeWidth="1" opacity="0.65" />
    </svg>
  )
}

export function ResetIcon({ size = 14, className, style }: IconProps) {
  return (
    <svg {...svgProps(size, className, style)}>
      <path
        d="M4.8 9.2A7.3 7.3 0 0 1 18.6 12a7.2 7.2 0 1 1-2.6-5.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M4.6 4.6v4.9h4.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ExternalIcon({ size = 13, className, style }: IconProps) {
  return (
    <svg {...svgProps(size, className, style)}>
      <path d="M13.5 5.2h5.3v5.3M18.4 5.5l-7.2 7.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17.6 14.2v3.6a1.8 1.8 0 0 1-1.8 1.8H6.4a1.8 1.8 0 0 1-1.8-1.8V8.4a1.8 1.8 0 0 1 1.8-1.8h3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function TrashIcon({ size = 13, className, style }: IconProps) {
  return (
    <svg {...svgProps(size, className, style)}>
      <path d="M4.8 7h14.4M9.4 4.6h5.2M6.6 7l.8 12.1a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L17.4 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.2 11v5.6M13.8 11v5.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
    </svg>
  )
}

export function LocateIcon({ size = 13, className, style }: IconProps) {
  return (
    <svg {...svgProps(size, className, style)}>
      <circle cx="12" cy="12" r="6.4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function ChevronIcon({ size = 12, direction = 'left', className, style }: IconProps & { direction?: 'left' | 'right' }) {
  return (
    <svg {...svgProps(size, className, style)} style={{ ...(style || {}), transform: direction === 'right' ? 'rotate(180deg)' : undefined }}>
      <path d="M14.4 5.8 8.2 12l6.2 6.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SortIcon({ size = 12, order = 'desc', className, style }: IconProps & { order?: 'asc' | 'desc' }) {
  return (
    <svg {...svgProps(size, className, style)}>
      <path d="M12 4.6v14.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity="0.5" />
      <path
        d={order === 'desc' ? 'M7.6 10.4 12 5.6l4.4 4.8M7.6 14.2l4.4 4.8 4.4-4.8' : 'M7.6 9.6 12 14.4l4.4-4.8M7.6 5.8 12 1l4.4 4.8'}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={order === 'desc' ? 1 : 0.45}
      />
    </svg>
  )
}

export function InfoIcon({ size = 13, className, style }: IconProps) {
  return (
    <svg {...svgProps(size, className, style)}>
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 11v5.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="7.8" r="1.05" fill="currentColor" />
    </svg>
  )
}

export function CheckIcon({ size = 13, className, style }: IconProps) {
  return (
    <svg {...svgProps(size, className, style)}>
      <path d="M4.8 12.4 9.6 17 19 6.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function AlertIcon({ size = 13, className, style }: IconProps) {
  return (
    <svg {...svgProps(size, className, style)}>
      <path d="M12 4.6 21 19.4H3L12 4.6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 10.2v4.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  )
}
