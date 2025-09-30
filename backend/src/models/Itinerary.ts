import { z } from 'zod';

// Validation schemas
export const CreateItinerarySchema = z.object({
  trip_id: z.string().uuid('trip_id must be a valid UUID'),
  generated_by: z.string().default('ai'),
  activities: z.array(z.any()).optional(),
  accommodation_recommendations: z.array(z.any()).optional(),
  transportation_recommendations: z.array(z.any()).optional(),
  metadata: z.any().optional()
});

export type CreateItineraryInput = z.infer<typeof CreateItinerarySchema>;

export interface Itinerary {
  id: string;
  trip_id: string;
  title?: string;
  description?: string;
  generated_by: string;
  activities: Activity[];
  accommodation_recommendations: AccommodationRecommendation[];
  transportation_recommendations: TransportationRecommendation[];
  total_estimated_cost: number;
  metadata?: any;
  created_at: Date;
  updated_at: Date;
}

export interface Activity {
  id?: string;
  name: string;
  description?: string;
  estimated_cost: number;
  duration?: number;
  location?: string;
  start_time?: string;
  end_time?: string;
}

export interface AccommodationRecommendation {
  id?: string;
  name: string;
  type: string;
  estimated_cost_per_night?: number;
  estimated_cost: number;
  location: string;
  rating?: number;
}

export interface TransportationRecommendation {
  id?: string;
  mode?: string;
  type: string;
  from: string;
  to: string;
  estimated_cost: number;
  duration?: number;
}

export class ItineraryModel {
  private itineraries: Map<string, Itinerary> = new Map();

  /**
   * Create a new itinerary
   */
  async create(input: CreateItineraryInput): Promise<Itinerary> {
    const validatedData = CreateItinerarySchema.parse(input);

    const activities = validatedData.activities || [];
    const accommodations = validatedData.accommodation_recommendations || [];
    const transportation = validatedData.transportation_recommendations || [];

    // Calculate total cost
    const activityCost = activities.reduce((sum: number, act: any) => sum + (act.estimated_cost || 0), 0);
    const accommodationCost = accommodations.reduce((sum: number, acc: any) => sum + (acc.estimated_cost || acc.estimated_cost_per_night || 0), 0);
    const transportationCost = transportation.reduce((sum: number, trans: any) => sum + (trans.estimated_cost || 0), 0);
    const totalCost = activityCost + accommodationCost + transportationCost;

    const itinerary: Itinerary = {
      id: this.generateId(),
      trip_id: validatedData.trip_id,
      generated_by: validatedData.generated_by,
      activities: activities as Activity[],
      accommodation_recommendations: accommodations as AccommodationRecommendation[],
      transportation_recommendations: transportation as TransportationRecommendation[],
      total_estimated_cost: totalCost,
      metadata: validatedData.metadata,
      created_at: new Date(),
      updated_at: new Date()
    };

    this.itineraries.set(itinerary.id, itinerary);
    return itinerary;
  }

  /**
   * Find itinerary by ID
   */
  async findById(id: string): Promise<Itinerary | null> {
    if (!this.isValidUUID(id)) {
      throw new Error('itinerary ID must be a valid UUID');
    }
    return this.itineraries.get(id) || null;
  }

  /**
   * Find all itineraries for a trip
   */
  async findByTripId(tripId: string): Promise<Itinerary[]> {
    if (!this.isValidUUID(tripId)) {
      throw new Error('trip ID must be a valid UUID');
    }
    return Array.from(this.itineraries.values()).filter(itin => itin.trip_id === tripId);
  }

  /**
   * Update itinerary
   */
  async update(id: string, updates: Partial<CreateItineraryInput>): Promise<Itinerary> {
    if (!this.isValidUUID(id)) {
      throw new Error('itinerary ID must be a valid UUID');
    }

    const itinerary = this.itineraries.get(id);
    if (!itinerary) {
      throw new Error('itinerary not found');
    }

    if (updates.activities !== undefined) {
      itinerary.activities = updates.activities as Activity[];
    }
    if (updates.accommodation_recommendations !== undefined) {
      itinerary.accommodation_recommendations = updates.accommodation_recommendations as AccommodationRecommendation[];
    }
    if (updates.transportation_recommendations !== undefined) {
      itinerary.transportation_recommendations = updates.transportation_recommendations as TransportationRecommendation[];
    }
    if (updates.metadata !== undefined) {
      itinerary.metadata = updates.metadata;
    }

    // Recalculate total cost
    const activityCost = itinerary.activities.reduce((sum, act) => sum + (act.estimated_cost || 0), 0);
    const accommodationCost = itinerary.accommodation_recommendations.reduce((sum, acc) => sum + (acc.estimated_cost || 0), 0);
    const transportationCost = itinerary.transportation_recommendations.reduce((sum, trans) => sum + (trans.estimated_cost || 0), 0);
    itinerary.total_estimated_cost = activityCost + accommodationCost + transportationCost;

    itinerary.updated_at = new Date();
    this.itineraries.set(id, itinerary);

    return itinerary;
  }

  /**
   * Delete itinerary
   */
  async delete(id: string): Promise<void> {
    if (!this.isValidUUID(id)) {
      throw new Error('itinerary ID must be a valid UUID');
    }
    this.itineraries.delete(id);
  }

  /**
   * Clear all itineraries (for testing)
   */
  async clear(): Promise<void> {
    this.itineraries.clear();
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
export const itineraryModel = new ItineraryModel();