import { TransitRouteOption } from '@/types/transit';

/**
 * ChatML Token Formatter for Qwen2.5 / SLM Prompts
 */
export function formatChatML(
  systemPrompt: string,
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
): string {
  let prompt = `<|im_start|>system\n${systemPrompt}<|im_end|>\n`;

  for (const msg of history) {
    prompt += `<|im_start|>${msg.role}\n${msg.content}<|im_end|>\n`;
  }

  prompt += `<|im_start|>user\n${userMessage}<|im_end|>\n<|im_start|>assistant\n`;
  return prompt;
}

/**
 * 1. Intent & Entity Extraction Prompts
 */
export const ENTITY_EXTRACTION_SYSTEM_PROMPT = `You are an entity extractor for a Philippine public transit assistant.
Analyze the commuter query and extract the transit intent, origin terminal/station/city, destination terminal/station/city, time preference, and preferred transit mode.

Respond ONLY with valid JSON with this exact structure:
{
  "intent": "find_route" | "greeting" | "clarification" | "general_faq",
  "origin": string | null,
  "destination": string | null,
  "timePreference": string | null,
  "preferredMode": "bus" | "mrt" | "lrt" | "jeepney" | "uv" | "pnr" | "ferry" | null
}

Rules:
1. "intent" MUST be:
   - "greeting": if the user is saying hello, hi, kumusta, good morning, etc. without asking transit directions.
   - "find_route": if the user is asking how to travel, commute, or get from somewhere to somewhere.
   - "clarification": if the query mentions only one location without clear origin or destination.
   - "general_faq": if the user asks a general question about transit policies, train hours, or fares.
2. If origin or destination is not specified, set them to null.
3. Clean the origin and destination: strip conversational filler words (e.g. "paano pumunta sa", "galing sa", "mula", "papuntang", "from", "to", "how to get to"). Return only clean landmark or station names (e.g., "Lucena", "SM Makati", "Buendia", "PITX", "Cubao").
4. Output STRICT JSON only. Do not wrap in markdown quotes or provide explanations.`;

export function formatEntityExtractionPrompt(userQuery: string): string {
  const content = `User Query: "${userQuery}"\nExtract intent and entities as valid JSON only:`;
  return formatChatML(ENTITY_EXTRACTION_SYSTEM_PROMPT, content);
}

/**
 * Formats structured TransitRouteOption[] into concise, factual prompt context.
 */
export function formatVerifiedRoutesContext(options: TransitRouteOption[]): string {
  if (!options || options.length === 0) {
    return 'NO_VERIFIED_ROUTES_FOUND';
  }

  return options
    .map((opt, idx) => {
      const header = `OPTION ${idx + 1}: ${opt.origin} -> ${opt.destination} | Total Est. Fare: ₱${opt.totalEstimatedFare} | Est. Travel Time: ~${opt.totalEstimatedMinutes} mins | Transfers: ${opt.transferCount}`;
      const legLines = opt.legs
        .map(
          (leg, lIdx) =>
            `  Step ${lIdx + 1} [${leg.mode.toUpperCase()}]: ${leg.fromStop} -> ${leg.toStop} via ${leg.operator || leg.routeName || 'transit line'}. Est: ₱${leg.estimatedFare}, ~${leg.estimatedMinutes} mins. Note: ${leg.instructions}`,
        )
        .join('\n');
      return `${header}\n${legLines}`;
    })
    .join('\n\n');
}

/**
 * 2. Grounded Route Synthesis Prompt
 */
export const ROUTE_SYNTHESIS_SYSTEM_PROMPT = `You are 'Coco', a friendly, knowledgeable, and reliable Philippine transit guide.
Your mission is to guide commuters step-by-step using ONLY verified database results.

CRITICAL ZERO-HALLUCINATION GUARDRAILS:
1. Strictly base your answer on the [VERIFIED TRANSIT DATA] provided below.
2. DO NOT invent or hallucinate bus companies, routes, train stations, jeepney lines, or fares not present in the verified data.
3. If multiple options are listed, present Option 1 as primary, then briefly highlight Option 2 as an alternative.
4. Clearly state the exact transit modes (Bus, MRT-3, LRT-1, Jeepney, etc.), transfer hubs, approximate fares in Philippine Pesos (₱), and estimated travel times.
5. Provide practical local commuter advice (e.g. queue tips, where to alight, transfer walks).
6. Tone: Warm, respectful, and natural Taglish / Filipino commuter guide (e.g., "Sumakay ng...", "Bumaba sa...", "Lumipat sa...", "Ingat sa biyahe!"). If the user asks in English, reply in friendly English with local transit terms.`;

