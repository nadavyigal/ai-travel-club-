import { z } from 'zod';
import { tripModel, Trip } from '../models/Trip.js';
import { groupBoardModel, CreateGroupBoardInput, GroupBoard, CreateVoteInput, ItineraryVote, BoardSummary } from '../models/GroupBoard.js';
import { userModel } from '../models/User.js';
import { itineraryModel } from '../models/Itinerary.js';

// Validation schemas
export const CreateGroupBoardRequestSchema = z.object({
  trip_id: z.string().uuid('trip_id must be a valid UUID'),
  voting_deadline_hours: z.number().int().positive().max(168).default(72), // Max 1 week
  consensus_threshold: z.number().min(0.5).max(1.0).default(0.6)
});

export const VoteRequestSchema = z.object({
  board_id: z.string().uuid('board_id must be a valid UUID'),
  itinerary_id: z.string().uuid('itinerary_id must be a valid UUID'),
  user_id: z.string().uuid('user_id must be a valid UUID'),
  vote_type: z.enum(['upvote', 'downvote', 'abstain']),
  comment: z.string().max(500).optional()
});

export const InviteMemberRequestSchema = z.object({
  trip_id: z.string().uuid('trip_id must be a valid UUID'),
  user_id: z.string().uuid('user_id must be a valid UUID'),
  invited_by: z.string().uuid('invited_by must be a valid UUID')
});

// Type definitions
export type CreateGroupBoardRequest = z.infer<typeof CreateGroupBoardRequestSchema>;
export type VoteRequest = z.infer<typeof VoteRequestSchema>;
export type InviteMemberRequest = z.infer<typeof InviteMemberRequestSchema>;

export interface GroupActivity {
  type: 'member_joined' | 'vote_cast' | 'consensus_reached' | 'discussion_started' | 'voting_opened';
  user_id: string;
  timestamp: Date;
  details: {
    trip_id?: string;
    board_id?: string;
    itinerary_id?: string;
    vote_type?: string;
    message?: string;
  };
}

export interface GroupInsights {
  trip_id: string;
  member_count: number;
  voting_participation: {
    eligible_voters: number;
    votes_cast: number;
    participation_rate: number;
  };
  consensus_status: {
    is_reached: boolean;
    winning_option_id: string | null;
    winning_percentage: number;
  };
  member_preferences: {
    most_active_voter: string | null;
    unanimous_choices: string[];
    controversial_choices: string[];
  };
}

export class GroupService {
  private static instance: GroupService;
  private groupActivities: Map<string, GroupActivity[]> = new Map();

  private constructor() {}

  static getInstance(): GroupService {
    if (!GroupService.instance) {
      GroupService.instance = new GroupService();
    }
    return GroupService.instance;
  }

  /**
   * Create a new group board for collaborative decision making
   */
  async createGroupBoard(request: CreateGroupBoardRequest, creatorId: string): Promise<GroupBoard> {
    // Validate input
    const validatedRequest = CreateGroupBoardRequestSchema.parse(request);

    // Verify trip exists and user is creator
    const trip = await tripModel.findById(validatedRequest.trip_id);
    if (!trip) {
      throw new Error('trip not found');
    }

    if (trip.creator_id !== creatorId) {
      throw new Error('only trip creator can create group board');
    }

    // Calculate voting deadline
    const votingDeadline = new Date();
    votingDeadline.setHours(votingDeadline.getHours() + validatedRequest.voting_deadline_hours);

    const boardData: CreateGroupBoardInput = {
      trip_id: validatedRequest.trip_id,
      voting_deadline: votingDeadline.toISOString(),
      consensus_threshold: validatedRequest.consensus_threshold
    };

    const board = await groupBoardModel.createBoard(boardData);

    // Log activity
    await this.logActivity(validatedRequest.trip_id, {
      type: 'discussion_started',
      user_id: creatorId,
      timestamp: new Date(),
      details: {
        trip_id: validatedRequest.trip_id,
        board_id: board.id,
        message: 'Group discussion board created'
      }
    });

    return board;
  }

