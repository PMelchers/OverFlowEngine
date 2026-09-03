import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

const GRID = 10

/**
 * Adds an invisible spacer after its content so the rendered box height is
 * always an exact multiple of the canvas grid (10px) - keeping a block's top
 * AND bottom edge sitting on a dot line even though its content height
 * varies (more conditions, more options, ...). Width is fixed via Tailwind
 * classes (already chosen as multiples of 10) so only height needs measuring.
 *
 * The spacer is a separate element (not extra padding on the box itself) so
 * it never fights with the box's own Tailwind padding classes.
 */
export default function GridSnapBox({ className, children }: { className: string; children: ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const spacerRef = useRef(0)
  const [spacer, setSpacer] = useState(0)

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return

    const update = () => {
      const natural = el.getBoundingClientRect().height - spacerRef.current
      const rounded = Math.ceil(natural / GRID) * GRID
      const next = Math.max(0, rounded - natural)
      if (Math.abs(next - spacerRef.current) > 0.5) {
        spacerRef.current = next
        setSpacer(next)
      }
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={boxRef} className={className}>
      {children}
      <div aria-hidden style={{ height: spacer }} />
    </div>
  )
}
