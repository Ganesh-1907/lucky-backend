import { relations } from 'drizzle-orm';
import {
  pgTable, pgEnum, integer, varchar, text, boolean, timestamp, decimal, jsonb, date, uniqueIndex, index, primaryKey, unique
} from 'drizzle-orm/pg-core';

// ==================== ENUMS ====================

export const userRoleEnum = pgEnum('user_role', ['CLIENT', 'VENDOR', 'ADMIN', 'EMPLOYEE', 'INVESTOR']);
export const vendorStatusEnum = pgEnum('vendor_status', ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']);
export const serviceStatusEnum = pgEnum('service_status', ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']);
export const bookingStatusEnum = pgEnum('booking_status', ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED']);
export const bookingPipelineStatusEnum = pgEnum('booking_pipeline_status', ['NEW_LEAD', 'CUSTOMER_CONTACTED', 'VENDOR_CONTACTED', 'CUSTOMER_DISCUSSION', 'ADVANCE_PAYMENT_PENDING', 'ADVANCE_PAYMENT_RECEIVED', 'BOOKING_CONFIRMED', 'PLANNING_STAGE', 'VENDOR_CONFIRMATION_PENDING', 'EVENT_PREPARATION', 'EVENT_ONGOING', 'EVENT_COMPLETED', 'CUSTOMER_FEEDBACK_PENDING', 'CLOSED', 'CANCELLED']);
export const priorityEnum = pgEnum('priority', ['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export const followUpStatusEnum = pgEnum('follow_up_status', ['PENDING', 'COMPLETED', 'MISSED']);
export const taskStatusEnum = pgEnum('task_status', ['PENDING', 'IN_PROGRESS', 'COMPLETED']);
export const paymentTypeEnum = pgEnum('payment_type', ['ADVANCE', 'REMAINING', 'REFUND']);
export const paymentStatusEnum = pgEnum('payment_status', ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED']);
export const couponTypeEnum = pgEnum('coupon_type', ['PERCENTAGE', 'FIXED']);
export const bannerPositionEnum = pgEnum('banner_position', ['HERO', 'SIDEBAR', 'FOOTER', 'POPUP', 'CATEGORY', 'HOMEPAGE', 'CUSTOM']);
export const notificationTypeEnum = pgEnum('notification_type', ['BOOKING', 'PAYMENT', 'SYSTEM', 'PROMOTION', 'FOLLOW_UP', 'ASSIGNMENT']);

// ==================== TABLES ====================

export const users = pgTable('users', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: varchar().notNull().unique(),
  password: varchar(),
  name: varchar().notNull(),
  phone: varchar(),
  role: userRoleEnum().default('CLIENT').notNull(),
  avatar: varchar(),
  city: varchar(),
  googleId: varchar().unique(),
  isActive: boolean().default(true).notNull(),
  emailVerified: boolean().default(false).notNull(),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('users_email_idx').on(table.email),
  index('users_role_idx').on(table.role),
]);

export const vendors = pgTable('vendors', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer().notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  businessName: varchar().notNull(),
  description: text(),
  logo: varchar(),
  gstNumber: varchar(),
  panNumber: varchar(),
  status: vendorStatusEnum().default('PENDING').notNull(),
  commissionRate: decimal({ precision: 5, scale: 2 }).default('10').notNull(),
  serviceCities: jsonb(),
  bankAccountName: varchar(),
  bankAccountNo: varchar(),
  bankIfsc: varchar(),
  bankName: varchar(),
  razorpayLinkedId: varchar(),
  totalEarnings: decimal({ precision: 12, scale: 2 }).default('0').notNull(),
  totalBookings: integer().default(0).notNull(),
  avgRating: decimal({ precision: 3, scale: 2 }).default('0').notNull(),
  reviewCount: integer().default(0).notNull(),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('vendors_status_idx').on(table.status),
]);

export const categories = pgTable('categories', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar().notNull(),
  slug: varchar().notNull().unique(),
  description: text(),
  image: varchar(),
  icon: varchar(),
  parentId: integer(),
  sortOrder: integer().default(0).notNull(),
  isActive: boolean().default(true).notNull(),
  seoTitle: varchar(),
  seoDescription: text(),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('categories_slug_idx').on(table.slug),
  index('categories_parent_id_idx').on(table.parentId),
]);

export const services = pgTable('services', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  vendorId: integer().notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  categoryId: integer().notNull().references(() => categories.id),
  title: varchar().notNull(),
  slug: varchar().notNull().unique(),
  description: text(),
  shortDesc: text(),
  basePrice: decimal({ precision: 10, scale: 2 }).notNull(),
  discountPrice: decimal({ precision: 10, scale: 2 }),
  images: jsonb().notNull(),
  tags: jsonb(),
  status: serviceStatusEnum().default('DRAFT').notNull(),
  isActive: boolean().default(true).notNull(),
  isFeatured: boolean().default(false).notNull(),
  isTrending: boolean().default(false).notNull(),
  isBestSeller: boolean().default(false).notNull(),
  isNewArrival: boolean().default(true).notNull(),
  avgRating: decimal({ precision: 3, scale: 2 }).default('0').notNull(),
  reviewCount: integer().default(0).notNull(),
  bookingCount: integer().default(0).notNull(),
  viewCount: integer().default(0).notNull(),
  minAdvancePercent: integer().default(50).notNull(),
  preparationTime: integer(),
  serviceDuration: integer(),
  maxCapacity: integer(),
  seoTitle: varchar(),
  seoDescription: text(),
  cities: jsonb(),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('services_slug_idx').on(table.slug),
  index('services_vendor_id_idx').on(table.vendorId),
  index('services_category_id_idx').on(table.categoryId),
  index('services_status_idx').on(table.status),
  index('services_is_featured_idx').on(table.isFeatured),
  index('services_is_trending_idx').on(table.isTrending),
]);

export const addons = pgTable('addons', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  serviceId: integer().notNull().references(() => services.id, { onDelete: 'cascade' }),
  name: varchar().notNull(),
  description: text(),
  price: decimal({ precision: 10, scale: 2 }).notNull(),
  image: varchar(),
  isActive: boolean().default(true).notNull(),
  sortOrder: integer().default(0).notNull(),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('addons_service_id_idx').on(table.serviceId),
]);

export const serviceFaqs = pgTable('service_faqs', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  serviceId: integer().notNull().references(() => services.id, { onDelete: 'cascade' }),
  question: text().notNull(),
  answer: text().notNull(),
  sortOrder: integer().default(0).notNull(),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('service_faqs_service_id_idx').on(table.serviceId),
]);

