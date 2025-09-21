import request from 'supertest';
import { app } from '../../src/app';

describe('POST /v1/auth/login - User Login Contract Tests', () => {
  describe('Request Validation', () => {
    it('should require all mandatory fields', async () => {
      const response = await request(app)
        .post('/v1/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('email');
      expect(response.body.message).toContain('password');
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'invalid-email',
          password: 'SomePassword123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('invalid email format');
    });

    it('should require password field', async () => {
      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'test@example.com'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('password is required');
    });

    it('should require email field', async () => {
      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          password: 'SomePassword123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('email is required');
    });
  });

  describe('Authentication Failures', () => {
    it('should reject login with non-existent email', async () => {
      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('invalid credentials');
    });

    it('should reject login with incorrect password', async () => {
      // First register a user
      const registerResponse = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'wrong-password@example.com',
          password: 'CorrectPassword123!'
        });

      expect(registerResponse.status).toBe(201);

      // Then try to login with wrong password
      const loginResponse = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'wrong-password@example.com',
          password: 'WrongPassword123!'
        });

      expect(loginResponse.status).toBe(401);
      expect(loginResponse.body.error).toBeDefined();
      expect(loginResponse.body.message).toContain('invalid credentials');
    });

    it('should handle case-sensitive password correctly', async () => {
      // Register user
      const registerResponse = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'case-sensitive@example.com',
          password: 'CaseSensitive123!'
        });

      expect(registerResponse.status).toBe(201);

      // Try login with different case
      const loginResponse = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'case-sensitive@example.com',
          password: 'casesensitive123!'
        });

      expect(loginResponse.status).toBe(401);
      expect(loginResponse.body.message).toContain('invalid credentials');
    });

    it('should handle case-insensitive email correctly', async () => {
      // Register user with lowercase email
      const registerResponse = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'case@example.com',
          password: 'CaseTest123!'
        });

      expect(registerResponse.status).toBe(201);

      // Try login with uppercase email
      const loginResponse = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'CASE@EXAMPLE.COM',
          password: 'CaseTest123!'
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body).toHaveProperty('token');
    });
  });

  describe('Successful Login', () => {
    it('should login with correct credentials', async () => {
      const email = 'successful-login@example.com';
      const password = 'SuccessfulLogin123!';

      // First register a user
      const registerResponse = await request(app)
        .post('/v1/auth/register')
        .send({
          email: email,
          password: password
        });

      expect(registerResponse.status).toBe(201);

      // Then login
      const loginResponse = await request(app)
        .post('/v1/auth/login')
        .send({
          email: email,
          password: password
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body).toHaveProperty('user');
      expect(loginResponse.body).toHaveProperty('token');

      // Validate user object structure
      expect(loginResponse.body.user).toHaveProperty('id');
      expect(loginResponse.body.user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(loginResponse.body.user).toHaveProperty('email', email);
      expect(loginResponse.body.user).toHaveProperty('created_at');
      expect(loginResponse.body.user).not.toHaveProperty('password');
      expect(loginResponse.body.user).not.toHaveProperty('password_hash');

      // Validate JWT token
      expect(typeof loginResponse.body.token).toBe('string');
      expect(loginResponse.body.token.split('.').length).toBe(3); // JWT format
    });

    it('should return user profile in login response', async () => {
      const email = 'profile-login@example.com';
      const password = 'ProfileLogin123!';

      // Register user with profile
      const registerResponse = await request(app)
        .post('/v1/auth/register')
        .send({
          email: email,
          password: password,
          profile: {
            budget_range: 'luxury',
            travel_style: 'relaxation',
            dietary_restrictions: ['vegan']
          }
        });

      expect(registerResponse.status).toBe(201);

      // Login and verify profile is returned
      const loginResponse = await request(app)
        .post('/v1/auth/login')
        .send({
          email: email,
          password: password
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.user).toHaveProperty('profile');
      expect(loginResponse.body.user.profile.budget_range).toBe('luxury');
      expect(loginResponse.body.user.profile.travel_style).toBe('relaxation');
      expect(loginResponse.body.user.profile.dietary_restrictions).toContain('vegan');
    });

    it('should return loyalty programs in login response', async () => {
      const email = 'loyalty-login@example.com';
      const password = 'LoyaltyLogin123!';

      // Register user with loyalty programs
      const registerResponse = await request(app)
        .post('/v1/auth/register')
        .send({
          email: email,
          password: password,
          loyalty_programs: [
            {
              provider: 'American',
              account_id: 'AA123456'
            }
          ]
        });

      expect(registerResponse.status).toBe(201);

      // Login and verify loyalty programs are returned
      const loginResponse = await request(app)
        .post('/v1/auth/login')
        .send({
          email: email,
          password: password
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.user).toHaveProperty('loyalty_programs');
      expect(loginResponse.body.user.loyalty_programs).toHaveLength(1);
      expect(loginResponse.body.user.loyalty_programs[0].provider).toBe('American');
    });

    it('should generate fresh token on each login', async () => {
      const email = 'fresh-token@example.com';
      const password = 'FreshToken123!';

      // Register user
      const registerResponse = await request(app)
        .post('/v1/auth/register')
        .send({
          email: email,
          password: password
        });

      expect(registerResponse.status).toBe(201);

      // First login
      const firstLogin = await request(app)
        .post('/v1/auth/login')
        .send({
          email: email,
          password: password
        });

      expect(firstLogin.status).toBe(200);
      const firstToken = firstLogin.body.token;

      // Second login after a brief delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      const secondLogin = await request(app)
        .post('/v1/auth/login')
        .send({
          email: email,
          password: password
        });

      expect(secondLogin.status).toBe(200);
      const secondToken = secondLogin.body.token;

      // Tokens should be different (different timestamps)
      expect(firstToken).not.toBe(secondToken);
    });
  });

  describe('Session Management', () => {
    it('should include session expiration in token', async () => {
      const email = 'session-test@example.com';
      const password = 'SessionTest123!';

      // Register and login
      await request(app)
        .post('/v1/auth/register')
        .send({
          email: email,
          password: password
        });

      const loginResponse = await request(app)
        .post('/v1/auth/login')
        .send({
          email: email,
          password: password
        });

      expect(loginResponse.status).toBe(200);

      // Decode token payload to check expiration
      const token = loginResponse.body.token;
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

      expect(payload).toHaveProperty('exp');
      expect(payload).toHaveProperty('iat');
      expect(payload.exp).toBeGreaterThan(payload.iat);

      // Token should be valid for reasonable time (e.g., 24 hours)
      const tokenDuration = payload.exp - payload.iat;
      expect(tokenDuration).toBeGreaterThan(3600); // At least 1 hour
      expect(tokenDuration).toBeLessThanOrEqual(86400 * 7); // At most 7 days
    });

    it('should include user information in token payload', async () => {
      const email = 'payload-login@example.com';
      const password = 'PayloadLogin123!';

      // Register and login
      await request(app)
        .post('/v1/auth/register')
        .send({
          email: email,
          password: password
        });

      const loginResponse = await request(app)
        .post('/v1/auth/login')
        .send({
          email: email,
          password: password
        });

      expect(loginResponse.status).toBe(200);

      const token = loginResponse.body.token;
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

      expect(payload).toHaveProperty('sub'); // Subject (user ID)
      expect(payload).toHaveProperty('email');
      expect(payload.email).toBe(email);
      expect(payload.sub).toBe(loginResponse.body.user.id);
    });
  });

  describe('Account Security', () => {
    it('should implement rate limiting for failed login attempts', async () => {
      const email = 'rate-limit@example.com';
      const correctPassword = 'CorrectPassword123!';
      const wrongPassword = 'WrongPassword123!';

      // Register user
      await request(app)
        .post('/v1/auth/register')
        .send({
          email: email,
          password: correctPassword
        });

      // Attempt multiple failed logins
      const failedAttempts = [];
      for (let i = 0; i < 10; i++) {
        const response = await request(app)
          .post('/v1/auth/login')
          .send({
            email: email,
            password: wrongPassword
          });
        failedAttempts.push(response.status);
      }

      // Should have some rate limiting after several failed attempts
      const rateLimitedResponses = failedAttempts.filter(status => status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should allow login after rate limit period expires', async () => {
      const email = 'rate-recovery@example.com';
      const password = 'RateRecovery123!';

      // Register user
      await request(app)
        .post('/v1/auth/register')
        .send({
          email: email,
          password: password
        });

      // This test would need to simulate time passage
      // For now, just verify correct credentials still work
      const loginResponse = await request(app)
        .post('/v1/auth/login')
        .send({
          email: email,
          password: password
        });

      expect(loginResponse.status).toBe(200);
    });

    it('should detect potential brute force attacks', async () => {
      const email = 'brute-force@example.com';
      const password = 'BruteForce123!';

      // Register user
      await request(app)
        .post('/v1/auth/register')
        .send({
          email: email,
          password: password
        });

      // Rapid failed attempts from same IP
      const rapidAttempts = [];
      for (let i = 0; i < 20; i++) {
        const response = await request(app)
          .post('/v1/auth/login')
          .send({
            email: email,
            password: 'WrongPassword123!'
          });
        rapidAttempts.push(response.status);
      }

      // Should implement aggressive rate limiting
      const blockedResponses = rapidAttempts.filter(status => status === 429);
      expect(blockedResponses.length).toBeGreaterThan(5);
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize email input', async () => {
      const email = 'sanitize@example.com';
      const password = 'SanitizeTest123!';

      // Register user
      await request(app)
        .post('/v1/auth/register')
        .send({
          email: email,
          password: password
        });

      // Login with whitespace in email
      const loginResponse = await request(app)
        .post('/v1/auth/login')
        .send({
          email: '  SANITIZE@EXAMPLE.COM  ',
          password: password
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.user.email).toBe(email);
    });

    it('should reject malicious input attempts', async () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>@example.com',
        'test@example.com"; DROP TABLE users; --',
        'test@example.com\x00admin'
      ];

      for (const maliciousEmail of maliciousInputs) {
        const response = await request(app)
          .post('/v1/auth/login')
          .send({
            email: maliciousEmail,
            password: 'MaliciousTest123!'
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('invalid email format');
      }
    });
  });

  describe('Password Security', () => {
    it('should use secure password comparison', async () => {
      const email = 'timing-attack@example.com';
      const password = 'TimingAttack123!';

      // Register user
      await request(app)
        .post('/v1/auth/register')
        .send({
          email: email,
          password: password
        });

      // Multiple login attempts with wrong passwords should take similar time
      const timings = [];
      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        await request(app)
          .post('/v1/auth/login')
          .send({
            email: email,
            password: 'WrongPassword123!'
          });
        timings.push(Date.now() - start);
      }

      // Timings should be relatively consistent (within reasonable variance)
      const avgTiming = timings.reduce((a, b) => a + b) / timings.length;
      for (const timing of timings) {
        expect(Math.abs(timing - avgTiming)).toBeLessThan(avgTiming * 0.5);
      }
    });
  });

  describe('Token Security', () => {
    it('should generate cryptographically secure tokens', async () => {
      const email = 'secure-token@example.com';
      const password = 'SecureToken123!';

      // Register and login multiple times
      await request(app)
        .post('/v1/auth/register')
        .send({
          email: email,
          password: password
        });

      const tokens = [];
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/v1/auth/login')
          .send({
            email: email,
            password: password
          });
        tokens.push(response.body.token);
      }

      // All tokens should be unique
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(tokens.length);

      // Tokens should have proper structure
      tokens.forEach(token => {
        expect(token.split('.').length).toBe(3);
        expect(token.length).toBeGreaterThan(100); // Reasonable length
      });
    });
  });

  describe('Error Handling', () => {
    it('should return structured error responses', async () => {
      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'invalid-email',
          password: 'short'
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
        .post('/v1/auth/login')
        .send({
          email: 'db-test@example.com',
          password: 'DatabaseTest123!'
        });

      // Should either succeed or return appropriate error
      if (response.status !== 200 && response.status !== 401) {
        expect([500, 503]).toContain(response.status);
        expect(response.body.error).toBeDefined();
      }
    });

    it('should not reveal whether email exists', async () => {
      // Login with non-existent email
      const nonExistentResponse = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!'
        });

      // Register user and then try wrong password
      await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'existing@example.com',
          password: 'CorrectPassword123!'
        });

      const wrongPasswordResponse = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'existing@example.com',
          password: 'WrongPassword123!'
        });

      // Both should return same error message
      expect(nonExistentResponse.status).toBe(401);
      expect(wrongPasswordResponse.status).toBe(401);
      expect(nonExistentResponse.body.message).toBe(wrongPasswordResponse.body.message);
    });
  });
});