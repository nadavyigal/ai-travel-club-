import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { tripModel } from '../models/Trip';
import { groupBoardModel } from '../models/GroupBoard';
import { userModel } from '../models/User';
import { realtimeService } from '../services/RealtimeService';

const router = Router();

// Validation schema for group creation request
const CreateGroupRequestSchema = z.object({
  trip_id: z.string().uuid('trip_id must be a valid UUID'),
  member_emails: z.array(z.string().email('invalid email address')).min(1).max(20, 'maximum 20 members allowed'),
  voting_deadline: z.string().datetime().optional(),
  consensus_threshold: z.number().min(0.5, 'consensus_threshold must be between 0.5 and 1.0').max(1.0, 'consensus_threshold must be between 0.5 and 1.0').default(0.6)
}).refine(
  (data) => {
    if (data.voting_deadline) {
      const deadline = new Date(data.voting_deadline);
      return deadline > new Date();
    }
    return true;
  },
  { message: 'voting_deadline must be in the future', path: ['voting_deadline'] }
).refine(
  (data) => {
    const uniqueEmails = new Set(data.member_emails.map(e => e.toLowerCase()));
    return uniqueEmails.size === data.member_emails.length;
  },
  { message: 'duplicate email addresses not allowed', path: ['member_emails'] }
);

// POST /v1/groups - Create Group Board
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Validate request body
    const validatedData = CreateGroupRequestSchema.parse(req.body);

    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'authentication required',
        code: 401
      });
    }

    // Verify trip exists
    const trip = await tripModel.findById(validatedData.trip_id);
    if (!trip) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'trip not found',
        code: 404
      });
    }

    // Verify user is trip creator
    if (trip.creator_id !== req.user.id) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'not authorized to create group for this trip',
        code: 403
      });
    }

    // Check if group board already exists for this trip
    const existingBoard = await groupBoardModel.findByTripId(validatedData.trip_id);
    if (existingBoard) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'group board already exists for this trip',
        code: 409
      });
    }

    // Calculate voting deadline (default to 7 days from now)
    const votingDeadline = validatedData.voting_deadline
      ? new Date(validatedData.voting_deadline)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create group board
    const board = await groupBoardModel.create({
      trip_id: validatedData.trip_id,
      voting_deadline: votingDeadline,
      consensus_threshold: validatedData.consensus_threshold
    });

    // Send placeholder invitations (in production, would send actual emails)
    const invitations = validatedData.member_emails.map(email => ({
      email,
      invited_at: new Date().toISOString(),
      status: 'pending'
    }));

    // Notify real-time clients
    await realtimeService.notifyBoardCreated(board.id, {
      boardId: board.id,
      tripId: board.trip_id,
      creatorId: req.user.id,
      memberCount: invitations.length
    });

    // Return group board response
    return res.status(201).json({
      id: board.id,
      trip_id: board.trip_id,
      voting_deadline: board.voting_deadline.toISOString(),
      consensus_threshold: board.consensus_threshold,
      current_phase: 'discussion',
      winning_option_id: null,
      pending_invitations: invitations
    });

  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((e: z.ZodIssue) => {
        if (e.path.length > 0) {
          return `${e.path.join('.')}: ${e.message}`;
        }
        return e.message;
      }).join(', ');

      return res.status(400).json({
        error: 'Validation Error',
        message: errorMessages,
        code: 400
      });
    }

    if (error instanceof Error) {
      return res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred',
        code: 500
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      code: 500
    });
  }
});

// POST /v1/groups/{board_id}/vote - Submit Vote
router.post('/:board_id/vote', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const board_id = req.params.board_id;

    // Validate board_id exists and has correct format
    if (!board_id) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'board_id is required',
        code: 400
      });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(board_id)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'board_id must be a valid UUID',
        code: 400
      });
    }

    // Validate vote request
    const VoteRequestSchema = z.object({
      itinerary_id: z.string().uuid('itinerary_id must be a valid UUID'),
      vote_type: z.enum(['upvote', 'downvote', 'abstain']),
      comment: z.string().max(500, 'comment cannot exceed 500 characters').optional()
    });

    const validatedVote = VoteRequestSchema.parse(req.body);

    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'authentication required',
        code: 401
      });
    }

    // Get board and verify it exists
    const board = await groupBoardModel.findById(board_id);
    if (!board) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'board not found',
        code: 404
      });
    }

    // Verify user is trip member
    const trip = await tripModel.findById(board.trip_id);
    if (!trip || !trip.member_ids.includes(req.user.id)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'only trip members can vote',
        code: 403
      });
    }

    // Check if user has already voted on this itinerary
    const existingVotes = await groupBoardModel.getBoardVotes(board_id);
    const userVote = existingVotes.find(v =>
      v.user_id === req.user!.id && v.itinerary_id === validatedVote.itinerary_id
    );

    if (userVote) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'user has already voted on this itinerary',
        code: 409
      });
    }

    // Submit vote
    const vote = await groupBoardModel.submitVote({
      board_id,
      itinerary_id: validatedVote.itinerary_id,
      user_id: req.user.id,
      vote_type: validatedVote.vote_type,
      comment: validatedVote.comment
    });

    // Check consensus
    const consensus = await groupBoardModel.checkConsensus(board_id);

    // Get total votes for progress calculation
    const allVotes = await groupBoardModel.getBoardVotes(board_id);
    const totalMembers = trip.member_ids.length;
    const consensusProgress = totalMembers > 0 ? allVotes.length / totalMembers : 0;

    // Emit real-time vote event
    await realtimeService.notifyVoteCast(board_id, {
      voteId: vote.id,
      userId: req.user.id,
      itineraryId: validatedVote.itinerary_id,
      voteType: validatedVote.vote_type,
      totalVotes: allVotes.length,
      consensusProgress
    });

    // If consensus reached, emit consensus event
    if (consensus.consensus_reached && consensus.winning_option_id) {
      await realtimeService.notifyConsensusReached(board_id, {
        winningItineraryId: consensus.winning_option_id,
        consensusThreshold: board.consensus_threshold,
        finalVoteCount: allVotes.length,
        winningPercentage: consensusProgress
      });
    }

    return res.status(200).json({
      vote_id: vote.id,
      board_status: board.status === 'active' ? 'voting' : board.status,
      consensus_reached: consensus.consensus_reached
    });

  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ');
      return res.status(400).json({
        error: 'Validation Error',
        message: errorMessages,
        code: 400
      });
    }

    if (error instanceof Error) {
      return res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred',
        code: 500
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      code: 500
    });
  }
});

export default router;