export const bookings = pgTable('bookings', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  bookingNumber: varchar().notNull().unique(),
  clientId: integer().notNull().references(() => users.id),
  serviceId: integer().notNull().references(() => services.id),
  vendorId: integer().notNull().references(() => vendors.id),
  bookingDate: timestamp({ mode: 'string' }).notNull(),
  timeSlot: varchar().notNull(),
  baseAmount: decimal({ precision: 10, scale: 2 }).notNull(),
  addonsAmount: decimal({ precision: 10, scale: 2 }).default('0').notNull(),
  couponDiscount: decimal({ precision: 10, scale: 2 }).default('0').notNull(),
  totalAmount: decimal({ precision: 10, scale: 2 }).notNull(),
  advancePaid: decimal({ precision: 10, scale: 2 }).default('0').notNull(),
  remainingAmount: decimal({ precision: 10, scale: 2 }).default('0').notNull(),
  commission: decimal({ precision: 10, scale: 2 }).default('0').notNull(),
  status: bookingStatusEnum().default('PENDING').notNull(),
  pipelineStatus: bookingPipelineStatusEnum().default('NEW_LEAD').notNull(),
  priority: priorityEnum().default('MEDIUM').notNull(),
  assignedEmployeeId: integer(),
  lastFollowUpDate: timestamp({ mode: 'string' }),
  selectedAddons: jsonb(),
  couponCode: varchar(),
  city: varchar().notNull(),
  address: text(),
  pincode: varchar(),
  notes: text(),
  cancelReason: text(),
  completedAt: timestamp({ mode: 'string' }),
  cancelledAt: timestamp({ mode: 'string' }),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('bookings_booking_number_idx').on(table.bookingNumber),
  index('bookings_client_id_idx').on(table.clientId),
  index('bookings_vendor_id_idx').on(table.vendorId),
  index('bookings_status_idx').on(table.status),
  index('bookings_pipeline_status_idx').on(table.pipelineStatus),
  index('bookings_assigned_employee_id_idx').on(table.assignedEmployeeId),
]);

