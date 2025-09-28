import express from 'express';
import { userModel, UpdateUserProfileSchema } from '../models/User';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();

// GET /v1/users/:id
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const idParam = (req.params as { id?: string }).id;
    if (!idParam) {
      return res.status(400).json({ error: 'bad_request', message: 'user ID must be a valid UUID', code: 400 });
    }
    const user = await userModel.findById(idParam);
    if (!user) {
      return res.status(404).json({ error: 'not_found', message: 'user not found', code: 404 });
    }

    return res.status(200).json(userModel.toPublic(user));
  } catch (err: any) {
    if (typeof err?.message === 'string') {
      if (err.message.includes('valid UUID')) {
        return res.status(400).json({ error: 'bad_request', message: err.message, code: 400 });
      }
    }
    return res.status(500).json({ error: 'internal_error', message: 'Internal server error', code: 500 });
  }
});

// PUT /v1/users/:id/profile
router.put('/:id/profile', requireAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const idParam = (req.params as { id?: string }).id;
    if (!idParam) {
      return res.status(400).json({ error: 'bad_request', message: 'user ID must be a valid UUID', code: 400 });
    }
    const body = req.body;

    if (!body || Object.keys(body).length === 0) {
      return res.status(400).json({ error: 'bad_request', message: 'request body cannot be empty', code: 400 });
    }

    // Validate payload shape
    try {
      UpdateUserProfileSchema.parse(body);
    } catch (parseErr: any) {
      const msg = deriveUpdateProfileErrorMessage(body, parseErr);
      return res.status(400).json({ error: 'bad_request', message: msg, code: 400 });
    }

    // Check user existence first for correct 404 semantics
    const existing = await userModel.findById(idParam);
    if (!existing) {
      return res.status(404).json({ error: 'not_found', message: 'user not found', code: 404 });
    }

    // Authorization after existence check
    if (req.user?.id && req.user.id !== idParam) {
      return res.status(403).json({ error: 'forbidden', message: 'not authorized to update this profile', code: 403 });
    }

    const updated = await userModel.updateProfile(idParam, body);
    return res.status(200).json(userModel.toPublic(updated));
  } catch (err: any) {
    const message: string = err?.message || '';
    if (message.includes('valid UUID')) {
      return res.status(400).json({ error: 'bad_request', message, code: 400 });
    }
    if (message.includes('user not found')) {
      return res.status(404).json({ error: 'not_found', message, code: 404 });
    }
    if (message.includes('duplicate loyalty program provider')) {
      return res.status(400).json({ error: 'bad_request', message, code: 400 });
    }
    return res.status(500).json({ error: 'internal_error', message: 'Internal server error', code: 500 });
  }
});

export default router;

function deriveUpdateProfileErrorMessage(body: any, parseErr: any): string {
  const firstIssue = parseErr?.issues?.[0];
  if (firstIssue?.message) {
    if (String(firstIssue.message).includes('loyalty program must have provider and account_id')) {
      return 'loyalty program must have provider and account_id';
    }
  }
  if (firstIssue && Array.isArray(firstIssue.path)) {
    const pathStr = firstIssue.path.join('.');
    // No valid fields provided
    if (firstIssue.message?.includes('no valid fields to update')) {
      return 'no valid fields to update';
    }
    // Budget range enum
    if (pathStr.includes('profile.budget_range')) {
      return 'budget_range must be one of: budget, mid-range, luxury';
    }
    // Travel style enum
    if (pathStr.includes('profile.travel_style')) {
      return 'travel_style must be one of: adventure, relaxation, cultural, business';
    }
    // Dietary restrictions array/type
    if (pathStr.includes('profile.dietary_restrictions')) {
      if (firstIssue.code === 'invalid_type' && firstIssue.expected === 'array') {
        return 'dietary_restrictions must be an array';
      }
      return 'dietary restrictions must be strings';
    }
    // Loyalty programs array/type
    if (pathStr.startsWith('loyalty_programs')) {
      if (firstIssue.code === 'invalid_type' && firstIssue.expected === 'array') {
        return 'loyalty_programs must be an array';
      }
      if (pathStr.endsWith('provider')) {
        return 'unsupported loyalty program provider';
      }
      if (pathStr.endsWith('account_id')) {
        return 'account_id cannot be empty';
      }
      // Missing keys
      return 'loyalty program must have provider and account_id';
    }
  }
  return 'invalid payload';
}


