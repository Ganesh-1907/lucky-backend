import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/database';
import { eq, or } from 'drizzle-orm';
import { users, vendors } from '../../db/schema/index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  phone: z.string().optional(),
  role: z.enum(['CLIENT', 'VENDOR']),
  city: z.string().optional(),
  businessName: z.string().optional(),
  description: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function generateTokens(userId: number) {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'fallback-secret',
    { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any }
  );
  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret',
    { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as any }
  );
  return { accessToken, refreshToken };
}

// POST /api/auth/register
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { name, email, password, phone, role, city, businessName, description } = req.body;

    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      throw ApiError.conflict('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [user] = await db.insert(users).values({
      name,
      email,
      password: hashedPassword,
      phone,
      role,
      city,
    }).returning();

    if (role === 'VENDOR' && businessName) {
      await db.insert(vendors).values({
        userId: user.id,
        businessName,
        description,
        status: 'PENDING',
        serviceCities: city ? [city] : [],
      }).returning();
    }

    const userData = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      with: role === 'VENDOR' ? { vendor: true } : undefined,
      columns: { password: false },
    });

    const tokens = generateTokens(user.id);

    ApiResponse.created(res, {
      user: userData,
      ...tokens,
    }, role === 'VENDOR'
      ? 'Vendor registration submitted. Pending admin approval.'
      : 'Registration successful');
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
      with: { vendor: true },
    });

    if (!user || !user.password) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    if (!user.isActive) {
      throw ApiError.forbidden('Account is deactivated. Contact support.');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    // Check vendor status
    if (user.role === 'VENDOR' && user.vendor) {
      if (user.vendor.status === 'PENDING') {
        throw ApiError.forbidden('Your vendor account is pending approval.');
      }
      if (user.vendor.status === 'REJECTED') {
        throw ApiError.forbidden('Your vendor application was rejected.');
      }
      if (user.vendor.status === 'SUSPENDED') {
        throw ApiError.forbidden('Your vendor account is suspended.');
      }
    }

    const tokens = generateTokens(user.id);
    const { password: _, ...userData } = user;

    ApiResponse.success(res, {
      user: userData,
      ...tokens,
    }, 'Login successful');
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/google
router.post('/google', async (req, res, next) => {
  try {
    const { googleId, email, name, avatar } = req.body;

    if (!googleId || !email) {
      throw ApiError.badRequest('Google ID and email are required');
    }

    let user = await db.query.users.findFirst({
      where: or(eq(users.googleId, googleId), eq(users.email, email)),
      with: { vendor: true },
    });

    if (!user) {
      const [newUser] = await db.insert(users).values({
        googleId,
        email,
        name: name || email.split('@')[0],
        avatar,
        role: 'CLIENT',
        emailVerified: true,
        isActive: true,
      }).returning();

      user = await db.query.users.findFirst({
        where: eq(users.id, newUser.id),
        with: { vendor: true },
      });
    } else if (!user.googleId) {
      await db.update(users).set({ googleId, avatar: user.avatar || avatar }).where(eq(users.id, user.id));

      user = await db.query.users.findFirst({
        where: eq(users.id, user.id),
        with: { vendor: true },
      });
    }

    if (!user!.isActive) {
      throw ApiError.forbidden('Account is deactivated');
    }

    const tokens = generateTokens(user!.id);
    const { password: _, ...userData } = user!;

    ApiResponse.success(res, { user: userData, ...tokens }, 'Login successful');
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user!.id),
      with: { vendor: true },
      columns: { password: false },
    });

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    ApiResponse.success(res, user);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw ApiError.badRequest('Refresh token is required');
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret'
    ) as any;

    const [user] = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
    if (!user || !user.isActive) {
      throw ApiError.unauthorized('Invalid refresh token');
    }

    const tokens = generateTokens(user.id);
    ApiResponse.success(res, tokens, 'Token refreshed');
  } catch (error) {
    next(error);
  }
});

// PUT /api/auth/profile
router.put('/profile', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { name, phone, city, avatar } = req.body;

    await db.update(users).set({ name, phone, city, avatar }).where(eq(users.id, req.user!.id));

    const [user] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
    const { password: _, ...userData } = user!;

    ApiResponse.success(res, userData, 'Profile updated');
  } catch (error) {
    next(error);
  }
});

// PUT /api/auth/change-password
router.put('/change-password', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      throw ApiError.badRequest('New password must be at least 6 characters');
    }

    const [user] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!user?.password) {
      throw ApiError.badRequest('Cannot change password for social login accounts');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw ApiError.badRequest('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, req.user!.id));

    ApiResponse.success(res, null, 'Password changed successfully');
  } catch (error) {
    next(error);
  }
});

export default router;
