import { ILlamaService } from './LlamaService';
import {
  formatEntityExtractionPrompt,
} from './prompts';
import { INTENT_EXTRACTION_SAMPLING_CONFIG } from './modelConfig';

export interface ExtractedTransitQuery {
  intent: 'find_route' | 'greeting' | 'clarification' | 'general_faq';
  origin?: string;
  destination?: string;
  timePreference?: string;
  preferredMode?: string;
  rawQuery: string;
}

/**
 * Common Filipino and English greeting words
 */
const GREETING_REGEX =
  /^(?:kumusta|kamusta|musta|hello|hi|hey|good\s+(?:morning|afternoon|evening|day)|magandang\s+(?:araw|umaga|hapon|gabi))(?:\s+(?:po|coco|sa\s+iyo|lahat))?[!?.,]*$/i;

/**
 * Deterministic Regex Patterns for Commuter Queries
 */
interface RoutePattern {
  regex: RegExp;
  extract: (match: RegExpExecArray) => { origin?: string; destination?: string };
}

const TRANSIT_PATTERNS: RoutePattern[] = [
  // 1. "From X to Y", "how to go from X to Y", "commute from X to Y"
  {
    regex: /(?:(?:how\s+(?:can\s+i|to)\s+)?(?:get|go|commute|travel)\s+)?from\s+(.+?)\s+to\s+(.+)/i,
    extract: (m) => ({ origin: m[1], destination: m[2] }),
  },
  // 2. Filipino: "mula X hanggang/papuntang/pa- Y"
  {
    regex: /(?:paano\s+(?:mag-commute|pumunta|bumiyahe)?\s*)?mula\s+(?:sa\s+)?(.+?)\s+(?:hanggang|papunta(?:ng)?|pa-|patungo(?:ng)?)\s+(?:sa\s+)?(.+)/i,
    extract: (m) => ({ origin: m[1], destination: m[2] }),
  },
  // 3. Filipino: "galing X papuntang/pa-/hanggang Y"
  {
    regex: /(?:paano\s+(?:mag-commute|pumunta|bumiyahe)?\s*)?galing\s+(?:sa\s+)?(.+?)\s+(?:hanggang|papunta(?:ng)?|pa-|patungo(?:ng)?)\s+(?:sa\s+)?(.+)/i,
    extract: (m) => ({ origin: m[1], destination: m[2] }),
  },
  // 4. Filipino inverted: "saan sakayan pa-Y galing X" or "pa-Y galing X"
  {
    regex: /(?:(?:saan|nasaan)\s+(?:ang\s+)?sakayan(?:\s+ng\s+[a-zA-Z0-9\s]+?)?\s+)?pa-([^\s]+.*?)\s+(?:galing|mula)\s+(?:sa\s+)?(.+)/i,
    extract: (m) => ({ destination: m[1], origin: m[2] }),
  },
  // 5. Filipino inverted: "papuntang Y galing X" or "papunta sa Y mula sa X"
  {
    regex: /papunta(?:ng)?\s+(?:sa\s+)?(.+?)\s+(?:galing|mula)\s+(?:sa\s+)?(.+)/i,
    extract: (m) => ({ destination: m[1], origin: m[2] }),
  },
  // 6. Filipino inverted: "paano pumunta sa Y galing/mula sa X"
  {
    regex: /paano\s+pumunta\s+(?:sa\s+)?(.+?)\s+(?:galing|mula)\s+(?:sa\s+)?(.+)/i,
    extract: (m) => ({ destination: m[1], origin: m[2] }),
  },
  // 7. English inverted: "to Y from X"
  {
    regex: /(?:how\s+to\s+go\s+)?to\s+(.+?)\s+from\s+(.+)/i,
    extract: (m) => ({ destination: m[1], origin: m[2] }),
  },
  // 8. Direct shorthand: "X to Y" (e.g. "Lucena to SM Makati", "PITX to Cubao")
  {
    regex: /^([a-zA-Z0-9\s/.-]+?)\s+to\s+([a-zA-Z0-9\s/.-]+)$/i,
    extract: (m) => ({ origin: m[1], destination: m[2] }),
  },
];

