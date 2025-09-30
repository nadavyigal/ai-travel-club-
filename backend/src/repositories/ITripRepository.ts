import { Trip, CreateTripInput, UpdateTripInput, TripStatus } from '../models/Trip';

/**
 * Repository interface for Trip operations
 * Allows switching between in-memory and database implementations
 */
export interface ITripRepository {
  /**
   * Create a new trip
   */
  create(tripData: CreateTripInput): Promise<Trip>;

  /**
   * Find trip by ID
   */
  findById(id: string): Promise<Trip | null>;

  /**
   * Update trip
   */
  update(id: string, updateData: UpdateTripInput): Promise<Trip>;

  /**
   * Update trip status
   */
  updateStatus(id: string, newStatus: TripStatus): Promise<Trip>;

  /**
   * Add member to trip
   */
  addMember(tripId: string, userId: string): Promise<Trip>;

  /**
   * Remove member from trip
   */
  removeMember(tripId: string, userId: string): Promise<Trip>;

  /**
   * Find trips by creator
   */
  findByCreator(creatorId: string): Promise<Trip[]>;

  /**
   * Find trips by member
   */
  findByMember(memberId: string): Promise<Trip[]>;

  /**
   * Find trips by status
   */
  findByStatus(status: TripStatus): Promise<Trip[]>;

  /**
   * Check if user is member of trip
   */
  isMember(tripId: string, userId: string): Promise<boolean>;

  /**
   * Check if user is creator of trip
   */
  isCreator(tripId: string, userId: string): Promise<boolean>;

  /**
   * Get total trip count
   */
  count(): Promise<number>;

  /**
   * Clear all trips (for testing)
   */
  clear(): Promise<void>;
}