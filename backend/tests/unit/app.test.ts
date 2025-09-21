import request from 'supertest';
import app from '../../src/app';

describe('App', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version', '1.0.0');
      expect(response.body).toHaveProperty('environment');
    });
  });

  describe('GET /api/v1', () => {
    it('should return API information', async () => {
      const response = await request(app).get('/api/v1');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'AI Travel Concierge API v1');
      expect(response.body).toHaveProperty('status', 'ready');
      expect(response.body).toHaveProperty('endpoints');
    });
  });

  describe('GET /unknown-route', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown-route');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Not found');
      expect(response.body.message).toContain('Route GET /unknown-route not found');
    });
  });
});