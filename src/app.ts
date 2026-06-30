import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import categoryRoutes from './routes/category.routes';
import serviceRoutes from './routes/service.routes';
import menuRoutes from './routes/menu.routes';
import homepageRoutes from './routes/homepage.routes';
import bannerRoutes from './routes/banner.routes';
import cityRoutes from './routes/city.routes';
import vendorRoutes from './routes/vendor.routes';
import bookingRoutes from './routes/booking.routes';
import reviewRoutes from './routes/review.routes';
import wishlistRoutes from './routes/wishlist.routes';
import couponRoutes from './routes/coupon.routes';
import uploadRoutes from './routes/upload.routes';
import adminRoutes from './routes/admin.routes';
import paymentRoutes from './routes/payment.routes';
import employeeRoutes from './routes/employee.routes';
import investorRoutes from './routes/investor.routes';

const app = express();

// Security
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { success: false, error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Convert Prisma Decimal objects to plain numbers in JSON responses
app.set('json replacer', (_key: string, value: any) => {
  // Prisma Decimal objects have a toNumber() method
  if (value && typeof value === 'object' && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  return value;
});

// Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/homepage', homepageRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/cities', cityRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/investor', investorRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'Lucky Marketplace API is running', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

export default app;
