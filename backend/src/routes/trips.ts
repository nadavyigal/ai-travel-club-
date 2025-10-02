import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { getTripPlanningAIService, TripPlanRequestSchema as AIServiceRequestSchema } from '../services/TripPlanningAIService';
import { tripModel } from '../models/Trip';
import { itineraryModel } from '../models/Itinerary';

const router = Router();

// Validation schema for HTTP endpoint (maps to AI service schema)
const TripPlanRequestSchema = z.object({
  prompt: z.string().min(1, 'prompt is required').optional(),
  destination: z.string().min(1, 'destination is required'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start_date must be in YYYY-MM-DD format'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end_date must be in YYYY-MM-DD format'),
  budget: z.number().positive('budget must be positive'),
  currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be 3-letter ISO code').default('USD'),
  group_size: z.number().int().positive().max(20, 'group_size cannot exceed 20').default(1).optional(),
  preferences: z.object({
    accommodation_type: z.enum(['hotel', 'apartment', 'hostel', 'any']).optional(),
    activity_types: z.array(z.string()).optional(),
    travel_style: z.string().optional(),
    dietary: z.array(z.string()).optional(),
    pace: z.enum(['slow', 'moderate', 'fast']).optional()
  }).optional(),
  constraints: z.object({
    max_options: z.number().int().min(1).max(5).default(3),
    events_focus: z.boolean().optional()
  }).optional()
}).refine(
  (data) => new Date(data.end_date) > new Date(data.start_date),
  { message: 'end_date must be after start_date', path: ['end_date'] }
);

// POST /v1/trips/plan - AI Trip Planning Endpoint
router.post('/plan', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const startTime = Date.now();
  console.log('═══════════════════════════════════════');
  console.log('📍 BACKEND: Received trip planning request');
  console.log('👤 User ID:', req.user?.id);
  console.log('📧 User Email:', req.user?.email);
  console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
  console.log('═══════════════════════════════════════');

  try {
    // Validate request body
    const validatedData = TripPlanRequestSchema.parse(req.body);
    console.log('✅ Request validated successfully');

    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'authentication required',
        code: 401
      });
    }

    // Map HTTP request to AI service request format
    const aiRequest = {
      destination: validatedData.destination,
      startDate: validatedData.start_date,
      endDate: validatedData.end_date,
      budgetTotal: validatedData.budget,
      currency: validatedData.currency || 'USD',
      group: {
        memberIds: validatedData.group_size ? Array(validatedData.group_size).fill(req.user.id) : [req.user.id],
        preferences: {
          travelStyle: validatedData.preferences?.travel_style,
          dietary: validatedData.preferences?.dietary,
          pace: validatedData.preferences?.pace
        }
      },
      constraints: {
        maxOptions: validatedData.constraints?.max_options || 3,
        eventsFocus: validatedData.constraints?.events_focus
      }
    };

    // Get AI service instance
    const aiService = getTripPlanningAIService();

    // Generate trip plan with new AI service
    const aiResult = await aiService.planTrip(aiRequest);

    // Create trip record in database
    const tripId = aiResult.tripId;

    // Store trip and itineraries in database
    try {
      // Create trip if it doesn't exist
      const existingTrip = await tripModel.findById(tripId);
      if (!existingTrip) {
        await tripModel.create({
          creator_id: req.user.id,
          title: `Trip to ${validatedData.destination}`,
          destination: validatedData.destination,
          start_date: validatedData.start_date,
          end_date: validatedData.end_date,
          budget_total: validatedData.budget,
          currency: validatedData.currency || 'USD',
          member_ids: [req.user.id]
        });
      }

      // Store each itinerary
      for (const itinerary of aiResult.itineraries) {
        await itineraryModel.create({
          trip_id: tripId,
          generated_by: itinerary.aiModelUsed,
          activities: itinerary.activities.map(act => ({
            name: act.activity,
            location: act.location || '',
            estimated_cost: act.price || 0,
            duration: act.duration ? parseInt(act.duration) : undefined,
            start_time: act.time
          })),
          accommodation_recommendations: itinerary.accommodations.map(acc => ({
            name: acc.name,
            type: acc.type,
            location: acc.address || '',
            estimated_cost: acc.pricePerNight
          })),
          transportation_recommendations: itinerary.transportation.map(trans => ({
            type: trans.type,
            from: trans.from,
            to: trans.to,
            estimated_cost: trans.price,
            duration: trans.duration ? parseInt(trans.duration) : undefined
          })),
          metadata: {
            title: itinerary.title,
            summary: itinerary.summary,
            aiModelUsed: itinerary.aiModelUsed,
            confidenceScore: itinerary.confidenceScore,
            currency: itinerary.currency,
            dining: itinerary.dining
          }
        });
      }
    } catch (dbError) {
      console.error('Database storage error:', dbError);
      // Continue even if DB storage fails - return AI result anyway
    }

    const generationTime = Date.now() - startTime;

    // Return response matching OpenAPI contract
    return res.status(200).json({
      trip_id: tripId,
      itineraries: aiResult.itineraries.map(itin => ({
        id: itin.id,
        trip_id: tripId,
        title: itin.title,
        ai_model_used: itin.aiModelUsed,
        total_cost: itin.totalCost,
        confidence_score: itin.confidenceScore,
        summary: itin.summary,
        accommodations: itin.accommodations.map(acc => ({
          name: acc.name,
          type: acc.type,
          address: acc.address || '',
          check_in: acc.checkIn,
          check_out: acc.checkOut,
          price_per_night: acc.pricePerNight
        })),
        transportation: itin.transportation.map(trans => ({
          type: trans.type,
          from: trans.from,
          to: trans.to,
          date: trans.date,
          price: trans.price,
          duration: trans.duration
        })),
        activities: itin.activities.map(act => ({
          day: act.day,
          time: act.time,
          name: act.activity,
          location: act.location,
          price: act.price,
          duration: act.duration
        })),
        dining: (itin.dining || []).map(dining => ({
          name: dining.name,
          cuisine: dining.cuisine,
          meal: dining.meal,
          day: dining.day,
          estimated_cost: dining.estimatedCost
        }))
      })),
      generation_time_ms: generationTime,
      meta: aiResult.meta
    });

  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ');
      return res.status(400).json({
        error: 'Validation Error',
        message: errorMessages,
        code: 400
      });
    }

    if (error instanceof Error) {
      if (error.message.includes('service temporarily unavailable')) {
        return res.status(503).json({
          error: 'Service Unavailable',
          message: 'service temporarily unavailable',
          code: 503
        });
      }

      return res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred',
        code: 500
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      code: 500
    });
  }
});

