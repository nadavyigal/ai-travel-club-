import { redisClient } from '../config/database';

/**
 * Job queue for background tasks (auto-rebooking, notifications, etc.)
 * Uses Redis if available, falls back to in-memory queue
 */
export class JobQueue {
  private inMemoryQueue: Map<string, Job[]> = new Map();
  private useRedis: boolean = false;
  private processing: boolean = false;
  private static instance: JobQueue;

  private constructor() {}

  static getInstance(): JobQueue {
    if (!JobQueue.instance) {
      JobQueue.instance = new JobQueue();
    }
    return JobQueue.instance;
  }

  /**
   * Initialize job queue
   */
  async initialize(): Promise<void> {
    try {
      // Try to use Redis
      await redisClient.ping();
      this.useRedis = true;
      console.log('✅ Job queue using Redis');
    } catch (error) {
      console.log('⚠️  Job queue using in-memory storage (Redis unavailable)');
      this.useRedis = false;
    }

    // Start processing jobs
    this.startProcessing();
  }

  /**
   * Enqueue a job
   */
  async enqueue(jobType: string, data: any, options?: JobOptions): Promise<string> {
    const job: Job = {
      id: this.generateJobId(),
      type: jobType,
      data,
      status: 'pending',
      attempts: 0,
      maxAttempts: options?.maxAttempts || 3,
      createdAt: new Date().toISOString(),
      scheduledFor: options?.delay ? new Date(Date.now() + options.delay).toISOString() : new Date().toISOString()
    };

    if (this.useRedis) {
      try {
        await redisClient.lPush(`queue:${jobType}`, JSON.stringify(job));
      } catch (error) {
        console.error('Error enqueuing job to Redis:', error);
        // Fallback to in-memory
        this.enqueueInMemory(jobType, job);
      }
    } else {
      this.enqueueInMemory(jobType, job);
    }

    console.log(`📋 Job enqueued: ${job.type} (${job.id})`);
    return job.id;
  }

  /**
   * Enqueue auto-rebook job
   */
  async enqueueAutoRebook(bookingId: string, itineraryId: string, tripPassId: string): Promise<string> {
    return this.enqueue('auto-rebook', {
      bookingId,
      itineraryId,
      tripPassId,
      priority: 'high'
    }, {
      maxAttempts: 5
    });
  }

