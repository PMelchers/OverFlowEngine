import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import type { RouteDirections } from '../nodes/types'

const POINT_STYLE = {
  start: { color: '#16a34a', radius: 8 },
  stop: { color: '#d97706', radius: 6 },
  end: { color: '#dc2626', radius: 8 },
} as const

/** The route on a real OpenStreetMap map (Leaflet, no API key). Leaflet is imperative, so
 *  the map is built once per route in an effect and torn down on unmount - the component
 *  only mounts while the Route tab is open, which also means Leaflet measures a visible
 *  container instead of a 0x0 hidden one.
 *
 *  Uses OSM's own tile server, which is fine for this kind of light, interactive use as
 *  long as the attribution stays visible (https://operations.osmfoundation.org/policies/tiles/). */
export default function RouteMap({ route }: { route: RouteDirections }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const map = L.map(container, { scrollWheelZoom: false })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)

    const line = L.polyline(route.geometry, { color: '#2563eb', weight: 5, opacity: 0.85 }).addTo(map)
    route.points.forEach((p, i) => {
      const style = POINT_STYLE[p.kind]
      // Same numbering as the stop list above the map, so the two can be matched up.
      const label = p.kind === 'start' ? `A · ${p.name}` : p.kind === 'end' ? `B · ${p.name}` : `${i} · ${p.name}`
      L.circleMarker([p.lat, p.lon], {
        radius: style.radius,
        color: '#ffffff',
        weight: 2,
        fillColor: style.color,
        fillOpacity: 1,
      })
        .bindTooltip(label, { direction: 'top', offset: [0, -6], permanent: true })
        .addTo(map)
    })

    // Fit the line *and* the markers, so a point the route doesn't actually reach is
    // still in view instead of silently off-screen.
    const bounds = line.getBounds()
    route.points.forEach((p) => bounds.extend([p.lat, p.lon]))
    map.fitBounds(bounds, { padding: [30, 30] })

    return () => {
      map.remove()
    }
  }, [route])

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Map of the route from ${route.points[0]?.name} to ${route.points.at(-1)?.name}`}
      // isolate: Leaflet's panes use z-indexes up to 1000, which would otherwise paint
      // over the modal's own header and tabs.
      className="isolate h-80 w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
    />
  )
}
