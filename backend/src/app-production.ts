import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { StorageService } from './services/StorageService';

// Types
interface AuthenticatedRequest extends express.Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
  supabase?: SupabaseClient;
}

// Environment configuration
const config = {
  supabase: {
    url: process.env.SUPABASE_URL || 'https://wzxlgidoeewrdqbulgvz.supabase.co',
    anonKey: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6eGxnaWRvZWV3cmRxYnVsZ3Z6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjQ4NDAsImV4cCI6MjA3MzAwMDg0MH0.bIoHi7YyM1pRgBs-AZTFlh_xD_b0_CmIsky1fDWfJjk',
    serviceKey: process.env.SUPABASE_SERVICE_KEY
  },
  app: {
    port: process.env.PORT || 3002,
    env: process.env.NODE_ENV || 'development',
    corsOrigins: process.env.NODE_ENV === 'production'
      ? ['https://your-domain.com']
      : ['http://localhost:3008', 'http://localhost:3007', 'http://localhost:3000', 'http://localhost:3001']
  }
};

// Create Supabase client
const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Create admin client if service key is available
const supabaseAdmin = config.supabase.serviceKey
  ? createClient(config.supabase.url, config.supabase.serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

// Initialize storage service
const storageService = new StorageService(supabase);

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 5 // Max 5 files at once
  }
});

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration
app.use(cors({
  origin: config.app.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Authentication middleware
const authenticateUser = async (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const userIdHeader = req.headers['x-user-id'] as string;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      // Verify JWT token with Supabase
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired token'
        });
      }

      // Create user-specific Supabase client
      const userSupabase = createClient(config.supabase.url, config.supabase.anonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });

      const userObj: any = {
        id: user.id,
        role: user.user_metadata?.role || 'user'
      };

      if (user.email) {
        userObj.email = user.email;
      }

      req.user = userObj;
      req.supabase = userSupabase;
    } else if (userIdHeader) {
      // Fallback for development - use user ID header
      req.user = {
        id: userIdHeader
      };
      req.supabase = supabase;
    }

    return next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const { data, error } = await supabase.from('destinations').select('count').limit(1);
    const dbHealthy = !error;

    return res.json({
      status: dbHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      environment: config.app.env,
      services: {
        database: dbHealthy ? 'healthy' : 'unhealthy',
        supabase: dbHealthy ? 'connected' : 'disconnected',
        error: error?.message || null
      }
    });
  } catch (err: any) {
    return res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      environment: config.app.env,
      services: {
        database: 'unhealthy',
        supabase: 'disconnected',
        error: err.message || 'Unknown error'
      }
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
      console.error('Database error fetching destinations:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch destinations',
        details: error.message
      });
    }

    return res.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    });
  } catch (err: any) {
    console.error('Server error fetching destinations:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: err.message
    });
  }
});

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

      console.error('Database error fetching destination:', error);
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
  } catch (err: any) {
    console.error('Server error fetching destination:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: err.message
    });
  }
});

// Trips API (requires authentication)
app.get('/api/v1/trips', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const userSupabase = req.supabase || supabase;
    const { data, error } = await userSupabase
      .from('trips')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error fetching trips:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch trips',
        details: error.message
      });
    }

    return res.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    });
  } catch (err: any) {
    console.error('Server error fetching trips:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: err.message
    });
  }
});

app.post('/api/v1/trips', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { title, destination_id, start_date, end_date, description, budget, status, trip_type, travelers_count } = req.body;

    // Validate required fields
    if (!title || !destination_id || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, destination_id, start_date, end_date'
      });
    }

    // Convert to database schema format
    const tripData = {
      title,
      description,
      start_date,
      end_date,
      budget_min: budget,
      budget_max: budget,
      destinations: [destination_id], // Convert single destination to array
      trip_type: trip_type || 'leisure',
      travelers_count: travelers_count || 1,
      status: status || 'planning',
      user_id: req.user.id
    };

    const userSupabase = req.supabase || supabase;
    const { data, error } = await userSupabase
      .from('trips')
      .insert(tripData)
      .select()
      .single();

    if (error) {
      console.error('Database error creating trip:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create trip',
        details: error.message
      });
    }

    return res.status(201).json({
      success: true,
      data
    });
  } catch (err: any) {
    console.error('Server error creating trip:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: err.message
    });
  }
});

// Bookings API (requires authentication)
app.get('/api/v1/bookings', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const userSupabase = req.supabase || supabase;
    const { data, error } = await userSupabase
      .from('bookings')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error fetching bookings:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch bookings',
        details: error.message
      });
    }

    return res.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    });
  } catch (err: any) {
    console.error('Server error fetching bookings:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: err.message
    });
  }
});

