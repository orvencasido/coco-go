import { ILlamaService, LlamaService } from './LlamaService';
import { IRouteSolver, RouteSolver } from '../transit/RouteSolver';
import { ITransitDatabase, TransitDatabase } from '../transit/TransitDatabase';
import { extractEntities, ExtractedTransitQuery } from './entityExtractor';
import {
  formatRouteSynthesisPrompt,
  formatGreetingPrompt,
  formatFallbackNotFoundPrompt,
  formatClarificationPrompt,
  formatGeneralFaqPrompt,
} from './prompts';
import {
  TRANSIT_SYNTHESIS_SAMPLING_CONFIG,
  FAST_CHAT_SAMPLING_CONFIG,
} from './modelConfig';
import { TransitRouteOption } from '@/types/transit';
import { InferenceMetrics } from '@/types/ai';

export interface ChatOrchestratorCallbacks {
  onToken?: (token: string, accumulated: string) => void;
  onRoutesFound?: (routes: TransitRouteOption[]) => void;
}

export interface ChatOrchestrationResult {
  content: string;
  intent: 'find_route' | 'greeting' | 'clarification' | 'general_faq' | 'route_not_found';
  routeOptions: TransitRouteOption[];
  routeResult?: TransitRouteOption;
  metrics?: InferenceMetrics;
  extractedQuery: ExtractedTransitQuery;
}

export interface IChatOrchestrator {
  handleUserMessage(
    userMessage: string,
    callbacks?: ChatOrchestratorCallbacks,
  ): Promise<ChatOrchestrationResult>;
}

/**
 * ChatOrchestrator coordinates the multi-stage local RAG pipeline:
 * 1. Intent & entity extraction (SLM greedy generation with resilient regex fallback)
 * 2. Route calculation (deterministic RouteSolver querying SQLite / in-memory transit DB)
 * 3. Verified ground-truth prompt injection with zero-hallucination guardrails
 * 4. Token-streamed synthesis with warm Filipino/Taglish persona ('Coco')
 * 5. Structured TransitRouteOption[] packaging for interactive UI leg cards
 */
export class ChatOrchestratorImpl implements IChatOrchestrator {
  private llamaService: ILlamaService;
  private routeSolver: IRouteSolver;
  private db: ITransitDatabase;

  constructor(
    llamaService: ILlamaService = LlamaService,
    routeSolver: IRouteSolver = RouteSolver,
    database: ITransitDatabase = TransitDatabase,
  ) {
    this.llamaService = llamaService;
    this.routeSolver = routeSolver;
    this.db = database;
  }

  public async handleUserMessage(
    userMessage: string,
    callbacks?: ChatOrchestratorCallbacks,
  ): Promise<ChatOrchestrationResult> {
    const trimmedInput = userMessage.trim();

    // 1. Ensure local transit database is ready
    if (!this.db.isReady()) {
      await this.db.initialize();
    }

    // 2. Step 1: Extract transit intent, origin, and destination
    const extracted = await extractEntities(trimmedInput, this.llamaService);

    // 3. Step 2 & 3: Intent routing & processing
    // Case A: Conversational greeting ("kumusta", "hi", "hello")
    if (extracted.intent === 'greeting') {
      const prompt = formatGreetingPrompt(trimmedInput);
      let accumulated = '';

      const metrics = await this.llamaService.generateStream(
        prompt,
        FAST_CHAT_SAMPLING_CONFIG,
        (token, text) => {
          accumulated = text;
          callbacks?.onToken?.(token, text);
        },
      );

      return {
        content: accumulated,
        intent: 'greeting',
        routeOptions: [],
        metrics,
        extractedQuery: extracted,
      };
    }

    // Case B: Incomplete transit request (missing origin or destination)
    const isMissingOrigin = !extracted.origin;
    const isMissingDest = !extracted.destination;

    if (
      extracted.intent === 'clarification' ||
      (extracted.intent === 'find_route' && (isMissingOrigin || isMissingDest))
    ) {
      let missingType: 'origin' | 'destination' | 'both' = 'both';
      let knownLocation: string | undefined;

      if (isMissingOrigin && !isMissingDest) {
        missingType = 'origin';
        knownLocation = extracted.destination;
      } else if (!isMissingOrigin && isMissingDest) {
        missingType = 'destination';
        knownLocation = extracted.origin;
      }

      const prompt = formatClarificationPrompt(
        trimmedInput,
        missingType,
        knownLocation,
      );

      let accumulated = '';
      const metrics = await this.llamaService.generateStream(
        prompt,
        FAST_CHAT_SAMPLING_CONFIG,
        (token, text) => {
          accumulated = text;
          callbacks?.onToken?.(token, text);
        },
      );

      return {
        content: accumulated,
        intent: 'clarification',
        routeOptions: [],
        metrics,
        extractedQuery: extracted,
      };
    }

    // Case C: Transit intent with both origin & destination identified
    if (extracted.origin && extracted.destination) {
      // Step 2b: Query RouteSolver for verified routes
      const routes = await this.routeSolver.findRoutes(
        extracted.origin,
        extracted.destination,
      );

      // Immediately pass structured routes to UI callback if found
      if (routes.length > 0 && callbacks?.onRoutesFound) {
        callbacks.onRoutesFound(routes);
      }

      if (routes.length > 0) {
        // Step 3: Package verified route ground-truth into synthesis prompt
        const synthesisPrompt = formatRouteSynthesisPrompt(trimmedInput, routes);
        let accumulated = '';

        // Step 4: Stream grounded response
        const metrics = await this.llamaService.generateStream(
          synthesisPrompt,
          TRANSIT_SYNTHESIS_SAMPLING_CONFIG,
          (token, text) => {
            accumulated = text;
            callbacks?.onToken?.(token, text);
          },
        );

        // Step 5: Return both streamed text and structured transit cards
        return {
          content: accumulated,
          intent: 'find_route',
          routeOptions: routes,
          routeResult: routes[0],
          metrics,
          extractedQuery: extracted,
        };
      } else {
        // Route not found in offline database
        const fallbackPrompt = formatFallbackNotFoundPrompt(
          trimmedInput,
          extracted.origin,
          extracted.destination,
        );

        let accumulated = '';
        const metrics = await this.llamaService.generateStream(
          fallbackPrompt,
          FAST_CHAT_SAMPLING_CONFIG,
          (token, text) => {
            accumulated = text;
            callbacks?.onToken?.(token, text);
          },
        );

        return {
          content: accumulated,
          intent: 'route_not_found',
          routeOptions: [],
          metrics,
          extractedQuery: extracted,
        };
      }
    }

    // Case D: General Transit FAQ or other questions
    const faqPrompt = formatGeneralFaqPrompt(trimmedInput);
    let accumulated = '';

    const metrics = await this.llamaService.generateStream(
      faqPrompt,
      FAST_CHAT_SAMPLING_CONFIG,
      (token, text) => {
        accumulated = text;
        callbacks?.onToken?.(token, text);
      },
    );

    return {
      content: accumulated,
      intent: 'general_faq',
      routeOptions: [],
      metrics,
      extractedQuery: extracted,
    };
  }
}

export const ChatOrchestrator = new ChatOrchestratorImpl();
