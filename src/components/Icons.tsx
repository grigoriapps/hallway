import type { ReactNode } from 'react'

function Svg({ size = 18, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

type IconProps = { size?: number }

export const IconChat = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M21 11.5a8.4 8.4 0 0 1-12.2 7.5L3 20.5l1.6-5A8.4 8.4 0 1 1 21 11.5z" />
  </Svg>
)

export const IconPaperclip = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" />
  </Svg>
)

export const IconSend = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M21 3L10 14" />
    <path d="M21 3l-6.5 18-4-8-8-4L21 3z" />
  </Svg>
)

export const IconClock = ({ size }: IconProps) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
)

export const IconChecks = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M2 12.5l4.5 4.5L16 7.5" />
    <path d="M11.5 16.5l.5.5L22 7.5" />
  </Svg>
)

export const IconAlert = ({ size }: IconProps) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5v.01" />
  </Svg>
)

export const IconClose = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)

export const IconSmile = ({ size }: IconProps) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
    <path d="M9 9.5v.01M15 9.5v.01" strokeWidth={2.6} />
  </Svg>
)

export const IconPlay = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M8 5.5l10 6.5-10 6.5v-13z" fill="currentColor" />
  </Svg>
)

export const IconGear = ({ size }: IconProps) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
  </Svg>
)

export const IconReply = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Svg>
)

export const IconPin = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M12 17v5" />
    <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z" />
  </Svg>
)

export const IconMegaphone = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M3 10.5v3a1 1 0 0 0 1 1h2.5L12 19V5L6.5 9.5H4a1 1 0 0 0-1 1z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M18.5 5.5a9 9 0 0 1 0 13" />
  </Svg>
)

export const IconBell = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
    <path d="M10 21a2.2 2.2 0 0 0 4 0" />
  </Svg>
)

export const IconCheck = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
)

export const IconSearch = ({ size }: IconProps) => (
  <Svg size={size}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Svg>
)

export const IconMore = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />
  </Svg>
)

export const IconChevronUp = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M6 15l6-6 6 6" />
  </Svg>
)

export const IconChevronDown = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
)

export const IconUsers = ({ size }: IconProps) => (
  <Svg size={size}>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 5.5a3.5 3.5 0 0 1 0 6.5" />
    <path d="M17.5 14.2A6.5 6.5 0 0 1 21.5 20" />
  </Svg>
)

export const IconPlus = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconUpload = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M12 15V4M7 9l5-5 5 5M5 20h14" />
  </Svg>
)
