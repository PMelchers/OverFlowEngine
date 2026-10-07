import type { ReactNode } from 'react'

interface BlockHeaderProps {
  icon: ReactNode
  /** full literal Tailwind classes for the badge background (+ text color if not white) */
  badgeClassName: string
  children?: ReactNode
}

/** Small circular symbol badge used in place of a "TYPE" text label at the top of every block. */
export default function BlockHeader({ icon, badgeClassName, children }: BlockHeaderProps) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span
        className={`flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white ${badgeClassName}`}
      >
        {icon}
      </span>
      {children}
    </div>
  )
}