// POST /v1/trips/modify - AI Chat Modification Endpoint
router.post('/modify', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  console.log('═══════════════════════════════════════');
  console.log('📍 BACKEND: Received itinerary modification request');
  console.log('👤 User ID:', req.user?.id);
  console.log('📦 Request body keys:', Object.keys(req.body));
  console.log('═══════════════════════════════════════');

  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'authentication required',
        code: 401
      });
    }

    const { itinerary, modification_request, original_plan_data } = req.body;

    if (!itinerary || !modification_request) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'itinerary and modification_request are required',
        code: 400
      });
    }

    // Build modification prompt
    const modificationPrompt = `
You are helping modify an existing travel itinerary based on user feedback.

Original Itinerary:
${JSON.stringify(itinerary, null, 2)}

User's Modification Request:
"${modification_request}"

Please modify the itinerary according to the user's request while:
1. Maintaining the overall trip structure (dates, destination, currency)
2. Keeping the total cost within the original budget of ${itinerary.currency} ${itinerary.total_cost}
3. Preserving activities/accommodations that weren't mentioned in the modification
4. Only changing what the user explicitly requested

Return your response in this exact JSON format:
{
  "modified_itinerary": {
    // Full itinerary object with same structure as input, with requested modifications
  },
  "explanation": "Brief explanation of what was changed (2-3 sentences)"
}

Ensure the modified_itinerary has the exact same structure as the original, with all required fields.
Return ONLY valid JSON, no additional text.
`.trim();

    // Get AI service and generate modification
    const aiService = getTripPlanningAIService();
    const aiResponse = await (aiService as any).aiProviders.generateWithFallback(modificationPrompt);

    // Parse AI response
    let cleanedContent = aiResponse.content.trim();
    if (cleanedContent.startsWith('```json')) {
      cleanedContent = cleanedContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (cleanedContent.startsWith('```')) {
      cleanedContent = cleanedContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleanedContent);

    if (!parsed.modified_itinerary || !parsed.explanation) {
      throw new Error('Invalid AI response format');
    }

    // Ensure modified itinerary has required fields
    parsed.modified_itinerary.itinerary_id = itinerary.itinerary_id || itinerary.id;
    parsed.modified_itinerary.currency = itinerary.currency;

    console.log('✅ Itinerary modified successfully');

    return res.status(200).json({
      modified_itinerary: parsed.modified_itinerary,
      explanation: parsed.explanation
    });

  } catch (error: unknown) {
    console.error('💥 Modification error:', error);

    if (error instanceof Error) {
      return res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Failed to modify itinerary',
        code: 500
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      code: 500
    });
  }
});

export default router;