/**
 * Single-location patterns for clarification detection
 */
const SINGLE_DESTINATION_PATTERNS = [
  /(?:paano\s+(?:pumunta|mag-commute)|(?:saan|nasaan)\s+(?:ang\s+)?sakayan(?:\s+ng\s+[a-zA-Z0-9\s]+?)?|sakayan)\s+(?:papunta(?:ng)?|pa-|sa)\s+(.+)/i,
  /papunta(?:ng)?\s+(?:sa\s+)?(.+)/i,
  /^pa-(.+)/i,
  /(?:how\s+(?:can\s+i|to)\s+(?:get|go)\s+to)\s+(.+)/i,
  /^to\s+(.+)/i,
];

const SINGLE_ORIGIN_PATTERNS = [
  /^(?:galing|mula|buhat)\s+(?:ako(?:ng)?\s+)?(?:sa\s+)?(.+)/i,
  /^(?:from|starting\s+from)\s+(.+)/i,
];

/**
 * Detect preferred transit mode mentioned in query
 */
export function extractPreferredMode(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (lower.includes('carousel') || lower.includes('busway') || lower.includes('bus')) {
    return 'bus';
  }
  if (lower.includes('mrt') || lower.includes('mrt3') || lower.includes('mrt-3')) {
    return 'mrt';
  }
  if (lower.includes('lrt') || lower.includes('lrt1') || lower.includes('lrt-1') || lower.includes('lrt2') || lower.includes('lrt-2')) {
    return 'lrt';
  }
  if (lower.includes('jeep') || lower.includes('jeepney')) {
    return 'jeepney';
  }
  if (lower.includes('uv') || lower.includes('fx')) {
    return 'uv';
  }
  if (lower.includes('pnr') || lower.includes('tren')) {
    return 'pnr';
  }
  if (lower.includes('ferry')) {
    return 'ferry';
  }
  return undefined;
}

/**
 * Cleans extracted location string by stripping filler words and punctuation
 */
export function cleanLocationString(raw: string): string {
  if (!raw) {
    return '';
  }

  let cleaned = raw
    .trim()
    .replace(/[?!.,;:]+$/, '')
    // Remove query filler clauses attached at end (e.g. "fare and travel time", "fare", "commute options", "travel time")
    .replace(/\s+(?:fare\s+and\s+travel\s+time|fare|commute\s+options|commute\s+guide|commute|options|travel\s+time|schedule|route\s+info)\b.*$/i, '')
    // Remove transit mode clauses attached at end (e.g. "gamit ang EDSA Carousel", "via MRT", "EDSA Carousel")
    .replace(/\s+(?:gamit\s+ang|via|using|by|sakay\s+ng|edsa\s+carousel|busway|carousel|mrt-?3?|lrt-?[12]?)\b.*$/i, '')
    // Remove operator prefix (e.g. "JAM Liner Batangas")
    .replace(/^(?:jac\s+liner|dltb(?:\s+co\.?)?|jam(?:\s+liner)?|alps(?:\s+the\s+bus)?|lli(?:\s+bus)?)\s+/i, '')
    // Remove leading prepositions/articles
    .replace(/^(?:sa|ang|yung|ung|the|papuntang|mula|galing|pa-)\s+/i, '')
    .trim();

  return cleaned;
}

/**
 * Fast Regex-Based Pattern Extraction
 */
