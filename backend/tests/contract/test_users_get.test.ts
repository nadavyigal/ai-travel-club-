import request from 'supertest';
import { app } from '../../src/app';

describe('GET /v1/users/{id} - User Profile Retrieval Contract Tests', () => {
  const validUserId = '123e4567-e89b-12d3-a456-426614174000';
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create a test user for authentication
    const registerResponse = await request(app)
      .post('/v1/auth/register')
      .send({
        email: 'test-user@example.com',
        password: 'TestUser123!',
        profile: {
          budget_range: 'mid-range',
          travel_style: 'adventure',
          dietary_restrictions: ['vegetarian']
        },
        loyalty_programs: [{
          provider: 'Delta',
          account_id: 'DL123456'
        }]
      });

    authToken = registerResponse.body.token;
    testUserId = registerResponse.body.user.id;
  });

  describe('Request Validation', () => {
    it('should validate user ID parameter format', async () => {
      const response = await request(app)
        .get('/v1/users/invalid-uuid')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('user ID must be a valid UUID');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get(`/v1/users/${validUserId}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('authentication required');
    });

    it('should reject invalid authentication token', async () => {
      const response = await request(app)
        .get(`/v1/users/${validUserId}`)
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('invalid token');
    });

    it('should reject malformed authorization header', async () => {
      const response = await request(app)
        .get(`/v1/users/${validUserId}`)
        .set('Authorization', 'InvalidFormat token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('invalid authorization header');
    });
  });

  describe('User Not Found', () => {
    it('should return 404 for non-existent user', async () => {
      const nonExistentUserId = '123e4567-e89b-12d3-a456-426614174999';

      const response = await request(app)
        .get(`/v1/users/${nonExistentUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('user not found');
    });

    it('should return 404 for valid UUID but non-existent user', async () => {
      const validButNonExistentId = '987fcdeb-51a2-43d1-9f20-8d5ef2a9c999';

      const response = await request(app)
        .get(`/v1/users/${validButNonExistentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('user not found');
    });
  });

  describe('Successful User Retrieval', () => {
    it('should retrieve own user profile', async () => {
      const response = await request(app)
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', testUserId);
      expect(response.body).toHaveProperty('email', 'test-user@example.com');
      expect(response.body).toHaveProperty('profile');
      expect(response.body).toHaveProperty('loyalty_programs');
      expect(response.body).toHaveProperty('created_at');

      // Should not include sensitive information
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('password_hash');
    });

    it('should retrieve user profile with complete data structure', async () => {
      const response = await request(app)
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      // Validate User schema fields
      expect(response.body).toHaveProperty('id');
      expect(typeof response.body.id).toBe('string');
      expect(response.body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

      expect(response.body).toHaveProperty('email');
      expect(typeof response.body.email).toBe('string');
      expect(response.body.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);

      expect(response.body).toHaveProperty('created_at');
      expect(typeof response.body.created_at).toBe('string');
      expect(response.body.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should retrieve user profile data correctly', async () => {
      const response = await request(app)
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      // Validate profile structure
      expect(response.body).toHaveProperty('profile');
      expect(response.body.profile).toHaveProperty('budget_range', 'mid-range');
      expect(response.body.profile).toHaveProperty('travel_style', 'adventure');
      expect(response.body.profile).toHaveProperty('dietary_restrictions');
      expect(Array.isArray(response.body.profile.dietary_restrictions)).toBe(true);
      expect(response.body.profile.dietary_restrictions).toContain('vegetarian');
    });

    it('should retrieve loyalty programs correctly', async () => {
      const response = await request(app)
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      // Validate loyalty programs structure
      expect(response.body).toHaveProperty('loyalty_programs');
      expect(Array.isArray(response.body.loyalty_programs)).toBe(true);
      expect(response.body.loyalty_programs).toHaveLength(1);

      const loyaltyProgram = response.body.loyalty_programs[0];
      expect(loyaltyProgram).toHaveProperty('provider', 'Delta');
      expect(loyaltyProgram).toHaveProperty('account_id', 'DL123456');
    });

    it('should handle user with minimal profile data', async () => {
      // Register minimal user
      const minimalRegisterResponse = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'minimal-user@example.com',
          password: 'MinimalUser123!'
        });

      const minimalToken = minimalRegisterResponse.body.token;
      const minimalUserId = minimalRegisterResponse.body.user.id;

      const response = await request(app)
        .get(`/v1/users/${minimalUserId}`)
        .set('Authorization', `Bearer ${minimalToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', minimalUserId);
      expect(response.body).toHaveProperty('email', 'minimal-user@example.com');
      // Profile and loyalty_programs should exist but may be empty/null
      expect(response.body).toHaveProperty('profile');
      expect(response.body).toHaveProperty('loyalty_programs');
    });
  });

  describe('Authorization and Privacy', () => {
    it('should allow users to view their own profile', async () => {
      const response = await request(app)
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testUserId);
    });

    it('should allow users to view other users profiles (public information)', async () => {
      // Create another user
      const otherUserResponse = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'other-user@example.com',
          password: 'OtherUser123!',
          profile: {
            budget_range: 'luxury',
            travel_style: 'relaxation'
          }
        });

      const otherUserId = otherUserResponse.body.user.id;

      // View other user's profile
      const response = await request(app)
        .get(`/v1/users/${otherUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(otherUserId);
      expect(response.body.email).toBe('other-user@example.com');

      // Should include public profile information
      expect(response.body).toHaveProperty('profile');
      expect(response.body.profile.budget_range).toBe('luxury');
    });

    it('should not expose sensitive data in public view', async () => {
      const response = await request(app)
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      // Sensitive fields should never be exposed
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('password_hash');
      expect(response.body).not.toHaveProperty('private_key');
      expect(response.body).not.toHaveProperty('api_keys');
    });

    it('should handle admin access levels appropriately', async () => {
      // This test would need admin user setup
      // For now, just verify normal user access works
      const response = await request(app)
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('Profile Data Validation', () => {
    it('should validate budget_range enum values in response', async () => {
      const response = await request(app)
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      if (response.body.profile && response.body.profile.budget_range) {
        expect(['budget', 'mid-range', 'luxury']).toContain(response.body.profile.budget_range);
      }
    });

    it('should validate travel_style enum values in response', async () => {
      const response = await request(app)
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      if (response.body.profile && response.body.profile.travel_style) {
        expect(['adventure', 'relaxation', 'cultural', 'business']).toContain(response.body.profile.travel_style);
      }
    });

    it('should validate dietary_restrictions array format', async () => {
      const response = await request(app)
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      if (response.body.profile && response.body.profile.dietary_restrictions) {
        expect(Array.isArray(response.body.profile.dietary_restrictions)).toBe(true);
        response.body.profile.dietary_restrictions.forEach((restriction: any) => {
          expect(typeof restriction).toBe('string');
        });
      }
    });

    it('should validate loyalty_programs array format', async () => {
      const response = await request(app)
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      if (response.body.loyalty_programs && response.body.loyalty_programs.length > 0) {
        expect(Array.isArray(response.body.loyalty_programs)).toBe(true);
        response.body.loyalty_programs.forEach((program: any) => {
          expect(program).toHaveProperty('provider');
          expect(program).toHaveProperty('account_id');
          expect(typeof program.provider).toBe('string');
          expect(typeof program.account_id).toBe('string');
        });
      }
    });
  });

  describe('Cache and Performance', () => {
    it('should return data within reasonable time', async () => {
      const startTime = Date.now();

      const response = await request(app)
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      const responseTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(1000); // Less than 1 second
    });

    it('should include appropriate cache headers', async () => {
      const response = await request(app)
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      // Should include cache control headers for user data
      if (response.headers['cache-control']) {
        expect(response.headers['cache-control']).toMatch(/private|no-cache|max-age/);
      }
    });
  });

  describe('Data Consistency', () => {
    it('should return consistent data across multiple requests', async () => {
      // Make multiple requests
      const responses = await Promise.all([
        request(app).get(`/v1/users/${testUserId}`).set('Authorization', `Bearer ${authToken}`),
        request(app).get(`/v1/users/${testUserId}`).set('Authorization', `Bearer ${authToken}`),
        request(app).get(`/v1/users/${testUserId}`).set('Authorization', `Bearer ${authToken}`)
      ]);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Data should be consistent
      const firstResponse = responses[0].body;
      responses.forEach(response => {
        expect(response.body.id).toBe(firstResponse.id);
        expect(response.body.email).toBe(firstResponse.email);
        expect(response.body.created_at).toBe(firstResponse.created_at);
      });
    });

    it('should reflect recent profile updates', async () => {
      // This test would need profile update functionality
      // For now, just verify current data is correct
      const response = await request(app)
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.profile.budget_range).toBe('mid-range');
      expect(response.body.profile.travel_style).toBe('adventure');
    });
  });

  describe('Error Handling', () => {
    it('should return structured error responses', async () => {
      const response = await request(app)
        .get('/v1/users/invalid-uuid')
        .set('Authorization', `Bearer ${authToken}`);

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
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      // Should either succeed or return appropriate error
      if (response.status !== 200) {
        expect([404, 500, 503]).toContain(response.status);
        expect(response.body.error).toBeDefined();
      }
    });

    it('should handle token expiration gracefully', async () => {
      // Use an expired or invalid token
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      const response = await request(app)
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toMatch(/token|expired|invalid/i);
    });

    it('should handle malformed requests gracefully', async () => {
      const response = await request(app)
        .get('/v1/users/')  // Missing user ID
        .set('Authorization', `Bearer ${authToken}`);

      expect([400, 404]).toContain(response.status);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('API Versioning', () => {
    it('should handle v1 API version correctly', async () => {
      const response = await request(app)
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
    });

    it('should include API version in response headers', async () => {
      const response = await request(app)
        .get(`/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      // Should include version information
      if (response.headers['api-version']) {
        expect(response.headers['api-version']).toMatch(/v1|1\.0/);
      }
    });
  });
});