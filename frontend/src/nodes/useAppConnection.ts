import { useRef, useState } from 'react'
import type { BlockNodeData } from './types'

/** The app-picker/connect-nudge/connect-modal state and select-app behavior shared by
 *  AppActionNode and AppTriggerNode: opening the picker, nudging to connect an app
 *  that isn't linked yet, and writing the chosen app into `data[appField]`. Each node
 *  still renders its own AppPicker/ConnectAppNudge/ConnectAppModal JSX, since their
 *  layouts (and AppActionNode's extra AI branch) differ. */
export function useAppConnection(data: BlockNodeData, appField: 'targetApp' | 'sourceApp') {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [connectNudgeApp, setConnectNudgeApp] = useState<string | null>(null)
  const [connectModalApp, setConnectModalApp] = useState<string | null>(null)

  const selectApp = (app: string, extra?: Partial<BlockNodeData>) => {
    data.onChange?.({ [appField]: app, ...extra })
    if (!(data.appConnections?.[app] ?? false)) setConnectNudgeApp(app)
  }

  return {
    anchorRef,
    pickerOpen,
    setPickerOpen,
    connectNudgeApp,
    setConnectNudgeApp,
    connectModalApp,
    setConnectModalApp,
    selectApp,
  }
}
