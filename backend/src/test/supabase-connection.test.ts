import { supabase } from '../config/supabase';

describe('Supabase Connection Test', () => {
  test('should connect to Supabase and fetch destinations', async () => {
    const { data, error } = await supabase
      .from('destinations')
      .select('*')
      .limit(5);

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(Array.isArray(data)).toBe(true);

    if (data && data.length > 0) {
      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('name');
      expect(data[0]).toHaveProperty('country');
    }
  });

  test('should verify table structure', async () => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .limit(1);

    expect(error).toBeNull();
    expect(data).toBeDefined();
  });

  test('should verify RLS is working', async () => {
    // This should fail because we're not authenticated
    const { data, error } = await supabase
      .from('trips')
      .select('*');

    // RLS should prevent unauthorized access
    expect(data).toEqual([]);
  });
});