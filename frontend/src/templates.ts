import type { BlockNodeData, FormField } from './nodes/types'

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

// Every input the Vacation Planner needs, collected by one Form Trigger block instead
// of 15+ separate Variable blocks/groups on the canvas - running it pops up a form, and
// each answer is saved as a variable named `name` (same names the rest of the template
// already references as `{name}`).
const VACATION_FORM_FIELDS: FormField[] = [
  { name: 'destinationCountry', label: 'Destination country', varType: 'string', value: 'Italy' },
  { name: 'transportMode', label: 'Transport mode', varType: 'string', value: 'car' },
  { name: 'destinationActivities', label: 'Interests / activities', varType: 'string', value: 'hiking, museums, local food' },
  { name: 'stayType', label: 'Accommodation type', varType: 'string', value: 'hotel' },
  // The route can't be built without knowing where it starts - fed into both Maps Route
  // blocks' Origin below. There's no matching "destination address" field - that's
  // deliberately NOT asked here; an AI step further down picks one specific place
  // within destinationCountry based on the answers below, instead of making the user
  // name an exact place themselves.
  { name: 'startingAddress', label: 'Starting address', varType: 'string', value: 'Home' },
  { name: 'tripStartDate', label: 'Start date', varType: 'string', value: '2026-07-01' },
  { name: 'tripEndDate', label: 'End date', varType: 'string', value: '2026-07-10' },
  // int (not string) so a downstream If block can compare these numerically later,
  // e.g. "if tripChildren > 0" to steer toward family-friendly stops.
  { name: 'tripAdults', label: 'Adults', varType: 'int', value: '2' },
  { name: 'tripChildren', label: 'Children', varType: 'int', value: '0' },
  { name: 'tripBudget', label: 'Budget', varType: 'string', value: '2000 EUR' },
  { name: 'tripWeatherPreference', label: 'Weather preference', varType: 'string', value: 'warm and sunny' },
  // These three are informational only - there's no routing/distance API or web-search
  // node wired up yet, so they're folded into the itinerary prompt as hints for the AI
  // rather than hard constraints. Add real enforcement later without renaming them.
  { name: 'tripKmPerStop', label: 'Max driving per stop', varType: 'string', value: 'max 150 km per day' },
  { name: 'tripDestinationRadius', label: 'Radius around destination', varType: 'string', value: '20 km around the final destination' },
  { name: 'tripExcludedSiteTypes', label: 'Sources to avoid', varType: 'string', value: 'social media, ad-heavy blogs' },
]

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
      'Enter a country, transport, activities and stay type - AI picks a specific destination for you, drafts an itinerary, then builds real Google/Apple Maps routes.',
    nodes: [
      {
        id: 'trigger',
        type: 'formTrigger',
        position: { x: 0 * STEP, y: 0 },
        data: { label: 'Plan My Trip', fields: VACATION_FORM_FIELDS },
      },
      {
        // Seeded blank so the Maps Route destinations below render cleanly even if the
        // activity suggestion is rejected (no accepted stops to weave in yet).
        id: 'routeActivitiesSeed',
        type: 'variable',
        position: { x: 1 * STEP, y: 0 },
        data: { label: 'routeActivities', varType: 'string', value: '' },
      },
      {
        // Same reasoning as routeActivitiesSeed, but for the Trip Cost block's
        // "at the destination" input if the suggestion is rejected.
        id: 'destinationStopsSeed',
        type: 'variable',
        position: { x: 1 * STEP, y: 200 },
        data: { label: 'destinationStops', varType: 'string', value: '' },
      },
      {
        id: 'pickDestInput',
        type: 'aiInput',
        position: { x: 2 * STEP, y: 0 },
        data: {
          label: 'pickDestInput',
          value:
            'Country/region: {destinationCountry}. Traveler interests: {destinationActivities}. ' +
            'Weather preference: {tripWeatherPreference}. Accommodation type: {stayType}. ' +
            'Recommend ONE specific city or region within {destinationCountry} to use as the trip\'s ' +
            "destination, chosen to best match these interests and preferences. Reply with ONLY the " +
            "place name and country (e.g. \"Florence, Italy\") - nothing else, no explanation.",
        },
      },
      {
        id: 'pickDestAgent',
        type: 'aiAgent',
        position: { x: 3 * STEP, y: 0 },
        data: {
          label: 'Pick Destination Agent',
          prompt:
            'You are a knowledgeable travel destination expert. Given a country/region and trip ' +
            'preferences, name exactly one ideal specific destination (a city or region) - concise, ' +
            'no extra commentary.',
        },
      },
      {
        id: 'destinationAddress',
        type: 'aiOutput',
        position: { x: 4 * STEP, y: 0 },
        data: { label: 'destinationAddress' },
      },
      {
        id: 'planInput',
        type: 'aiInput',
        position: { x: 5 * STEP, y: 0 },
        data: {
          label: 'planInput',
          value:
            'Plan a {stayType} vacation in {destinationCountry}, starting the trip from {startingAddress} and ending in {destinationAddress}, from {tripStartDate} to {tripEndDate}. ' +
            'Travelers: {tripAdults} adult(s) and {tripChildren} child(ren), budget {tripBudget}. We are traveling by {transportMode} and enjoy {destinationActivities}. ' +
            'Preferred weather: {tripWeatherPreference}. Keep driving to roughly {tripKmPerStop}, and favor stops within {tripDestinationRadius}. ' +
            "Don't base suggestions on {tripExcludedSiteTypes}. Suggest a day-by-day itinerary with the best stops to visit.",
        },
      },
      {
        id: 'planAgent',
        type: 'aiAgent',
        position: { x: 6 * STEP, y: 0 },
        data: {
          label: 'Vacation Planner Agent',
          prompt: 'You are a helpful travel planner. Write a clear day-by-day itinerary matching the traveler\'s starting point, destination, transport, interests, dates, group size, budget, and accommodation preference.',
        },
      },
      {
        id: 'planModel',
        type: 'aiModel',
        position: { x: 6 * STEP + 120, y: 280 },
        data: { label: 'Model', credentialId: null },
      },
      {
        id: 'vacationPlan',
        type: 'aiOutput',
        position: { x: 7 * STEP, y: 0 },
        data: { label: 'vacationPlan' },
      },
      {
        id: 'suggestActivities',
        type: 'activitySuggestion',
        position: { x: 8 * STEP, y: 0 },
        data: {
          label: 'Suggest Activities',
          origin: '{startingAddress}',
          activityContext: '{destinationAddress}',
          interests: '{destinationActivities}',
          outputVariable: 'routeActivities',
          destinationOutputVariable: 'destinationStops',
        },
      },
      {
        id: 'suggestModel',
        type: 'aiModel',
        position: { x: 8 * STEP + 120, y: 280 },
        data: { label: 'Model', credentialId: null },
      },
      {
        id: 'googleRoute',
        type: 'mapsAction',
        position: { x: 9 * STEP, y: 0 },
        data: {
          label: 'Google Maps Route',
          mapsProvider: 'google',
          origin: '{startingAddress}',
          destination: '{destinationAddress}',
          waypoints: '{routeActivities}',
          travelMode: 'driving',
          outputVariable: 'googleMapsRoute',
        },
      },
      {
        id: 'appleRoute',
        type: 'mapsAction',
        position: { x: 10 * STEP, y: 0 },
        data: {
          label: 'Apple Maps Route',
          mapsProvider: 'apple',
          origin: '{startingAddress}',
          destination: '{destinationAddress}',
          waypoints: '{routeActivities}',
          travelMode: 'driving',
          outputVariable: 'appleMapsRoute',
        },
      },
      {
        id: 'costEstimate',
        type: 'costEstimate',
        position: { x: 9 * STEP, y: 400 },
        data: {
          label: 'Trip Cost',
          waypoints: '{routeActivities}',
          destinationStops: '{destinationStops}',
          origin: '{startingAddress}',
          activityContext: '{destinationAddress}',
          stayType: '{stayType}',
          transportMode: '{transportMode}',
          checkInDate: '{tripStartDate}',
          checkOutDate: '{tripEndDate}',
          adults: '{tripAdults}',
          children: '{tripChildren}',
          budget: '{tripBudget}',
          currency: 'EUR',
          outputVariable: 'tripCostEstimate',
        },
      },
      {
        id: 'tripSummary',
        type: 'tripSummary',
        position: { x: 10 * STEP, y: 400 },
        data: {
          label: 'Trip PDF',
          activityContext: '{destinationAddress}',
          checkInDate: '{tripStartDate}',
          checkOutDate: '{tripEndDate}',
          itinerary: '{vacationPlan}',
          googleMapsLink: '{googleMapsRoute}',
          appleMapsLink: '{appleMapsRoute}',
          costBreakdownData: '{tripCostEstimate}',
        },
      },
    ],
    edges: [
      { id: 'e-trigger-routeActivitiesSeed', source: 'trigger', target: 'routeActivitiesSeed' },
      { id: 'e-routeActivitiesSeed-destinationStopsSeed', source: 'routeActivitiesSeed', target: 'destinationStopsSeed' },
      { id: 'e-destinationStopsSeed-pickDestInput', source: 'destinationStopsSeed', target: 'pickDestInput' },
      { id: 'e-pickDestInput-pickDestAgent', source: 'pickDestInput', target: 'pickDestAgent' },
      // Reuses planModel's AI Model block (a second edge from the same node) instead of
      // another Model block on the canvas - one connected key can feed several blocks.
      { id: 'e-planModel-pickDestAgent', source: 'planModel', target: 'pickDestAgent', targetHandle: 'model' },
      { id: 'e-pickDestAgent-destinationAddress', source: 'pickDestAgent', target: 'destinationAddress' },
      { id: 'e-destinationAddress-planInput', source: 'destinationAddress', target: 'planInput' },
      { id: 'e-planInput-planAgent', source: 'planInput', target: 'planAgent' },
      { id: 'e-planModel-planAgent', source: 'planModel', target: 'planAgent', targetHandle: 'model' },
      { id: 'e-planAgent-vacationPlan', source: 'planAgent', target: 'vacationPlan' },
      { id: 'e-vacationPlan-suggestActivities', source: 'vacationPlan', target: 'suggestActivities' },
      { id: 'e-suggestModel-suggestActivities', source: 'suggestModel', target: 'suggestActivities', targetHandle: 'model' },
      { id: 'e-suggestActivities-googleRoute', source: 'suggestActivities', target: 'googleRoute' },
      { id: 'e-googleRoute-appleRoute', source: 'googleRoute', target: 'appleRoute' },
      // Chained after both routes (not run in parallel off suggestActivities) so it's
      // guaranteed to start only once googleMapsRoute/appleMapsRoute are already saved -
      // the Trip PDF block below needs both of those plus the cost breakdown to exist.
      { id: 'e-appleRoute-costEstimate', source: 'appleRoute', target: 'costEstimate' },
      // Reuses suggestModel's AI Model block (a second edge from the same node) instead
      // of another Model block on the canvas - one connected key can feed several blocks.
      { id: 'e-suggestModel-costEstimate', source: 'suggestModel', target: 'costEstimate', targetHandle: 'model' },
      { id: 'e-costEstimate-tripSummary', source: 'costEstimate', target: 'tripSummary' },
    ],
  },
]
