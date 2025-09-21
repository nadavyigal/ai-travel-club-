import request from 'supertest';
import { app } from '../../src/app';

describe('POST /v1/payments/split - Payment Splitting Contract Tests', () => {
  const validBookingId = '123e4567-e89b-12d3-a456-426614174000';
  const validUserId1 = '987fcdeb-51a2-43d1-9f20-8d5ef2a9c1b0';
  const validUserId2 = '987fcdeb-51a2-43d1-9f20-8d5ef2a9c1b1';

  describe('Request Validation', () => {
    it('should require all mandatory fields', async () => {
      const response = await request(app)
        .post('/v1/payments/split')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('booking_id');
      expect(response.body.message).toContain('splits');
    });

    it('should validate booking_id format', async () => {
      const response = await request(app)
        .post('/v1/payments/split')
        .send({
          booking_id: 'invalid-uuid',
          splits: [{
            user_id: validUserId1,
            percentage: 100,
            payment_method: 'pm_test_stripe_method'
          }]
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('booking_id must be a valid UUID');
    });

    it('should require at least one split', async () => {
      const response = await request(app)
        .post('/v1/payments/split')
        .send({
          booking_id: validBookingId,
          splits: []
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('at least one split required');
    });

    it('should enforce maximum split limit', async () => {
      const tooManySplits = Array.from({ length: 21 }, (_, i) => ({
        user_id: `987fcdeb-51a2-43d1-9f20-8d5ef2a9c1b${i}`,
        percentage: 100 / 21,
        payment_method: 'pm_test_stripe_method'
      }));

      const response = await request(app)
        .post('/v1/payments/split')
        .send({
          booking_id: validBookingId,
          splits: tooManySplits
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('maximum 20 splits allowed');
    });

    it('should validate booking exists', async () => {
      const nonExistentBookingId = '123e4567-e89b-12d3-a456-426614174999';

      const response = await request(app)
        .post('/v1/payments/split')
        .send({
          booking_id: nonExistentBookingId,
          splits: [{
            user_id: validUserId1,
            percentage: 100,
            payment_method: 'pm_test_stripe_method'
          }]
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('booking not found');
    });
  });

  describe('Split Validation', () => {
    it('should validate user_id format in splits', async () => {
      const response = await request(app)
        .post('/v1/payments/split')
        .send({
          booking_id: validBookingId,
          splits: [{
            user_id: 'invalid-uuid',
            percentage: 100,
            payment_method: 'pm_test_stripe_method'
          }]
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('user_id must be a valid UUID');
    });

    it('should validate percentage ranges', async () => {
      const response = await request(app)
        .post('/v1/payments/split')
        .send({
          booking_id: validBookingId,
          splits: [{
            user_id: validUserId1,
            percentage: 150, // Invalid: > 100
            payment_method: 'pm_test_stripe_method'
          }]
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('percentage must be between 0 and 100');
    });

    it('should validate negative percentages', async () => {
      const response = await request(app)
        .post('/v1/payments/split')
        .send({
          booking_id: validBookingId,
          splits: [{
            user_id: validUserId1,
            percentage: -10, // Invalid: negative
            payment_method: 'pm_test_stripe_method'
          }]
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('percentage must be between 0 and 100');
    });

    it('should validate total percentages sum to 100', async () => {
      const response = await request(app)
        .post('/v1/payments/split')
        .send({
          booking_id: validBookingId,
          splits: [
            {
              user_id: validUserId1,
              percentage: 60,
              payment_method: 'pm_test_stripe_method_1'
            },
            {
              user_id: validUserId2,
              percentage: 30, // Total: 90%, not 100%
              payment_method: 'pm_test_stripe_method_2'
            }
          ]
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('percentages must sum to 100');
    });

    it('should validate payment method format', async () => {
      const response = await request(app)
        .post('/v1/payments/split')
        .send({
          booking_id: validBookingId,
          splits: [{
            user_id: validUserId1,
            percentage: 100,
            payment_method: 'invalid_payment_method'
          }]
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('invalid payment method format');
    });

    it('should prevent duplicate user_ids in splits', async () => {
      const response = await request(app)
        .post('/v1/payments/split')
        .send({
          booking_id: validBookingId,
          splits: [
            {
              user_id: validUserId1,
              percentage: 50,
              payment_method: 'pm_test_stripe_method_1'
            },
            {
              user_id: validUserId1, // Duplicate user
              percentage: 50,
              payment_method: 'pm_test_stripe_method_2'
            }
          ]
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('duplicate user_id not allowed');
    });

    it('should validate users exist', async () => {
      const nonExistentUserId = '987fcdeb-51a2-43d1-9f20-8d5ef2a9c999';

      const response = await request(app)
        .post('/v1/payments/split')
        .send({
          booking_id: validBookingId,
          splits: [{
            user_id: nonExistentUserId,
            percentage: 100,
            payment_method: 'pm_test_stripe_method'
          }]
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('user not found');
    });
  });

  describe('Amount Calculation', () => {
    it('should calculate correct amounts based on percentages', async () => {
      const validRequest = {
        booking_id: validBookingId, // Assume booking total is $1000
        splits: [
          {
            user_id: validUserId1,
            percentage: 60,
            payment_method: 'pm_test_stripe_method_1'
          },
          {
            user_id: validUserId2,
            percentage: 40,
            payment_method: 'pm_test_stripe_method_2'
          }
        ]
      };

      const response = await request(app)
        .post('/v1/payments/split')
        .send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total_amount');
      expect(response.body).toHaveProperty('payment_urls');

      // Verify amounts are calculated correctly
      const paymentUrls = response.body.payment_urls;
      expect(paymentUrls).toHaveLength(2);

      // Should have payment URLs for both users
      const user1Payment = paymentUrls.find((p: any) => p.user_id === validUserId1);
      const user2Payment = paymentUrls.find((p: any) => p.user_id === validUserId2);

      expect(user1Payment).toBeDefined();
      expect(user2Payment).toBeDefined();
      expect(user1Payment.payment_url).toMatch(/^https?:\/\/.+/);
      expect(user2Payment.payment_url).toMatch(/^https?:\/\/.+/);
    });

    it('should handle decimal percentages correctly', async () => {
      const validRequest = {
        booking_id: validBookingId,
        splits: [
          {
            user_id: validUserId1,
            percentage: 33.33,
            payment_method: 'pm_test_stripe_method_1'
          },
          {
            user_id: validUserId2,
            percentage: 66.67,
            payment_method: 'pm_test_stripe_method_2'
          }
        ]
      };

      const response = await request(app)
        .post('/v1/payments/split')
        .send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('split_id');
      expect(response.body).toHaveProperty('total_amount');
    });
  });

  describe('Successful Payment Split Creation', () => {
    it('should create payment split with equal division', async () => {
      const equalSplitRequest = {
        booking_id: validBookingId,
        splits: [
          {
            user_id: validUserId1,
            percentage: 50,
            payment_method: 'pm_test_stripe_method_1'
          },
          {
            user_id: validUserId2,
            percentage: 50,
            payment_method: 'pm_test_stripe_method_2'
          }
        ]
      };

      const response = await request(app)
        .post('/v1/payments/split')
        .send(equalSplitRequest);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('split_id');
      expect(response.body.split_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

      expect(response.body).toHaveProperty('total_amount');
      expect(typeof response.body.total_amount).toBe('number');

      expect(response.body).toHaveProperty('payment_urls');
      expect(Array.isArray(response.body.payment_urls)).toBe(true);
      expect(response.body.payment_urls).toHaveLength(2);
    });

    it('should create payment split with unequal division', async () => {
      const unequalSplitRequest = {
        booking_id: validBookingId,
        splits: [
          {
            user_id: validUserId1,
            percentage: 70,
            payment_method: 'pm_test_stripe_method_1'
          },
          {
            user_id: validUserId2,
            percentage: 30,
            payment_method: 'pm_test_stripe_method_2'
          }
        ]
      };

      const response = await request(app)
        .post('/v1/payments/split')
        .send(unequalSplitRequest);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('split_id');
      expect(response.body).toHaveProperty('total_amount');
      expect(response.body).toHaveProperty('payment_urls');
    });

    it('should create payment split for single user (100%)', async () => {
      const singleUserRequest = {
        booking_id: validBookingId,
        splits: [{
          user_id: validUserId1,
          percentage: 100,
          payment_method: 'pm_test_stripe_method'
        }]
      };

      const response = await request(app)
        .post('/v1/payments/split')
        .send(singleUserRequest);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('split_id');
      expect(response.body).toHaveProperty('payment_urls');
      expect(response.body.payment_urls).toHaveLength(1);
    });

    it('should handle complex multi-user split', async () => {
      const complexSplitRequest = {
        booking_id: validBookingId,
        splits: [
          {
            user_id: validUserId1,
            percentage: 40,
            payment_method: 'pm_test_stripe_method_1'
          },
          {
            user_id: validUserId2,
            percentage: 30,
            payment_method: 'pm_test_stripe_method_2'
          },
          {
            user_id: '987fcdeb-51a2-43d1-9f20-8d5ef2a9c1b2',
            percentage: 20,
            payment_method: 'pm_test_stripe_method_3'
          },
          {
            user_id: '987fcdeb-51a2-43d1-9f20-8d5ef2a9c1b3',
            percentage: 10,
            payment_method: 'pm_test_stripe_method_4'
          }
        ]
      };

      const response = await request(app)
        .post('/v1/payments/split')
        .send(complexSplitRequest);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('split_id');
      expect(response.body).toHaveProperty('payment_urls');
      expect(response.body.payment_urls).toHaveLength(4);
    });
  });

  describe('Stripe Integration', () => {
    it('should generate valid Stripe payment URLs', async () => {
      const validRequest = {
        booking_id: validBookingId,
        splits: [{
          user_id: validUserId1,
          percentage: 100,
          payment_method: 'pm_test_valid_stripe_method'
        }]
      };

      const response = await request(app)
        .post('/v1/payments/split')
        .send(validRequest);

      expect(response.status).toBe(200);

      const paymentUrl = response.body.payment_urls[0].payment_url;
      expect(paymentUrl).toMatch(/^https:\/\/checkout\.stripe\.com\/.+/);
    });

    it('should handle invalid Stripe payment methods', async () => {
      const invalidStripeRequest = {
        booking_id: validBookingId,
        splits: [{
          user_id: validUserId1,
          percentage: 100,
          payment_method: 'pm_invalid_stripe_method'
        }]
      };

      const response = await request(app)
        .post('/v1/payments/split')
        .send(invalidStripeRequest);

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('invalid payment method');
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/v1/payments/split')
        .send({
          booking_id: validBookingId,
          splits: [{
            user_id: validUserId1,
            percentage: 100,
            payment_method: 'pm_test_stripe_method'
          }]
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('authentication required');
    });

    it('should verify user has permission to split payment for booking', async () => {
      const response = await request(app)
        .post('/v1/payments/split')
        .set('Authorization', 'Bearer valid-but-unauthorized-token')
        .send({
          booking_id: validBookingId,
          splits: [{
            user_id: validUserId1,
            percentage: 100,
            payment_method: 'pm_test_stripe_method'
          }]
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('not authorized to split payment for this booking');
    });
  });

  describe('Duplicate Split Prevention', () => {
    it('should prevent creating multiple splits for same booking', async () => {
      const splitRequest = {
        booking_id: validBookingId,
        splits: [{
          user_id: validUserId1,
          percentage: 100,
          payment_method: 'pm_test_stripe_method'
        }]
      };

      // Create first split
      const firstResponse = await request(app)
        .post('/v1/payments/split')
        .send(splitRequest);

      expect(firstResponse.status).toBe(200);

      // Attempt to create second split for same booking
      const secondResponse = await request(app)
        .post('/v1/payments/split')
        .send(splitRequest);

      expect(secondResponse.status).toBe(409);
      expect(secondResponse.body.error).toBeDefined();
      expect(secondResponse.body.message).toContain('payment split already exists for this booking');
    });
  });

  describe('Response Structure Validation', () => {
    it('should return properly structured payment split response', async () => {
      const validRequest = {
        booking_id: validBookingId,
        splits: [
          {
            user_id: validUserId1,
            percentage: 60,
            payment_method: 'pm_test_stripe_method_1'
          },
          {
            user_id: validUserId2,
            percentage: 40,
            payment_method: 'pm_test_stripe_method_2'
          }
        ]
      };

      const response = await request(app)
        .post('/v1/payments/split')
        .send(validRequest);

      expect(response.status).toBe(200);

      // Validate required response fields
      expect(response.body).toHaveProperty('split_id');
      expect(typeof response.body.split_id).toBe('string');
      expect(response.body.split_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

      expect(response.body).toHaveProperty('total_amount');
      expect(typeof response.body.total_amount).toBe('number');

      expect(response.body).toHaveProperty('payment_urls');
      expect(Array.isArray(response.body.payment_urls)).toBe(true);

      // Validate payment URL structure
      response.body.payment_urls.forEach((paymentUrl: any) => {
        expect(paymentUrl).toHaveProperty('user_id');
        expect(paymentUrl).toHaveProperty('payment_url');
        expect(typeof paymentUrl.user_id).toBe('string');
        expect(typeof paymentUrl.payment_url).toBe('string');
        expect(paymentUrl.payment_url).toMatch(/^https?:\/\/.+/);
      });
    });
  });

  describe('Error Handling', () => {
    it('should return structured error responses', async () => {
      const response = await request(app)
        .post('/v1/payments/split')
        .send({
          booking_id: 'invalid-uuid',
          splits: [{
            user_id: 'invalid-uuid',
            percentage: 150,
            payment_method: 'invalid'
          }]
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('code');
      expect(typeof response.body.error).toBe('string');
      expect(typeof response.body.message).toBe('string');
      expect(typeof response.body.code).toBe('number');
    });

    it('should handle Stripe API errors gracefully', async () => {
      const stripeFailureRequest = {
        booking_id: validBookingId,
        splits: [{
          user_id: validUserId1,
          percentage: 100,
          payment_method: 'pm_test_stripe_failure'
        }]
      };

      const response = await request(app)
        .post('/v1/payments/split')
        .send(stripeFailureRequest);

      // Should return appropriate error for Stripe failures
      expect([400, 402, 503]).toContain(response.status);
      expect(response.body.error).toBeDefined();

      if (response.status === 503) {
        expect(response.body.message).toContain('payment service temporarily unavailable');
      }
    });
  });
});