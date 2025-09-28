import { Router } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

// GET /api/v1/destinations - Get all destinations
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('destinations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch destinations',
        details: error.message
      });
    }

    return res.json({
      success: true,
      data,
      count: data?.length || 0
    });
  } catch (err) {
    console.error('Error fetching destinations:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET /api/v1/destinations/:id - Get destination by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('destinations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Destination not found'
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to fetch destination',
        details: error.message
      });
    }

    return res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('Error fetching destination:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;