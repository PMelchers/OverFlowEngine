/** Shared by TripSummaryCard and TripSummaryView - kept out of the component files so
 *  React Fast Refresh keeps working on them. */
export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
