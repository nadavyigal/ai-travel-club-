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

  try {
    // Validate request body
    const validatedData = TripPlanRequestSchema.parse(req.body);

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

export default router;