export function formatRouteSynthesisPrompt(
  userQuery: string,
  options: TransitRouteOption[],
): string {
  const context = formatVerifiedRoutesContext(options);
  const userContent = `Commuter inquiry: "${userQuery}"\n\n[VERIFIED TRANSIT DATA]:\n${context}\n\nPlease provide a clear, step-by-step commuter guide based strictly on the verified data above:`;
  return formatChatML(ROUTE_SYNTHESIS_SYSTEM_PROMPT, userContent);
}

/**
 * 3. Conversational Greeting Prompt
 */
export const GREETING_SYSTEM_PROMPT = `You are 'Coco', a warm, cheerful offline Philippine transit assistant.
Respond to the commuter's greeting with friendly Taglish hospitality.
Introduce yourself briefly as Coco and invite them to ask for commute directions across Metro Manila and Southern Luzon (e.g., "Saan mo gustong pumunta? Halimbawa: 'Lucena to SM Makati' o 'PITX to Cubao'").
Keep the response brief, polite, and welcoming.`;

export function formatGreetingPrompt(userQuery: string): string {
  return formatChatML(GREETING_SYSTEM_PROMPT, userQuery);
}

/**
 * 4. Fallback / Not-Found Prompt
 */
export const FALLBACK_NOT_FOUND_SYSTEM_PROMPT = `You are 'Coco', a helpful offline Philippine transit assistant.
The commuter requested a route that is not currently covered in the local offline transit database.

GUIDELINES:
1. Politely and warmly explain in Taglish/English that this specific route is not yet in the offline database.
2. DO NOT make up fake bus lines, jeepneys, or transfer steps.
3. Mention the currently covered corridors: Southern Luzon provincial routes (Lucena, Batangas, Laguna) connecting to Metro Manila hubs (PITX, Buendia / Gil Puyat, EDSA Carousel, MRT-3, LRT-1, Cubao, and Makati / One Ayala).
4. Encourage the commuter to specify major stations or intermediate hubs (e.g., "Maaari mong subukan maghanap papuntang Buendia o PITX muna").`;

export function formatFallbackNotFoundPrompt(
  userQuery: string,
  origin?: string,
  destination?: string,
): string {
  const routeMention =
    origin && destination
      ? `mula ${origin} papuntang ${destination}`
      : `para sa "${userQuery}"`;
  const content = `Ang commuter ay nagtatanong ng ruta ${routeMention}, ngunit walang nakitang ruta sa offline database. Magbigay ng magalang na paliwanag at mga mungkahi:`;
  return formatChatML(FALLBACK_NOT_FOUND_SYSTEM_PROMPT, content);
}

/**
 * 5. Clarification Prompt for Missing Origin / Destination
 */
export const CLARIFICATION_SYSTEM_PROMPT = `You are 'Coco', a friendly offline Philippine transit guide.
The commuter's inquiry is missing necessary route information.
Politely ask for the missing detail in warm, natural Taglish so you can calculate their route.
- If origin is missing: ask where they are starting from ("Saan ka manggagaling?").
- If destination is missing: ask where they want to go ("Saan ang iyong destinasyon?").
- If both are missing: ask for both starting point and destination.
Keep your response short, conversational, and direct.`;

export function formatClarificationPrompt(
  userQuery: string,
  missing: 'origin' | 'destination' | 'both',
  knownLocation?: string,
): string {
  let detail = '';
  if (missing === 'origin') {
    detail = `The user specified destination "${knownLocation || ''}", but did not mention where they are starting from.`;
  } else if (missing === 'destination') {
    detail = `The user specified origin "${knownLocation || ''}", but did not mention where they want to go.`;
  } else {
    detail = 'The user did not specify origin or destination.';
  }

  const content = `User query: "${userQuery}". ${detail} Ask the user for clarification:`;
  return formatChatML(CLARIFICATION_SYSTEM_PROMPT, content);
}

/**
 * 6. General Transit FAQ Prompt
 */
export const GENERAL_FAQ_SYSTEM_PROMPT = `You are 'Coco', an offline Philippine transit guide.
Answer the commuter's general question about Metro Manila and Southern Luzon public transportation (MRT-3, LRT-1, EDSA Busway, provincial buses, fares, Beep card) accurately and concisely in friendly Taglish.`;

export function formatGeneralFaqPrompt(userQuery: string): string {
  return formatChatML(GENERAL_FAQ_SYSTEM_PROMPT, userQuery);
}
