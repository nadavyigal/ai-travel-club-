import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { redisClient } from '../config/database';
import { createClient as createRedisClient } from 'redis';

/**
 * Real-time service using Socket.IO and Redis Pub/Sub
 * Handles group board updates, voting, and consensus events
 */
export class RealtimeService {
  private io: SocketIOServer | null = null;
  private redisPublisher: ReturnType<typeof createRedisClient> | null = null;
  private redisSubscriber: ReturnType<typeof createRedisClient> | null = null;
  private static instance: RealtimeService;

  private constructor() {}

  static getInstance(): RealtimeService {
    if (!RealtimeService.instance) {
      RealtimeService.instance = new RealtimeService();
    }
    return RealtimeService.instance;
  }

  /**
   * Initialize WebSocket server and Redis Pub/Sub
   */
  async initialize(httpServer: HTTPServer): Promise<void> {
    // Initialize Socket.IO
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.NODE_ENV === 'production'
          ? ['https://your-domain.com']
          : [
              'http://localhost:3000',
              'http://localhost:3001',
              'http://localhost:3002',
              'http://localhost:3003',
              'http://localhost:3004',
              'http://localhost:3005',
              'http://localhost:3006'
            ],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    // Setup Socket.IO event handlers
    this.io.on('connection', (socket: Socket) => {
      console.log(`✅ Client connected: ${socket.id}`);

      // Join board room
      socket.on('join:board', (boardId: string) => {
        socket.join(`board:${boardId}`);
        console.log(`Client ${socket.id} joined board ${boardId}`);
        socket.emit('joined:board', { boardId, timestamp: new Date().toISOString() });
      });

      // Leave board room
      socket.on('leave:board', (boardId: string) => {
        socket.leave(`board:${boardId}`);
        console.log(`Client ${socket.id} left board ${boardId}`);
      });

      socket.on('disconnect', () => {
        console.log(`❌ Client disconnected: ${socket.id}`);
      });

      socket.on('error', (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
      });
    });

    // Initialize Redis Pub/Sub for distributed events (optional)
    // Only attempt if REDIS_URL is explicitly configured
    if (process.env.REDIS_URL && process.env.REDIS_URL !== 'redis://localhost:6379') {
      try {
        this.redisPublisher = createRedisClient({
          url: process.env.REDIS_URL
        });
        this.redisSubscriber = createRedisClient({
          url: process.env.REDIS_URL
        });

        await this.redisPublisher.connect();
        await this.redisSubscriber.connect();

        // Subscribe to board events
        await this.redisSubscriber.subscribe('board:events', (message) => {
          try {
            const event = JSON.parse(message);
            this.handleBoardEvent(event);
          } catch (error) {
            console.error('Error handling board event:', error);
          }
        });

        console.log('✅ Redis Pub/Sub initialized for real-time events');
      } catch (error) {
        console.warn('⚠️  Redis Pub/Sub initialization failed (using local-only mode)');
        // Continue without Redis - events will only work within single server instance
      }
    } else {
      console.log('ℹ️  Redis not configured - using local-only mode for real-time events');
    }
  }

  /**
   * Publish board event (vote, consensus, creation)
   */
  async publishBoardEvent(event: BoardEvent): Promise<void> {
    const eventData = {
      ...event,
      timestamp: new Date().toISOString()
    };

    // Emit locally
    this.emitToBoard(event.boardId, event.type, eventData);

    // Publish to Redis for distributed systems
    if (this.redisPublisher) {
      try {
        await this.redisPublisher.publish('board:events', JSON.stringify(eventData));
      } catch (error) {
        console.error('Error publishing to Redis:', error);
      }
    }

    // Log event
    console.log(`📡 Board event: ${event.type} for board ${event.boardId}`);
  }

  /**
   * Handle board event from Redis
   */
  private handleBoardEvent(event: BoardEvent): void {
    this.emitToBoard(event.boardId, event.type, event);
  }

  /**
   * Emit event to all clients in a board room
   */
  private emitToBoard(boardId: string, eventType: string, data: any): void {
    if (this.io) {
      this.io.to(`board:${boardId}`).emit(eventType, data);
    }
  }

  /**
   * Notify vote cast
   */
  async notifyVoteCast(boardId: string, voteData: VoteData): Promise<void> {
    await this.publishBoardEvent({
      type: 'vote:cast',
      boardId,
      data: voteData
    });
  }

  /**
   * Notify consensus reached
   */
  async notifyConsensusReached(boardId: string, consensusData: ConsensusData): Promise<void> {
    await this.publishBoardEvent({
      type: 'consensus:reached',
      boardId,
      data: consensusData
    });
  }

  /**
   * Notify board created
   */
  async notifyBoardCreated(boardId: string, boardData: any): Promise<void> {
    await this.publishBoardEvent({
      type: 'board:created',
      boardId,
      data: boardData
    });
  }

  /**
   * Notify board updated
   */
  async notifyBoardUpdated(boardId: string, updateData: any): Promise<void> {
    await this.publishBoardEvent({
      type: 'board:updated',
      boardId,
      data: updateData
    });
  }

  /**
   * Get connected clients count for a board
   */
  getConnectedClientsCount(boardId: string): number {
    if (!this.io) return 0;
    const room = this.io.sockets.adapter.rooms.get(`board:${boardId}`);
    return room ? room.size : 0;
  }

  /**
   * Get all connected boards
   */
  getConnectedBoards(): string[] {
    if (!this.io) return [];
    const boards: string[] = [];
    this.io.sockets.adapter.rooms.forEach((_, roomName) => {
      if (roomName.startsWith('board:')) {
        boards.push(roomName.replace('board:', ''));
      }
    });
    return boards;
  }

  /**
   * Shutdown service
   */
  async shutdown(): Promise<void> {
    if (this.io) {
      this.io.close();
      console.log('✅ Socket.IO server closed');
    }

    if (this.redisPublisher) {
      await this.redisPublisher.quit();
      console.log('✅ Redis publisher closed');
    }

    if (this.redisSubscriber) {
      await this.redisSubscriber.unsubscribe('board:events');
      await this.redisSubscriber.quit();
      console.log('✅ Redis subscriber closed');
    }
  }
}

// Types
export interface BoardEvent {
  type: 'vote:cast' | 'consensus:reached' | 'board:created' | 'board:updated';
  boardId: string;
  data: any;
  timestamp?: string;
}

export interface VoteData {
  voteId: string;
  userId: string;
  itineraryId: string;
  voteType: 'upvote' | 'downvote' | 'abstain';
  totalVotes: number;
  consensusProgress: number;
}

export interface ConsensusData {
  winningItineraryId: string;
  consensusThreshold: number;
  finalVoteCount: number;
  winningPercentage: number;
}

// Export singleton instance
export const realtimeService = RealtimeService.getInstance();