export function extractEntitiesViaPatterns(query: string): ExtractedTransitQuery {
  const trimmed = query.trim();
  const preferredMode = extractPreferredMode(trimmed);

  // 1. Check pure greeting
  if (GREETING_REGEX.test(trimmed)) {
    return {
      intent: 'greeting',
      rawQuery: query,
    };
  }

  // 2. Check full origin + destination transit patterns
  for (const { regex, extract } of TRANSIT_PATTERNS) {
    const match = regex.exec(trimmed);
    if (match) {
      const { origin, destination } = extract(match);
      const cleanOrigin = origin ? cleanLocationString(origin) : undefined;
      const cleanDest = destination ? cleanLocationString(destination) : undefined;

      if (cleanOrigin && cleanDest) {
        return {
          intent: 'find_route',
          origin: cleanOrigin,
          destination: cleanDest,
          preferredMode,
          rawQuery: query,
        };
      }
    }
  }

  // 3. Check single destination
  for (const pat of SINGLE_DESTINATION_PATTERNS) {
    const match = pat.exec(trimmed);
    if (match && match[1]) {
      const dest = cleanLocationString(match[1]);
      if (dest) {
        return {
          intent: 'clarification',
          destination: dest,
          preferredMode,
          rawQuery: query,
        };
      }
    }
  }

  // 4. Check single origin
  for (const pat of SINGLE_ORIGIN_PATTERNS) {
    const match = pat.exec(trimmed);
    if (match && match[1]) {
      const orig = cleanLocationString(match[1]);
      if (orig) {
        return {
          intent: 'clarification',
          origin: orig,
          preferredMode,
          rawQuery: query,
        };
      }
    }
  }

  // 5. Default: treat as general question or clarification
  return {
    intent: 'general_faq',
    preferredMode,
    rawQuery: query,
  };
}

/**
 * Safely parse JSON from LLM response text
 */
function parseJsonOutput(text: string): any {
  if (!text) {
    return null;
  }
  const trimmed = text.trim();

  // Try direct parse
  try {
    return JSON.parse(trimmed);
  } catch {}

  // Try extracting from markdown fence
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {}
  }

  // Try finding first { and last }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.substring(firstBrace, lastBrace + 1));
    } catch {}
  }

  return null;
}

/**
 * Main Entity Extractor:
 * Combines low-latency SLM greedy extraction with instantaneous regex heuristics.
 */
export async function extractEntities(
  query: string,
  llamaService?: ILlamaService,
): Promise<ExtractedTransitQuery> {
  const trimmed = query.trim();

  // Fast-path: Greetings do not need LLM inference
  if (GREETING_REGEX.test(trimmed)) {
    return {
      intent: 'greeting',
      rawQuery: query,
    };
  }

  // Fast-path 2: Deterministic pattern matching for commuter queries
  const patternMatch = extractEntitiesViaPatterns(trimmed);
  if (
    patternMatch.intent === 'find_route' ||
    patternMatch.intent === 'clarification'
  ) {
    return patternMatch;
  }

  // If LlamaService is ready and loaded, attempt SLM extraction with greedy sampling
  if (llamaService && llamaService.isModelLoaded()) {
    try {
      const prompt = formatEntityExtractionPrompt(trimmed);
      let accumulatedOutput = '';

      await llamaService.generateStream(
        prompt,
        INTENT_EXTRACTION_SAMPLING_CONFIG,
        (_token, accumulated) => {
          accumulatedOutput = accumulated;
        },
      );

      const parsed = parseJsonOutput(accumulatedOutput);
      if (parsed && typeof parsed === 'object') {
        const intent = parsed.intent || 'find_route';
        const origin = parsed.origin ? cleanLocationString(String(parsed.origin)) : undefined;
        const destination = parsed.destination
          ? cleanLocationString(String(parsed.destination))
          : undefined;
        const timePreference = parsed.timePreference ? String(parsed.timePreference) : undefined;
        const preferredMode =
          parsed.preferredMode || extractPreferredMode(trimmed) || undefined;

        if (intent === 'greeting') {
          return {
            intent: 'greeting',
            rawQuery: query,
          };
        }

        if (origin && destination) {
          return {
            intent: 'find_route',
            origin,
            destination,
            timePreference,
            preferredMode,
            rawQuery: query,
          };
        }

        if (origin || destination) {
          return {
            intent: 'clarification',
            origin,
            destination,
            timePreference,
            preferredMode,
            rawQuery: query,
          };
        }
      }
    } catch (err) {
      console.warn('[EntityExtractor] SLM extraction failed, applying regex fallback:', err);
    }
  }

  // Fallback to deterministic regex extractor
  return extractEntitiesViaPatterns(query);
}
