import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { jobQueue } from '../services/JobQueue';

const router = Router();

// Validation schema for Trip Pass booking request
const TripPassBookingSchema = z.object({
  itinerary_id: z.string().uuid('itinerary_id must be a valid UUID'),
  trip_pass_id: z.string().uuid('trip_pass_id must be a valid UUID'),
  auto_rebook: z.boolean().default(true)
});

// POST /v1/bookings/trip-pass - Book with Trip Pass
router.post('/trip-pass', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Validate request body
    const validatedData = TripPassBookingSchema.parse(req.body);

    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'authentication required',
        code: 401
      });
    }

    // Generate booking details (stub implementation)
    const bookingId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

    const confirmationCode = `TP${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    const totalAmount = 1500; // Placeholder

    // Create booking response with Trip Pass guarantees
    const booking = {
      id: bookingId,
      trip_id: validatedData.itinerary_id,
      confirmation_code: confirmationCode,
      total_amount: totalAmount,
      currency: 'USD',
      booking_status: 'confirmed',
      travel_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      guarantee_terms: {
        price_protection: totalAmount,
        auto_rebook_sla: 300, // 5 minutes in seconds (300 minutes as per spec requirements)
        refund_policy: 'Full refund available up to 24 hours before travel date. Price protection guarantees no increase in booking cost.'
      }
    };

    // Enqueue auto-rebook job if enabled
    if (validatedData.auto_rebook) {
      const jobId = await jobQueue.enqueueAutoRebook(
        bookingId,
        validatedData.itinerary_id,
        validatedData.trip_pass_id
      );
      console.log(`📋 Auto-rebook job enqueued: ${jobId} for booking ${bookingId}`);
    }

    return res.status(201).json(booking);

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
      // Check for specific error types
      if (error.message.includes('insufficient funds') || error.message.includes('Trip Pass insufficient')) {
        return res.status(402).json({
          error: 'Payment Required',
          message: 'Payment required or Trip Pass insufficient',
          code: 402
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