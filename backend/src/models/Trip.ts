import { z } from 'zod';

// Validation schemas
export const CreateTripSchema = z.object({
  creator_id: z.string().uuid('creator_id must be a valid UUID'),
  title: z.string().min(1, 'title is required').max(255, 'title cannot exceed 255 characters'),
  destination: z.string().min(1, 'destination is required'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start_date must be in YYYY-MM-DD format'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end_date must be in YYYY-MM-DD format'),
  budget_total: z.number().positive('budget must be positive'),
  currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be 3-letter ISO code').default('USD'),
  member_ids: z.array(z.string().uuid('member ID must be a valid UUID')).max(20, 'maximum 20 members per trip')
}).refine(
  (data) => new Date(data.end_date) > new Date(data.start_date),
  { message: 'end_date must be after start_date', path: ['end_date'] }
).refine(
  (data) => data.member_ids.includes(data.creator_id),
  { message: 'creator must be included in member_ids', path: ['member_ids'] }
);

export const UpdateTripSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  destination: z.string().min(1).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  budget_total: z.number().positive().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  member_ids: z.array(z.string().uuid()).max(20).optional()
}).refine(
  (data) => {
    if (data.start_date && data.end_date) {
      return new Date(data.end_date) > new Date(data.start_date);
    }
    return true;
  },
  { message: 'end_date must be after start_date', path: ['end_date'] }
);

// Type definitions
export type TripStatus = 'planning' | 'booked' | 'completed' | 'cancelled';
export type CreateTripInput = z.infer<typeof CreateTripSchema>;
export type UpdateTripInput = z.infer<typeof UpdateTripSchema>;

export interface Trip {
  id: string;
  creator_id: string;
  title: string;
  destination: string;
  start_date: Date;
  end_date: Date;
  budget_total: number;
  currency: string;
  status: TripStatus;
  member_ids: string[];
  created_at: Date;
  updated_at: Date;
}

export interface TripSummary {
  id: string;
  title: string;
  destination: string;
  start_date: Date;
  end_date: Date;
  status: TripStatus;
  member_count: number;
}

export class TripModel {
  private trips: Map<string, Trip> = new Map();

  /**
   * Create a new trip with validation
   */
  async create(tripData: CreateTripInput): Promise<Trip> {
    // Validate input
    const validatedData = CreateTripSchema.parse(tripData);

    // Additional business validation
    await this.validateDates(validatedData.start_date, validatedData.end_date);
    await this.validateMemberIds(validatedData.member_ids);

    // Create trip
    const trip: Trip = {
      id: this.generateId(),
      creator_id: validatedData.creator_id,
      title: validatedData.title.trim(),
      destination: validatedData.destination.trim(),
      start_date: new Date(validatedData.start_date),
      end_date: new Date(validatedData.end_date),
      budget_total: validatedData.budget_total,
      currency: validatedData.currency.toUpperCase(),
      status: 'planning',
      member_ids: [...new Set(validatedData.member_ids)], // Remove duplicates
      created_at: new Date(),
      updated_at: new Date()
    };

    this.trips.set(trip.id, trip);
    return trip;
  }

  /**
   * Find trip by ID
   */
  async findById(id: string): Promise<Trip | null> {
    if (!this.isValidUUID(id)) {
      throw new Error('trip ID must be a valid UUID');
    }

    return this.trips.get(id) || null;
  }

  /**
   * Update trip
   */
  async update(id: string, updateData: UpdateTripInput): Promise<Trip> {
    if (!this.isValidUUID(id)) {
      throw new Error('trip ID must be a valid UUID');
    }

    const trip = this.trips.get(id);
    if (!trip) {
      throw new Error('trip not found');
    }

    // Validate status transitions
    if (trip.status === 'completed' || trip.status === 'cancelled') {
      throw new Error('cannot update completed or cancelled trips');
    }

    // Validate input
    const validatedData = UpdateTripSchema.parse(updateData);

    // Validate dates if provided
    const newStartDate = validatedData.start_date ?? trip.start_date.toISOString().split('T')[0];
    const newEndDate = validatedData.end_date ?? trip.end_date.toISOString().split('T')[0];

    if (newStartDate && newEndDate) {
      await this.validateDates(newStartDate, newEndDate);
    }

    // Validate member IDs if provided
    if (validatedData.member_ids) {
      await this.validateMemberIds(validatedData.member_ids);

      // Ensure creator remains a member
      if (!validatedData.member_ids.includes(trip.creator_id)) {
        throw new Error('creator must remain a member of the trip');
      }
    }

    // Update fields
    if (validatedData.title !== undefined) {
      trip.title = validatedData.title.trim();
    }
    if (validatedData.destination !== undefined) {
      trip.destination = validatedData.destination.trim();
    }
    if (validatedData.start_date !== undefined) {
      trip.start_date = new Date(validatedData.start_date);
    }
    if (validatedData.end_date !== undefined) {
      trip.end_date = new Date(validatedData.end_date);
    }
    if (validatedData.budget_total !== undefined) {
      trip.budget_total = validatedData.budget_total;
    }
    if (validatedData.currency !== undefined) {
      trip.currency = validatedData.currency.toUpperCase();
    }
    if (validatedData.member_ids !== undefined) {
      trip.member_ids = [...new Set(validatedData.member_ids)]; // Remove duplicates
    }

    trip.updated_at = new Date();
    this.trips.set(id, trip);

    return trip;
  }

  /**
   * Change trip status with validation
   */
  async updateStatus(id: string, newStatus: TripStatus): Promise<Trip> {
    if (!this.isValidUUID(id)) {
      throw new Error('trip ID must be a valid UUID');
    }

    const trip = this.trips.get(id);
    if (!trip) {
      throw new Error('trip not found');
    }

    // Validate status transitions
    this.validateStatusTransition(trip.status, newStatus);

    trip.status = newStatus;
    trip.updated_at = new Date();
    this.trips.set(id, trip);

    return trip;
  }

