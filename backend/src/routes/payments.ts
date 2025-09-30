import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Validation schema for payment split request
const PaymentSplitRequestSchema = z.object({
  booking_id: z.string().uuid('booking_id must be a valid UUID'),
  splits: z.array(z.object({
    user_id: z.string().uuid('user_id must be a valid UUID'),
    amount: z.number().positive().optional(),
    percentage: z.number().min(0).max(100),
    payment_method: z.string().optional()
  })).min(1, 'at least one split is required').max(20, 'maximum 20 splits allowed')
}).refine(
  (data) => {
    const totalPercentage = data.splits.reduce((sum, split) => sum + split.percentage, 0);
    return Math.abs(totalPercentage - 100) < 0.01; // Allow for floating point errors
  },
  { message: 'split percentages must sum to 100', path: ['splits'] }
);

// POST /v1/payments/split - Configure Payment Split
router.post('/split', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Validate request body
    const validatedData = PaymentSplitRequestSchema.parse(req.body);

    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'authentication required',
        code: 401
      });
    }

    // Calculate total amount (stub - would come from booking)
    const totalAmount = 1000; // Placeholder

    // Calculate individual amounts
    const splits = validatedData.splits.map(split => ({
      ...split,
      amount: (split.percentage / 100) * totalAmount
    }));

    // Generate placeholder payment URLs (Stripe integration would go here)
    const paymentUrls = splits.map(split => ({
      user_id: split.user_id,
      payment_url: `https://stripe.com/pay/${split.user_id}/placeholder`
    }));

    // Generate split_id
    const splitId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

    return res.status(200).json({
      split_id: splitId,
      total_amount: totalAmount,
      payment_urls: paymentUrls
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