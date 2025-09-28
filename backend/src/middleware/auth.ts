import { Request, Response, NextFunction } from 'express';
import { verifyAuthToken } from '../utils/jwt';

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers['authorization'];
    if (!header) {
      return res.status(401).json({ error: 'unauthorized', message: 'authentication required', code: 401 });
    }

    const parts = header.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ error: 'unauthorized', message: 'invalid authorization header', code: 401 });
    }

    const token = parts[1];
    if (!token || typeof token !== 'string') {
      return res.status(401).json({ error: 'unauthorized', message: 'invalid token', code: 401 });
    }
    const payload = verifyAuthToken(token as string);
    req.user = { id: payload.userId, email: payload.email };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized', message: 'invalid token', code: 401 });
  }
}