export const payments = pgTable('payments', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  bookingId: integer().notNull().references(() => bookings.id),
  razorpayOrderId: varchar(),
  razorpayPaymentId: varchar(),
  razorpaySignature: varchar(),
  amount: decimal({ precision: 10, scale: 2 }).notNull(),
  type: paymentTypeEnum().notNull(),
  status: paymentStatusEnum().default('PENDING').notNull(),
  method: varchar(),
  refundId: varchar(),
  refundAmount: decimal({ precision: 10, scale: 2 }),
  metadata: jsonb(),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('payments_booking_id_idx').on(table.bookingId),
  index('payments_razorpay_order_id_idx').on(table.razorpayOrderId),
]);

export const reviews = pgTable('reviews', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  bookingId: integer().notNull().unique().references(() => bookings.id),
  clientId: integer().notNull().references(() => users.id),
  vendorId: integer().notNull().references(() => vendors.id),
  serviceId: integer().notNull().references(() => services.id),
  rating: integer().notNull(),
  title: varchar(),
  comment: text(),
  images: jsonb(),
  isApproved: boolean().default(false).notNull(),
  adminReply: text(),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('reviews_service_id_idx').on(table.serviceId),
  index('reviews_vendor_id_idx').on(table.vendorId),
]);

export const menuItems = pgTable('menu_items', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  label: varchar().notNull(),
  url: varchar(),
  parentId: integer(),
  sortOrder: integer().default(0).notNull(),
  isActive: boolean().default(true).notNull(),
  column: varchar(),
  icon: varchar(),
  image: varchar(),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('menu_items_parent_id_idx').on(table.parentId),
]);

export const banners = pgTable('banners', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  title: varchar().notNull(),
  subtitle: varchar(),
  description: text(),
  image: varchar().notNull(),
  link: varchar(),
  sortOrder: integer().default(0).notNull(),
  priority: integer().default(0).notNull(),
  isActive: boolean().default(true).notNull(),
  position: bannerPositionEnum().default('HERO').notNull(),
  startDate: timestamp({ mode: 'string' }),
  endDate: timestamp({ mode: 'string' }),
  visibility: jsonb(), // { desktop: boolean, tablet: boolean, mobile: boolean }
  clicks: integer().default(0).notNull(),
  impressions: integer().default(0).notNull(),
  createdBy: integer(), // reference to users
  updatedBy: integer(), // reference to users
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const coupons = pgTable('coupons', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  code: varchar().notNull().unique(),
  type: couponTypeEnum().notNull(),
  value: decimal({ precision: 10, scale: 2 }).notNull(),
  minOrder: decimal({ precision: 10, scale: 2 }).default('0').notNull(),
  maxDiscount: decimal({ precision: 10, scale: 2 }),
  usageLimit: integer(),
  usedCount: integer().default(0).notNull(),
  validFrom: timestamp({ mode: 'string' }).notNull(),
  validTo: timestamp({ mode: 'string' }).notNull(),
  isActive: boolean().default(true).notNull(),
  description: varchar(),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('coupons_code_idx').on(table.code),
]);

export const wishlists = pgTable('wishlists', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
  serviceId: integer().notNull().references(() => services.id, { onDelete: 'cascade' }),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('wishlists_user_service_unique').on(table.userId, table.serviceId),
]);

export const availabilitySlots = pgTable('availability_slots', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  vendorId: integer().notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  dayOfWeek: integer().notNull(),
  startTime: varchar().notNull(),
  endTime: varchar().notNull(),
  maxBookings: integer().default(1).notNull(),
  isActive: boolean().default(true).notNull(),
}, (table) => [
  index('availability_slots_vendor_id_idx').on(table.vendorId),
]);

export const notifications = pgTable('notifications', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar().notNull(),
  message: text().notNull(),
  type: notificationTypeEnum().default('SYSTEM').notNull(),
  isRead: boolean().default(false).notNull(),
  link: varchar(),
  metadata: jsonb(),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('notifications_user_id_idx').on(table.userId),
  index('notifications_is_read_idx').on(table.isRead),
]);

