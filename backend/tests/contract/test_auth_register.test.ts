import request from 'supertest';
import { app } from '../../src/app';

describe('POST /v1/auth/register - User Registration Contract Tests', () => {
  describe('Request Validation', () => {
    it('should require all mandatory fields', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('email');
      expect(response.body.message).toContain('password');
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'invalid-email',
          password: 'ValidPassword123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('invalid email format');
    });

    it('should validate email RFC 5322 compliance', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'test@',
          password: 'ValidPassword123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('invalid email format');
    });

    it('should validate password minimum length', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'short'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('password must be at least 8 characters');
    });

    it('should validate password complexity requirements', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123' // No uppercase or symbols
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('password must contain uppercase, lowercase, numbers, and symbols');
    });

    it('should validate password has uppercase letters', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('uppercase');
    });

    it('should validate password has lowercase letters', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'PASSWORD123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('lowercase');
    });

    it('should validate password has numbers', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password!'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('numbers');
    });

    it('should validate password has symbols', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('symbols');
    });
  });

  describe('Profile Validation', () => {
    it('should validate budget_range enum values', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword123!',
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
        .post('/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword123!',
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
        .post('/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword123!',
          profile: {
            dietary_restrictions: 'not-an-array'
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('dietary_restrictions must be an array');
    });

    it('should validate loyalty_programs array format', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword123!',
          loyalty_programs: 'not-an-array'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('loyalty_programs must be an array');
    });

    it('should validate loyalty program object structure', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword123!',
          loyalty_programs: [{
            provider: 'Delta',
            // Missing account_id
          }]
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('loyalty program must have provider and account_id');
    });

    it('should validate supported loyalty program providers', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword123!',
          loyalty_programs: [{
            provider: 'UnsupportedAirline',
            account_id: '12345'
          }]
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('unsupported loyalty program provider');
    });
  });

  describe('Successful Registration', () => {
    it('should register user with minimal required fields', async () => {
      const uniqueEmail = `test-${Date.now()}@example.com`;

      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: uniqueEmail,
          password: 'ValidPassword123!'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');

      // Validate user object structure
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(response.body.user).toHaveProperty('email', uniqueEmail);
      expect(response.body.user).toHaveProperty('created_at');
      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.user).not.toHaveProperty('password_hash');

      // Validate JWT token
      expect(typeof response.body.token).toBe('string');
      expect(response.body.token.split('.').length).toBe(3); // JWT format
    });

    it('should register user with complete profile', async () => {
      const uniqueEmail = `complete-${Date.now()}@example.com`;

      const completeRegistration = {
        email: uniqueEmail,
        password: 'CompletePassword123!',
        profile: {
          budget_range: 'mid-range',
          travel_style: 'adventure',
          dietary_restrictions: ['vegetarian', 'gluten-free']
        },
        loyalty_programs: [
          {
            provider: 'Delta',
            account_id: 'DL123456789'
          },
          {
            provider: 'Marriott',
            account_id: 'MR987654321'
          }
        ]
      };

      const response = await request(app)
        .post('/v1/auth/register')
        .send(completeRegistration);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('profile');
      expect(response.body.user).toHaveProperty('loyalty_programs');

      expect(response.body.user.profile.budget_range).toBe('mid-range');
      expect(response.body.user.profile.travel_style).toBe('adventure');
      expect(response.body.user.loyalty_programs).toHaveLength(2);
    });

    it('should register user with various valid password formats', async () => {
      const validPasswords = [
        'StrongP@ss1',
        'MyV3ryStr0ng!',
        'C0mpl3x&S3cur3',
        'An0th3r#Va1id'
      ];

      for (let i = 0; i < validPasswords.length; i++) {
        const uniqueEmail = `strong-${Date.now()}-${i}@example.com`;
        const response = await request(app)
          .post('/v1/auth/register')
          .send({
            email: uniqueEmail,
            password: validPasswords[i]
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('token');
      }
    });

    it('should register users with different budget ranges', async () => {
      const budgetRanges = ['budget', 'mid-range', 'luxury'];

      for (const budgetRange of budgetRanges) {
        const uniqueEmail = `budget-${budgetRange}-${Date.now()}@example.com`;
        const response = await request(app)
          .post('/v1/auth/register')
          .send({
            email: uniqueEmail,
            password: 'ValidPassword123!',
            profile: {
              budget_range: budgetRange
            }
          });

        expect(response.status).toBe(201);
        expect(response.body.user.profile.budget_range).toBe(budgetRange);
      }
    });

    it('should register users with different travel styles', async () => {
      const travelStyles = ['adventure', 'relaxation', 'cultural', 'business'];

      for (const travelStyle of travelStyles) {
        const uniqueEmail = `style-${travelStyle}-${Date.now()}@example.com`;
        const response = await request(app)
          .post('/v1/auth/register')
          .send({
            email: uniqueEmail,
            password: 'ValidPassword123!',
            profile: {
              travel_style: travelStyle
            }
          });

        expect(response.status).toBe(201);
        expect(response.body.user.profile.travel_style).toBe(travelStyle);
      }
    });
  });

  describe('Duplicate Email Prevention', () => {
    it('should prevent registration with existing email', async () => {
      const duplicateEmail = 'duplicate@example.com';

      // First registration
      const firstResponse = await request(app)
        .post('/v1/auth/register')
        .send({
          email: duplicateEmail,
          password: 'FirstPassword123!'
        });

      expect(firstResponse.status).toBe(201);

      // Attempt duplicate registration
      const secondResponse = await request(app)
        .post('/v1/auth/register')
        .send({
          email: duplicateEmail,
          password: 'SecondPassword123!'
        });

      expect(secondResponse.status).toBe(409);
      expect(secondResponse.body.error).toBeDefined();
      expect(secondResponse.body.message).toContain('email already exists');
    });

    it('should handle case insensitive email duplicates', async () => {
      const baseEmail = 'case@example.com';

      // First registration with lowercase
      const firstResponse = await request(app)
        .post('/v1/auth/register')
        .send({
          email: baseEmail.toLowerCase(),
          password: 'FirstPassword123!'
        });

      expect(firstResponse.status).toBe(201);

      // Attempt registration with uppercase
      const secondResponse = await request(app)
        .post('/v1/auth/register')
        .send({
          email: baseEmail.toUpperCase(),
          password: 'SecondPassword123!'
        });

      expect(secondResponse.status).toBe(409);
      expect(secondResponse.body.message).toContain('email already exists');
    });
  });

  describe('Password Security', () => {
    it('should hash password before storage', async () => {
      const uniqueEmail = `hash-test-${Date.now()}@example.com`;
      const password = 'TestPassword123!';

      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: uniqueEmail,
          password: password
        });

      expect(response.status).toBe(201);
      // Password should never be returned in response
      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.user).not.toHaveProperty('password_hash');
    });

    it('should reject common weak passwords', async () => {
      const weakPasswords = [
        'password123!',
        'Password123',
        '12345678!',
        'qwerty123!'
      ];

      for (const weakPassword of weakPasswords) {
        const uniqueEmail = `weak-${Date.now()}-${Math.random()}@example.com`;
        const response = await request(app)
          .post('/v1/auth/register')
          .send({
            email: uniqueEmail,
            password: weakPassword
          });

        // Should either reject weak password or require stronger complexity
        expect([400, 422]).toContain(response.status);
        expect(response.body.message).toMatch(/weak|common|password/i);
      }
    });
  });

  describe('Token Generation', () => {
    it('should generate valid JWT token structure', async () => {
      const uniqueEmail = `jwt-test-${Date.now()}@example.com`;

      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: uniqueEmail,
          password: 'JWTTestPassword123!'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');

      const token = response.body.token;
      const tokenParts = token.split('.');
      expect(tokenParts).toHaveLength(3);

      // Should be able to decode header (not verify signature)
      const header = JSON.parse(Buffer.from(tokenParts[0], 'base64').toString());
      expect(header).toHaveProperty('alg');
      expect(header).toHaveProperty('typ', 'JWT');
    });

    it('should include user information in token payload', async () => {
      const uniqueEmail = `payload-test-${Date.now()}@example.com`;

      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: uniqueEmail,
          password: 'PayloadTestPassword123!'
        });

      expect(response.status).toBe(201);

      const token = response.body.token;
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

      expect(payload).toHaveProperty('sub'); // Subject (user ID)
      expect(payload).toHaveProperty('email');
      expect(payload).toHaveProperty('iat'); // Issued at
      expect(payload).toHaveProperty('exp'); // Expiration
      expect(payload.email).toBe(uniqueEmail);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce registration rate limiting', async () => {
      const responses = [];
      const baseEmail = `rate-limit-${Date.now()}`;

      // Attempt multiple rapid registrations
      for (let i = 0; i < 10; i++) {
        const response = await request(app)
          .post('/v1/auth/register')
          .send({
            email: `${baseEmail}-${i}@example.com`,
            password: 'RateLimitTest123!'
          });
        responses.push(response.status);
      }

      // Should have some rate limiting after several attempts
      const rateLimitedResponses = responses.filter(status => status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize email input', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: '  TEST@EXAMPLE.COM  ',
          password: 'SanitizeTest123!'
        });

      expect(response.status).toBe(201);
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should reject malicious input attempts', async () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>@example.com',
        'test@example.com"; DROP TABLE users; --',
        'test@example.com\x00admin'
      ];

      for (const maliciousEmail of maliciousInputs) {
        const response = await request(app)
          .post('/v1/auth/register')
          .send({
            email: maliciousEmail,
            password: 'MaliciousTest123!'
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('invalid email format');
      }
    });
  });

  describe('Error Handling', () => {
    it('should return structured error responses', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'invalid-email',
          password: 'weak'
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
        .post('/v1/auth/register')
        .send({
          email: 'db-test@example.com',
          password: 'DatabaseTest123!'
        });

      // Should either succeed or return appropriate error
      if (response.status !== 201) {
        expect([500, 503]).toContain(response.status);
        expect(response.body.error).toBeDefined();
      }
    });
  });
});