// User profile endpoints
app.get('/api/v1/profile', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const userSupabase = req.supabase || supabase;
    const { data, error } = await userSupabase
      .from('users')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'User profile not found'
        });
      }

      console.error('Database error fetching profile:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch profile',
        details: error.message
      });
    }

    return res.json({
      success: true,
      data
    });
  } catch (err: any) {
    console.error('Server error fetching profile:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: err.message
    });
  }
});

// File upload endpoints
app.post('/api/v1/upload/photo', authenticateUser, upload.single('photo'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided'
      });
    }

    // Validate file
    const validation = storageService.validateFile(req.file, 'travel-photos');
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    // Upload to storage
    const result = await storageService.uploadFile(req.file.buffer, {
      userId: req.user.id,
      bucket: 'travel-photos',
      fileName: req.file.originalname,
      folder: req.body.folder || 'general',
      contentType: req.file.mimetype
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    return res.json({
      success: true,
      data: result.data
    });
  } catch (err: any) {
    console.error('Photo upload error:', err);
    return res.status(500).json({
      success: false,
      error: 'Upload failed'
    });
  }
});

app.post('/api/v1/upload/document', authenticateUser, upload.single('document'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided'
      });
    }

    // Validate file
    const validation = storageService.validateFile(req.file, 'travel-documents');
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    // Upload to storage
    const result = await storageService.uploadFile(req.file.buffer, {
      userId: req.user.id,
      bucket: 'travel-documents',
      fileName: req.file.originalname,
      folder: req.body.folder || 'general',
      contentType: req.file.mimetype
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    return res.json({
      success: true,
      data: result.data
    });
  } catch (err: any) {
    console.error('Document upload error:', err);
    return res.status(500).json({
      success: false,
      error: 'Upload failed'
    });
  }
});

app.post('/api/v1/upload/avatar', authenticateUser, upload.single('avatar'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided'
      });
    }

    // Validate file
    const validation = storageService.validateFile(req.file, 'avatars');
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    // Upload to storage (overwrites existing)
    const result = await storageService.uploadFile(req.file.buffer, {
      userId: req.user.id,
      bucket: 'avatars',
      fileName: 'avatar.jpg', // Standardized filename
      contentType: req.file.mimetype,
      upsert: true // Allow overwriting existing avatar
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    // Update user profile with new avatar URL
    if (result.data?.publicUrl && req.supabase) {
      await req.supabase
        .from('users')
        .update({ avatar_url: result.data.publicUrl })
        .eq('id', req.user.id);
    }

    return res.json({
      success: true,
      data: result.data
    });
  } catch (err: any) {
    console.error('Avatar upload error:', err);
    return res.status(500).json({
      success: false,
      error: 'Upload failed'
    });
  }
});

// Get user files
app.get('/api/v1/files/:bucket', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { bucket } = req.params;
    const { folder } = req.query;

    if (!bucket || !['travel-photos', 'travel-documents', 'avatars'].includes(bucket)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bucket'
      });
    }

    const result = await storageService.listUserFiles(bucket, req.user.id, typeof folder === 'string' ? folder : undefined);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    return res.json({
      success: true,
      data: result.files
    });
  } catch (err: any) {
    console.error('List files error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to list files'
    });
  }
});

// API routes index
app.get('/api/v1', (req, res) => {
  return res.json({
    message: 'AI Travel Club API v2 - Production Ready with Storage',
    status: 'ready',
    version: '2.0.0',
    endpoints: {
      // Public endpoints
      health: '/health',
      destinations: '/api/v1/destinations',

      // Authenticated endpoints
      trips: '/api/v1/trips (auth required)',
      bookings: '/api/v1/bookings (auth required)',
      profile: '/api/v1/profile (auth required)',

      // File upload endpoints (auth required)
      uploadPhoto: 'POST /api/v1/upload/photo (multipart/form-data)',
      uploadDocument: 'POST /api/v1/upload/document (multipart/form-data)',
      uploadAvatar: 'POST /api/v1/upload/avatar (multipart/form-data)',

      // File management
      listFiles: 'GET /api/v1/files/:bucket?folder=name (auth required)'
    },
    storage: {
      buckets: {
        'travel-photos': 'Public travel photos (5MB limit)',
        'travel-documents': 'Private travel documents (10MB limit)',
        'avatars': 'Public user avatars (2MB limit)'
      },
      supportedTypes: {
        photos: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        documents: ['application/pdf', 'image/jpeg', 'image/png', 'text/plain', 'application/json'],
        avatars: ['image/jpeg', 'image/png', 'image/webp']
      }
    },
    authentication: {
      method: 'Bearer token or x-user-id header',
      note: 'Use Authorization: Bearer <jwt_token> header for production'
    }
  });
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);

  return res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: config.app.env === 'development' ? err.message : 'Something went wrong',
    ...(config.app.env === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

export default app;