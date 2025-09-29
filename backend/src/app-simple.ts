import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { supabase } from './config/supabase';

// Load environment variables
dotenv.config();

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://your-domain.com']
    : ['http://localhost:3008', 'http://localhost:3007', 'http://localhost:3006', 'http://localhost:3001', 'http://localhost:3000'],
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
  } catch (err: any) {
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

// Destinations API
app.get('/api/v1/destinations', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('destinations')
      .select('*')
      .order('rating', { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch destinations',
        details: error.message
      });
    }

    return res.json({
      success: true,
      data,
      count: data?.length || 0
    });
  } catch (err) {
    console.error('Error fetching destinations:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get destination by ID
app.get('/api/v1/destinations/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('destinations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Destination not found'
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to fetch destination',
        details: error.message
      });
    }

    return res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('Error fetching destination:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Trips API
app.get('/api/v1/trips', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User ID required'
      });
    }

    const { data, error } = await supabase
      .from('trips')
      .select(`
        *,
        destinations (
          name,
          country,
          city
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch trips',
        details: error.message
      });
    }

    return res.json({
      success: true,
      data,
      count: data?.length || 0
    });
  } catch (err) {
    console.error('Error fetching trips:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Create trip
app.post('/api/v1/trips', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User ID required'
      });
    }

    const { title, destination_id, start_date, end_date, description, budget, status } = req.body;

    const { data, error } = await supabase
      .from('trips')
      .insert({
        title,
        destination_id,
        start_date,
        end_date,
        description,
        budget,
        status: status || 'planning',
        user_id: userId
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create trip',
        details: error.message
      });
    }

    return res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('Error creating trip:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Bookings API
app.get('/api/v1/bookings', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User ID required'
      });
    }

    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch bookings',
        details: error.message
      });
    }

    return res.json({
      success: true,
      data,
      count: data?.length || 0
    });
  } catch (err) {
    console.error('Error fetching bookings:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// API routes index
app.get('/api/v1', (req, res) => {
  res.json({
    message: 'AI Travel Concierge API v1',
    status: 'ready',
    endpoints: {
      health: '/health',
      destinations: '/api/v1/destinations',
      trips: '/api/v1/trips',
      bookings: '/api/v1/bookings'
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