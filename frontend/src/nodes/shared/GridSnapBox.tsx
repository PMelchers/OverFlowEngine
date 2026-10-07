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
 *
 * Content height is measured on a dedicated inner wrapper that does NOT
 * include the spacer, so the calculation never has to back out the spacer's
 * own contribution from the observed height. Deriving "natural" content
 * height by subtracting the previous spacer from the total (spacer included)
 * height creates a feedback loop: sub-pixel jitter near a grid boundary can
 * flip the rounded target back and forth, and each flip changes the height
 * again, re-triggering the observer - visible as the block continuously
 * growing/shrinking ("vibrating").
 */
export default function GridSnapBox({ className, children }: { className: string; children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null)
  const spacerRef = useRef(0)
  const [spacer, setSpacer] = useState(0)

  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return

    const update = () => {
      const natural = el.getBoundingClientRect().height
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
    <div className={className}>
      <div ref={contentRef}>{children}</div>
      <div aria-hidden style={{ height: spacer }} />
    </div>
  )
}