  /**
   * Enqueue notification job
   */
  async enqueueNotification(userId: string, type: string, data: any): Promise<string> {
    return this.enqueue('notification', {
      userId,
      type,
      data
    });
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<Job | null> {
    if (this.useRedis) {
      try {
        // Search through all queues (Redis doesn't support direct ID lookup)
        const queues = await redisClient.keys('queue:*');
        for (const queueKey of queues) {
          const jobs = await redisClient.lRange(queueKey, 0, -1);
          for (const jobStr of jobs) {
            const job = JSON.parse(jobStr);
            if (job.id === jobId) {
              return job;
            }
          }
        }
        return null;
      } catch (error) {
        console.error('Error getting job from Redis:', error);
      }
    }

    // In-memory search
    for (const [_, jobs] of this.inMemoryQueue.entries()) {
      const job = jobs.find(j => j.id === jobId);
      if (job) return job;
    }

    return null;
  }

  /**
   * Get queue stats
   */
  async getStats(): Promise<QueueStats> {
    const stats: QueueStats = {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      byType: {}
    };

    if (this.useRedis) {
      try {
        const queues = await redisClient.keys('queue:*');
        for (const queueKey of queues) {
          const jobs = await redisClient.lRange(queueKey, 0, -1);
          jobs.forEach(jobStr => {
            const job = JSON.parse(jobStr);
            stats.total++;
            if (job.status === 'pending') stats.pending++;
            else if (job.status === 'processing') stats.processing++;
            else if (job.status === 'completed') stats.completed++;
            else if (job.status === 'failed') stats.failed++;
            stats.byType[job.type] = (stats.byType[job.type] || 0) + 1;
          });
        }
      } catch (error) {
        console.error('Error getting stats from Redis:', error);
      }
    } else {
      // In-memory stats
      for (const [type, jobs] of this.inMemoryQueue.entries()) {
        stats.byType[type] = jobs.length;
        jobs.forEach(job => {
          stats.total++;
          if (job.status === 'pending') stats.pending++;
          else if (job.status === 'processing') stats.processing++;
          else if (job.status === 'completed') stats.completed++;
          else if (job.status === 'failed') stats.failed++;
        });
      }
    }

    return stats;
  }

  /**
   * Process jobs (internal worker)
   */
  private async startProcessing(): Promise<void> {
    this.processing = true;

    const processLoop = async () => {
      while (this.processing) {
        try {
          await this.processNextJob();
        } catch (error) {
          console.error('Error processing job:', error);
        }
        // Wait before next iteration
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    };

    processLoop();
  }

  /**
   * Process next job in queue
   */
  private async processNextJob(): Promise<void> {
    let job: Job | null = null;

    if (this.useRedis) {
      try {
        const queues = await redisClient.keys('queue:*');
        for (const queueKey of queues) {
          const jobStr = await redisClient.rPop(queueKey);
          if (jobStr) {
            job = JSON.parse(jobStr);
            break;
          }
        }
      } catch (error) {
        console.error('Error getting job from Redis:', error);
      }
    } else {
      // Get next job from in-memory queue
      for (const [type, jobs] of this.inMemoryQueue.entries()) {
        if (jobs.length > 0) {
          job = jobs.shift() || null;
          if (job) break;
        }
      }
    }

    if (!job) return;

    // Check if job is scheduled for future
    if (new Date(job.scheduledFor) > new Date()) {
      // Re-enqueue for later
      await this.enqueue(job.type, job.data, { delay: 1000 });
      return;
    }

    // Process job
    job.status = 'processing';
    job.attempts++;

    try {
      await this.executeJob(job);
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      console.log(`✅ Job completed: ${job.type} (${job.id})`);
    } catch (error) {
      console.error(`❌ Job failed: ${job.type} (${job.id})`, error);
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';

      // Retry if attempts remaining
      if (job.attempts < job.maxAttempts) {
        job.status = 'pending';
        await this.enqueue(job.type, job.data, { maxAttempts: job.maxAttempts, delay: 5000 });
        console.log(`🔄 Job retry scheduled: ${job.type} (${job.id}), attempt ${job.attempts}/${job.maxAttempts}`);
      }
    }
  }

  /**
   * Execute job based on type
   */
  private async executeJob(job: Job): Promise<void> {
    console.log(`⚙️  Processing job: ${job.type} (${job.id})`);

    switch (job.type) {
      case 'auto-rebook':
        await this.processAutoRebook(job);
        break;
      case 'notification':
        await this.processNotification(job);
        break;
      default:
        console.warn(`Unknown job type: ${job.type}`);
    }
  }

  /**
   * Process auto-rebook job
   */
  private async processAutoRebook(job: Job): Promise<void> {
    const { bookingId, itineraryId, tripPassId } = job.data;

    // Stub implementation - in production would:
    // 1. Check for cancellation/changes
    // 2. Search for alternative bookings
    // 3. Rebook automatically if found
    // 4. Notify user of outcome

    console.log(`🔄 Auto-rebook processing for booking ${bookingId}`);
    console.log(`   Itinerary: ${itineraryId}, Trip Pass: ${tripPassId}`);

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log(`✅ Auto-rebook stub completed for booking ${bookingId}`);
  }

  /**
   * Process notification job
   */
  private async processNotification(job: Job): Promise<void> {
    const { userId, type, data } = job.data;

    // Stub implementation - in production would send actual notifications
    console.log(`📧 Notification sent to user ${userId}: ${type}`);
  }

  /**
   * Enqueue job in memory
   */
  private enqueueInMemory(jobType: string, job: Job): void {
    if (!this.inMemoryQueue.has(jobType)) {
      this.inMemoryQueue.set(jobType, []);
    }
    this.inMemoryQueue.get(jobType)!.push(job);
  }

  /**
   * Generate job ID
   */
  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Stop processing jobs
   */
  async shutdown(): Promise<void> {
    this.processing = false;
    console.log('✅ Job queue stopped');
  }
}

// Types
export interface Job {
  id: string;
  type: string;
  data: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  scheduledFor: string;
  completedAt?: string;
  error?: string;
}

export interface JobOptions {
  maxAttempts?: number;
  delay?: number; // milliseconds
}

export interface QueueStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  byType: Record<string, number>;
}

// Export singleton instance
export const jobQueue = JobQueue.getInstance();