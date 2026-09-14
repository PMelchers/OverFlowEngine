import { CheckCircle2, ChevronDown, CircleDashed, Plug, Zap } from 'lucide-react'
import { useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import AppPicker from './AppPicker'
import BlockHeader from './BlockHeader'
import ConnectAppModal from './ConnectAppModal'
import ConnectAppNudge from './ConnectAppNudge'
import GridSnapBox from './GridSnapBox'
import { APP_ICONS, APP_TRIGGER_SOURCES, CALENDAR_APPS, type BlockNodeData } from './types'

export default function AppTriggerNode({ data }: NodeProps<BlockNodeData>) {
  const active = data.status === 'active'
  const sourceApp = data.sourceApp
  const AppIcon = sourceApp ? (APP_ICONS[sourceApp] ?? Zap) : Plug
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [connectNudgeApp, setConnectNudgeApp] = useState<string | null>(null)
  const [connectModalApp, setConnectModalApp] = useState<string | null>(null)

  const connected = sourceApp ? (data.appConnections?.[sourceApp] ?? false) : false
  const isConnectable = sourceApp ? CALENDAR_APPS.includes(sourceApp) : false

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active
          ? 'node-flash border-green-500 bg-green-100 dark:border-green-600 dark:bg-green-950'
          : 'border-cyan-400 bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-950'
      }`}
    >
      <BlockHeader icon={<Zap className="h-3 w-3" />} badgeClassName="bg-cyan-600">
        <input
          type="text"
          value={data.label}
          onChange={(e) => data.onChange?.({ label: e.target.value })}
          className="nodrag w-0 min-w-0 flex-1 rounded border border-cyan-300 bg-white px-2 py-1 text-sm font-medium dark:border-cyan-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </BlockHeader>

      <label className="mb-1 block text-[11px] font-medium text-cyan-700 dark:text-cyan-300">Source app</label>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setPickerOpen((o) => !o)}
        className={`nodrag mb-1 flex w-full items-center gap-2 rounded border px-2 py-1.5 text-sm transition-colors ${
          sourceApp
            ? 'border-cyan-300 bg-white hover:bg-cyan-50 dark:border-cyan-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-cyan-950/40'
            : 'border-dashed border-cyan-300 bg-cyan-50/50 text-cyan-500 hover:bg-cyan-100 dark:border-cyan-700 dark:bg-cyan-950/20 dark:text-cyan-400 dark:hover:bg-cyan-950/40'
        }`}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300">
          <AppIcon className="h-3 w-3" />
        </span>
        <span className="flex-1 text-left">{sourceApp ?? 'Select an app...'}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
      </button>
      {pickerOpen && (
        <AppPicker
          anchorRef={anchorRef}
          onClose={() => setPickerOpen(false)}
          apps={APP_TRIGGER_SOURCES}
          selectedApp={sourceApp}
          onSelectApp={(app) => {
            data.onChange?.({ sourceApp: app })
            if (!(data.appConnections?.[app] ?? false)) setConnectNudgeApp(app)
          }}
        />
      )}
      {connectNudgeApp && (
        <ConnectAppNudge
          app={connectNudgeApp}
          onConnect={() => setConnectModalApp(connectNudgeApp)}
          onClose={() => setConnectNudgeApp(null)}
        />
      )}
      {connectModalApp && (
        <ConnectAppModal
          app={connectModalApp}
          onConnected={data.onAppConnected}
          onOpenSettings={data.onOpenSettings}
          onClose={() => setConnectModalApp(null)}
        />
      )}

      {sourceApp && isConnectable && (
        <p
          className={`nodrag mb-2 flex items-center gap-1 text-[10px] font-medium ${
            connected
              ? 'text-green-600 dark:text-green-400'
              : 'cursor-pointer text-amber-600 hover:underline dark:text-amber-400'
          }`}
          onClick={connected ? undefined : () => setConnectModalApp(sourceApp)}
        >
          {connected ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
          {connected ? 'Connected' : 'Not connected - click to connect it'}
        </p>
      )}
      {sourceApp && !isConnectable && (
        <p className="mb-2 flex items-center gap-1 text-[10px] font-medium text-gray-400 dark:text-gray-500">
          <CircleDashed className="h-3 w-3" /> Preview only - no real connection for {sourceApp} yet
        </p>
      )}

      {!sourceApp && (
        <p className="mb-1 text-[10px] text-cyan-600 dark:text-cyan-400">Pick an app above to configure this trigger.</p>
      )}

      {sourceApp && (
        <>
          <label className="mb-1 mt-1 block text-[11px] font-medium text-cyan-700 dark:text-cyan-300">
            Sample sender (e.g. email address)
          </label>
          <input
            type="text"
            value={data.fromAddress ?? ''}
            onChange={(e) => data.onChange?.({ fromAddress: e.target.value })}
            placeholder="e.g. someone@example.com"
            className="nodrag mb-2 w-full rounded border border-cyan-300 bg-white px-2 py-1 text-sm dark:border-cyan-700 dark:bg-gray-900 dark:text-gray-100"
          />

          <label className="mb-1 block text-[11px] font-medium text-cyan-700 dark:text-cyan-300">
            Sample incoming message
          </label>
          <textarea
            value={data.value ?? ''}
            onChange={(e) => data.onChange?.({ value: e.target.value })}
            placeholder="e.g. Please reply confirming the meeting time"
            rows={2}
            className="nodrag mb-2 w-full resize-none rounded border border-cyan-300 bg-white px-2 py-1 text-xs dark:border-cyan-700 dark:bg-gray-900 dark:text-gray-100"
          />

          <label className="mb-1 block text-[11px] font-medium text-cyan-700 dark:text-cyan-300">Save message as</label>
          <input
            type="text"
            value={data.outputVariable ?? ''}
            placeholder="variable name"
            onChange={(e) => data.onChange?.({ outputVariable: e.target.value })}
            className="nodrag w-full rounded border border-cyan-300 bg-white px-2 py-1 text-sm dark:border-cyan-700 dark:bg-gray-900 dark:text-gray-100"
          />
          {data.outputVariable && data.fromAddress && (
            <p className="mt-1 text-[10px] text-cyan-600 dark:text-cyan-400">
              Sender also saved as {'{' + data.outputVariable + 'From}'} - reference it in an App Action
              block's "To" field to reply.
            </p>
          )}

          <button
            type="button"
            onClick={data.onTrigger}
            className="nodrag mt-2 flex w-full items-center justify-center gap-1.5 rounded bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white transition-transform hover:bg-cyan-700 active:scale-95 active:bg-cyan-800"
          >
            <Zap className="h-3.5 w-3.5" /> Simulate incoming message
          </button>
          <p className="mt-1 text-[10px] text-cyan-600 dark:text-cyan-400">
            Preview trigger - simulates something arriving from {sourceApp}; a real listener isn't wired up
            yet.
          </p>
        </>
      )}

      <Handle type="source" position={Position.Right} className="!bg-cyan-500" />
    </GridSnapBox>
  )
}
