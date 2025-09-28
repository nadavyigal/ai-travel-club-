import app from './app';
import { supabase } from './config/supabase';

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`🚀 AI Travel Concierge API server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 API v1: http://localhost:${PORT}/api/v1`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);

  // Test Supabase connection (non-blocking)
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
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

export default server;
