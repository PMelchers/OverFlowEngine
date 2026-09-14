import { CheckCircle2, ChevronDown, CircleDashed, Plug, Reply, Sparkles, Wrench } from 'lucide-react'
import { useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import AiCallFields from './AiCallFields'
import AppPicker from './AppPicker'
import BlockHeader from './BlockHeader'
import ConnectAppModal from './ConnectAppModal'
import ConnectAppNudge from './ConnectAppNudge'
import GridSnapBox from './GridSnapBox'
import { AI_ACTION_APP, AI_QUICK_ACTIONS, APP_ICONS, APP_TRIGGER_SOURCES, CALENDAR_APPS, type BlockNodeData } from './types'

const CALENDAR_ACTIONS: { value: NonNullable<BlockNodeData['targetAction']>; label: string }[] = [
  { value: 'fetchEvents', label: 'Fetch Events' },
  { value: 'createEvent', label: 'Create Event' },
  { value: 'deleteEvent', label: 'Delete Event' },
]

export default function AppActionNode({ data }: NodeProps<BlockNodeData>) {
  const active = data.status === 'active'
  const availableVariables = data.availableVariables ?? []
  const toRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const eventIdRef = useRef<HTMLInputElement>(null)
  const appAnchorRef = useRef<HTMLButtonElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [connectNudgeApp, setConnectNudgeApp] = useState<string | null>(null)
  const [connectModalApp, setConnectModalApp] = useState<string | null>(null)

  const targetApp = data.targetApp
  const isCalendar = targetApp ? CALENDAR_APPS.includes(targetApp) : false
  const isAi = targetApp === AI_ACTION_APP
  // Every non-calendar, non-AI app only has one action; calendar apps default to fetching.
  const action = isCalendar ? (data.targetAction ?? 'fetchEvents') : isAi ? 'aiCall' : 'sendMessage'

  const aiMode = data.aiCallMode ?? 'custom'
  const aiModeLabel = AI_QUICK_ACTIONS.find((a) => a.key === aiMode)?.label ?? 'Custom prompt'
  const AppIcon = !targetApp ? Plug : isAi ? Sparkles : (APP_ICONS[targetApp] ?? Wrench)
  const appDisplayLabel = !targetApp ? 'Select an app...' : isAi ? `AI - ${aiModeLabel}` : targetApp
  const connected = targetApp ? (data.appConnections?.[targetApp] ?? false) : false

  const insertInto = (
    field: 'to' | 'body' | 'eventTitle' | 'eventId',
    ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
    name: string,
  ) => {
    if (!name) return
    const token = `{${name}}`
    const el = ref.current
    const current = data[field] ?? ''
    const start = el?.selectionStart ?? current.length
    const end = el?.selectionEnd ?? current.length
    const next = current.slice(0, start) + token + current.slice(end)
    data.onChange?.({ [field]: next })
    requestAnimationFrame(() => {
      el?.focus()
      const caret = start + token.length
      el?.setSelectionRange(caret, caret)
    })
  }

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active
          ? 'node-flash border-green-500 bg-green-100 dark:border-green-600 dark:bg-green-950'
          : 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-emerald-500" />
      <BlockHeader icon={<Reply className="h-3 w-3" />} badgeClassName="bg-emerald-600">
        <input
          type="text"
          value={data.label}
          onChange={(e) => data.onChange?.({ label: e.target.value })}
          className="nodrag w-0 min-w-0 flex-1 rounded border border-emerald-300 bg-white px-2 py-1 text-sm font-medium dark:border-emerald-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </BlockHeader>

      <label className="mb-1 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">App</label>
      <button
        ref={appAnchorRef}
        type="button"
        onClick={() => setPickerOpen((o) => !o)}
        className={`nodrag mb-1 flex w-full items-center gap-2 rounded border px-2 py-1.5 text-sm transition-colors ${
          targetApp
            ? 'border-emerald-300 bg-white hover:bg-emerald-50 dark:border-emerald-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-emerald-950/40'
            : 'border-dashed border-emerald-300 bg-emerald-50/50 text-emerald-500 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 dark:hover:bg-emerald-950/40'
        }`}
      >
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${
            isAi
              ? 'bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-950 dark:text-fuchsia-400'
              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
          }`}
        >
          <AppIcon className="h-3 w-3" />
        </span>
        <span className="flex-1 truncate text-left">{appDisplayLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
      </button>
      {pickerOpen && (
        <AppPicker
          anchorRef={appAnchorRef}
          onClose={() => setPickerOpen(false)}
          apps={APP_TRIGGER_SOURCES}
          selectedApp={targetApp}
          onSelectApp={(app) => {
            data.onChange?.({ targetApp: app, targetAction: undefined })
            if (!(data.appConnections?.[app] ?? false)) setConnectNudgeApp(app)
          }}
          aiActions={{
            selectedMode: data.aiCallMode,
            onSelect: (mode) => {
              const template = AI_QUICK_ACTIONS.find((a) => a.key === mode)?.promptTemplate ?? ''
              data.onChange?.({ targetApp: AI_ACTION_APP, targetAction: 'aiCall', aiCallMode: mode, prompt: template })
            },
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

      {targetApp && isCalendar && (
        <p
          className={`nodrag mb-2 flex items-center gap-1 text-[10px] font-medium ${
            connected
              ? 'text-green-600 dark:text-green-400'
              : 'cursor-pointer text-amber-600 hover:underline dark:text-amber-400'
          }`}
          onClick={connected ? undefined : () => setConnectModalApp(targetApp)}
        >
          {connected ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
          {connected ? 'Connected' : 'Not connected - click to connect it'}
        </p>
      )}
      {targetApp && !isCalendar && !isAi && (
        <p className="mb-2 flex items-center gap-1 text-[10px] font-medium text-gray-400 dark:text-gray-500">
          <CircleDashed className="h-3 w-3" /> Preview only - no real connection for {targetApp} yet
        </p>
      )}

      {!targetApp && (
        <p className="mb-1 text-[10px] text-emerald-600 dark:text-emerald-400">
          Pick an app (or an AI action) above to configure this step.
        </p>
      )}

      {isAi && <AiCallFields data={data} />}

      {isCalendar && (
        <>
          <label className="mb-1 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            Action
          </label>
          <select
            value={action}
            onChange={(e) => data.onChange?.({ targetAction: e.target.value as BlockNodeData['targetAction'] })}
            className="nodrag mb-2 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm dark:border-emerald-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {CALENDAR_ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </>
      )}

      {targetApp && !isCalendar && !isAi && (
        <>
          <label className="mb-1 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">To</label>
          <input
            ref={toRef}
            type="text"
            value={data.to ?? ''}
            placeholder="e.g. {incomingMessageFrom}"
            onChange={(e) => data.onChange?.({ to: e.target.value })}
            className="nodrag mb-1 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm dark:border-emerald-700 dark:bg-gray-900 dark:text-gray-100"
          />
          {availableVariables.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                insertInto('to', toRef, e.target.value)
                e.target.value = ''
              }}
              className="nodrag mb-2 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm text-emerald-600 dark:border-emerald-700 dark:bg-gray-900 dark:text-emerald-300"
            >
              <option value="">Insert a variable into To...</option>
              {availableVariables.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.varType})
                </option>
              ))}
            </select>
          )}

          <label className="mb-1 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            Subject (optional)
          </label>
          <input
            type="text"
            value={data.subject ?? ''}
            placeholder="e.g. Re: your request"
            onChange={(e) => data.onChange?.({ subject: e.target.value })}
            className="nodrag mb-2 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm dark:border-emerald-700 dark:bg-gray-900 dark:text-gray-100"
          />

          <label className="mb-1 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            Message
          </label>
          <textarea
            ref={bodyRef}
            value={data.body ?? ''}
            placeholder="e.g. {agentReply}"
            onChange={(e) => data.onChange?.({ body: e.target.value })}
            rows={3}
            className="nodrag w-full resize-none rounded border border-emerald-300 bg-white px-2 py-1 text-xs dark:border-emerald-700 dark:bg-gray-900 dark:text-gray-100"
          />
          {availableVariables.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                insertInto('body', bodyRef, e.target.value)
                e.target.value = ''
              }}
              className="nodrag mt-1 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm text-emerald-600 dark:border-emerald-700 dark:bg-gray-900 dark:text-emerald-300"
            >
              <option value="">Insert a variable into Message...</option>
              {availableVariables.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.varType})
                </option>
              ))}
            </select>
          )}

          <p className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">
            Preview action - logs what would be sent; a real {targetApp} connection isn't wired up yet.
          </p>
        </>
      )}

      {isCalendar && action === 'fetchEvents' && (
        <>
          <label className="mb-1 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            Days ahead to fetch
          </label>
          <input
            type="text"
            value={data.daysAhead ?? ''}
            placeholder="7"
            onChange={(e) => data.onChange?.({ daysAhead: e.target.value })}
            className="nodrag mb-2 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm dark:border-emerald-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <label className="mb-1 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            Save results as
          </label>
          <input
            type="text"
            value={data.outputVariable ?? ''}
            placeholder="e.g. upcomingEvents"
            onChange={(e) => data.onChange?.({ outputVariable: e.target.value })}
            className="nodrag w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm dark:border-emerald-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </>
      )}

      {isCalendar && action === 'createEvent' && (
        <>
          <label className="mb-1 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            Event title
          </label>
          <input
            ref={titleRef}
            type="text"
            value={data.eventTitle ?? ''}
            placeholder="e.g. Call with {customerName}"
            onChange={(e) => data.onChange?.({ eventTitle: e.target.value })}
            className="nodrag mb-1 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm dark:border-emerald-700 dark:bg-gray-900 dark:text-gray-100"
          />
          {availableVariables.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                insertInto('eventTitle', titleRef, e.target.value)
                e.target.value = ''
              }}
              className="nodrag mb-2 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm text-emerald-600 dark:border-emerald-700 dark:bg-gray-900 dark:text-emerald-300"
            >
              <option value="">Insert a variable into title...</option>
              {availableVariables.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.varType})
                </option>
              ))}
            </select>
          )}
          <div className="mb-2 flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                Start (ISO)
              </label>
              <input
                type="text"
                value={data.startTime ?? ''}
                placeholder="2026-09-10T10:00:00Z"
                onChange={(e) => data.onChange?.({ startTime: e.target.value })}
                className="nodrag w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm dark:border-emerald-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                End (ISO)
              </label>
              <input
                type="text"
                value={data.endTime ?? ''}
                placeholder="2026-09-10T10:30:00Z"
                onChange={(e) => data.onChange?.({ endTime: e.target.value })}
                className="nodrag w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm dark:border-emerald-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
          <label className="mb-1 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            Description (optional)
          </label>
          <input
            type="text"
            value={data.eventDescription ?? ''}
            onChange={(e) => data.onChange?.({ eventDescription: e.target.value })}
            className="nodrag mb-2 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm dark:border-emerald-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <label className="mb-1 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            Save created event ID as
          </label>
          <input
            type="text"
            value={data.outputVariable ?? ''}
            placeholder="variable name (optional)"
            onChange={(e) => data.onChange?.({ outputVariable: e.target.value })}
            className="nodrag w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm dark:border-emerald-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </>
      )}

      {isCalendar && action === 'deleteEvent' && (
        <>
          <label className="mb-1 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            Event ID to delete
          </label>
          <input
            ref={eventIdRef}
            type="text"
            value={data.eventId ?? ''}
            placeholder="e.g. {createdEventId}"
            onChange={(e) => data.onChange?.({ eventId: e.target.value })}
            className="nodrag mb-1 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm dark:border-emerald-700 dark:bg-gray-900 dark:text-gray-100"
          />
          {availableVariables.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                insertInto('eventId', eventIdRef, e.target.value)
                e.target.value = ''
              }}
              className="nodrag mb-2 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm text-emerald-600 dark:border-emerald-700 dark:bg-gray-900 dark:text-emerald-300"
            >
              <option value="">Insert a variable...</option>
              {availableVariables.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.varType})
                </option>
              ))}
            </select>
          )}
        </>
      )}

      {isCalendar && (
        <p className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">
          Real {targetApp} action - connect your account from Settings first.
        </p>
      )}

      <Handle type="source" position={Position.Right} className="!bg-emerald-500" />
      {isAi && <Handle type="target" position={Position.Bottom} id="model" className="!bg-emerald-500" />}
    </GridSnapBox>
  )
}
