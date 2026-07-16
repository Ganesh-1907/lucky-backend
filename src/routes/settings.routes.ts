import express from 'express';
import { db } from '../db';
import { settings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();

// GET /api/settings - Fetch all settings
router.get('/', async (req, res, next) => {
  try {
    const allSettings = await db.select().from(settings);
    // Convert array to a key-value object
    const settingsObj: any = {};
    for (const s of allSettings) {
      // parse json if possible, otherwise keep string
      try {
        settingsObj[s.key] = JSON.parse(s.value);
      } catch (e) {
        settingsObj[s.key] = s.value;
      }
    }
    res.json({ success: true, data: settingsObj });
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings - Update settings (Admin only)
router.put('/', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const updates = req.body;
    
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        
        const existing = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
        if (existing.length > 0) {
          await db.update(settings).set({ value: stringValue }).where(eq(settings.key, key));
        } else {
          await db.insert(settings).values({ key, value: stringValue });
        }
      }
    }
    
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