export const homepageSections = pgTable('homepage_sections', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar().notNull(),
  type: varchar().notNull(),
  title: varchar(),
  subtitle: varchar(),
  sortOrder: integer().default(0).notNull(),
  isActive: boolean().default(true).notNull(),
  config: jsonb(),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const recentlyViewed = pgTable('recently_viewed', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
  serviceId: integer().notNull().references(() => services.id, { onDelete: 'cascade' }),
  viewedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('recently_viewed_user_service_unique').on(table.userId, table.serviceId),
  index('recently_viewed_user_id_idx').on(table.userId),
]);

export const cities = pgTable('cities', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar().notNull().unique(),
  slug: varchar().notNull().unique(),
  state: varchar(),
  image: varchar(),
  isActive: boolean().default(true).notNull(),
  sortOrder: integer().default(0).notNull(),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const seoPages = pgTable('seo_pages', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  slug: varchar().notNull().unique(),
  title: varchar().notNull(),
  metaDescription: text(),
  content: text(),
  city: varchar(),
  category: varchar(),
  isActive: boolean().default(true).notNull(),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('seo_pages_slug_idx').on(table.slug),
]);

export const settings = pgTable('settings', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  key: varchar().notNull().unique(),
  value: text().notNull(),
  group: varchar().default('general').notNull(),
});

export const employeeBookingAssignments = pgTable('employee_booking_assignments', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  employeeId: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
  bookingId: integer().notNull().unique().references(() => bookings.id, { onDelete: 'cascade' }),
  assignedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('eba_employee_id_idx').on(table.employeeId),
  index('eba_booking_id_idx').on(table.bookingId),
]);

export const bookingNotes = pgTable('booking_notes', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  bookingId: integer().notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  employeeId: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text().notNull(),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('booking_notes_booking_id_idx').on(table.bookingId),
  index('booking_notes_employee_id_idx').on(table.employeeId),
]);

export const bookingTimeline = pgTable('booking_timeline', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  bookingId: integer().notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  employeeId: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
  fromStatus: bookingPipelineStatusEnum().notNull(),
  toStatus: bookingPipelineStatusEnum().notNull(),
  note: text(),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('booking_timeline_booking_id_idx').on(table.bookingId),
  index('booking_timeline_employee_id_idx').on(table.employeeId),
]);

export const followUps = pgTable('follow_ups', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  employeeId: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
  bookingId: integer(),
  customerName: varchar().notNull(),
  followUpDate: timestamp({ mode: 'string' }).notNull(),
  followUpTime: varchar().notNull(),
  reminderNote: text(),
  status: followUpStatusEnum().default('PENDING').notNull(),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('follow_ups_employee_id_idx').on(table.employeeId),
  index('follow_ups_booking_id_idx').on(table.bookingId),
  index('follow_ups_date_idx').on(table.followUpDate),
  index('follow_ups_status_idx').on(table.status),
]);

export const employeeTasks = pgTable('employee_tasks', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  employeeId: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar().notNull(),
  description: text(),
  dueDate: timestamp({ mode: 'string' }).notNull(),
  priority: priorityEnum().default('MEDIUM').notNull(),
  status: taskStatusEnum().default('PENDING').notNull(),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('employee_tasks_employee_id_idx').on(table.employeeId),
  index('employee_tasks_due_date_idx').on(table.dueDate),
  index('employee_tasks_status_idx').on(table.status),
]);

// ==================== RELATIONS ====================

export const usersRelations = relations(users, ({ one, many }) => ({
  vendor: one(vendors, { fields: [users.id], references: [vendors.userId] }),
  bookings: many(bookings, { relationName: 'clientBookings' }),
  reviews: many(reviews),
  wishlists: many(wishlists),
  notifications: many(notifications),
  recentlyViewed: many(recentlyViewed),
  employeeBookings: many(bookings, { relationName: 'employeeBookings' }),
  bookingNotes: many(bookingNotes),
  bookingTimelines: many(bookingTimeline),
  followUps: many(followUps),
  employeeTasks: many(employeeTasks),
  employeeAssignments: many(employeeBookingAssignments),
}));

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  user: one(users, { fields: [vendors.userId], references: [users.id] }),
  services: many(services),
  bookings: many(bookings),
  reviews: many(reviews),
  availabilitySlots: many(availabilitySlots),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parentId], references: [categories.id], relationName: 'categoryTree' }),
  children: many(categories, { relationName: 'categoryTree' }),
  services: many(services),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  vendor: one(vendors, { fields: [services.vendorId], references: [vendors.id] }),
  category: one(categories, { fields: [services.categoryId], references: [categories.id] }),
  addons: many(addons),
  bookings: many(bookings),
  reviews: many(reviews),
  wishlists: many(wishlists),
  recentlyViewed: many(recentlyViewed),
  faq: many(serviceFaqs),
}));

