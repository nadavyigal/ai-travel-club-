import { z } from 'zod';
import { AIProviders, createAIProvidersFromEnv } from './AIProviders';
import crypto from 'crypto';

// Request schema
export const TripPlanRequestSchema = z.object({
  tripId: z.string().uuid().optional(),
  destination: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().length(3).default('USD'),
  budgetTotal: z.number().positive(),
  group: z.object({
    memberIds: z.array(z.string().uuid()).optional(),
    preferences: z.object({
      travelStyle: z.string().optional(),
      dietary: z.array(z.string()).optional(),
      pace: z.enum(['slow', 'moderate', 'fast']).optional()
    }).optional()
  }).optional(),
  constraints: z.object({
    maxOptions: z.number().int().min(1).max(5).default(3),
    eventsFocus: z.boolean().optional()
  }).optional()
});

export type TripPlanRequest = z.infer<typeof TripPlanRequestSchema>;

// Response schema
const ActivitySchema = z.object({
  day: z.number().int().positive(),
  time: z.string().optional(),
  activity: z.string(),
  location: z.string().optional(),
  price: z.number().nonnegative().optional(),
  duration: z.string().optional()
});

const AccommodationSchema = z.object({
  name: z.string(),
  type: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  pricePerNight: z.number().nonnegative(),
  address: z.string().optional()
});

const TransportationSchema = z.object({
  type: z.string(),
  from: z.string(),
  to: z.string(),
  date: z.string(),
  price: z.number().nonnegative(),
  duration: z.string().optional()
});

const DiningSchema = z.object({
  name: z.string(),
  cuisine: z.string().optional(),
  meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  day: z.number().int().positive(),
  estimatedCost: z.number().nonnegative()
});

export const ItinerarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  aiModelUsed: z.string(),
  confidenceScore: z.number().min(0).max(1),
  totalCost: z.number().nonnegative(),
  currency: z.string().length(3),
  summary: z.string(),
  accommodations: z.array(AccommodationSchema),
  transportation: z.array(TransportationSchema),
  activities: z.array(ActivitySchema),
  dining: z.array(DiningSchema).optional()
});

export type Itinerary = z.infer<typeof ItinerarySchema>;

export interface TripPlanResponse {
  tripId: string;
  itineraries: Itinerary[];
  meta: {
    cached: boolean;
    latencyMs: number;
    modelUsed: string;
    tokensUsed?: number;
    promptVersion: string;
  };
}

// In-memory cache (in production, use Redis)
interface CacheEntry {
  response: TripPlanResponse;
  timestamp: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry>();

export class TripPlanningAIService {
  private aiProviders: AIProviders;
  private cacheTTL: number;
  private promptVersion = 'v1.0';

  constructor() {
    this.aiProviders = createAIProvidersFromEnv();
    this.cacheTTL = parseInt(process.env.AI_CACHE_TTL_SEC || '3600') * 1000;
  }

  /**
   * Generate trip plan with AI
   */
  async planTrip(request: TripPlanRequest): Promise<TripPlanResponse> {
    const startTime = Date.now();

    // Validate request
    const validatedRequest = TripPlanRequestSchema.parse(request);

    // Check cache
    const cacheKey = this.generateCacheKey(validatedRequest);
    const cached = this.getFromCache(cacheKey);

    if (cached) {
      console.log(`Cache hit for key: ${cacheKey.substring(0, 16)}...`);
      return {
        ...cached,
        meta: {
          ...cached.meta,
          cached: true,
          latencyMs: Date.now() - startTime
        }
      };
    }

    // Build prompt
    const prompt = this.buildPrompt(validatedRequest);

    // Call AI provider
    try {
      const aiResponse = await this.aiProviders.generateWithFallback(prompt);

      // Parse and validate response
      const itineraries = this.parseAndValidateResponse(
        aiResponse.content,
        validatedRequest,
        aiResponse.model
      );

      // Build response
      const response: TripPlanResponse = {
        tripId: validatedRequest.tripId || this.generateUUID(),
        itineraries,
        meta: {
          cached: false,
          latencyMs: Date.now() - startTime,
          modelUsed: aiResponse.model,
          tokensUsed: aiResponse.tokensUsed,
          promptVersion: this.promptVersion
        }
      };

      // Cache response
      this.saveToCache(cacheKey, response);

      return response;
    } catch (error: any) {
      console.error('Trip planning AI error:', error);

      // Return degraded single-option fallback
      return this.getDegradedFallback(validatedRequest, startTime);
    }
  }

