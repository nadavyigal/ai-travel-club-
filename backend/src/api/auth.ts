import express from 'express';
import { userModel, CreateUserSchema } from '../models/User';
import { signAuthToken } from '../utils/jwt';

const router = express.Router();

// POST /v1/auth/register
router.post('/register', async (req, res) => {
  try {
    const data = req.body;
    try {
      CreateUserSchema.parse(data);
    } catch (parseErr: any) {
      return res.status(400).json({ error: 'bad_request', message: parseErr.errors?.[0]?.message || 'invalid payload', code: 400 });
    }

    const user = await userModel.create(data);
    const token = signAuthToken({ userId: user.id, email: user.email });
    return res.status(201).json({ user: userModel.toPublic(user), token });
  } catch (err: any) {
    const message: string = err?.message || '';
    if (message.includes('email already exists')) {
      return res.status(409).json({ error: 'conflict', message, code: 409 });
    }
    if (message) {
      return res.status(400).json({ error: 'bad_request', message, code: 400 });
    }
    return res.status(500).json({ error: 'internal_error', message: 'Internal server error', code: 500 });
  }
});

export default router;


