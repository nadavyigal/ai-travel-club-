import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

// Environment variables
const SUPABASE_URL = 'https://wzxlgidoeewrdqbulgvz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6eGxnaWRvZWV3cmRxYnVsZ3Z6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjQ4NDAsImV4cCI6MjA3MzAwMDg0MH0.bIoHi7YyM1pRgBs-AZTFlh_xD_b0_CmIsky1fDWfJjk';

// Create Supabase client with RLS bypass for now
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const app = express();
const PORT = 3002;

// Middleware
app.use(cors({
  origin: ['http://localhost:3008', 'http://localhost:3007', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  console.log('Health check called');
  return res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Get destinations
app.get('/api/v1/destinations', async (req, res) => {
  console.log('Destinations API called');
  try {
    // Direct query without RLS for now
    const { data, error } = await supabase
      .from('destinations')
      .select('*')
      .order('rating', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({
        success: false,
        error: 'Database error',
        details: error.message
      });
    }

    console.log('Destinations fetched:', data?.length || 0);
    return res.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    });
  } catch (err: any) {
    console.error('Server error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: err.message
    });
  }
});

// Get single destination
app.get('/api/v1/destinations/:id', async (req, res) => {
  console.log('Single destination API called:', req.params.id);
  try {
    const { data, error } = await supabase
      .from('destinations')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Destination not found'
        });
      }
      console.error('Supabase error:', error);
      return res.status(500).json({
        success: false,
        error: 'Database error',
        details: error.message
      });
    }

    return res.json({
      success: true,
      data
    });
  } catch (err: any) {
    console.error('Server error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: err.message
    });
  }
});

// Basic trips endpoint
app.get('/api/v1/trips', async (req, res) => {
  console.log('Trips API called');
  res.json({
    success: true,
    data: [],
    count: 0
  });
});

// Create trip endpoint
app.post('/api/v1/trips', async (req, res) => {
  console.log('Create trip API called');
  res.json({
    success: true,
    data: { id: 'test-trip-id', ...req.body }
  });
});

// Basic bookings endpoint
app.get('/api/v1/bookings', async (req, res) => {
  console.log('Bookings API called');
  res.json({
    success: true,
    data: [],
    count: 0
  });
});

// API info
app.get('/api/v1', (req, res) => {
  res.json({
    message: 'AI Travel Club Quick API',
    status: 'ready',
    endpoints: {
      health: '/health',
      destinations: '/api/v1/destinations',
      trips: '/api/v1/trips',
      bookings: '/api/v1/bookings'
    }
  });
});

// Error handlers
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Quick API server running on port ${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`🌐 API: http://localhost:${PORT}/api/v1`);
  console.log(`📍 Destinations: http://localhost:${PORT}/api/v1/destinations`);
});

// Test Supabase connection
(async () => {
  try {
    const { data, error } = await supabase.from('destinations').select('count').limit(1);
    if (error) {
      console.warn('⚠️  Supabase connection issue:', error.message);
    } else {
      console.log('✅ Supabase connected successfully');
    }
  } catch (err) {
    console.warn('⚠️  Supabase connection failed:', err);
  }
})();