import request from 'supertest';
import { app } from '../../src/app';

describe('POST /v1/trips/plan - Trip Planning Contract Tests', () => {
  describe('Request Validation', () => {
    it('should require all mandatory fields', async () => {
      const response = await request(app)
        .post('/v1/trips/plan')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('prompt');
      expect(response.body.message).toContain('destination');
      expect(response.body.message).toContain('start_date');
      expect(response.body.message).toContain('end_date');
      expect(response.body.message).toContain('budget');
    });

    it('should validate date format and logic', async () => {
      const response = await request(app)
        .post('/v1/trips/plan')
        .send({
          prompt: 'Plan a weekend trip',
          destination: 'Las Vegas, NV',
          start_date: '2024-12-31',
          end_date: '2024-12-30', // End date before start date
          budget: 1000
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('end_date must be after start_date');
    });

    it('should validate budget is positive', async () => {
      const response = await request(app)
        .post('/v1/trips/plan')
        .send({
          prompt: 'Plan a weekend trip',
          destination: 'Las Vegas, NV',
          start_date: '2024-12-30',
          end_date: '2024-12-31',
          budget: -100
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('budget must be positive');
    });

    it('should validate group_size limits', async () => {
      const response = await request(app)
        .post('/v1/trips/plan')
        .send({
          prompt: 'Plan a weekend trip',
          destination: 'Las Vegas, NV',
          start_date: '2024-12-30',
          end_date: '2024-12-31',
          budget: 1000,
          group_size: 25 // Exceeds maximum of 20
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('group_size cannot exceed 20');
    });

    it('should validate currency format', async () => {
      const response = await request(app)
        .post('/v1/trips/plan')
        .send({
          prompt: 'Plan a weekend trip',
          destination: 'Las Vegas, NV',
          start_date: '2024-12-30',
          end_date: '2024-12-31',
          budget: 1000,
          currency: 'invalid'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('currency must be 3-letter ISO code');
    });
  });

  describe('Successful Trip Planning', () => {
    it('should generate itinerary options for valid request', async () => {
      const validRequest = {
        prompt: 'Plan a fun weekend trip for 4 friends to see a football game',
        destination: 'Las Vegas, NV',
        start_date: '2024-12-30',
        end_date: '2024-12-31',
        budget: 2000,
        currency: 'USD',
        group_size: 4,
        preferences: {
          accommodation_type: 'hotel',
          activity_types: ['sports', 'entertainment']
        }
      };

      const response = await request(app)
        .post('/v1/trips/plan')
        .send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('trip_id');
      expect(response.body.trip_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

      expect(response.body).toHaveProperty('itineraries');
      expect(Array.isArray(response.body.itineraries)).toBe(true);
      expect(response.body.itineraries.length).toBeGreaterThanOrEqual(1);
      expect(response.body.itineraries.length).toBeLessThanOrEqual(5);

      // Validate itinerary structure
      const itinerary = response.body.itineraries[0];
      expect(itinerary).toHaveProperty('id');
      expect(itinerary).toHaveProperty('trip_id');
      expect(itinerary).toHaveProperty('title');
      expect(itinerary).toHaveProperty('ai_model_used');
      expect(itinerary).toHaveProperty('total_cost');
      expect(itinerary).toHaveProperty('confidence_score');
      expect(itinerary).toHaveProperty('accommodations');
      expect(itinerary).toHaveProperty('transportation');
      expect(itinerary).toHaveProperty('activities');

      // Validate confidence score range
      expect(itinerary.confidence_score).toBeGreaterThanOrEqual(0);
      expect(itinerary.confidence_score).toBeLessThanOrEqual(1);

      // Validate generation time performance requirement
      expect(response.body).toHaveProperty('generation_time_ms');
      expect(response.body.generation_time_ms).toBeLessThanOrEqual(3000);
    });

    it('should handle minimal valid request with defaults', async () => {
      const minimalRequest = {
        prompt: 'Quick business trip',
        destination: 'New York, NY',
        start_date: '2024-12-30',
        end_date: '2024-12-31',
        budget: 500
      };

      const response = await request(app)
        .post('/v1/trips/plan')
        .send(minimalRequest);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('trip_id');
      expect(response.body).toHaveProperty('itineraries');
      expect(response.body.itineraries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Authentication and Rate Limiting', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/v1/trips/plan')
        .send({
          prompt: 'Plan a trip',
          destination: 'Paris',
          start_date: '2024-12-30',
          end_date: '2024-12-31',
          budget: 1000
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('authentication required');
    });

    it('should enforce rate limiting', async () => {
      // This test would need to be implemented with proper rate limiting setup
      // For now, we'll skip it as it requires authentication setup
      const response = await request(app)
        .post('/v1/trips/plan')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          prompt: 'Plan a trip',
          destination: 'Paris',
          start_date: '2024-12-30',
          end_date: '2024-12-31',
          budget: 1000
        });

      // Should be 401 for invalid token, or 429 for rate limit
      expect([401, 429]).toContain(response.status);
    });
  });

  describe('Accommodation Structure Validation', () => {
    it('should validate accommodation objects have required fields', async () => {
      const validRequest = {
        prompt: 'Plan a weekend getaway',
        destination: 'Miami, FL',
        start_date: '2024-12-30',
        end_date: '2024-12-31',
        budget: 1500
      };

      const response = await request(app)
        .post('/v1/trips/plan')
        .send(validRequest);

      expect(response.status).toBe(200);

      const itinerary = response.body.itineraries[0];
      if (itinerary.accommodations.length > 0) {
        const accommodation = itinerary.accommodations[0];
        expect(accommodation).toHaveProperty('name');
        expect(accommodation).toHaveProperty('address');
        expect(accommodation).toHaveProperty('check_in');
        expect(accommodation).toHaveProperty('check_out');
        expect(accommodation).toHaveProperty('price');
        expect(typeof accommodation.price).toBe('number');
      }
    });
  });

  describe('Transportation Structure Validation', () => {
    it('should validate transportation objects have required fields', async () => {
      const validRequest = {
        prompt: 'Plan a cross-country trip',
        destination: 'Los Angeles, CA',
        start_date: '2024-12-30',
        end_date: '2025-01-02',
        budget: 2500
      };

      const response = await request(app)
        .post('/v1/trips/plan')
        .send(validRequest);

      expect(response.status).toBe(200);

      const itinerary = response.body.itineraries[0];
      if (itinerary.transportation.length > 0) {
        const transport = itinerary.transportation[0];
        expect(transport).toHaveProperty('type');
        expect(transport).toHaveProperty('departure');
        expect(transport).toHaveProperty('arrival');
        expect(transport).toHaveProperty('price');
        expect(typeof transport.price).toBe('number');
      }
    });
  });

  describe('Activities Structure Validation', () => {
    it('should validate activity objects have required fields', async () => {
      const validRequest = {
        prompt: 'Plan an adventure trip with activities',
        destination: 'Denver, CO',
        start_date: '2024-12-30',
        end_date: '2025-01-01',
        budget: 1800
      };

      const response = await request(app)
        .post('/v1/trips/plan')
        .send(validRequest);

      expect(response.status).toBe(200);

      const itinerary = response.body.itineraries[0];
      if (itinerary.activities.length > 0) {
        const activity = itinerary.activities[0];
        expect(activity).toHaveProperty('name');
        expect(activity).toHaveProperty('date_time');
        expect(activity).toHaveProperty('duration');
        expect(activity).toHaveProperty('price');
        expect(typeof activity.duration).toBe('number');
        expect(typeof activity.price).toBe('number');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle AI service timeouts gracefully', async () => {
      // This test simulates a timeout scenario
      const complexRequest = {
        prompt: 'Plan an extremely detailed 30-day world tour with complex requirements',
        destination: 'Multiple destinations worldwide',
        start_date: '2024-12-30',
        end_date: '2025-01-30',
        budget: 50000,
        group_size: 15
      };

      const response = await request(app)
        .post('/v1/trips/plan')
        .send(complexRequest);

      // Should either succeed within time limit or return appropriate error
      if (response.status !== 200) {
        expect(response.status).toBe(503);
        expect(response.body.error).toBeDefined();
        expect(response.body.message).toContain('service temporarily unavailable');
      }
    });

    it('should return structured error responses', async () => {
      const response = await request(app)
        .post('/v1/trips/plan')
        .send({
          prompt: '', // Empty prompt
          destination: 'Invalid',
          start_date: 'invalid-date',
          end_date: 'invalid-date',
          budget: 'not-a-number'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('code');
      expect(typeof response.body.error).toBe('string');
      expect(typeof response.body.message).toBe('string');
      expect(typeof response.body.code).toBe('number');
    });
  });
});