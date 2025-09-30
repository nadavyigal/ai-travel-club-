import { supabaseAdmin } from '../config/supabase';
import { ITripRepository } from './ITripRepository';
import { Trip, CreateTripInput, UpdateTripInput, TripStatus } from '../models/Trip';

/**
 * Supabase implementation of Trip repository
 */
export class SupabaseTripRepository implements ITripRepository {
  private readonly tableName = 'trips';

  async create(tripData: CreateTripInput): Promise<Trip> {
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not initialized');
    }

    const { data, error } = await supabaseAdmin
      .from(this.tableName)
      .insert({
        creator_id: tripData.creator_id,
        title: tripData.title,
        destination: tripData.destination,
        start_date: tripData.start_date,
        end_date: tripData.end_date,
        budget_total: tripData.budget_total,
        currency: tripData.currency,
        status: 'planning',
        member_ids: tripData.member_ids,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create trip: ${error.message}`);
    }

    return this.mapToTrip(data);
  }

  async findById(id: string): Promise<Trip | null> {
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not initialized');
    }

    const { data, error } = await supabaseAdmin
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to find trip: ${error.message}`);
    }

    return this.mapToTrip(data);
  }

  async update(id: string, updateData: UpdateTripInput): Promise<Trip> {
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not initialized');
    }

    const { data, error } = await supabaseAdmin
      .from(this.tableName)
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update trip: ${error.message}`);
    }

    return this.mapToTrip(data);
  }

  async updateStatus(id: string, newStatus: TripStatus): Promise<Trip> {
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not initialized');
    }

    const { data, error } = await supabaseAdmin
      .from(this.tableName)
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update trip status: ${error.message}`);
    }

    return this.mapToTrip(data);
  }

  async addMember(tripId: string, userId: string): Promise<Trip> {
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not initialized');
    }

    // Get current trip
    const trip = await this.findById(tripId);
    if (!trip) {
      throw new Error('trip not found');
    }

    // Add member if not already present
    if (!trip.member_ids.includes(userId)) {
      const updatedMemberIds = [...trip.member_ids, userId];

      const { data, error } = await supabaseAdmin
        .from(this.tableName)
        .update({
          member_ids: updatedMemberIds,
          updated_at: new Date().toISOString()
        })
        .eq('id', tripId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to add member: ${error.message}`);
      }

      return this.mapToTrip(data);
    }

    return trip;
  }

  async removeMember(tripId: string, userId: string): Promise<Trip> {
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not initialized');
    }

    // Get current trip
    const trip = await this.findById(tripId);
    if (!trip) {
      throw new Error('trip not found');
    }

    // Remove member
    const updatedMemberIds = trip.member_ids.filter(id => id !== userId);

    const { data, error } = await supabaseAdmin
      .from(this.tableName)
      .update({
        member_ids: updatedMemberIds,
        updated_at: new Date().toISOString()
      })
      .eq('id', tripId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to remove member: ${error.message}`);
    }

    return this.mapToTrip(data);
  }

  async findByCreator(creatorId: string): Promise<Trip[]> {
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not initialized');
    }

    const { data, error } = await supabaseAdmin
      .from(this.tableName)
      .select('*')
      .eq('creator_id', creatorId);

    if (error) {
      throw new Error(`Failed to find trips by creator: ${error.message}`);
    }

    return data.map(row => this.mapToTrip(row));
  }

  async findByMember(memberId: string): Promise<Trip[]> {
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not initialized');
    }

    const { data, error } = await supabaseAdmin
      .from(this.tableName)
      .select('*')
      .contains('member_ids', [memberId]);

    if (error) {
      throw new Error(`Failed to find trips by member: ${error.message}`);
    }

    return data.map(row => this.mapToTrip(row));
  }

  async findByStatus(status: TripStatus): Promise<Trip[]> {
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not initialized');
    }

    const { data, error } = await supabaseAdmin
      .from(this.tableName)
      .select('*')
      .eq('status', status);

    if (error) {
      throw new Error(`Failed to find trips by status: ${error.message}`);
    }

    return data.map(row => this.mapToTrip(row));
  }

  async isMember(tripId: string, userId: string): Promise<boolean> {
    const trip = await this.findById(tripId);
    return trip ? trip.member_ids.includes(userId) : false;
  }

  async isCreator(tripId: string, userId: string): Promise<boolean> {
    const trip = await this.findById(tripId);
    return trip ? trip.creator_id === userId : false;
  }

  async count(): Promise<number> {
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not initialized');
    }

    const { count, error } = await supabaseAdmin
      .from(this.tableName)
      .select('*', { count: 'exact', head: true });

    if (error) {
      throw new Error(`Failed to count trips: ${error.message}`);
    }

    return count || 0;
  }

  async clear(): Promise<void> {
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not initialized');
    }

    const { error } = await supabaseAdmin
      .from(this.tableName)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (error) {
      throw new Error(`Failed to clear trips: ${error.message}`);
    }
  }

  /**
   * Map database row to Trip model
   */
  private mapToTrip(row: any): Trip {
    return {
      id: row.id,
      creator_id: row.creator_id,
      title: row.title,
      destination: row.destination,
      start_date: new Date(row.start_date),
      end_date: new Date(row.end_date),
      budget_total: parseFloat(row.budget_total),
      currency: row.currency,
      status: row.status as TripStatus,
      member_ids: row.member_ids || [],
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    };
  }
}