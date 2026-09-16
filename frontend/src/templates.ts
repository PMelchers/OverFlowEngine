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
          label: 'Email Trigger',
          sourceApp: 'Email',
          fromAddress: 'sender@example.com',
          value: 'Please confirm the 3pm meeting',
          outputVariable: 'incomingMessage',
        },
      },
      // An App Action set to "AI" runs a model call as its action - the same block
      // that would send/receive from a real app, just pointed at AI instead. Two of
      // them chained (extract, then draft) replace what used to be a 4-block
      // aiInput/aiAgent/aiModel/aiOutput chain for each step.
      {
        id: 'extract',
        type: 'appAction',
        position: { x: 1 * STEP, y: 0 },
        data: {
          label: 'Extract Instructions',
          targetApp: 'AI',
          targetAction: 'aiCall',
          aiCallMode: 'extract',
          prompt: 'Extract clear, actionable instructions from this email:\n\n{incomingMessage}',
          outputVariable: 'extractedInstructions',
        },
      },
      {
        id: 'extractModel',
        type: 'aiModel',
        position: { x: 1 * STEP + 120, y: 280 },
        data: { label: 'Model', credentialId: null },
      },
      {
        id: 'reply',
        type: 'appAction',
        position: { x: 2 * STEP, y: 0 },
        data: {
          label: 'Draft Reply',
          targetApp: 'AI',
          targetAction: 'aiCall',
          aiCallMode: 'custom',
          prompt: 'Write a polite, concise reply email based on these instructions:\n\n{extractedInstructions}',
          outputVariable: 'replyText',
        },
      },
      {
        id: 'replyModel',
        type: 'aiModel',
        position: { x: 2 * STEP + 120, y: 280 },
        data: { label: 'Model', credentialId: null },
      },
      {
        id: 'send',
        type: 'appAction',
        position: { x: 3 * STEP, y: 0 },
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
      { id: 'e-trigger-extract', source: 'trigger', target: 'extract' },
      { id: 'e-extractModel-extract', source: 'extractModel', target: 'extract', targetHandle: 'model' },
      { id: 'e-extract-reply', source: 'extract', target: 'reply' },
      { id: 'e-replyModel-reply', source: 'replyModel', target: 'reply', targetHandle: 'model' },
      { id: 'e-reply-send', source: 'reply', target: 'send' },
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
        id: 'suggestModel',
        type: 'aiModel',
        position: { x: 2800, y: 640 },
        data: { label: 'Model', credentialId: null },
      },
      {
        id: 'googleRoute',
        type: 'mapsAction',
        position: { x: 11 * STEP, y: 0 },
        data: {
          label: 'Google Maps Route',
          mapsProvider: 'google',
          origin: '{startingAddress}',
          destination: '{destinationCountry}',
          waypoints: '{routeActivities}',
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
          destination: '{destinationCountry}',
          waypoints: '{routeActivities}',
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
      { id: 'e-suggestModel-suggestActivities', source: 'suggestModel', target: 'suggestActivities', targetHandle: 'model' },
      { id: 'e-suggestActivities-googleRoute', source: 'suggestActivities', target: 'googleRoute' },
      { id: 'e-googleRoute-appleRoute', source: 'googleRoute', target: 'appleRoute' },
    ],
  },
]