  /**
   * Build AI prompt
   */
  private buildPrompt(request: TripPlanRequest): string {
    const numDays = this.calculateDays(request.startDate, request.endDate);
    const maxOptions = request.constraints?.maxOptions || 3;

    const prompt = `
Generate ${maxOptions} detailed travel itineraries for a trip to ${request.destination}.

Trip Details:
- Dates: ${request.startDate} to ${request.endDate} (${numDays} days)
- Budget: ${request.currency} ${request.budgetTotal}
- Group Size: ${request.group?.memberIds?.length || 1} people
${request.group?.preferences?.travelStyle ? `- Travel Style: ${request.group.preferences.travelStyle}` : ''}
${request.group?.preferences?.pace ? `- Pace: ${request.group.preferences.pace}` : ''}
${request.group?.preferences?.dietary?.length ? `- Dietary Restrictions: ${request.group.preferences.dietary.join(', ')}` : ''}
${request.constraints?.eventsFocus ? '- Focus on local events and experiences' : ''}

Generate ${maxOptions} diverse itinerary options with different themes (e.g., cultural immersion, adventure, relaxation, food-focused).

For each itinerary, provide:
1. A compelling title
2. A summary (2-3 sentences)
3. Accommodations with names, types, prices per night
4. Transportation details (flights, trains, local transport)
5. Daily activities with times, locations, and estimated costs
6. Dining recommendations with cuisine types and estimated costs
7. Total cost breakdown
8. A confidence score (0-1) based on availability and fit

Important constraints:
- Total cost for each itinerary must NOT exceed ${request.currency} ${request.budgetTotal}
- Sum of all component costs (accommodation + transport + activities + dining) must equal total cost
- Activities must cover all ${numDays} days
- Include realistic prices based on destination
- Confidence score should reflect seasonal factors, availability, and budget fit

Return ONLY valid JSON in this exact format:
{
  "itineraries": [
    {
      "id": "uuid-v4",
      "title": "string",
      "summary": "string",
      "aiModelUsed": "model-name",
      "confidenceScore": number (0-1),
      "totalCost": number,
      "currency": "string",
      "accommodations": [
        {
          "name": "string",
          "type": "string",
          "checkIn": "YYYY-MM-DD",
          "checkOut": "YYYY-MM-DD",
          "pricePerNight": number,
          "address": "string (optional)"
        }
      ],
      "transportation": [
        {
          "type": "string",
          "from": "string",
          "to": "string",
          "date": "YYYY-MM-DD",
          "price": number,
          "duration": "string (optional)"
        }
      ],
      "activities": [
        {
          "day": number (1-${numDays}),
          "time": "HH:MM (optional)",
          "activity": "string",
          "location": "string (optional)",
          "price": number (optional),
          "duration": "string (optional)"
        }
      ],
      "dining": [
        {
          "name": "string",
          "cuisine": "string (optional)",
          "meal": "breakfast|lunch|dinner|snack",
          "day": number (1-${numDays}),
          "estimatedCost": number
        }
      ]
    }
  ]
}

Generate exactly ${maxOptions} itineraries. Respond with ONLY the JSON, no additional text.
`.trim();

    return prompt;
  }

  /**
   * Parse and validate AI response
   */
  private parseAndValidateResponse(
    content: string,
    request: TripPlanRequest,
    modelUsed: string
  ): Itinerary[] {
    try {
      // Clean up content - remove markdown code blocks if present
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }

      // Additional cleanup: try to fix truncated JSON by finding the last complete object
      if (!cleanedContent.endsWith('}')) {
        console.warn('AI response appears truncated, attempting to fix...');
        // Find the last complete itinerary object
        const lastCompleteObject = cleanedContent.lastIndexOf('}');
        if (lastCompleteObject > 0) {
          // Truncate to last complete object and close the array
          cleanedContent = cleanedContent.substring(0, lastCompleteObject + 1) + ']}';
        }
      }

      // Parse JSON
      const parsed = JSON.parse(cleanedContent);

      if (!parsed.itineraries || !Array.isArray(parsed.itineraries)) {
        throw new Error('Invalid response format: missing itineraries array');
      }

      // Validate each itinerary
      const validatedItineraries: Itinerary[] = [];

      for (const itinerary of parsed.itineraries) {
        try {
          // Add generated ID if missing
          if (!itinerary.id) {
            itinerary.id = this.generateUUID();
          }

          // Add model name
          itinerary.aiModelUsed = modelUsed;

          // Ensure currency matches request
          itinerary.currency = request.currency;

          // Validate schema
          const validated = ItinerarySchema.parse(itinerary);

          // Business rule: verify total cost
          this.validateTotalCost(validated);

          // Business rule: verify budget constraint
          if (validated.totalCost > request.budgetTotal) {
            console.warn(`Itinerary ${validated.id} exceeds budget, skipping`);
            continue;
          }

          validatedItineraries.push(validated);
        } catch (error: any) {
          console.warn(`Skipping invalid itinerary: ${error.message}`);
        }
      }

      if (validatedItineraries.length === 0) {
        throw new Error('No valid itineraries generated');
      }

      // Limit to requested max
      const maxOptions = request.constraints?.maxOptions || 3;
      return validatedItineraries.slice(0, maxOptions);
    } catch (error: any) {
      console.error('Response parsing error:', error);
      throw new Error(`Failed to parse AI response: ${error.message}`);
    }
  }