export const addonsRelations = relations(addons, ({ one }) => ({
  service: one(services, { fields: [addons.serviceId], references: [services.id] }),
}));

export const serviceFaqsRelations = relations(serviceFaqs, ({ one }) => ({
  service: one(services, { fields: [serviceFaqs.serviceId], references: [services.id] }),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  client: one(users, { fields: [bookings.clientId], references: [users.id], relationName: 'clientBookings' }),
  service: one(services, { fields: [bookings.serviceId], references: [services.id] }),
  vendor: one(vendors, { fields: [bookings.vendorId], references: [vendors.id] }),
  assignedEmployee: one(users, { fields: [bookings.assignedEmployeeId], references: [users.id], relationName: 'employeeBookings' }),
  payments: many(payments),
  review: one(reviews, { fields: [bookings.id], references: [reviews.bookingId] }),
  bookingNotes: many(bookingNotes),
  bookingTimeline: many(bookingTimeline),
  followUps: many(followUps),
  employeeAssignment: one(employeeBookingAssignments, { fields: [bookings.id], references: [employeeBookingAssignments.bookingId] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  booking: one(bookings, { fields: [payments.bookingId], references: [bookings.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  booking: one(bookings, { fields: [reviews.bookingId], references: [bookings.id] }),
  client: one(users, { fields: [reviews.clientId], references: [users.id] }),
  vendor: one(vendors, { fields: [reviews.vendorId], references: [vendors.id] }),
  service: one(services, { fields: [reviews.serviceId], references: [services.id] }),
}));

export const menuItemsRelations = relations(menuItems, ({ one, many }) => ({
  parent: one(menuItems, { fields: [menuItems.parentId], references: [menuItems.id], relationName: 'menuTree' }),
  children: many(menuItems, { relationName: 'menuTree' }),
}));

export const wishlistsRelations = relations(wishlists, ({ one }) => ({
  user: one(users, { fields: [wishlists.userId], references: [users.id] }),
  service: one(services, { fields: [wishlists.serviceId], references: [services.id] }),
}));

export const availabilitySlotsRelations = relations(availabilitySlots, ({ one }) => ({
  vendor: one(vendors, { fields: [availabilitySlots.vendorId], references: [vendors.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const recentlyViewedRelations = relations(recentlyViewed, ({ one }) => ({
  user: one(users, { fields: [recentlyViewed.userId], references: [users.id] }),
  service: one(services, { fields: [recentlyViewed.serviceId], references: [services.id] }),
}));

export const employeeBookingAssignmentsRelations = relations(employeeBookingAssignments, ({ one }) => ({
  employee: one(users, { fields: [employeeBookingAssignments.employeeId], references: [users.id] }),
  booking: one(bookings, { fields: [employeeBookingAssignments.bookingId], references: [bookings.id] }),
}));

export const bookingNotesRelations = relations(bookingNotes, ({ one }) => ({
  booking: one(bookings, { fields: [bookingNotes.bookingId], references: [bookings.id] }),
  employee: one(users, { fields: [bookingNotes.employeeId], references: [users.id] }),
}));

export const bookingTimelineRelations = relations(bookingTimeline, ({ one }) => ({
  booking: one(bookings, { fields: [bookingTimeline.bookingId], references: [bookings.id] }),
  employee: one(users, { fields: [bookingTimeline.employeeId], references: [users.id] }),
}));

export const followUpsRelations = relations(followUps, ({ one }) => ({
  employee: one(users, { fields: [followUps.employeeId], references: [users.id] }),
  booking: one(bookings, { fields: [followUps.bookingId], references: [bookings.id] }),
}));

export const employeeTasksRelations = relations(employeeTasks, ({ one }) => ({
  employee: one(users, { fields: [employeeTasks.employeeId], references: [users.id] }),
}));
