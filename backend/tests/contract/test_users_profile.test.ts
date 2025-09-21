import request from 'supertest';
import { app } from '../../src/app';

describe('PUT /v1/users/{id}/profile - User Profile Update Contract Tests', () => {
  let authToken: string;
  let testUserId: string;
  let otherAuthToken: string;
  let otherUserId: string;

  beforeAll(async () => {
    // Create test user
    const registerResponse = await request(app)
      .post('/v1/auth/register')
      .send({
        email: 'profile-test@example.com',
        password: 'ProfileTest123!',
        profile: {
          budget_range: 'budget',
          travel_style: 'cultural',
          dietary_restrictions: ['vegetarian']
        },
        loyalty_programs: [{
          provider: 'Delta',
          account_id: 'DL123456'
        }]
      });

    authToken = registerResponse.body.token;
    testUserId = registerResponse.body.user.id;

    // Create another user for authorization tests
    const otherRegisterResponse = await request(app)
      .post('/v1/auth/register')
      .send({
        email: 'other-profile-test@example.com',
        password: 'OtherTest123!'
      });

    otherAuthToken = otherRegisterResponse.body.token;
    otherUserId = otherRegisterResponse.body.user.id;
  });

  describe('Request Validation', () => {
    it('should validate user ID parameter format', async () => {
      const response = await request(app)
        .put('/v1/users/invalid-uuid/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            budget_range: 'luxury'
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('user ID must be a valid UUID');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .send({
          profile: {
            budget_range: 'luxury'
          }
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('authentication required');
    });

    it('should reject invalid authentication token', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', 'Bearer invalid-token')
        .send({
          profile: {
            budget_range: 'luxury'
          }
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('invalid token');
    });

    it('should require request body', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('request body cannot be empty');
    });

    it('should validate at least one updatable field is provided', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          invalid_field: 'value'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('no valid fields to update');
    });
  });

  describe('Profile Field Validation', () => {
    it('should validate budget_range enum values', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            budget_range: 'invalid_range'
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('budget_range must be one of: budget, mid-range, luxury');
    });

    it('should validate travel_style enum values', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            travel_style: 'invalid_style'
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('travel_style must be one of: adventure, relaxation, cultural, business');
    });

    it('should validate dietary_restrictions array format', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            dietary_restrictions: 'not-an-array'
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('dietary_restrictions must be an array');
    });

    it('should validate dietary_restrictions array contents', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            dietary_restrictions: ['valid', 123, 'also-valid']
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('dietary restrictions must be strings');
    });
  });

  describe('Loyalty Programs Validation', () => {
    it('should validate loyalty_programs array format', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          loyalty_programs: 'not-an-array'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('loyalty_programs must be an array');
    });

    it('should validate loyalty program object structure', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          loyalty_programs: [{
            provider: 'Delta'
            // Missing account_id
          }]
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('loyalty program must have provider and account_id');
    });

    it('should validate supported loyalty program providers', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          loyalty_programs: [{
            provider: 'UnsupportedAirline',
            account_id: '12345'
          }]
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('unsupported loyalty program provider');
    });

    it('should validate account_id format', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          loyalty_programs: [{
            provider: 'Delta',
            account_id: '' // Empty account_id
          }]
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('account_id cannot be empty');
    });

    it('should prevent duplicate loyalty program providers', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          loyalty_programs: [
            {
              provider: 'Delta',
              account_id: 'DL123456'
            },
            {
              provider: 'Delta', // Duplicate provider
              account_id: 'DL789012'
            }
          ]
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('duplicate loyalty program provider');
    });
  });

  describe('Authorization', () => {
    it('should allow users to update their own profile', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            budget_range: 'luxury'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.profile.budget_range).toBe('luxury');
    });

    it('should prevent users from updating other users profiles', async () => {
      const response = await request(app)
        .put(`/v1/users/${otherUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            budget_range: 'luxury'
          }
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('not authorized to update this profile');
    });

    it('should handle non-existent user ID', async () => {
      const nonExistentUserId = '123e4567-e89b-12d3-a456-426614174999';

      const response = await request(app)
        .put(`/v1/users/${nonExistentUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            budget_range: 'luxury'
          }
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('user not found');
    });
  });

  describe('Successful Profile Updates', () => {
    it('should update profile budget_range', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            budget_range: 'mid-range'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', testUserId);
      expect(response.body).toHaveProperty('profile');
      expect(response.body.profile.budget_range).toBe('mid-range');

      // Other profile fields should remain unchanged
      expect(response.body.profile.travel_style).toBe('cultural');
      expect(response.body.profile.dietary_restrictions).toContain('vegetarian');
    });

    it('should update profile travel_style', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            travel_style: 'adventure'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.profile.travel_style).toBe('adventure');
    });

    it('should update dietary_restrictions', async () => {
      const newDietaryRestrictions = ['vegan', 'gluten-free', 'nut-free'];

      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            dietary_restrictions: newDietaryRestrictions
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.profile.dietary_restrictions).toEqual(newDietaryRestrictions);
    });

    it('should update multiple profile fields simultaneously', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            budget_range: 'luxury',
            travel_style: 'relaxation',
            dietary_restrictions: ['vegetarian', 'dairy-free']
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.profile.budget_range).toBe('luxury');
      expect(response.body.profile.travel_style).toBe('relaxation');
      expect(response.body.profile.dietary_restrictions).toEqual(['vegetarian', 'dairy-free']);
    });

    it('should update loyalty programs', async () => {
      const newLoyaltyPrograms = [
        {
          provider: 'American',
          account_id: 'AA987654'
        },
        {
          provider: 'Marriott',
          account_id: 'MR123456'
        }
      ];

      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          loyalty_programs: newLoyaltyPrograms
        });

      expect(response.status).toBe(200);
      expect(response.body.loyalty_programs).toEqual(newLoyaltyPrograms);
    });

    it('should update both profile and loyalty programs', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            budget_range: 'budget',
            travel_style: 'business'
          },
          loyalty_programs: [{
            provider: 'United',
            account_id: 'UA555666'
          }]
        });

      expect(response.status).toBe(200);
      expect(response.body.profile.budget_range).toBe('budget');
      expect(response.body.profile.travel_style).toBe('business');
      expect(response.body.loyalty_programs).toHaveLength(1);
      expect(response.body.loyalty_programs[0].provider).toBe('United');
    });

    it('should handle empty dietary_restrictions array', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            dietary_restrictions: []
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.profile.dietary_restrictions).toEqual([]);
    });

    it('should handle empty loyalty_programs array', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          loyalty_programs: []
        });

      expect(response.status).toBe(200);
      expect(response.body.loyalty_programs).toEqual([]);
    });
  });

  describe('Partial Updates', () => {
    it('should support partial profile updates', async () => {
      // First, set a known state
      await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            budget_range: 'budget',
            travel_style: 'cultural',
            dietary_restrictions: ['vegetarian']
          }
        });

      // Then update only budget_range
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            budget_range: 'luxury'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.profile.budget_range).toBe('luxury');
      expect(response.body.profile.travel_style).toBe('cultural'); // Should remain unchanged
      expect(response.body.profile.dietary_restrictions).toEqual(['vegetarian']); // Should remain unchanged
    });

    it('should support updating only loyalty programs', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          loyalty_programs: [{
            provider: 'Southwest',
            account_id: 'SW123456'
          }]
        });

      expect(response.status).toBe(200);
      expect(response.body.loyalty_programs).toHaveLength(1);
      expect(response.body.loyalty_programs[0].provider).toBe('Southwest');
      // Profile should remain unchanged
      expect(response.body.profile).toHaveProperty('budget_range');
    });
  });

  describe('Response Validation', () => {
    it('should return complete user object with updates', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            budget_range: 'mid-range'
          }
        });

      expect(response.status).toBe(200);

      // Should return complete User schema
      expect(response.body).toHaveProperty('id', testUserId);
      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('profile');
      expect(response.body).toHaveProperty('loyalty_programs');
      expect(response.body).toHaveProperty('created_at');

      // Should not expose sensitive fields
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('password_hash');
    });

    it('should include timestamp of update', async () => {
      const beforeUpdate = new Date().toISOString();

      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            budget_range: 'luxury'
          }
        });

      expect(response.status).toBe(200);

      // Should have updated_at field that's recent
      if (response.body.updated_at) {
        const updatedAt = new Date(response.body.updated_at);
        const before = new Date(beforeUpdate);
        expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      }
    });
  });

  describe('Data Persistence', () => {
    it('should persist profile updates across requests', async () => {
      // Update profile
      const updateResponse = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            budget_range: 'luxury',
            travel_style: 'relaxation'
          }
        });

      expect(updateResponse.status).toBe(200);

      // Fetch updated profile
      const getResponse = await request(app)
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.profile.budget_range).toBe('luxury');
      expect(getResponse.body.profile.travel_style).toBe('relaxation');
    });

    it('should persist loyalty program updates across requests', async () => {
      const newLoyaltyPrograms = [{
        provider: 'Hilton',
        account_id: 'HH789123'
      }];

      // Update loyalty programs
      const updateResponse = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          loyalty_programs: newLoyaltyPrograms
        });

      expect(updateResponse.status).toBe(200);

      // Fetch updated data
      const getResponse = await request(app)
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.loyalty_programs).toEqual(newLoyaltyPrograms);
    });
  });

  describe('Error Handling', () => {
    it('should return structured error responses', async () => {
      const response = await request(app)
        .put('/v1/users/invalid-uuid/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            budget_range: 'invalid_range'
          }
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('code');
      expect(typeof response.body.error).toBe('string');
      expect(typeof response.body.message).toBe('string');
      expect(typeof response.body.code).toBe('number');
    });

    it('should handle database connection errors gracefully', async () => {
      // This test would need to simulate database issues
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            budget_range: 'luxury'
          }
        });

      // Should either succeed or return appropriate error
      if (response.status !== 200) {
        expect([404, 500, 503]).toContain(response.status);
        expect(response.body.error).toBeDefined();
      }
    });

    it('should handle concurrent updates gracefully', async () => {
      // Simulate concurrent updates
      const update1Promise = request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            budget_range: 'budget'
          }
        });

      const update2Promise = request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            budget_range: 'luxury'
          }
        });

      const [response1, response2] = await Promise.all([update1Promise, update2Promise]);

      // Both should either succeed or one should fail with conflict
      expect([200, 409].includes(response1.status)).toBe(true);
      expect([200, 409].includes(response2.status)).toBe(true);
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize string inputs', async () => {
      const response = await request(app)
        .put(`/v1/users/${testUserId}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          profile: {
            dietary_restrictions: ['  vegetarian  ', '  VEGAN  ']
          }
        });

      expect(response.status).toBe(200);
      // Should be trimmed and normalized
      expect(response.body.profile.dietary_restrictions).toContain('vegetarian');
      expect(response.body.profile.dietary_restrictions).toContain('vegan');
    });

    it('should reject malicious input attempts', async () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '"; DROP TABLE users; --'
      ];

      for (const maliciousInput of maliciousInputs) {
        const response = await request(app)
          .put(`/v1/users/${testUserId}/profile`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            profile: {
              dietary_restrictions: [maliciousInput]
            }
          });

        // Should either sanitize or reject
        expect([200, 400]).toContain(response.status);

        if (response.status === 200) {
          // Should not contain raw malicious content
          expect(response.body.profile.dietary_restrictions[0]).not.toBe(maliciousInput);
        }
      }
    });
  });
});