  /**
   * Invite member to join trip group
   */
  async inviteMember(request: InviteMemberRequest): Promise<Trip> {
    // Validate input
    const validatedRequest = InviteMemberRequestSchema.parse(request);

    // Verify trip exists
    const trip = await tripModel.findById(validatedRequest.trip_id);
    if (!trip) {
      throw new Error('trip not found');
    }

    // Verify inviter is trip member
    if (!trip.member_ids.includes(validatedRequest.invited_by)) {
      throw new Error('only trip members can invite others');
    }

    // Verify user to invite exists
    const userExists = await userModel.exists(validatedRequest.user_id);
    if (!userExists) {
      throw new Error('user to invite not found');
    }

    // Add member to trip
    const updatedTrip = await tripModel.addMember(validatedRequest.trip_id, validatedRequest.user_id);

    // Log activity
    await this.logActivity(validatedRequest.trip_id, {
      type: 'member_joined',
      user_id: validatedRequest.user_id,
      timestamp: new Date(),
      details: {
        trip_id: validatedRequest.trip_id,
        message: 'New member joined the trip'
      }
    });

    return updatedTrip;
  }

  /**
   * Remove member from trip group
   */
  async removeMember(tripId: string, userId: string, removedBy: string): Promise<Trip> {
    if (!this.isValidUUID(tripId) || !this.isValidUUID(userId) || !this.isValidUUID(removedBy)) {
      throw new Error('invalid UUID format');
    }

    // Verify trip exists
    const trip = await tripModel.findById(tripId);
    if (!trip) {
      throw new Error('trip not found');
    }

    // Only creator can remove members (or members can remove themselves)
    if (trip.creator_id !== removedBy && userId !== removedBy) {
      throw new Error('unauthorized to remove member');
    }

    // Remove member from trip
    const updatedTrip = await tripModel.removeMember(tripId, userId);

    // Log activity
    await this.logActivity(tripId, {
      type: 'member_joined', // Using existing type, in production would add 'member_left'
      user_id: userId,
      timestamp: new Date(),
      details: {
        trip_id: tripId,
        message: userId === removedBy ? 'Member left the trip' : 'Member was removed from trip'
      }
    });

    return updatedTrip;
  }

  /**
   * Start voting phase on group board
   */
  async startVoting(boardId: string, startedBy: string): Promise<GroupBoard> {
    if (!this.isValidUUID(boardId) || !this.isValidUUID(startedBy)) {
      throw new Error('invalid UUID format');
    }

    // Get board and verify access
    const board = await groupBoardModel.findBoardById(boardId);
    if (!board) {
      throw new Error('board not found');
    }

    // Verify user is trip creator
    const trip = await tripModel.findById(board.trip_id);
    if (!trip || trip.creator_id !== startedBy) {
      throw new Error('only trip creator can start voting');
    }

    // Start voting
    const updatedBoard = await groupBoardModel.startVoting(boardId);

    // Log activity
    await this.logActivity(board.trip_id, {
      type: 'voting_opened',
      user_id: startedBy,
      timestamp: new Date(),
      details: {
        trip_id: board.trip_id,
        board_id: boardId,
        message: 'Voting phase started'
      }
    });

    return updatedBoard;
  }

  /**
   * Submit vote on itinerary
   */
  async submitVote(vote: VoteRequest): Promise<{ vote: ItineraryVote; consensus_reached: boolean }> {
    // Validate input
    const validatedVote = VoteRequestSchema.parse(vote);

    // Verify user is trip member
    const board = await groupBoardModel.findBoardById(validatedVote.board_id);
    if (!board) {
      throw new Error('board not found');
    }

    const trip = await tripModel.findById(board.trip_id);
    if (!trip || !trip.member_ids.includes(validatedVote.user_id)) {
      throw new Error('only trip members can vote');
    }

    // Verify itinerary exists and belongs to trip
    const itinerary = await itineraryModel.findById(validatedVote.itinerary_id);
    if (!itinerary || itinerary.trip_id !== board.trip_id) {
      throw new Error('itinerary not found or not associated with trip');
    }

    // Submit vote
    const voteInput: CreateVoteInput = {
      board_id: validatedVote.board_id,
      itinerary_id: validatedVote.itinerary_id,
      user_id: validatedVote.user_id,
      vote_type: validatedVote.vote_type,
      weight: 1,
      comment: validatedVote.comment
    };

    const result = await groupBoardModel.submitVote(voteInput);

    // Log activity
    await this.logActivity(board.trip_id, {
      type: 'vote_cast',
      user_id: validatedVote.user_id,
      timestamp: new Date(),
      details: {
        trip_id: board.trip_id,
        board_id: validatedVote.board_id,
        itinerary_id: validatedVote.itinerary_id,
        vote_type: validatedVote.vote_type,
        message: `Vote cast: ${validatedVote.vote_type}`
      }
    });

    // Check if consensus was just reached
    if (result.boardStatus.consensus_reached) {
      await this.logActivity(board.trip_id, {
        type: 'consensus_reached',
        user_id: validatedVote.user_id,
        timestamp: new Date(),
        details: {
          trip_id: board.trip_id,
          board_id: validatedVote.board_id,
          message: 'Consensus reached on itinerary selection'
        }
      });
    }

    return {
      vote: result.vote,
      consensus_reached: result.boardStatus.consensus_reached
    };
  }

