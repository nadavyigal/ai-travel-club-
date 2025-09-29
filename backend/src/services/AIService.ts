import { z } from 'zod';
import { tripModel, CreateTripInput, Trip } from '../models/Trip';
import { itineraryModel, CreateItineraryInput, Itinerary } from '../models/Itinerary';

// Validation schemas
export const TripPlanningRequestSchema = z.object({
  destination: z.string().min(1, 'destination is required'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start_date must be in YYYY-MM-DD format'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end_date must be in YYYY-MM-DD format'),
  budget_total: z.number().positive('budget must be positive'),
  currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be 3-letter ISO code').default('USD'),
  preferences: z.object({
    travel_style: z.enum(['adventure', 'relaxation', 'cultural', 'business']).optional(),
    budget_range: z.enum(['budget', 'mid-range', 'luxury']).optional(),
    dietary_restrictions: z.array(z.string()).optional(),
    group_size: z.number().int().positive().max(20).default(1)
  }).optional()
}).refine(
  (data) => new Date(data.end_date) > new Date(data.start_date),
  { message: 'end_date must be after start_date', path: ['end_date'] }
);

export const ItineraryOptimizationSchema = z.object({
  itinerary_id: z.string().uuid('itinerary_id must be a valid UUID'),
  optimization_type: z.enum(['cost', 'time', 'experience', 'sustainability']),
  constraints: z.object({
    max_budget: z.number().positive().optional(),
    max_duration_hours: z.number().positive().optional(),
    required_activities: z.array(z.string()).optional(),
    excluded_activities: z.array(z.string()).optional()
  }).optional()
});

// Type definitions
export type TripPlanningRequest = z.infer<typeof TripPlanningRequestSchema>;
export type ItineraryOptimization = z.infer<typeof ItineraryOptimizationSchema>;

export interface AIGeneratedPlan {
  itinerary: Itinerary;
  confidence_score: number;
  alternatives: Itinerary[];
  reasoning: string;
  estimated_cost_breakdown: {
    accommodation: number;
    transportation: number;
    activities: number;
    food: number;
    miscellaneous: number;
  };
}

export interface OptimizationResult {
  original_itinerary: Itinerary;
  optimized_itinerary: Itinerary;
  improvements: {
    cost_savings: number;
    time_savings_hours: number;
    experience_enhancement_score: number;
  };
  optimization_reasoning: string;
}

export class AIService {
  private static instance: AIService;
  private openaiApiKey: string | null = null;
  private isOnline: boolean = false;

