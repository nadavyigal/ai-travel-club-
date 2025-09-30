import { ITripRepository } from './ITripRepository';
import { Trip, CreateTripInput, UpdateTripInput, TripStatus, CreateTripSchema, UpdateTripSchema } from '../models/Trip';

/**
 * In-memory implementation of Trip repository (for testing and fallback)
 */
export class InMemoryTripRepository implements ITripRepository {
  private trips: Map<string, Trip> = new Map();

  async create(tripData: CreateTripInput): Promise<Trip> {
    // Validate input
    const validatedData = CreateTripSchema.parse(tripData);

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

  async findById(id: string): Promise<Trip | null> {
    if (!this.isValidUUID(id)) {
      throw new Error('trip ID must be a valid UUID');
    }
    return this.trips.get(id) || null;
  }

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

  async updateStatus(id: string, newStatus: TripStatus): Promise<Trip> {
    if (!this.isValidUUID(id)) {
      throw new Error('trip ID must be a valid UUID');
    }

    const trip = this.trips.get(id);
    if (!trip) {
      throw new Error('trip not found');
    }

    // Validate status transitions
    const validTransitions: Record<TripStatus, TripStatus[]> = {
      planning: ['booked', 'cancelled'],
      booked: ['completed', 'cancelled'],
      completed: [],
      cancelled: []
    };

    if (!validTransitions[trip.status].includes(newStatus)) {
      throw new Error(`invalid status transition from ${trip.status} to ${newStatus}`);
    }

    trip.status = newStatus;
    trip.updated_at = new Date();
    this.trips.set(id, trip);

    return trip;
  }

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

  async findByCreator(creatorId: string): Promise<Trip[]> {
    if (!this.isValidUUID(creatorId)) {
      throw new Error('creator ID must be a valid UUID');
    }
    return Array.from(this.trips.values()).filter(trip => trip.creator_id === creatorId);
  }

  async findByMember(memberId: string): Promise<Trip[]> {
    if (!this.isValidUUID(memberId)) {
      throw new Error('member ID must be a valid UUID');
    }
    return Array.from(this.trips.values()).filter(trip => trip.member_ids.includes(memberId));
  }

  async findByStatus(status: TripStatus): Promise<Trip[]> {
    return Array.from(this.trips.values()).filter(trip => trip.status === status);
  }

  async isMember(tripId: string, userId: string): Promise<boolean> {
    const trip = await this.findById(tripId);
    if (!trip) {
      return false;
    }
    return trip.member_ids.includes(userId);
  }

  async isCreator(tripId: string, userId: string): Promise<boolean> {
    const trip = await this.findById(tripId);
    if (!trip) {
      return false;
    }
    return trip.creator_id === userId;
  }

  async count(): Promise<number> {
    return this.trips.size;
  }

  async clear(): Promise<void> {
    this.trips.clear();
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