  /**
   * Get group insights and statistics
   */
  async getGroupInsights(tripId: string): Promise<GroupInsights> {
    if (!this.isValidUUID(tripId)) {
      throw new Error('trip ID must be a valid UUID');
    }

    const trip = await tripModel.findById(tripId);
    if (!trip) {
      throw new Error('trip not found');
    }

    const board = await groupBoardModel.findBoardByTripId(tripId);
    if (!board) {
      throw new Error('no group board found for trip');
    }

    // Get voting data
    const boardVotes = await groupBoardModel.getBoardVotes(board.id);
    const uniqueVoters = new Set(boardVotes.map(vote => vote.user_id));
    const eligibleVoters = trip.member_ids.length;
    const participationRate = eligibleVoters > 0 ? uniqueVoters.size / eligibleVoters : 0;

    // Get consensus status
    const consensusResult = await groupBoardModel.checkConsensus(board.id);

    // Calculate winning percentage if consensus reached
    let winningPercentage = 0;
    if (consensusResult.reached && consensusResult.winning_option_id) {
      const summary = await groupBoardModel.getVotingSummary(board.id, consensusResult.winning_option_id);
      winningPercentage = summary.percentage;
    }

    // Find most active voter
    const votesByUser = new Map<string, number>();
    boardVotes.forEach(vote => {
      votesByUser.set(vote.user_id, (votesByUser.get(vote.user_id) || 0) + 1);
    });

    let mostActiveVoter: string | null = null;
    let maxVotes = 0;
    votesByUser.forEach((count, userId) => {
      if (count > maxVotes) {
        maxVotes = count;
        mostActiveVoter = userId;
      }
    });

    return {
      trip_id: tripId,
      member_count: trip.member_ids.length,
      voting_participation: {
        eligible_voters: eligibleVoters,
        votes_cast: uniqueVoters.size,
        participation_rate: Math.round(participationRate * 100) / 100
      },
      consensus_status: {
        is_reached: consensusResult.reached,
        winning_option_id: consensusResult.winning_option_id || null,
        winning_percentage: Math.round(winningPercentage * 100) / 100
      },
      member_preferences: {
        most_active_voter: mostActiveVoter,
        unanimous_choices: [], // Would require more complex analysis
        controversial_choices: [] // Would require more complex analysis
      }
    };
  }

  /**
   * Get group activity timeline
   */
  async getGroupActivity(tripId: string, limit: number = 50): Promise<GroupActivity[]> {
    if (!this.isValidUUID(tripId)) {
      throw new Error('trip ID must be a valid UUID');
    }

    const activities = this.groupActivities.get(tripId) || [];
    return activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get board summary with voting statistics
   */
  async getBoardSummary(boardId: string): Promise<BoardSummary> {
    if (!this.isValidUUID(boardId)) {
      throw new Error('board ID must be a valid UUID');
    }

    const board = await groupBoardModel.findBoardById(boardId);
    if (!board) {
      throw new Error('board not found');
    }

    const trip = await tripModel.findById(board.trip_id);
    if (!trip) {
      throw new Error('associated trip not found');
    }

    return await groupBoardModel.getBoardSummary(boardId, trip.member_ids.length);
  }

  /**
   * Force consensus decision (admin override)
   */
  async forceConsensus(boardId: string, winningItineraryId: string, forcedBy: string): Promise<GroupBoard> {
    if (!this.isValidUUID(boardId) || !this.isValidUUID(winningItineraryId) || !this.isValidUUID(forcedBy)) {
      throw new Error('invalid UUID format');
    }

    // Verify access
    const board = await groupBoardModel.findBoardById(boardId);
    if (!board) {
      throw new Error('board not found');
    }

    const trip = await tripModel.findById(board.trip_id);
    if (!trip || trip.creator_id !== forcedBy) {
      throw new Error('only trip creator can force consensus');
    }

    // Force decision
    const updatedBoard = await groupBoardModel.forceDecision(boardId, winningItineraryId);

    // Log activity
    await this.logActivity(board.trip_id, {
      type: 'consensus_reached',
      user_id: forcedBy,
      timestamp: new Date(),
      details: {
        trip_id: board.trip_id,
        board_id: boardId,
        itinerary_id: winningItineraryId,
        message: 'Consensus forced by trip creator'
      }
    });

    return updatedBoard;
  }

  /**
   * Log group activity
   */
  private async logActivity(tripId: string, activity: GroupActivity): Promise<void> {
    const activities = this.groupActivities.get(tripId) || [];
    activities.push(activity);

    // Keep only last 100 activities per trip
    if (activities.length > 100) {
      activities.splice(0, activities.length - 100);
    }

    this.groupActivities.set(tripId, activities);
  }

  /**
   * Validate UUID format
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Clear all group activities (for testing)
   */
  async clearActivities(): Promise<void> {
    this.groupActivities.clear();
  }
}

// Export singleton instance
export const groupService = GroupService.getInstance();

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'create-board':
      if (args.length < 2) {
        console.log('Usage: node GroupService.ts create-board <trip_id> <creator_id> [voting_deadline_hours] [consensus_threshold]');
        process.exit(1);
      }
      const [tripId, creatorId, hoursStr, thresholdStr] = args;
      const request = {
        trip_id: tripId,
        voting_deadline_hours: hoursStr ? parseInt(hoursStr) : 72,
        consensus_threshold: thresholdStr ? parseFloat(thresholdStr) : 0.6
      };