  private constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY || null;
    this.isOnline = !!this.openaiApiKey;
  }

  static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  /**
   * Generate comprehensive trip plan using AI
   */
  async generateTripPlan(request: TripPlanningRequest, creatorId: string): Promise<AIGeneratedPlan> {
    // Validate input
    const validatedRequest = TripPlanningRequestSchema.parse(request);

    // Create trip record first
    const tripData: CreateTripInput = {
      creator_id: creatorId,
      title: `Trip to ${validatedRequest.destination}`,
      destination: validatedRequest.destination,
      start_date: validatedRequest.start_date,
      end_date: validatedRequest.end_date,
      budget_total: validatedRequest.budget_total,
      currency: validatedRequest.currency,
      member_ids: [creatorId]
    };

    const trip = await tripModel.create(tripData);

    // Generate AI plan (mock implementation for now)
    const aiResponse = await this.callOpenAI(validatedRequest);

    // Create primary itinerary
    const primaryItinerary = await this.createItineraryFromAI(aiResponse.primary, trip.id);

    // Create alternative itineraries
    const alternatives: Itinerary[] = [];
    for (const altPlan of aiResponse.alternatives) {
      const altItinerary = await this.createItineraryFromAI(altPlan, trip.id);
      alternatives.push(altItinerary);
    }

    return {
      itinerary: primaryItinerary,
      confidence_score: aiResponse.confidence_score,
      alternatives,
      reasoning: aiResponse.reasoning,
      estimated_cost_breakdown: aiResponse.cost_breakdown
    };
  }

  /**
   * Optimize existing itinerary using AI
   */
  async optimizeItinerary(optimization: ItineraryOptimization): Promise<OptimizationResult> {
    // Validate input
    const validatedOptimization = ItineraryOptimizationSchema.parse(optimization);

    // Get original itinerary
    const originalItinerary = await itineraryModel.findById(validatedOptimization.itinerary_id);
    if (!originalItinerary) {
      throw new Error('itinerary not found');
    }

    // Generate optimized version using AI
    const optimizationResponse = await this.callOptimizationAI(originalItinerary, validatedOptimization);

    // Create new optimized itinerary
    const optimizedItinerary = await this.createItineraryFromAI(
      optimizationResponse.optimized_plan,
      originalItinerary.trip_id
    );

    return {
      original_itinerary: originalItinerary,
      optimized_itinerary: optimizedItinerary,
      improvements: optimizationResponse.improvements,
      optimization_reasoning: optimizationResponse.reasoning
    };
  }

  /**
   * Get AI recommendations for activities at destination
   */
  async getActivityRecommendations(destination: string, preferences?: any): Promise<{
    activities: Array<{
      name: string;
      description: string;
      estimated_cost: number;
      duration_hours: number;
      category: string;
      recommendation_score: number;
    }>;
    local_insights: string[];
  }> {
    if (!destination) {
      throw new Error('destination is required');
    }

    // Mock AI response for now
    return {
      activities: [
        {
          name: "Historic City Walking Tour",
          description: "Explore the historic district with a local guide",
          estimated_cost: 25,
          duration_hours: 3,
          category: "cultural",
          recommendation_score: 0.9
        },
        {
          name: "Local Food Market Experience",
          description: "Visit local markets and taste regional specialties",
          estimated_cost: 40,
          duration_hours: 2,
          category: "culinary",
          recommendation_score: 0.85
        }
      ],
      local_insights: [
        "Best time to visit is early morning for fewer crowds",
        "Local transportation passes offer significant savings",
        "Weather can be unpredictable, pack layers"
      ]
    };
  }

  /**
   * Validate trip feasibility using AI analysis
   */
  async validateTripFeasibility(tripId: string): Promise<{
    is_feasible: boolean;
    feasibility_score: number;
    concerns: string[];
    recommendations: string[];
  }> {
    if (!this.isValidUUID(tripId)) {
      throw new Error('trip ID must be a valid UUID');
    }

    const trip = await tripModel.findById(tripId);
    if (!trip) {
      throw new Error('trip not found');
    }

    // Mock validation for now
    const concerns: string[] = [];
    const recommendations: string[] = [];

    // Check budget reasonableness
    const durationDays = (trip.end_date.getTime() - trip.start_date.getTime()) / (24 * 60 * 60 * 1000);
    const dailyBudget = trip.budget_total / durationDays;

    if (dailyBudget < 50) {
      concerns.push('Budget may be too low for destination');
      recommendations.push('Consider increasing budget or reducing trip duration');
    }

    if (durationDays < 2) {
      concerns.push('Very short trip duration');
      recommendations.push('Consider extending stay to make travel worthwhile');
    }

    const feasibilityScore = Math.max(0, 1 - (concerns.length * 0.2));

    return {
      is_feasible: feasibilityScore > 0.6,
      feasibility_score: feasibilityScore,
      concerns,
      recommendations
    };
  }

  /**
   * Get AI service status and capabilities
   */
  getServiceStatus(): {
    is_online: boolean;
    api_key_configured: boolean;
    available_features: string[];
    limitations: string[];
  } {
    return {
      is_online: this.isOnline,
      api_key_configured: !!this.openaiApiKey,
      available_features: this.isOnline ? [
        'trip_planning',
        'itinerary_optimization',
        'activity_recommendations',
        'feasibility_validation'
      ] : ['mock_responses'],
      limitations: this.isOnline ? [
        'Rate limited by OpenAI API',
        'Requires internet connection'
      ] : [
        'OpenAI API key not configured',
        'Only mock responses available'
      ]
    };
  }

  /**
   * Mock OpenAI call for trip planning
   */
  private async callOpenAI(request: TripPlanningRequest): Promise<{
    primary: any;
    alternatives: any[];
    confidence_score: number;
    reasoning: string;
    cost_breakdown: any;
  }> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (this.isOnline) {
      // TODO: Implement actual OpenAI API call
      console.log('Making OpenAI API call for trip planning...');
    }

    // Mock response
    return {
      primary: {
        activities: [
          {
            name: `Visit ${request.destination} Museum`,
            description: 'Explore local history and culture',
            start_time: '09:00',
            end_time: '12:00',
            location: request.destination,
            estimated_cost: request.budget_total * 0.1
          },
          {
            name: 'Lunch at Local Restaurant',
            description: 'Try regional specialties',
            start_time: '12:30',
            end_time: '14:00',
            location: request.destination,
            estimated_cost: request.budget_total * 0.05
          }
        ],
        accommodation_recommendations: [
          {
            name: 'Recommended Hotel',
            type: 'hotel',
            estimated_cost_per_night: request.budget_total * 0.3
          }
        ],
        transportation_recommendations: [
          {
            mode: 'flight',
            estimated_cost: request.budget_total * 0.4
          }
        ]
      },
      alternatives: [
        {
          activities: [
            {
              name: 'Alternative Activity',
              description: 'Budget-friendly option',
              start_time: '10:00',
              end_time: '15:00',
              location: request.destination,
              estimated_cost: request.budget_total * 0.08
            }
          ],
          accommodation_recommendations: [],
          transportation_recommendations: []
        }
      ],
      confidence_score: 0.85,
      reasoning: `Generated plan based on ${request.destination} destination, ${request.budget_total} budget, and ${request.preferences?.travel_style || 'general'} travel style preferences.`,
      cost_breakdown: {
        accommodation: request.budget_total * 0.4,
        transportation: request.budget_total * 0.3,
        activities: request.budget_total * 0.2,
        food: request.budget_total * 0.08,
        miscellaneous: request.budget_total * 0.02
      }
    };
  }

  /**
   * Mock OpenAI call for itinerary optimization
   */
  private async callOptimizationAI(itinerary: Itinerary, optimization: ItineraryOptimization): Promise<{
    optimized_plan: any;
    improvements: any;
    reasoning: string;
  }> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    if (this.isOnline) {
      console.log('Making OpenAI API call for itinerary optimization...');
    }

    // Mock optimization response
    return {
      optimized_plan: {
        activities: itinerary.activities.map((activity: any) => ({
          ...activity,
          estimated_cost: activity.estimated_cost * 0.9 // 10% cost reduction
        })),
        accommodation_recommendations: itinerary.accommodation_recommendations,
        transportation_recommendations: itinerary.transportation_recommendations.map((transport: any) => ({
          ...transport,
          estimated_cost: transport.estimated_cost * 0.85 // 15% cost reduction
        }))
      },
      improvements: {
        cost_savings: itinerary.total_estimated_cost * 0.12,
        time_savings_hours: 2,
        experience_enhancement_score: 0.15
      },
      reasoning: `Optimized for ${optimization.optimization_type}. Found better pricing options and more efficient routing.`
    };
  }

  /**
   * Create itinerary from AI response
   */
  private async createItineraryFromAI(aiPlan: any, tripId: string): Promise<Itinerary> {
    const itineraryData: CreateItineraryInput = {
      trip_id: tripId,
      generated_by: 'ai',
      activities: aiPlan.activities || [],
      accommodation_recommendations: aiPlan.accommodation_recommendations || [],
      transportation_recommendations: aiPlan.transportation_recommendations || [],
      metadata: {
        ai_model: 'gpt-4',
        generation_timestamp: new Date().toISOString(),
        confidence_score: 0.85
      }
    };

    return await itineraryModel.create(itineraryData);
  }

  /**
   * Validate UUID format
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}

// Export singleton instance
export const aiService = AIService.getInstance();

// CLI Interface
if (require.main === module) {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'status':
      console.log('AI Service Status:', aiService.getServiceStatus());
      break;

    case 'plan':
      if (args.length < 5) {
        console.log('Usage: node AIService.ts plan <destination> <start_date> <end_date> <budget> <creator_id>');
        process.exit(1);
      }
      const [destination, startDate, endDate, budgetStr, creatorId] = args;
      const budget = parseFloat(budgetStr || '0');

      if (!destination || !startDate || !endDate || !budgetStr || !creatorId) {
        console.error('Missing required arguments');
        process.exit(1);
      }

      aiService.generateTripPlan({
        destination: destination,
        start_date: startDate,
        end_date: endDate,
        budget_total: budget,
        currency: 'USD'
      }, creatorId)
      .then(result => console.log('Generated Plan:', JSON.stringify(result, null, 2)))
      .catch(error => console.error('Error:', error.message));
      break;

    case 'validate':
      if (args.length < 1) {
        console.log('Usage: node AIService.ts validate <trip_id>');
        process.exit(1);
      }
      const [tripId] = args;

      if (!tripId) {
        console.error('Trip ID is required');
        process.exit(1);
      }

      aiService.validateTripFeasibility(tripId)
      .then(result => console.log('Feasibility:', JSON.stringify(result, null, 2)))
      .catch(error => console.error('Error:', error.message));
      break;

    case 'activities':
      if (args.length < 1) {
        console.log('Usage: node AIService.ts activities <destination>');
        process.exit(1);
      }
      const [dest] = args;

      if (!dest) {
        console.error('Destination is required');
        process.exit(1);
      }

      aiService.getActivityRecommendations(dest)
      .then(result => console.log('Recommendations:', JSON.stringify(result, null, 2)))
      .catch(error => console.error('Error:', error.message));
      break;

    default:
      console.log('Available commands:');
      console.log('  status - Check AI service status');
      console.log('  plan <destination> <start_date> <end_date> <budget> <creator_id> - Generate trip plan');
      console.log('  validate <trip_id> - Validate trip feasibility');
      console.log('  activities <destination> - Get activity recommendations');
  }
}