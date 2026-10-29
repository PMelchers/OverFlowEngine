import { User } from 'lucide-react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { ProfileBlockData } from '../types'

/** Opt-in profile block. It has only an output handle, wired to an AI Agent's "profile"
 *  handle - that wire is the consent. Nothing here is sent anywhere by itself. */
export default function ProfileNode({ data }: NodeProps<ProfileBlockData>) {
  return (
    <div className="relative flex w-64 flex-col gap-1 rounded-lg border-2 border-sky-400 bg-sky-50 px-3 py-2 shadow-sm dark:border-sky-700 dark:bg-sky-950">
      <div className="flex items-center gap-1.5">
        <span className="flex items-center gap-1 rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
          <User className="h-3 w-3" /> Profile
        </span>
        <span className="ml-auto rounded-full border border-sky-300 px-2 py-0.5 text-[10px] text-sky-700 dark:text-sky-300">
          opt-in
        </span>
      </div>
      <p className="text-sm font-medium text-sky-900 dark:text-sky-100">{data.label}</p>
      <p className="text-[10px] leading-snug text-sky-700 dark:text-sky-300">
        Connect this to an AI Agent's <b>Profile</b> handle to let that agent use your saved preferences and
        feedback. Unconnected, it shares nothing.
      </p>
      <Handle type="source" position={Position.Top} className="!bg-sky-500" />
    </div>
  )
}
