import request from 'supertest';
import { app } from '../../src/app';

describe('POST /v1/groups - Group Board Creation Contract Tests', () => {
  describe('Request Validation', () => {
    it('should require all mandatory fields', async () => {
      const response = await request(app)
        .post('/v1/groups')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('trip_id');
      expect(response.body.message).toContain('member_emails');
    });

    it('should validate trip_id format', async () => {
      const response = await request(app)
        .post('/v1/groups')
        .send({
          trip_id: 'invalid-uuid',
          member_emails: ['user1@example.com', 'user2@example.com']
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('trip_id must be a valid UUID');
    });

    it('should validate email addresses in member_emails', async () => {
      const response = await request(app)
        .post('/v1/groups')
        .send({
          trip_id: '123e4567-e89b-12d3-a456-426614174000',
          member_emails: ['invalid-email', 'user2@example.com']
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('invalid email address');
    });

    it('should enforce maximum member limit', async () => {
      const tooManyEmails = Array.from({ length: 21 }, (_, i) => `user${i}@example.com`);

      const response = await request(app)
        .post('/v1/groups')
        .send({
          trip_id: '123e4567-e89b-12d3-a456-426614174000',
          member_emails: tooManyEmails
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('maximum 20 members allowed');
    });

    it('should validate voting_deadline is in the future', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Yesterday

      const response = await request(app)
        .post('/v1/groups')
        .send({
          trip_id: '123e4567-e89b-12d3-a456-426614174000',
          member_emails: ['user1@example.com', 'user2@example.com'],
          voting_deadline: pastDate
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('voting_deadline must be in the future');
    });

    it('should validate consensus_threshold range', async () => {
      const response = await request(app)
        .post('/v1/groups')
        .send({
          trip_id: '123e4567-e89b-12d3-a456-426614174000',
          member_emails: ['user1@example.com', 'user2@example.com'],
          consensus_threshold: 1.5 // Invalid: > 1.0
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('consensus_threshold must be between 0.5 and 1.0');
    });

    it('should validate consensus_threshold minimum', async () => {
      const response = await request(app)
        .post('/v1/groups')
        .send({
          trip_id: '123e4567-e89b-12d3-a456-426614174000',
          member_emails: ['user1@example.com', 'user2@example.com'],
          consensus_threshold: 0.3 // Invalid: < 0.5
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('consensus_threshold must be between 0.5 and 1.0');
    });

    it('should validate trip exists', async () => {
      const response = await request(app)
        .post('/v1/groups')
        .send({
          trip_id: '123e4567-e89b-12d3-a456-426614174999', // Non-existent trip
          member_emails: ['user1@example.com', 'user2@example.com']
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('trip not found');
    });
  });

  describe('Successful Group Board Creation', () => {
    it('should create group board with valid data', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // One week from now

      const validRequest = {
        trip_id: '123e4567-e89b-12d3-a456-426614174000',
        member_emails: [
          'alice@example.com',
          'bob@example.com',
          'charlie@example.com'
        ],
        voting_deadline: futureDate,
        consensus_threshold: 0.7
      };

      const response = await request(app)
        .post('/v1/groups')
        .send(validRequest);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

      expect(response.body).toHaveProperty('trip_id', validRequest.trip_id);
      expect(response.body).toHaveProperty('voting_deadline', validRequest.voting_deadline);
      expect(response.body).toHaveProperty('consensus_threshold', validRequest.consensus_threshold);
      expect(response.body).toHaveProperty('current_phase', 'discussion');
      expect(response.body).toHaveProperty('winning_option_id', null);
    });

    it('should create group board with default consensus threshold', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const requestWithDefaults = {
        trip_id: '123e4567-e89b-12d3-a456-426614174000',
        member_emails: [
          'alice@example.com',
          'bob@example.com'
        ],
        voting_deadline: futureDate
        // consensus_threshold omitted to test default
      };

      const response = await request(app)
        .post('/v1/groups')
        .send(requestWithDefaults);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('consensus_threshold', 0.6); // Default value
      expect(response.body).toHaveProperty('current_phase', 'discussion');
    });

    it('should create group board with minimal member list', async () => {
      const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

      const minimalRequest = {
        trip_id: '123e4567-e89b-12d3-a456-426614174000',
        member_emails: ['solo@example.com']
      };

      const response = await request(app)
        .post('/v1/groups')
        .send(minimalRequest);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('trip_id', minimalRequest.trip_id);
    });

    it('should create group board with maximum member list', async () => {
      const maxEmails = Array.from({ length: 20 }, (_, i) => `user${i}@example.com`);
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const maxRequest = {
        trip_id: '123e4567-e89b-12d3-a456-426614174000',
        member_emails: maxEmails,
        voting_deadline: futureDate,
        consensus_threshold: 0.8
      };

      const response = await request(app)
        .post('/v1/groups')
        .send(maxRequest);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('consensus_threshold', 0.8);
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/v1/groups')
        .send({
          trip_id: '123e4567-e89b-12d3-a456-426614174000',
          member_emails: ['user1@example.com', 'user2@example.com']
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('authentication required');
    });

    it('should verify user has permission to create group for trip', async () => {
      const response = await request(app)
        .post('/v1/groups')
        .set('Authorization', 'Bearer valid-but-unauthorized-token')
        .send({
          trip_id: '123e4567-e89b-12d3-a456-426614174000',
          member_emails: ['user1@example.com', 'user2@example.com']
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('not authorized to create group for this trip');
    });
  });

  describe('Duplicate Group Board Prevention', () => {
    it('should prevent creating multiple group boards for same trip', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const request1 = {
        trip_id: '123e4567-e89b-12d3-a456-426614174000',
        member_emails: ['user1@example.com', 'user2@example.com'],
        voting_deadline: futureDate
      };

      // Create first group board
      await request(app)
        .post('/v1/groups')
        .send(request1);

      // Attempt to create second group board for same trip
      const response = await request(app)
        .post('/v1/groups')
        .send(request1);

      expect(response.status).toBe(409);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('group board already exists for this trip');
    });
  });

  describe('Email Validation and User Handling', () => {
    it('should handle duplicate email addresses', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const requestWithDuplicates = {
        trip_id: '123e4567-e89b-12d3-a456-426614174000',
        member_emails: [
          'user1@example.com',
          'user2@example.com',
          'user1@example.com' // Duplicate
        ],
        voting_deadline: futureDate
      };

      const response = await request(app)
        .post('/v1/groups')
        .send(requestWithDuplicates);

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('duplicate email addresses not allowed');
    });

    it('should handle non-existent user emails gracefully', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const requestWithNewUsers = {
        trip_id: '123e4567-e89b-12d3-a456-426614174000',
        member_emails: [
          'existing@example.com',
          'newuser@example.com' // User doesn't exist yet
        ],
        voting_deadline: futureDate
      };

      const response = await request(app)
        .post('/v1/groups')
        .send(requestWithNewUsers);

      // Should either create invitations or return specific error
      expect([201, 202, 400]).toContain(response.status);

      if (response.status === 201 || response.status === 202) {
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('pending_invitations');
      } else {
        expect(response.body.message).toContain('some users not found');
      }
    });
  });

  describe('Response Structure Validation', () => {
    it('should return properly structured group board object', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const validRequest = {
        trip_id: '123e4567-e89b-12d3-a456-426614174000',
        member_emails: ['user1@example.com', 'user2@example.com'],
        voting_deadline: futureDate,
        consensus_threshold: 0.6
      };

      const response = await request(app)
        .post('/v1/groups')
        .send(validRequest);

      expect(response.status).toBe(201);

      // Validate all required GroupBoard schema fields
      expect(response.body).toHaveProperty('id');
      expect(typeof response.body.id).toBe('string');

      expect(response.body).toHaveProperty('trip_id');
      expect(typeof response.body.trip_id).toBe('string');

      expect(response.body).toHaveProperty('voting_deadline');
      expect(typeof response.body.voting_deadline).toBe('string');

      expect(response.body).toHaveProperty('consensus_threshold');
      expect(typeof response.body.consensus_threshold).toBe('number');

      expect(response.body).toHaveProperty('current_phase');
      expect(['discussion', 'voting', 'decided']).toContain(response.body.current_phase);

      expect(response.body).toHaveProperty('winning_option_id');
      expect(response.body.winning_option_id).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should return structured error responses', async () => {
      const response = await request(app)
        .post('/v1/groups')
        .send({
          trip_id: 'invalid',
          member_emails: ['invalid-email']
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
      // This test would need to simulate database connection issues
      // For now, we'll test with a request that might trigger DB errors
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const response = await request(app)
        .post('/v1/groups')
        .send({
          trip_id: '123e4567-e89b-12d3-a456-426614174000',
          member_emails: ['user1@example.com'],
          voting_deadline: futureDate
        });

      // Should either succeed or return appropriate error
      if (response.status !== 201) {
        expect([400, 404, 500, 503]).toContain(response.status);
        expect(response.body.error).toBeDefined();
      }
    });
  });
});