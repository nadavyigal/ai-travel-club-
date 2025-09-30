import { z } from 'zod';

// Validation schemas
export const CreateGroupBoardSchema = z.object({
  trip_id: z.string().uuid('trip_id must be a valid UUID'),
  voting_deadline: z.date(),
  consensus_threshold: z.number().min(0.5).max(1.0).default(0.6)
});

export const CreateVoteSchema = z.object({
  board_id: z.string().uuid('board_id must be a valid UUID'),
  itinerary_id: z.string().uuid('itinerary_id must be a valid UUID'),
  user_id: z.string().uuid('user_id must be a valid UUID'),
  vote_type: z.enum(['upvote', 'downvote', 'abstain']),
  comment: z.string().max(500).optional()
});

export type CreateGroupBoardInput = z.infer<typeof CreateGroupBoardSchema>;
export type CreateVoteInput = z.infer<typeof CreateVoteSchema> & { weight?: number };

export interface GroupBoard {
  id: string;
  trip_id: string;
  voting_deadline: Date;
  consensus_threshold: number;
  status: 'active' | 'completed' | 'cancelled';
  current_phase?: string;
  winning_option_id?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ItineraryVote {
  id: string;
  board_id: string;
  itinerary_id: string;
  user_id: string;
  vote_type: 'upvote' | 'downvote' | 'abstain';
  weight: number;
  comment?: string;
  created_at: Date;
}

export interface BoardSummary {
  board: GroupBoard;
  total_votes: number;
  consensus_reached: boolean;
  top_itinerary?: string;
  participation_rate: number;
}

export class GroupBoardModel {
  private boards: Map<string, GroupBoard> = new Map();
  private votes: Map<string, ItineraryVote> = new Map();

  /**
   * Create a new group board
   */
  async create(input: CreateGroupBoardInput): Promise<GroupBoard> {
    const validatedData = CreateGroupBoardSchema.parse(input);

    const board: GroupBoard = {
      id: this.generateId(),
      trip_id: validatedData.trip_id,
      voting_deadline: validatedData.voting_deadline,
      consensus_threshold: validatedData.consensus_threshold,
      status: 'active',
      current_phase: 'discussion',
      winning_option_id: null,
      created_at: new Date(),
      updated_at: new Date()
    };

    this.boards.set(board.id, board);
    return board;
  }

  /**
   * Find board by ID
   */
  async findById(id: string): Promise<GroupBoard | null> {
    if (!this.isValidUUID(id)) {
      throw new Error('board ID must be a valid UUID');
    }
    return this.boards.get(id) || null;
  }

  /**
   * Find board by trip ID
   */
  async findByTripId(tripId: string): Promise<GroupBoard | null> {
    if (!this.isValidUUID(tripId)) {
      throw new Error('trip ID must be a valid UUID');
    }
    return Array.from(this.boards.values()).find(b => b.trip_id === tripId) || null;
  }

  /**
   * Submit a vote
   */
  async submitVote(voteInput: CreateVoteInput): Promise<ItineraryVote> {
    const validatedData = CreateVoteSchema.parse(voteInput);

    const vote: ItineraryVote = {
      id: this.generateId(),
      board_id: validatedData.board_id,
      itinerary_id: validatedData.itinerary_id,
      user_id: validatedData.user_id,
      vote_type: validatedData.vote_type,
      weight: voteInput.weight || 1,
      comment: validatedData.comment,
      created_at: new Date()
    };

    this.votes.set(vote.id, vote);
    return vote;
  }

  /**
   * Get all votes for a board
   */
  async getBoardVotes(boardId: string): Promise<ItineraryVote[]> {
    if (!this.isValidUUID(boardId)) {
      throw new Error('board ID must be a valid UUID');
    }
    return Array.from(this.votes.values()).filter(v => v.board_id === boardId);
  }

  /**
   * Check if consensus has been reached
   */
  async checkConsensus(boardId: string): Promise<{ consensus_reached: boolean; winning_option_id?: string }> {
    if (!this.isValidUUID(boardId)) {
      throw new Error('board ID must be a valid UUID');
    }

    const board = await this.findById(boardId);
    if (!board) {
      throw new Error('board not found');
    }

    const votes = await this.getBoardVotes(boardId);
    if (votes.length === 0) {
      return { consensus_reached: false };
    }

    // Calculate votes per itinerary
    const voteCounts = new Map<string, { upvotes: number; downvotes: number; total: number }>();
    votes.forEach(vote => {
      if (!voteCounts.has(vote.itinerary_id)) {
        voteCounts.set(vote.itinerary_id, { upvotes: 0, downvotes: 0, total: 0 });
      }
      const counts = voteCounts.get(vote.itinerary_id)!;
      if (vote.vote_type === 'upvote') counts.upvotes += vote.weight;
      if (vote.vote_type === 'downvote') counts.downvotes += vote.weight;
      counts.total += vote.weight;
    });

    // Find winning itinerary
    let winningId: string | undefined;
    let highestScore = 0;

    voteCounts.forEach((counts, itineraryId) => {
      const score = counts.total > 0 ? counts.upvotes / counts.total : 0;
      if (score >= board.consensus_threshold && score > highestScore) {
        highestScore = score;
        winningId = itineraryId;
      }
    });

    return {
      consensus_reached: !!winningId,
      winning_option_id: winningId
    };
  }

  /**
   * Get board summary with statistics
   */
  async getBoardSummary(boardId: string, totalMembers: number): Promise<BoardSummary> {
    if (!this.isValidUUID(boardId)) {
      throw new Error('board ID must be a valid UUID');
    }

    const board = await this.findById(boardId);
    if (!board) {
      throw new Error('board not found');
    }

    const votes = await this.getBoardVotes(boardId);
    const uniqueVoters = new Set(votes.map(v => v.user_id));
    const consensus = await this.checkConsensus(boardId);

    return {
      board,
      total_votes: votes.length,
      consensus_reached: consensus.consensus_reached,
      top_itinerary: consensus.winning_option_id,
      participation_rate: totalMembers > 0 ? uniqueVoters.size / totalMembers : 0
    };
  }

  /**
   * Update board
   */
  async update(id: string, updates: Partial<GroupBoard>): Promise<GroupBoard> {
    if (!this.isValidUUID(id)) {
      throw new Error('board ID must be a valid UUID');
    }

    const board = this.boards.get(id);
    if (!board) {
      throw new Error('board not found');
    }

    Object.assign(board, updates, { updated_at: new Date() });
    this.boards.set(id, board);
    return board;
  }

  /**
   * Delete board
   */
  async delete(id: string): Promise<void> {
    if (!this.isValidUUID(id)) {
      throw new Error('board ID must be a valid UUID');
    }
    this.boards.delete(id);

    // Delete associated votes
    const votesToDelete = Array.from(this.votes.entries())
      .filter(([_, vote]) => vote.board_id === id)
      .map(([voteId, _]) => voteId);

    votesToDelete.forEach(voteId => this.votes.delete(voteId));
  }

  /**
   * Clear all boards and votes (for testing)
   */
  async clear(): Promise<void> {
    this.boards.clear();
    this.votes.clear();
  }

  /**
   * Generate UUID v4
   */
  private generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Validate UUID format
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}

// Export singleton instance
export const groupBoardModel = new GroupBoardModel();