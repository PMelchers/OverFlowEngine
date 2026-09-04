import type { BlockNodeData } from './nodes/types'

export interface TemplateNode {
  id: string
  type: string
  data: BlockNodeData
  position: { x: number; y: number }
}

export interface TemplateEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

export interface WorkflowTemplate {
  id: string
  label: string
  description: string
  nodes: TemplateNode[]
  edges: TemplateEdge[]
}

/** Drag payload prefix so Canvas's onDrop can tell a template drag apart from a plain palette-kind drag. */
export const TEMPLATE_DRAG_PREFIX = 'template::'

export const TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'email-auto-reply',
    label: 'Email Auto-Reply',
    description:
      'Receive an email as a trigger, have AI read the instructions and draft a reply, then send it back to the sender.',
    nodes: [
      {
        id: 'trigger',
        type: 'appTrigger',
        position: { x: 0, y: 0 },
        data: {
          label: 'Outlook Trigger',
          sourceApp: 'Email',
          fromAddress: 'sender@example.com',
          value: 'Please confirm the 3pm meeting',
          outputVariable: 'incomingMessage',
        },
      },
      {
        id: 'readInput',
        type: 'aiInput',
        position: { x: 400, y: 0 },
        data: { label: 'readInput', value: 'Extract the instructions from this email: {incomingMessage}' },
      },
      {
        id: 'readAgent',
        type: 'aiAgent',
        position: { x: 800, y: 0 },
        data: { label: 'Reader Agent', prompt: 'Extract clear, actionable instructions from the email.' },
      },
      {
        id: 'readModel',
        type: 'aiModel',
        position: { x: 920, y: 240 },
        data: { label: 'Model', credentialId: null },
      },
      {
        id: 'extracted',
        type: 'aiOutput',
        position: { x: 1200, y: 0 },
        data: { label: 'extractedInstructions' },
      },
      {
        id: 'replyInput',
        type: 'aiInput',
        position: { x: 1600, y: 0 },
        data: { label: 'replyInput', value: 'Write a polite reply based on: {extractedInstructions}' },
      },
      {
        id: 'replyAgent',
        type: 'aiAgent',
        position: { x: 2000, y: 0 },
        data: { label: 'Writer Agent', prompt: 'Write a polite, concise reply email.' },
      },
      {
        id: 'replyModel',
        type: 'aiModel',
        position: { x: 2120, y: 240 },
        data: { label: 'Model', credentialId: null },
      },
      {
        id: 'replyText',
        type: 'aiOutput',
        position: { x: 2400, y: 0 },
        data: { label: 'replyText' },
      },
      {
        id: 'send',
        type: 'appAction',
        position: { x: 2800, y: 0 },
        data: {
          label: 'Send Reply',
          targetApp: 'Email',
          to: '{incomingMessageFrom}',
          subject: 'Re: your message',
          body: '{replyText}',
        },
      },
    ],
    edges: [
      { id: 'e-trigger-readInput', source: 'trigger', target: 'readInput' },
      { id: 'e-readInput-readAgent', source: 'readInput', target: 'readAgent' },
      { id: 'e-readModel-readAgent', source: 'readModel', target: 'readAgent', targetHandle: 'model' },
      { id: 'e-readAgent-extracted', source: 'readAgent', target: 'extracted' },
      { id: 'e-extracted-replyInput', source: 'extracted', target: 'replyInput' },
      { id: 'e-replyInput-replyAgent', source: 'replyInput', target: 'replyAgent' },
      { id: 'e-replyModel-replyAgent', source: 'replyModel', target: 'replyAgent', targetHandle: 'model' },
      { id: 'e-replyAgent-replyText', source: 'replyAgent', target: 'replyText' },
      { id: 'e-replyText-send', source: 'replyText', target: 'send' },
    ],
  },
]
