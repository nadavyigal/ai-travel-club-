import request from 'supertest';
import { app } from '../../src/app';

describe('POST /v1/bookings/trip-pass - Trip Pass Booking Contract Tests', () => {
  const validItineraryId = '123e4567-e89b-12d3-a456-426614174000';
  const validTripPassId = '987fcdeb-51a2-43d1-9f20-8d5ef2a9c1b0';

  describe('Request Validation', () => {
    it('should require all mandatory fields', async () => {
      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('itinerary_id');
      expect(response.body.message).toContain('trip_pass_id');
    });

    it('should validate itinerary_id format', async () => {
      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: 'invalid-uuid',
          trip_pass_id: validTripPassId
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('itinerary_id must be a valid UUID');
    });

    it('should validate trip_pass_id format', async () => {
      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: validItineraryId,
          trip_pass_id: 'invalid-uuid'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('trip_pass_id must be a valid UUID');
    });

    it('should validate auto_rebook is boolean when provided', async () => {
      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: validItineraryId,
          trip_pass_id: validTripPassId,
          auto_rebook: 'invalid-boolean'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('auto_rebook must be a boolean');
    });

    it('should validate itinerary exists', async () => {
      const nonExistentItineraryId = '123e4567-e89b-12d3-a456-426614174999';

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: nonExistentItineraryId,
          trip_pass_id: validTripPassId
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('itinerary not found');
    });

    it('should validate trip pass exists', async () => {
      const nonExistentTripPassId = '987fcdeb-51a2-43d1-9f20-8d5ef2a9c999';

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: validItineraryId,
          trip_pass_id: nonExistentTripPassId
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('trip pass not found');
    });
  });

  describe('Trip Pass Validation', () => {
    it('should validate trip pass is active', async () => {
      const inactiveTripPassId = '987fcdeb-51a2-43d1-9f20-8d5ef2a9c1b1';

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: validItineraryId,
          trip_pass_id: inactiveTripPassId
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('trip pass is not active');
    });

    it('should validate trip pass is not expired', async () => {
      const expiredTripPassId = '987fcdeb-51a2-43d1-9f20-8d5ef2a9c1b2';

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: validItineraryId,
          trip_pass_id: expiredTripPassId
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('trip pass has expired');
    });

    it('should validate trip pass coverage limits', async () => {
      const limitedTripPassId = '987fcdeb-51a2-43d1-9f20-8d5ef2a9c1b3';

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: validItineraryId, // Assume this itinerary exceeds guarantee limit
          trip_pass_id: limitedTripPassId
        });

      expect(response.status).toBe(402);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('booking amount exceeds trip pass guarantee limit');
    });

    it('should validate user owns the trip pass', async () => {
      const otherUserTripPassId = '987fcdeb-51a2-43d1-9f20-8d5ef2a9c1b4';

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .set('Authorization', 'Bearer valid-token-wrong-user')
        .send({
          itinerary_id: validItineraryId,
          trip_pass_id: otherUserTripPassId
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('trip pass does not belong to user');
    });
  });

  describe('Booking Availability', () => {
    it('should validate accommodation availability', async () => {
      const unavailableItineraryId = '123e4567-e89b-12d3-a456-426614174001';

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: unavailableItineraryId,
          trip_pass_id: validTripPassId
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('accommodation no longer available');
    });

    it('should validate transportation availability', async () => {
      const fullyBookedItineraryId = '123e4567-e89b-12d3-a456-426614174002';

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: fullyBookedItineraryId,
          trip_pass_id: validTripPassId
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('transportation no longer available');
    });

    it('should handle price changes since itinerary generation', async () => {
      const priceChangedItineraryId = '123e4567-e89b-12d3-a456-426614174003';

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: priceChangedItineraryId,
          trip_pass_id: validTripPassId
        });

      // Should either succeed with price protection or warn about changes
      if (response.status === 201) {
        expect(response.body.guarantee_terms).toHaveProperty('price_protection');
      } else {
        expect(response.status).toBe(409);
        expect(response.body.message).toContain('prices have changed');
      }
    });
  });

  describe('Successful Booking Creation', () => {
    it('should create booking with default auto-rebooking enabled', async () => {
      const validRequest = {
        itinerary_id: validItineraryId,
        trip_pass_id: validTripPassId
      };

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send(validRequest);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

      expect(response.body).toHaveProperty('trip_id');
      expect(response.body).toHaveProperty('confirmation_code');
      expect(response.body).toHaveProperty('total_amount');
      expect(response.body).toHaveProperty('currency');
      expect(response.body).toHaveProperty('booking_status', 'confirmed');
      expect(response.body).toHaveProperty('travel_date');

      // Validate guarantee terms
      expect(response.body).toHaveProperty('guarantee_terms');
      expect(response.body.guarantee_terms).toHaveProperty('price_protection');
      expect(response.body.guarantee_terms).toHaveProperty('auto_rebook_sla');
      expect(response.body.guarantee_terms).toHaveProperty('refund_policy');

      expect(typeof response.body.guarantee_terms.price_protection).toBe('number');
      expect(typeof response.body.guarantee_terms.auto_rebook_sla).toBe('number');
      expect(typeof response.body.guarantee_terms.refund_policy).toBe('string');
    });

    it('should create booking with auto-rebooking explicitly enabled', async () => {
      const validRequest = {
        itinerary_id: validItineraryId,
        trip_pass_id: validTripPassId,
        auto_rebook: true
      };

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send(validRequest);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('guarantee_terms');
      expect(response.body.guarantee_terms.auto_rebook_sla).toBeGreaterThan(0);
    });

    it('should create booking with auto-rebooking disabled', async () => {
      const validRequest = {
        itinerary_id: validItineraryId,
        trip_pass_id: validTripPassId,
        auto_rebook: false
      };

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send(validRequest);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('guarantee_terms');
      // Auto-rebook SLA should be null or 0 when disabled
      expect([null, 0]).toContain(response.body.guarantee_terms.auto_rebook_sla);
    });

    it('should generate valid confirmation code', async () => {
      const validRequest = {
        itinerary_id: validItineraryId,
        trip_pass_id: validTripPassId
      };

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send(validRequest);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('confirmation_code');
      expect(typeof response.body.confirmation_code).toBe('string');
      expect(response.body.confirmation_code.length).toBeGreaterThan(5);
    });
  });

  describe('Guarantee Terms Validation', () => {
    it('should set price protection based on trip pass tier', async () => {
      const premiumTripPassId = '987fcdeb-51a2-43d1-9f20-8d5ef2a9c1b5';

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: validItineraryId,
          trip_pass_id: premiumTripPassId
        });

      expect(response.status).toBe(201);
      expect(response.body.guarantee_terms.price_protection).toBeGreaterThan(0);
    });

    it('should set auto-rebook SLA based on trip pass tier', async () => {
      const enterpriseTripPassId = '987fcdeb-51a2-43d1-9f20-8d5ef2a9c1b6';

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: validItineraryId,
          trip_pass_id: enterpriseTripPassId
        });

      expect(response.status).toBe(201);
      expect(response.body.guarantee_terms.auto_rebook_sla).toBeLessThanOrEqual(5); // 5 minutes max
    });

    it('should include appropriate refund policy', async () => {
      const validRequest = {
        itinerary_id: validItineraryId,
        trip_pass_id: validTripPassId
      };

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send(validRequest);

      expect(response.status).toBe(201);
      expect(response.body.guarantee_terms.refund_policy).toMatch(/full refund|partial refund|no refund/i);
    });
  });

  describe('Payment Processing', () => {
    it('should handle successful payment processing', async () => {
      const validRequest = {
        itinerary_id: validItineraryId,
        trip_pass_id: validTripPassId
      };

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send(validRequest);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('total_amount');
      expect(response.body.total_amount).toBeGreaterThan(0);
      expect(response.body).toHaveProperty('booking_status', 'confirmed');
    });

    it('should handle payment failures', async () => {
      const paymentFailTripPassId = '987fcdeb-51a2-43d1-9f20-8d5ef2a9c1b7';

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: validItineraryId,
          trip_pass_id: paymentFailTripPassId
        });

      expect(response.status).toBe(402);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('payment failed');
    });

    it('should handle insufficient trip pass balance', async () => {
      const insufficientTripPassId = '987fcdeb-51a2-43d1-9f20-8d5ef2a9c1b8';

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: validItineraryId,
          trip_pass_id: insufficientTripPassId
        });

      expect(response.status).toBe(402);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('insufficient trip pass balance');
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: validItineraryId,
          trip_pass_id: validTripPassId
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('authentication required');
    });

    it('should verify user has access to the itinerary', async () => {
      const restrictedItineraryId = '123e4567-e89b-12d3-a456-426614174004';

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .set('Authorization', 'Bearer valid-but-unauthorized-token')
        .send({
          itinerary_id: restrictedItineraryId,
          trip_pass_id: validTripPassId
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('not authorized to book this itinerary');
    });
  });

  describe('Booking Provider Integration', () => {
    it('should handle Amadeus booking success', async () => {
      const amadeusBakableItineraryId = '123e4567-e89b-12d3-a456-426614174005';

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: amadeusBakableItineraryId,
          trip_pass_id: validTripPassId
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('confirmation_code');
      // Should include provider-specific booking ID
      expect(response.body).toHaveProperty('provider_booking_id');
    });

    it('should handle Expedia booking success', async () => {
      const expediaBookableItineraryId = '123e4567-e89b-12d3-a456-426614174006';

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: expediaBookableItineraryId,
          trip_pass_id: validTripPassId
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('confirmation_code');
    });

    it('should handle provider API failures gracefully', async () => {
      const providerFailItineraryId = '123e4567-e89b-12d3-a456-426614174007';

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: providerFailItineraryId,
          trip_pass_id: validTripPassId
        });

      expect([503, 409]).toContain(response.status);
      expect(response.body.error).toBeDefined();

      if (response.status === 503) {
        expect(response.body.message).toContain('booking service temporarily unavailable');
      } else {
        expect(response.body.message).toContain('booking failed');
      }
    });
  });

  describe('Response Structure Validation', () => {
    it('should return properly structured booking response', async () => {
      const validRequest = {
        itinerary_id: validItineraryId,
        trip_pass_id: validTripPassId,
        auto_rebook: true
      };

      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send(validRequest);

      expect(response.status).toBe(201);

      // Validate Booking schema fields
      expect(response.body).toHaveProperty('id');
      expect(typeof response.body.id).toBe('string');

      expect(response.body).toHaveProperty('trip_id');
      expect(typeof response.body.trip_id).toBe('string');

      expect(response.body).toHaveProperty('confirmation_code');
      expect(typeof response.body.confirmation_code).toBe('string');

      expect(response.body).toHaveProperty('total_amount');
      expect(typeof response.body.total_amount).toBe('number');

      expect(response.body).toHaveProperty('currency');
      expect(typeof response.body.currency).toBe('string');

      expect(response.body).toHaveProperty('booking_status');
      expect(['confirmed', 'cancelled', 'modified', 'completed']).toContain(response.body.booking_status);

      expect(response.body).toHaveProperty('travel_date');
      expect(typeof response.body.travel_date).toBe('string');

      // Validate guarantee_terms structure
      expect(response.body).toHaveProperty('guarantee_terms');
      expect(response.body.guarantee_terms).toHaveProperty('price_protection');
      expect(response.body.guarantee_terms).toHaveProperty('auto_rebook_sla');
      expect(response.body.guarantee_terms).toHaveProperty('refund_policy');

      expect(typeof response.body.guarantee_terms.price_protection).toBe('number');
      expect(typeof response.body.guarantee_terms.auto_rebook_sla).toBe('number');
      expect(typeof response.body.guarantee_terms.refund_policy).toBe('string');
    });
  });

  describe('Error Handling', () => {
    it('should return structured error responses', async () => {
      const response = await request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: 'invalid-uuid',
          trip_pass_id: 'invalid-uuid'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('code');
      expect(typeof response.body.error).toBe('string');
      expect(typeof response.body.message).toBe('string');
      expect(typeof response.body.code).toBe('number');
    });

    it('should handle concurrent booking attempts', async () => {
      const limitedAvailabilityItinerary = '123e4567-e89b-12d3-a456-426614174008';

      // Simulate concurrent booking attempts
      const booking1Promise = request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: limitedAvailabilityItinerary,
          trip_pass_id: validTripPassId
        });

      const booking2Promise = request(app)
        .post('/v1/bookings/trip-pass')
        .send({
          itinerary_id: limitedAvailabilityItinerary,
          trip_pass_id: '987fcdeb-51a2-43d1-9f20-8d5ef2a9c1b9'
        });

      const [response1, response2] = await Promise.all([booking1Promise, booking2Promise]);

      // One should succeed, one should fail due to availability
      const statuses = [response1.status, response2.status].sort();
      expect(statuses[0]).toBe(201); // One success
      expect([409, 503]).toContain(statuses[1]); // One failure
    });
  });
});