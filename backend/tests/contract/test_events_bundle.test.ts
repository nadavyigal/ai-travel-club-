import request from 'supertest';
import { app } from '../../src/app';

describe('GET /v1/events/bundle - Event Bundle Search Contract Tests', () => {
  describe('Request Validation', () => {
    it('should require location parameter', async () => {
      const response = await request(app)
        .get('/v1/events/bundle');

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('location is required');
    });

    it('should validate event_type enum values', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          event_type: 'invalid_type',
          location: 'New York, NY'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('event_type must be one of: sports, concerts, festivals, conferences');
    });

    it('should validate date_range format', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'New York, NY',
          date_range: 'invalid-format'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('date_range must follow format YYYY-MM-DD:YYYY-MM-DD');
    });

    it('should validate date_range start before end', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'New York, NY',
          date_range: '2024-12-31:2024-12-30' // End before start
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('end date must be after start date');
    });

    it('should validate budget_max is positive number', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'New York, NY',
          budget_max: -100
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('budget_max must be positive');
    });

    it('should validate budget_max is numeric', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'New York, NY',
          budget_max: 'not-a-number'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('budget_max must be a number');
    });
  });

  describe('Successful Bundle Search', () => {
    it('should return bundles for valid location-only search', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'Las Vegas, NV'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('bundles');
      expect(Array.isArray(response.body.bundles)).toBe(true);

      if (response.body.bundles.length > 0) {
        const bundle = response.body.bundles[0];
        expect(bundle).toHaveProperty('event');
        expect(bundle).toHaveProperty('accommodation');
        expect(bundle).toHaveProperty('total_package_price');
        expect(bundle).toHaveProperty('savings');
      }
    });

    it('should return bundles for sports events', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          event_type: 'sports',
          location: 'Los Angeles, CA',
          date_range: '2024-12-01:2024-12-31'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('bundles');

      if (response.body.bundles.length > 0) {
        const bundle = response.body.bundles[0];
        expect(bundle.event).toHaveProperty('name');
        expect(bundle.event).toHaveProperty('venue');
        expect(bundle.event).toHaveProperty('date');
        expect(bundle.event).toHaveProperty('ticket_price');
      }
    });

    it('should return bundles for concerts', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          event_type: 'concerts',
          location: 'Nashville, TN',
          date_range: '2024-12-15:2025-01-15'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('bundles');

      if (response.body.bundles.length > 0) {
        const bundle = response.body.bundles[0];
        expect(bundle.event).toHaveProperty('name');
        expect(bundle.event).toHaveProperty('venue');
        expect(bundle.event).toHaveProperty('date');
        expect(bundle.event).toHaveProperty('ticket_price');
        expect(typeof bundle.event.ticket_price).toBe('number');
      }
    });

    it('should return bundles for festivals', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          event_type: 'festivals',
          location: 'Austin, TX',
          date_range: '2025-03-01:2025-03-31'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('bundles');
    });

    it('should return bundles for conferences', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          event_type: 'conferences',
          location: 'San Francisco, CA',
          date_range: '2024-11-01:2024-11-30'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('bundles');
    });

    it('should filter bundles by budget constraint', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'Miami, FL',
          budget_max: 500
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('bundles');

      // All returned bundles should be within budget
      response.body.bundles.forEach((bundle: any) => {
        expect(bundle.total_package_price).toBeLessThanOrEqual(500);
      });
    });

    it('should combine all search parameters', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          event_type: 'sports',
          location: 'Denver, CO',
          date_range: '2024-12-01:2024-12-31',
          budget_max: 1000
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('bundles');

      response.body.bundles.forEach((bundle: any) => {
        expect(bundle.total_package_price).toBeLessThanOrEqual(1000);
      });
    });
  });

  describe('Event Bundle Structure Validation', () => {
    it('should validate event object structure', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'Chicago, IL',
          event_type: 'sports'
        });

      expect(response.status).toBe(200);

      if (response.body.bundles.length > 0) {
        const event = response.body.bundles[0].event;
        expect(event).toHaveProperty('name');
        expect(event).toHaveProperty('venue');
        expect(event).toHaveProperty('date');
        expect(event).toHaveProperty('ticket_price');

        expect(typeof event.name).toBe('string');
        expect(typeof event.venue).toBe('string');
        expect(typeof event.date).toBe('string');
        expect(typeof event.ticket_price).toBe('number');
        expect(event.ticket_price).toBeGreaterThan(0);

        // Validate date format
        expect(event.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      }
    });

    it('should validate accommodation object structure', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'Boston, MA',
          event_type: 'concerts'
        });

      expect(response.status).toBe(200);

      if (response.body.bundles.length > 0) {
        const accommodation = response.body.bundles[0].accommodation;
        expect(accommodation).toHaveProperty('name');
        expect(accommodation).toHaveProperty('distance_to_venue');
        expect(accommodation).toHaveProperty('price_per_night');

        expect(typeof accommodation.name).toBe('string');
        expect(typeof accommodation.distance_to_venue).toBe('string');
        expect(typeof accommodation.price_per_night).toBe('number');
        expect(accommodation.price_per_night).toBeGreaterThan(0);
      }
    });

    it('should validate bundle pricing calculations', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'Seattle, WA',
          event_type: 'festivals'
        });

      expect(response.status).toBe(200);

      if (response.body.bundles.length > 0) {
        const bundle = response.body.bundles[0];
        expect(bundle).toHaveProperty('total_package_price');
        expect(bundle).toHaveProperty('savings');

        expect(typeof bundle.total_package_price).toBe('number');
        expect(typeof bundle.savings).toBe('number');
        expect(bundle.total_package_price).toBeGreaterThan(0);
        expect(bundle.savings).toBeGreaterThanOrEqual(0);

        // Total package price should be reasonable
        const individualTotal = bundle.event.ticket_price + bundle.accommodation.price_per_night;
        expect(bundle.total_package_price).toBeLessThanOrEqual(individualTotal);
      }
    });
  });

  describe('No Results Scenarios', () => {
    it('should return 404 when no bundles found for location', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'Remote Island, Nowhere'
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('no bundles found');
    });

    it('should return 404 when no bundles found for event type', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          event_type: 'conferences',
          location: 'Small Town, MT'
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('no bundles found');
    });

    it('should return 404 when no bundles found within budget', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'New York, NY',
          budget_max: 10 // Unrealistically low budget
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('no bundles found within budget');
    });

    it('should return 404 when no events in date range', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'Las Vegas, NV',
          date_range: '2030-01-01:2030-01-02' // Far future dates
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('no bundles found for date range');
    });
  });

  describe('Sorting and Filtering', () => {
    it('should return bundles sorted by best value (savings)', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'Orlando, FL',
          event_type: 'festivals'
        });

      expect(response.status).toBe(200);

      if (response.body.bundles.length > 1) {
        const bundles = response.body.bundles;
        for (let i = 0; i < bundles.length - 1; i++) {
          // Should be sorted by savings descending (best deals first)
          expect(bundles[i].savings).toBeGreaterThanOrEqual(bundles[i + 1].savings);
        }
      }
    });

    it('should limit number of results', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'New York, NY'
        });

      expect(response.status).toBe(200);
      expect(response.body.bundles.length).toBeLessThanOrEqual(50); // Reasonable limit
    });
  });

  describe('Authentication and Rate Limiting', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'Phoenix, AZ'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('authentication required');
    });

    it('should handle rate limiting', async () => {
      // This would need proper rate limiting setup
      const response = await request(app)
        .get('/v1/events/bundle')
        .set('Authorization', 'Bearer invalid-token')
        .query({
          location: 'San Diego, CA'
        });

      expect([401, 429]).toContain(response.status);
    });
  });

  describe('External API Integration', () => {
    it('should handle event provider API timeouts', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'Timeout Test Location',
          event_type: 'sports'
        });

      // Should either succeed or return appropriate timeout error
      if (response.status !== 200) {
        expect([503, 408]).toContain(response.status);
        expect(response.body.error).toBeDefined();
        expect(response.body.message).toContain('service temporarily unavailable');
      }
    });

    it('should handle accommodation provider API failures', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'API Failure Test Location',
          event_type: 'concerts'
        });

      // Should either succeed or handle gracefully
      if (response.status !== 200) {
        expect([503, 404]).toContain(response.status);
      }
    });
  });

  describe('Data Quality Validation', () => {
    it('should validate distance calculations are reasonable', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'Portland, OR',
          event_type: 'sports'
        });

      expect(response.status).toBe(200);

      if (response.body.bundles.length > 0) {
        response.body.bundles.forEach((bundle: any) => {
          const distance = bundle.accommodation.distance_to_venue;
          // Distance should be in reasonable format (e.g., "0.5 miles", "2.3 km")
          expect(distance).toMatch(/^\d+(\.\d+)?\s+(miles?|km|kilometers?|blocks?)$/i);
        });
      }
    });

    it('should validate event dates are in the future', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'Atlanta, GA',
          event_type: 'conferences'
        });

      expect(response.status).toBe(200);

      if (response.body.bundles.length > 0) {
        const now = new Date();
        response.body.bundles.forEach((bundle: any) => {
          const eventDate = new Date(bundle.event.date);
          expect(eventDate.getTime()).toBeGreaterThan(now.getTime());
        });
      }
    });
  });

  describe('Response Performance', () => {
    it('should return results within reasonable time', async () => {
      const startTime = Date.now();

      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          location: 'Houston, TX',
          event_type: 'sports'
        });

      const responseTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(5000); // Less than 5 seconds
    });
  });

  describe('Error Handling', () => {
    it('should return structured error responses', async () => {
      const response = await request(app)
        .get('/v1/events/bundle')
        .query({
          event_type: 'invalid',
          location: '',
          date_range: 'invalid',
          budget_max: 'invalid'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('code');
      expect(typeof response.body.error).toBe('string');
      expect(typeof response.body.message).toBe('string');
      expect(typeof response.body.code).toBe('number');
    });

    it('should handle malformed query parameters gracefully', async () => {
      const response = await request(app)
        .get('/v1/events/bundle?location=Test&invalid_param=value&budget_max=abc');

      expect([200, 400]).toContain(response.status);

      if (response.status === 400) {
        expect(response.body.error).toBeDefined();
      }
    });
  });
});