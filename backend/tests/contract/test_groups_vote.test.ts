import request from 'supertest';
import { app } from '../../src/app';

describe('POST /v1/groups/{board_id}/vote - Group Voting Contract Tests', () => {
  const validBoardId = '123e4567-e89b-12d3-a456-426614174000';
  const validItineraryId = '987fcdeb-51a2-43d1-9f20-8d5ef2a9c1b0';

  describe('Request Validation', () => {
    it('should require all mandatory fields', async () => {
      const response = await request(app)
        .post(`/v1/groups/${validBoardId}/vote`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('itinerary_id');
      expect(response.body.message).toContain('vote_type');
    });

    it('should validate board_id parameter format', async () => {
      const response = await request(app)
        .post('/v1/groups/invalid-uuid/vote')
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'upvote'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('board_id must be a valid UUID');
    });

    it('should validate itinerary_id format', async () => {
      const response = await request(app)
        .post(`/v1/groups/${validBoardId}/vote`)
        .send({
          itinerary_id: 'invalid-uuid',
          vote_type: 'upvote'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('itinerary_id must be a valid UUID');
    });

    it('should validate vote_type enum values', async () => {
      const response = await request(app)
        .post(`/v1/groups/${validBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'invalid_vote_type'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('vote_type must be one of: upvote, downvote, abstain');
    });

    it('should validate comment length limit', async () => {
      const longComment = 'a'.repeat(501); // Exceeds 500 character limit

      const response = await request(app)
        .post(`/v1/groups/${validBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'upvote',
          comment: longComment
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('comment cannot exceed 500 characters');
    });

    it('should validate board exists', async () => {
      const nonExistentBoardId = '123e4567-e89b-12d3-a456-426614174999';

      const response = await request(app)
        .post(`/v1/groups/${nonExistentBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'upvote'
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('group board not found');
    });

    it('should validate itinerary exists', async () => {
      const nonExistentItineraryId = '987fcdeb-51a2-43d1-9f20-8d5ef2a9c999';

      const response = await request(app)
        .post(`/v1/groups/${validBoardId}/vote`)
        .send({
          itinerary_id: nonExistentItineraryId,
          vote_type: 'upvote'
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('itinerary not found');
    });
  });

  describe('Voting Phase Validation', () => {
    it('should reject votes when board is in discussion phase', async () => {
      const response = await request(app)
        .post(`/v1/groups/${validBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'upvote'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('voting not yet open');
    });

    it('should reject votes when board is in decided phase', async () => {
      // This test assumes a board that has already reached consensus
      const decidedBoardId = '123e4567-e89b-12d3-a456-426614174001';

      const response = await request(app)
        .post(`/v1/groups/${decidedBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'upvote'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('voting has closed');
    });

    it('should reject votes after voting deadline', async () => {
      const expiredBoardId = '123e4567-e89b-12d3-a456-426614174002';

      const response = await request(app)
        .post(`/v1/groups/${expiredBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'upvote'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('voting deadline has passed');
    });
  });

  describe('Successful Voting', () => {
    const votingBoardId = '123e4567-e89b-12d3-a456-426614174003'; // Board in voting phase

    it('should accept valid upvote', async () => {
      const response = await request(app)
        .post(`/v1/groups/${votingBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'upvote',
          comment: 'This itinerary looks great!'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('vote_id');
      expect(response.body.vote_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

      expect(response.body).toHaveProperty('board_status');
      expect(['discussion', 'voting', 'decided']).toContain(response.body.board_status);

      expect(response.body).toHaveProperty('consensus_reached');
      expect(typeof response.body.consensus_reached).toBe('boolean');
    });

    it('should accept valid downvote', async () => {
      const response = await request(app)
        .post(`/v1/groups/${votingBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'downvote',
          comment: 'Too expensive for our budget'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('vote_id');
      expect(response.body).toHaveProperty('board_status');
      expect(response.body).toHaveProperty('consensus_reached');
    });

    it('should accept abstain vote', async () => {
      const response = await request(app)
        .post(`/v1/groups/${votingBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'abstain'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('vote_id');
      expect(response.body).toHaveProperty('board_status');
      expect(response.body).toHaveProperty('consensus_reached');
    });

    it('should accept vote without comment', async () => {
      const response = await request(app)
        .post(`/v1/groups/${votingBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'upvote'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('vote_id');
    });

    it('should detect consensus when threshold is reached', async () => {
      // This test would need specific setup with known voting scenario
      const consensusBoardId = '123e4567-e89b-12d3-a456-426614174004';

      const response = await request(app)
        .post(`/v1/groups/${consensusBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'upvote',
          comment: 'Final vote to reach consensus'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('consensus_reached', true);
      expect(response.body).toHaveProperty('board_status', 'decided');
    });
  });

  describe('Duplicate Vote Prevention', () => {
    it('should prevent user from voting twice on same itinerary', async () => {
      const votingBoardId = '123e4567-e89b-12d3-a456-426614174005';

      // First vote
      const firstVote = await request(app)
        .post(`/v1/groups/${votingBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'upvote'
        });

      expect(firstVote.status).toBe(200);

      // Attempt second vote
      const secondVote = await request(app)
        .post(`/v1/groups/${votingBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'downvote'
        });

      expect(secondVote.status).toBe(409);
      expect(secondVote.body.error).toBeDefined();
      expect(secondVote.body.message).toContain('user has already voted on this itinerary');
    });

    it('should allow user to vote on different itineraries', async () => {
      const votingBoardId = '123e4567-e89b-12d3-a456-426614174006';
      const secondItineraryId = '987fcdeb-51a2-43d1-9f20-8d5ef2a9c1b1';

      // Vote on first itinerary
      const firstVote = await request(app)
        .post(`/v1/groups/${votingBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'upvote'
        });

      expect(firstVote.status).toBe(200);

      // Vote on second itinerary
      const secondVote = await request(app)
        .post(`/v1/groups/${votingBoardId}/vote`)
        .send({
          itinerary_id: secondItineraryId,
          vote_type: 'downvote'
        });

      expect(secondVote.status).toBe(200);
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post(`/v1/groups/${validBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'upvote'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('authentication required');
    });

    it('should verify user is member of the group', async () => {
      const response = await request(app)
        .post(`/v1/groups/${validBoardId}/vote`)
        .set('Authorization', 'Bearer valid-but-not-member-token')
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'upvote'
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('not a member of this group');
    });
  });

  describe('Real-time Updates', () => {
    it('should trigger real-time notifications on vote submission', async () => {
      const votingBoardId = '123e4567-e89b-12d3-a456-426614174007';

      const response = await request(app)
        .post(`/v1/groups/${votingBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'upvote',
          comment: 'Love this plan!'
        });

      expect(response.status).toBe(200);

      // Response should include information for real-time updates
      expect(response.body).toHaveProperty('board_status');
      expect(response.body).toHaveProperty('consensus_reached');

      // These fields help clients update UI in real-time
      if (response.body.consensus_reached) {
        expect(response.body.board_status).toBe('decided');
      }
    });
  });

  describe('Vote Weight and Calculations', () => {
    it('should handle weighted voting (future feature)', async () => {
      const votingBoardId = '123e4567-e89b-12d3-a456-426614174008';

      const response = await request(app)
        .post(`/v1/groups/${votingBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'upvote',
          weight: 2 // Future feature for weighted voting
        });

      // Should either accept weight or ignore it gracefully
      expect([200, 400]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('vote_id');
      } else {
        expect(response.body.message).toContain('weighted voting not yet supported');
      }
    });
  });

  describe('Response Structure Validation', () => {
    it('should return properly structured vote response', async () => {
      const votingBoardId = '123e4567-e89b-12d3-a456-426614174009';

      const response = await request(app)
        .post(`/v1/groups/${votingBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'upvote',
          comment: 'Great choice!'
        });

      expect(response.status).toBe(200);

      // Validate response structure
      expect(response.body).toHaveProperty('vote_id');
      expect(typeof response.body.vote_id).toBe('string');
      expect(response.body.vote_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

      expect(response.body).toHaveProperty('board_status');
      expect(typeof response.body.board_status).toBe('string');
      expect(['discussion', 'voting', 'decided']).toContain(response.body.board_status);

      expect(response.body).toHaveProperty('consensus_reached');
      expect(typeof response.body.consensus_reached).toBe('boolean');
    });
  });

  describe('Error Handling', () => {
    it('should return structured error responses', async () => {
      const response = await request(app)
        .post('/v1/groups/invalid-uuid/vote')
        .send({
          itinerary_id: 'invalid-uuid',
          vote_type: 'invalid'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('code');
      expect(typeof response.body.error).toBe('string');
      expect(typeof response.body.message).toBe('string');
      expect(typeof response.body.code).toBe('number');
    });

    it('should handle concurrent voting gracefully', async () => {
      const votingBoardId = '123e4567-e89b-12d3-a456-426614174010';

      // Simulate concurrent votes from same user
      const vote1Promise = request(app)
        .post(`/v1/groups/${votingBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'upvote'
        });

      const vote2Promise = request(app)
        .post(`/v1/groups/${votingBoardId}/vote`)
        .send({
          itinerary_id: validItineraryId,
          vote_type: 'downvote'
        });

      const [response1, response2] = await Promise.all([vote1Promise, vote2Promise]);

      // One should succeed, one should fail with conflict
      const statuses = [response1.status, response2.status].sort();
      expect(statuses).toEqual([200, 409]);
    });
  });
});