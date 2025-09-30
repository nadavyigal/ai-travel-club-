import { Router, Request, Response } from 'express';
import { z } from 'zod';

const router = Router();

// Validation schema for event bundle search query
const EventBundleQuerySchema = z.object({
  event_type: z.enum(['sports', 'concerts', 'festivals', 'conferences']).optional(),
  location: z.string().min(1, 'location is required'),
  date_range: z.string().regex(/^\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/, 'date_range must match pattern YYYY-MM-DD:YYYY-MM-DD').optional(),
  budget_max: z.number().positive().optional()
});

// GET /v1/events/bundle - Search Event Bundles
router.get('/bundle', async (req: Request, res: Response) => {
  try {
    // Validate query parameters
    const validatedQuery = EventBundleQuerySchema.parse({
      event_type: req.query.event_type,
      location: req.query.location,
      date_range: req.query.date_range,
      budget_max: req.query.budget_max ? parseFloat(req.query.budget_max as string) : undefined
    });

    // Generate mock event bundles (stub implementation)
    const mockBundles = [
      {
        event: {
          name: `${validatedQuery.event_type || 'Sports'} Event at ${validatedQuery.location}`,
          venue: `${validatedQuery.location} Stadium`,
          date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          ticket_price: 150
        },
        accommodation: {
          name: `Hotel Near ${validatedQuery.location} Stadium`,
          distance_to_venue: '0.5 miles',
          price_per_night: 200
        },
        total_package_price: 550,
        savings: 50
      },
      {
        event: {
          name: `Premium ${validatedQuery.event_type || 'Concert'} Experience`,
          venue: `${validatedQuery.location} Arena`,
          date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
          ticket_price: 250
        },
        accommodation: {
          name: `Luxury Hotel ${validatedQuery.location}`,
          distance_to_venue: '0.3 miles',
          price_per_night: 350
        },
        total_package_price: 950,
        savings: 100
      }
    ];

    // Filter by budget if specified
    const filteredBundles = validatedQuery.budget_max
      ? mockBundles.filter(bundle => bundle.total_package_price <= validatedQuery.budget_max!)
      : mockBundles;

    if (filteredBundles.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No bundles found for criteria',
        code: 404
      });
    }

    return res.status(200).json({
      bundles: filteredBundles
    });

  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((e: z.ZodIssue) => {
        if (e.path.length > 0) {
          return `${e.path.join('.')}: ${e.message}`;
        }
        return e.message;
      }).join(', ');

      return res.status(400).json({
        error: 'Validation Error',
        message: errorMessages,
        code: 400
      });
    }

    if (error instanceof Error) {
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