      groupService.createGroupBoard(request, creatorId)
      .then(board => console.log('Board Created:', JSON.stringify(board, null, 2)))
      .catch(error => console.error('Error:', error.message));
      break;

    case 'invite':
      if (args.length < 3) {
        console.log('Usage: node GroupService.ts invite <trip_id> <user_id> <invited_by>');
        process.exit(1);
      }
      const [tId, uId, invitedBy] = args;

      groupService.inviteMember({ trip_id: tId, user_id: uId, invited_by: invitedBy })
      .then(trip => console.log('Member Invited:', JSON.stringify(trip.member_ids, null, 2)))
      .catch(error => console.error('Error:', error.message));
      break;

    case 'vote':
      if (args.length < 4) {
        console.log('Usage: node GroupService.ts vote <board_id> <itinerary_id> <user_id> <vote_type> [comment]');
        process.exit(1);
      }
      const [boardId, itineraryId, userId, voteType, comment] = args;

      groupService.submitVote({
        board_id: boardId,
        itinerary_id: itineraryId,
        user_id: userId,
        vote_type: voteType as 'upvote' | 'downvote' | 'abstain',
        comment
      })
      .then(result => console.log('Vote Submitted:', JSON.stringify(result, null, 2)))
      .catch(error => console.error('Error:', error.message));
      break;

    case 'insights':
      if (args.length < 1) {
        console.log('Usage: node GroupService.ts insights <trip_id>');
        process.exit(1);
      }
      const [insightsTripId] = args;

      groupService.getGroupInsights(insightsTripId)
      .then(insights => console.log('Group Insights:', JSON.stringify(insights, null, 2)))
      .catch(error => console.error('Error:', error.message));
      break;

    case 'activity':
      if (args.length < 1) {
        console.log('Usage: node GroupService.ts activity <trip_id> [limit]');
        process.exit(1);
      }
      const [activityTripId, limitStr] = args;
      const limit = limitStr ? parseInt(limitStr) : 50;

      groupService.getGroupActivity(activityTripId, limit)
      .then(activities => console.log('Recent Activity:', JSON.stringify(activities, null, 2)))
      .catch(error => console.error('Error:', error.message));
      break;

    case 'start-voting':
      if (args.length < 2) {
        console.log('Usage: node GroupService.ts start-voting <board_id> <started_by>');
        process.exit(1);
      }
      const [bId, startedBy] = args;

      groupService.startVoting(bId, startedBy)
      .then(board => console.log('Voting Started:', JSON.stringify(board, null, 2)))
      .catch(error => console.error('Error:', error.message));
      break;

    default:
      console.log('Available commands:');
      console.log('  create-board <trip_id> <creator_id> - Create group decision board');
      console.log('  invite <trip_id> <user_id> <invited_by> - Invite member to trip');
      console.log('  vote <board_id> <itinerary_id> <user_id> <vote_type> - Submit vote');
      console.log('  insights <trip_id> - Get group insights and statistics');
      console.log('  activity <trip_id> - Get recent group activity');
      console.log('  start-voting <board_id> <started_by> - Start voting phase');
  }
}