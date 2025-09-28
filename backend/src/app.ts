import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { supabase } from './config/supabase';
import destinationsRouter from './routes/destinations';
import authRouter from './api/auth';
import usersRouter from './api/users';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://your-domain.com']
    : ['http://localhost:3001'],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const { data, error } = await supabase.from('destinations').select('count').limit(1);
    const isHealthy = !error;

    return res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        supabase: isHealthy ? 'healthy' : 'unhealthy',
        error: error?.message || null
      },
    });
  } catch (err) {
    return res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        supabase: 'unhealthy',
        error: 'Connection failed'
      },
    });
  }
});

// API routes
app.use('/api/v1/destinations', destinationsRouter);
app.use('/v1/auth', authRouter);
app.use('/v1/users', usersRouter);

// API routes index
app.get('/api/v1', (req, res) => {
  res.json({
    message: 'AI Travel Concierge API v1',
    status: 'ready',
    endpoints: {
      health: '/health',
      destinations: '/api/v1/destinations',
      docs: '/api/v1/docs'
    }
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

export default app;
export { app };