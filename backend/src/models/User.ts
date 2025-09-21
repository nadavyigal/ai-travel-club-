import bcrypt from 'bcryptjs';
import { z } from 'zod';

// Validation schemas
export const LoyaltyProgramSchema = z.object({
  provider: z.enum([
    'Delta', 'American', 'United', 'Southwest', 'Alaska',
    'Marriott', 'Hilton', 'Hyatt', 'IHG', 'Choice',
    'Hertz', 'Avis', 'Enterprise', 'Budget'
  ]),
  account_id: z.string().min(1, 'account_id cannot be empty')
});

export const UserProfileSchema = z.object({
  budget_range: z.enum(['budget', 'mid-range', 'luxury']).optional(),
  travel_style: z.enum(['adventure', 'relaxation', 'cultural', 'business']).optional(),
  dietary_restrictions: z.array(z.string()).optional()
});

export const CreateUserSchema = z.object({
  email: z.string().email('invalid email format').min(1, 'email is required'),
  password: z.string()
    .min(8, 'password must be at least 8 characters')
    .regex(/[A-Z]/, 'password must contain uppercase letters')
    .regex(/[a-z]/, 'password must contain lowercase letters')
    .regex(/\d/, 'password must contain numbers')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'password must contain symbols'),
  profile: UserProfileSchema.optional(),
  loyalty_programs: z.array(LoyaltyProgramSchema).optional()
});

export const UpdateUserProfileSchema = z.object({
  profile: UserProfileSchema.optional(),
  loyalty_programs: z.array(LoyaltyProgramSchema).optional()
}).refine(
  (data) => data.profile !== undefined || data.loyalty_programs !== undefined,
  { message: 'no valid fields to update' }
);

// Type definitions
export type LoyaltyProgram = z.infer<typeof LoyaltyProgramSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserProfileInput = z.infer<typeof UpdateUserProfileSchema>;

export interface User {
  id: string;
  email: string;
  password_hash: string;
  profile: UserProfile | null;
  loyalty_programs: LoyaltyProgram[];
  created_at: Date;
  updated_at: Date;
}

export interface UserPublic {
  id: string;
  email: string;
  profile: UserProfile | null;
  loyalty_programs: LoyaltyProgram[];
  created_at: Date;
}

export class UserModel {
  private users: Map<string, User> = new Map();

  /**
   * Create a new user with validation
   */
  async create(userData: CreateUserInput): Promise<User> {
    // Validate input
    const validatedData = CreateUserSchema.parse(userData);

    // Check for duplicate email (case-insensitive)
    const normalizedEmail = validatedData.email.toLowerCase().trim();
    const existingUser = Array.from(this.users.values()).find(
      user => user.email.toLowerCase() === normalizedEmail
    );

    if (existingUser) {
      throw new Error('email already exists');
    }

    // Validate password strength (additional checks beyond schema)
    await this.validatePasswordStrength(validatedData.password);

    // Validate loyalty programs don't have duplicates
    if (validatedData.loyalty_programs) {
      const providers = validatedData.loyalty_programs.map(lp => lp.provider);
      const uniqueProviders = new Set(providers);
      if (providers.length !== uniqueProviders.size) {
        throw new Error('duplicate loyalty program provider');
      }
    }

    // Hash password
    const password_hash = await bcrypt.hash(validatedData.password, 12);

    // Create user
    const user: User = {
      id: this.generateId(),
      email: normalizedEmail,
      password_hash,
      profile: validatedData.profile || null,
      loyalty_programs: validatedData.loyalty_programs || [],
      created_at: new Date(),
      updated_at: new Date()
    };

    this.users.set(user.id, user);
    return user;
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    if (!this.isValidUUID(id)) {
      throw new Error('user ID must be a valid UUID');
    }

    return this.users.get(id) || null;
  }

  /**
   * Find user by email (case-insensitive)
   */
  async findByEmail(email: string): Promise<User | null> {
    if (!email || typeof email !== 'string') {
      throw new Error('email is required');
    }

    const normalizedEmail = email.toLowerCase().trim();
    return Array.from(this.users.values()).find(
      user => user.email.toLowerCase() === normalizedEmail
    ) || null;
  }

  /**
   * Update user profile
   */
  async updateProfile(id: string, updateData: UpdateUserProfileInput): Promise<User> {
    if (!this.isValidUUID(id)) {
      throw new Error('user ID must be a valid UUID');
    }

    // Validate input
    const validatedData = UpdateUserProfileSchema.parse(updateData);

    const user = this.users.get(id);
    if (!user) {
      throw new Error('user not found');
    }

    // Validate loyalty programs don't have duplicates
    if (validatedData.loyalty_programs) {
      const providers = validatedData.loyalty_programs.map(lp => lp.provider);
      const uniqueProviders = new Set(providers);
      if (providers.length !== uniqueProviders.size) {
        throw new Error('duplicate loyalty program provider');
      }
    }

    // Update fields
    if (validatedData.profile !== undefined) {
      user.profile = validatedData.profile;
    }

    if (validatedData.loyalty_programs !== undefined) {
      user.loyalty_programs = validatedData.loyalty_programs;
    }

    user.updated_at = new Date();
    this.users.set(id, user);

    return user;
  }

  /**
   * Verify user password
   */
  async verifyPassword(user: User, password: string): Promise<boolean> {
    if (!password || typeof password !== 'string') {
      return false;
    }

    try {
      return await bcrypt.compare(password, user.password_hash);
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  }

  /**
   * Convert user to public format (remove sensitive fields)
   */
  toPublic(user: User): UserPublic {
    return {
      id: user.id,
      email: user.email,
      profile: user.profile,
      loyalty_programs: user.loyalty_programs,
      created_at: user.created_at
    };
  }

  /**
   * Check if user exists
   */
  async exists(id: string): Promise<boolean> {
    if (!this.isValidUUID(id)) {
      return false;
    }
    return this.users.has(id);
  }

  /**
   * Get total user count
   */
  async count(): Promise<number> {
    return this.users.size;
  }

  /**
   * Validate password strength beyond basic requirements
   */
  private async validatePasswordStrength(password: string): Promise<void> {
    const commonPasswords = [
      'password123!', 'Password123', '12345678!', 'qwerty123!',
      'password', 'admin123!', 'welcome123!', 'letmein123!'
    ];

    if (commonPasswords.includes(password)) {
      throw new Error('password is too common and weak');
    }

    // Check for repeated characters
    if (/(.)\1{2,}/.test(password)) {
      throw new Error('password contains too many repeated characters');
    }

    // Check for keyboard patterns
    const keyboardPatterns = ['123456', 'qwerty', 'asdfgh', 'zxcvbn'];
    for (const pattern of keyboardPatterns) {
      if (password.toLowerCase().includes(pattern)) {
        throw new Error('password contains keyboard patterns');
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
   * Clear all users (for testing)
   */
  async clear(): Promise<void> {
    this.users.clear();
  }
}

// Export singleton instance
export const userModel = new UserModel();