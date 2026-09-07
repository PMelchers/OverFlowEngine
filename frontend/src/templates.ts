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

/** Horizontal gap between blocks in a single left-to-right row (block width is 320px). */
const STEP = 380

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
        position: { x: 0 * STEP, y: 0 },
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
        position: { x: 1 * STEP, y: 0 },
        data: { label: 'readInput', value: 'Extract the instructions from this email: {incomingMessage}' },
      },
      {
        id: 'readAgent',
        type: 'aiAgent',
        position: { x: 2 * STEP, y: 0 },
        data: { label: 'Reader Agent', prompt: 'Extract clear, actionable instructions from the email.' },
      },
      {
        id: 'readModel',
        type: 'aiModel',
        position: { x: 2 * STEP + 120, y: 280 },
        data: { label: 'Model', credentialId: null },
      },
      {
        id: 'extracted',
        type: 'aiOutput',
        position: { x: 3 * STEP, y: 0 },
        data: { label: 'extractedInstructions' },
      },
      {
        id: 'replyInput',
        type: 'aiInput',
        position: { x: 4 * STEP, y: 0 },
        data: { label: 'replyInput', value: 'Write a polite reply based on: {extractedInstructions}' },
      },
      {
        id: 'replyAgent',
        type: 'aiAgent',
        position: { x: 5 * STEP, y: 0 },
        data: { label: 'Writer Agent', prompt: 'Write a polite, concise reply email.' },
      },
      {
        id: 'replyModel',
        type: 'aiModel',
        position: { x: 5 * STEP + 120, y: 280 },
        data: { label: 'Model', credentialId: null },
      },
      {
        id: 'replyText',
        type: 'aiOutput',
        position: { x: 6 * STEP, y: 0 },
        data: { label: 'replyText' },
      },
      {
        id: 'send',
        type: 'appAction',
        position: { x: 7 * STEP, y: 0 },
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
  {
    id: 'vacation-planner',
    label: 'Vacation Planner',
    description:
      'Enter your destination, transport, activities and stay type, have AI draft an itinerary, then get real Google/Apple Maps routes.',
    nodes: [
      {
        id: 'trigger',
        type: 'trigger',
        position: { x: 0 * STEP, y: 0 },
        data: { label: 'Plan My Trip' },
      },
      {
        id: 'country',
        type: 'variable',
        position: { x: 1 * STEP, y: 0 },
        data: { label: 'destinationCountry', varType: 'string', value: 'Italy' },
      },
      {
        id: 'transport',
        type: 'variable',
        position: { x: 2 * STEP, y: 0 },
        data: { label: 'transportMode', varType: 'string', value: 'car' },
      },
      {
        id: 'activities',
        type: 'variable',
        position: { x: 3 * STEP, y: 0 },
        data: { label: 'destinationActivities', varType: 'string', value: 'hiking, museums, local food' },
      },
      {
        id: 'stayType',
        type: 'variable',
        position: { x: 4 * STEP, y: 0 },
        data: { label: 'stayType', varType: 'string', value: 'hotel' },
      },
      {
        // The route can't be built without knowing where it starts - fed into both Maps
        // Route blocks' Origin below so they build an actual point-to-point route instead
        // of leaving the maps app to ask for the current location.
        id: 'startAddress',
        type: 'variable',
        position: { x: 5 * STEP, y: 0 },
        data: { label: 'startingAddress', varType: 'string', value: 'Home' },
      },
      {
        // Seeded blank so the Maps Route destinations below render cleanly even if the
        // activity suggestion is rejected (no accepted stops to weave in yet).
        id: 'routeActivitiesSeed',
        type: 'variable',
        position: { x: 6 * STEP, y: 0 },
        data: { label: 'routeActivities', varType: 'string', value: '' },
      },
      {
        id: 'planInput',
        type: 'aiInput',
        position: { x: 7 * STEP, y: 0 },
        data: {
          label: 'planInput',
          value:
            'Plan a {stayType} vacation in {destinationCountry}, starting the trip from {startingAddress}. We are traveling by {transportMode} and enjoy {destinationActivities}. Suggest a day-by-day itinerary with the best stops to visit.',
        },
      },
      {
        id: 'planAgent',
        type: 'aiAgent',
        position: { x: 8 * STEP, y: 0 },
        data: {
          label: 'Vacation Planner Agent',
          prompt: 'You are a helpful travel planner. Write a clear day-by-day itinerary matching the traveler\'s starting point, destination, transport, interests, and accommodation preference.',
        },
      },
      {
        id: 'planModel',
        type: 'aiModel',
        position: { x: 8 * STEP + 120, y: 280 },
        data: { label: 'Model', credentialId: null },
      },
      {
        id: 'vacationPlan',
        type: 'aiOutput',
        position: { x: 9 * STEP, y: 0 },
        data: { label: 'vacationPlan' },
      },
      {
        id: 'suggestActivities',
        type: 'activitySuggestion',
        position: { x: 10 * STEP, y: 0 },
        data: {
          label: 'Suggest Activities',
          activityContext: '{destinationCountry}',
          interests: '{destinationActivities}',
          outputVariable: 'routeActivities',
        },
      },
      {
        id: 'googleRoute',
        type: 'mapsAction',
        position: { x: 11 * STEP, y: 0 },
        data: {
          label: 'Google Maps Route',
          mapsProvider: 'google',
          origin: '{startingAddress}',
          destination: '{destinationCountry}, {routeActivities}',
          travelMode: 'driving',
          outputVariable: 'googleMapsRoute',
        },
      },
      {
        id: 'appleRoute',
        type: 'mapsAction',
        position: { x: 12 * STEP, y: 0 },
        data: {
          label: 'Apple Maps Route',
          mapsProvider: 'apple',
          origin: '{startingAddress}',
          destination: '{destinationCountry}, {routeActivities}',
          travelMode: 'driving',
          outputVariable: 'appleMapsRoute',
        },
      },
    ],
    edges: [
      { id: 'e-trigger-country', source: 'trigger', target: 'country' },
      { id: 'e-country-transport', source: 'country', target: 'transport' },
      { id: 'e-transport-activities', source: 'transport', target: 'activities' },
      { id: 'e-activities-stayType', source: 'activities', target: 'stayType' },
      { id: 'e-stayType-startAddress', source: 'stayType', target: 'startAddress' },
      { id: 'e-startAddress-routeActivitiesSeed', source: 'startAddress', target: 'routeActivitiesSeed' },
      { id: 'e-routeActivitiesSeed-planInput', source: 'routeActivitiesSeed', target: 'planInput' },
      { id: 'e-planInput-planAgent', source: 'planInput', target: 'planAgent' },
      { id: 'e-planModel-planAgent', source: 'planModel', target: 'planAgent', targetHandle: 'model' },
      { id: 'e-planAgent-vacationPlan', source: 'planAgent', target: 'vacationPlan' },
      { id: 'e-vacationPlan-suggestActivities', source: 'vacationPlan', target: 'suggestActivities' },
      { id: 'e-suggestActivities-googleRoute', source: 'suggestActivities', target: 'googleRoute' },
      { id: 'e-googleRoute-appleRoute', source: 'googleRoute', target: 'appleRoute' },
    ],
  },
]
