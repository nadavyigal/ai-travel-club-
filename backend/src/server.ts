import app from './app';
import { initDatabase, closeDatabase } from './config/database';

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, async () => {
  console.log(`🚀 AI Travel Concierge API server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 API v1: http://localhost:${PORT}/api/v1`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);

  // Initialize database connections
  const dbConnected = await initDatabase();
  if (!dbConnected) {
    console.warn('⚠️  Server started but database connections failed');
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await closeDatabase();
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await closeDatabase();
  server.close(() => {
    console.log('Process terminated');
  });
});

export default server;