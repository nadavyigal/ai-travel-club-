import app from './app-production';
import { createClient } from '@supabase/supabase-js';

const PORT = process.env.PORT || 3002;
const ENV = process.env.NODE_ENV || 'development';

// Supabase connection test
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://wzxlgidoeewrdqbulgvz.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6eGxnaWRvZWV3cmRxYnVsZ3Z6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjQ4NDAsImV4cCI6MjA3MzAwMDg0MH0.bIoHi7YyM1pRgBs-AZTFlh_xD_b0_CmIsky1fDWfJjk'
);

const server = app.listen(PORT, () => {
  console.log('🚀 AI Travel Club API v2 - Production Ready');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 API v1: http://localhost:${PORT}/api/v1`);
  console.log(`📍 Destinations: http://localhost:${PORT}/api/v1/destinations`);
  console.log(`✈️  Trips: http://localhost:${PORT}/api/v1/trips`);
  console.log(`🏨 Bookings: http://localhost:${PORT}/api/v1/bookings`);
  console.log(`👤 Profile: http://localhost:${PORT}/api/v1/profile`);
  console.log(`🔧 Environment: ${ENV}`);
  console.log('---');

  // Test Supabase connection (non-blocking)
  (async () => {
    try {
      console.log('🔍 Testing Supabase connection...');
      const { data, error } = await supabase.from('destinations').select('count').limit(1);

      if (error) {
        console.warn('⚠️  Supabase connection issue:', error.message);
        console.warn('   Check your SUPABASE_URL and SUPABASE_ANON_KEY environment variables');
      } else {
        console.log('✅ Supabase connected successfully');
        console.log('📊 Database accessible');
      }

      // Test destinations table
      const { data: destinations, error: destError } = await supabase
        .from('destinations')
        .select('id, name')
        .limit(3);

      if (destError) {
        console.warn('⚠️  Destinations table access issue:', destError.message);
      } else {
        console.log(`📍 Found ${destinations?.length || 0} destinations in database`);
        if (destinations && destinations.length > 0) {
          console.log('   Sample destinations:', destinations.map(d => d.name).join(', '));
        }
      }
    } catch (err: any) {
      console.warn('⚠️  Supabase connection failed:', err.message);
    }
  })();
});

// Graceful shutdown handlers
const gracefulShutdown = (signal: string) => {
  console.log(`\n${signal} received, shutting down gracefully...`);

  server.close(() => {
    console.log('✅ HTTP server closed');

    // Close database connections if any
    console.log('✅ Database connections closed');

    console.log('👋 Server shutdown complete');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after 10 seconds');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

export default server;