  /**
   * Validate total cost matches sum of components
   */
  private validateTotalCost(itinerary: Itinerary): void {
    const accommodationCost = itinerary.accommodations.reduce(
      (sum, acc) => {
        const nights = this.calculateDays(acc.checkIn, acc.checkOut);
        return sum + (acc.pricePerNight * nights);
      },
      0
    );

    const transportationCost = itinerary.transportation.reduce(
      (sum, t) => sum + t.price,
      0
    );

    const activitiesCost = itinerary.activities.reduce(
      (sum, a) => sum + (a.price || 0),
      0
    );

    const diningCost = (itinerary.dining || []).reduce(
      (sum, d) => sum + d.estimatedCost,
      0
    );

    const calculatedTotal = accommodationCost + transportationCost + activitiesCost + diningCost;
    const difference = Math.abs(calculatedTotal - itinerary.totalCost);

    // Allow 5% variance for rounding
    const threshold = itinerary.totalCost * 0.05;

    if (difference > threshold) {
      console.warn(
        `Total cost mismatch for itinerary ${itinerary.id}: ` +
        `declared=${itinerary.totalCost}, calculated=${calculatedTotal}`
      );
      // Auto-correct to calculated total
      itinerary.totalCost = Math.round(calculatedTotal);
    }
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(request: TripPlanRequest): string {
    const relevantData = {
      destination: request.destination.toLowerCase().trim(),
      startDate: request.startDate,
      endDate: request.endDate,
      budgetTotal: request.budgetTotal,
      currency: request.currency,
      preferences: request.group?.preferences,
      eventsFocus: request.constraints?.eventsFocus,
      promptVersion: this.promptVersion
    };

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(relevantData))
      .digest('hex');

    return hash;
  }

  /**
   * Get from cache
   */
  private getFromCache(key: string): TripPlanResponse | null {
    const entry = cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      cache.delete(key);
      return null;
    }

    return entry.response;
  }

  /**
   * Save to cache
   */
  private saveToCache(key: string, response: TripPlanResponse): void {
    cache.set(key, {
      response,
      timestamp: Date.now(),
      ttl: this.cacheTTL
    });

    // Simple cache size management
    if (cache.size > 1000) {
      const firstKey = cache.keys().next().value;
      if (firstKey) {
        cache.delete(firstKey);
      }
    }
  }

  /**
   * Get degraded fallback response
   */
  private getDegradedFallback(request: TripPlanRequest, startTime: number): TripPlanResponse {
    const numDays = this.calculateDays(request.startDate, request.endDate);

    // Generate more realistic fallback activities
    const genericActivities = [
      { name: 'City Walking Tour', location: 'City Center' },
      { name: 'Visit Main Attractions', location: 'Tourist District' },
      { name: 'Local Museum Visit', location: 'Cultural District' },
      { name: 'Traditional Restaurant Experience', location: 'Local Area' },
      { name: 'Shopping and Local Markets', location: 'Market District' },
      { name: 'Parks and Recreation', location: 'Green Spaces' },
      { name: 'Historical Sites Tour', location: 'Old Town' },
      { name: 'Local Cuisine Tasting', location: 'Food District' },
      { name: 'Scenic Views and Photography', location: 'Viewpoints' },
      { name: 'Cultural Performance or Event', location: 'Entertainment District' }
    ];

    const fallbackActivities = Array.from({ length: numDays }, (_, i) => {
      const activityTemplate = genericActivities[i % genericActivities.length]!;
      return {
        day: i + 1,
        activity: `${activityTemplate.name} in ${request.destination}`,
        location: activityTemplate.location,
        price: Math.round((request.budgetTotal * 0.2) / numDays)
      };
    });

    const fallbackItinerary: Itinerary = {
      id: this.generateUUID(),
      title: `${numDays}-Day Discovery of ${request.destination}`,
      aiModelUsed: 'fallback',
      confidenceScore: 0.5,
      totalCost: request.budgetTotal * 0.9,
      currency: request.currency,
      summary: `A ${numDays}-day itinerary for ${request.destination}. Note: This is a basic plan. For detailed, personalized recommendations, please try again when AI service is available.`,
      accommodations: [
        {
          name: `Centrally Located Hotel in ${request.destination}`,
          type: 'hotel',
          checkIn: request.startDate,
          checkOut: request.endDate,
          pricePerNight: Math.round((request.budgetTotal * 0.5) / numDays),
          address: 'City Center'
        }
      ],
      transportation: [
        {
          type: 'flight',
          from: 'Your Location',
          to: request.destination,
          date: request.startDate,
          price: Math.round(request.budgetTotal * 0.2),
          duration: 'Varies by origin'
        }
      ],
      activities: fallbackActivities
    };

    return {
      tripId: request.tripId || this.generateUUID(),
      itineraries: [fallbackItinerary],
      meta: {
        cached: false,
        latencyMs: Date.now() - startTime,
        modelUsed: 'fallback',
        promptVersion: this.promptVersion
      }
    };
  }

  /**
   * Calculate days between dates
   */
  private calculateDays(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays || 1;
  }

  /**
   * Generate UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Singleton instance
let aiServiceInstance: TripPlanningAIService | null = null;

export function getTripPlanningAIService(): TripPlanningAIService {
  if (!aiServiceInstance) {
    aiServiceInstance = new TripPlanningAIService();
  }
  return aiServiceInstance;
}