  /**
   * Add member to trip
   */
  async addMember(tripId: string, userId: string): Promise<Trip> {
    if (!this.isValidUUID(tripId)) {
      throw new Error('trip ID must be a valid UUID');
    }
    if (!this.isValidUUID(userId)) {
      throw new Error('user ID must be a valid UUID');
    }

    const trip = this.trips.get(tripId);
    if (!trip) {
      throw new Error('trip not found');
    }

    if (trip.status !== 'planning') {
      throw new Error('can only add members to trips in planning status');
    }

    if (trip.member_ids.includes(userId)) {
      throw new Error('user is already a member of this trip');
    }

    if (trip.member_ids.length >= 20) {
      throw new Error('trip has reached maximum member limit');
    }

    trip.member_ids.push(userId);
    trip.updated_at = new Date();
    this.trips.set(tripId, trip);

    return trip;
  }

  /**
   * Remove member from trip
   */
  async removeMember(tripId: string, userId: string): Promise<Trip> {
    if (!this.isValidUUID(tripId)) {
      throw new Error('trip ID must be a valid UUID');
    }
    if (!this.isValidUUID(userId)) {
      throw new Error('user ID must be a valid UUID');
    }

    const trip = this.trips.get(tripId);
    if (!trip) {
      throw new Error('trip not found');
    }

    if (trip.status !== 'planning') {
      throw new Error('can only remove members from trips in planning status');
    }

    if (trip.creator_id === userId) {
      throw new Error('cannot remove trip creator');
    }

    const memberIndex = trip.member_ids.indexOf(userId);
    if (memberIndex === -1) {
      throw new Error('user is not a member of this trip');
    }

    trip.member_ids.splice(memberIndex, 1);
    trip.updated_at = new Date();
    this.trips.set(tripId, trip);

    return trip;
  }

  /**
   * Find trips by creator
   */
  async findByCreator(creatorId: string): Promise<Trip[]> {
    if (!this.isValidUUID(creatorId)) {
      throw new Error('creator ID must be a valid UUID');
    }

    return Array.from(this.trips.values()).filter(trip => trip.creator_id === creatorId);
  }

  /**
   * Find trips by member
   */
  async findByMember(memberId: string): Promise<Trip[]> {
    if (!this.isValidUUID(memberId)) {
      throw new Error('member ID must be a valid UUID');
    }

    return Array.from(this.trips.values()).filter(trip => trip.member_ids.includes(memberId));
  }

  /**
   * Find trips by status
   */
  async findByStatus(status: TripStatus): Promise<Trip[]> {
    return Array.from(this.trips.values()).filter(trip => trip.status === status);
  }

  /**
   * Get trip summary
   */
  toSummary(trip: Trip): TripSummary {
    return {
      id: trip.id,
      title: trip.title,
      destination: trip.destination,
      start_date: trip.start_date,
      end_date: trip.end_date,
      status: trip.status,
      member_count: trip.member_ids.length
    };
  }

  /**
   * Check if user is member of trip
   */
  async isMember(tripId: string, userId: string): Promise<boolean> {
    const trip = await this.findById(tripId);
    if (!trip) {
      return false;
    }
    return trip.member_ids.includes(userId);
  }

  /**
   * Check if user is creator of trip
   */
  async isCreator(tripId: string, userId: string): Promise<boolean> {
    const trip = await this.findById(tripId);
    if (!trip) {
      return false;
    }
    return trip.creator_id === userId;
  }

  /**
   * Get total trip count
   */
  async count(): Promise<number> {
    return this.trips.size;
  }

  /**
   * Validate status transitions
   */
  private validateStatusTransition(currentStatus: TripStatus, newStatus: TripStatus): void {
    const validTransitions: Record<TripStatus, TripStatus[]> = {
      planning: ['booked', 'cancelled'],
      booked: ['completed', 'cancelled'],
      completed: [], // No transitions from completed
      cancelled: []  // No transitions from cancelled
    };

    if (!validTransitions[currentStatus].includes(newStatus)) {
      throw new Error(`invalid status transition from ${currentStatus} to ${newStatus}`);
    }
  }

  /**
   * Validate dates are in the future and reasonable
   */
  private async validateDates(startDate: string, endDate: string): Promise<void> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();
    const maxFutureDate = new Date(now.getTime() + (10 * 365 * 24 * 60 * 60 * 1000)); // 10 years

    // Check if dates are valid
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('invalid date format');
    }

    // Check if start date is not too far in the past (allow some flexibility for testing)
    const minPastDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago
    if (start < minPastDate) {
      throw new Error('start date cannot be more than 30 days in the past');
    }

    // Check if dates are not too far in the future
    if (start > maxFutureDate || end > maxFutureDate) {
      throw new Error('dates cannot be more than 10 years in the future');
    }

    // Check trip duration is reasonable
    const durationDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    if (durationDays > 365) {
      throw new Error('trip duration cannot exceed 365 days');
    }
  }

  /**
   * Validate member IDs are unique
   */
  private async validateMemberIds(memberIds: string[]): Promise<void> {
    const uniqueIds = new Set(memberIds);
    if (uniqueIds.size !== memberIds.length) {
      throw new Error('duplicate member IDs not allowed');
    }

    // Validate all are UUIDs
    for (const id of memberIds) {
      if (!this.isValidUUID(id)) {
        throw new Error(`invalid member ID format: ${id}`);
      }
    }
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

  /**
   * Clear all trips (for testing)
   */
  async clear(): Promise<void> {
    this.trips.clear();
  }
}

// Export singleton instance
export const tripModel = new TripModel();