import { createServer } from 'http';
import dotenv from 'dotenv';
import app from './app';
import { supabase } from './config/supabase';
import { realtimeService } from './services/RealtimeService';
import { jobQueue } from './services/JobQueue';

// Load environment variables FIRST
dotenv.config();

const PORT = process.env.PORT || 3000;

// Create HTTP server for Socket.IO
const httpServer = createServer(app);

// Initialize services
(async () => {
  try {
    // Initialize WebSocket server
    await realtimeService.initialize(httpServer);
    console.log('✅ Real-time service initialized');

    // Initialize job queue
    await jobQueue.initialize();
    console.log('✅ Job queue initialized');

    // Test Supabase connection (non-blocking)
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
  } catch (error) {
    console.error('❌ Service initialization failed:', error);
  }
})();

const server = httpServer.listen(PORT, () => {
  console.log(`🚀 AI Travel Concierge API server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 API v1: http://localhost:${PORT}/api/v1`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await realtimeService.shutdown();
  await jobQueue.shutdown();
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await realtimeService.shutdown();
  await jobQueue.shutdown();
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

export default server;

