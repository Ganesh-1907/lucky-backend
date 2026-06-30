import { db } from '../src/config/database';
import * as bcrypt from 'bcryptjs';
import { users, bookings, employeeBookingAssignments, followUps, employeeTasks, notifications } from './schema/index';
import { eq, and } from 'drizzle-orm';

async function main() {
  console.log('🌱 Creating Employee user and sample data...');

  const employeePassword = await bcrypt.hash('employee123', 12);
  const [employee] = await db.insert(users).values({
    email: 'employee@yopmail.com',
    password: employeePassword,
    name: 'Priya Coordinator',
    phone: '+91 9876543215',
    role: 'EMPLOYEE',
    city: 'Mumbai',
    isActive: true,
    emailVerified: true,
  }).onConflictDoUpdate({ target: users.email, set: { role: 'EMPLOYEE', password: employeePassword } }).returning();

  console.log('✅ Employee user created:', employee.email);

  // Assign existing bookings
  const existingBookings = await db.select().from(bookings).limit(20);

  if (existingBookings.length > 0) {
    for (const booking of existingBookings) {
      const pipelineStages = ['NEW_LEAD', 'CUSTOMER_CONTACTED', 'VENDOR_CONTACTED', 'CUSTOMER_DISCUSSION', 'ADVANCE_PAYMENT_PENDING', 'BOOKING_CONFIRMED', 'PLANNING_STAGE'];
      const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

      await db.update(bookings).set({
        assignedEmployeeId: employee.id,
        pipelineStatus: pipelineStages[Math.floor(Math.random() * pipelineStages.length)] as any,
        priority: priorities[Math.floor(Math.random() * priorities.length)] as any,
      }).where(eq(bookings.id, booking.id));

      await db.insert(employeeBookingAssignments).values({
        employeeId: employee.id,
        bookingId: booking.id,
      }).onConflictDoNothing();
    }
    console.log(`✅ Assigned ${existingBookings.length} bookings to employee`);
  } else {
    console.log('⚠️ No bookings found. Run the main seed first.');
  }

  // Create follow-ups
  const today = new Date();
  const followUpData = [
    { customerName: 'Rahul Sharma', daysFromNow: 0, time: '10:30', note: 'Confirm venue availability', status: 'PENDING' },
    { customerName: 'Priya Patel', daysFromNow: 0, time: '14:00', note: 'Discuss decoration theme', status: 'PENDING' },
    { customerName: 'Vikram Singh', daysFromNow: 0, time: '16:30', note: 'Send revised quotation', status: 'PENDING' },
    { customerName: 'Anita Joshi', daysFromNow: -1, time: '11:00', note: 'Collect advance payment', status: 'PENDING' },
    { customerName: 'Meera Gupta', daysFromNow: -2, time: '09:30', note: 'Follow up on vendor confirmation', status: 'PENDING' },
    { customerName: 'Raj Kumar', daysFromNow: 1, time: '10:00', note: 'Share event photos', status: 'PENDING' },
    { customerName: 'Sneha Reddy', daysFromNow: 3, time: '15:00', note: 'Confirm catering arrangements', status: 'PENDING' },
    { customerName: 'Amit Shah', daysFromNow: -3, time: '12:00', note: 'Check payment status', status: 'COMPLETED' },
  ];

  for (const fu of followUpData) {
    const date = new Date(today);
    date.setDate(date.getDate() + fu.daysFromNow);
    await db.insert(followUps).values({
      employeeId: employee.id,
      customerName: fu.customerName,
      followUpDate: date.toISOString(),
      followUpTime: fu.time,
      reminderNote: fu.note,
      status: fu.status as any,
    });
  }
  console.log('✅ Sample follow-ups created');

  // Create tasks
  const taskData = [
    { title: 'Call Rahul about venue confirmation', dueDate: 0, priority: 'HIGH', status: 'PENDING' },
    { title: 'Collect quotation from flower vendor', dueDate: 1, priority: 'MEDIUM', status: 'PENDING' },
    { title: 'Confirm DJ booking for Saturday event', dueDate: 2, priority: 'URGENT', status: 'IN_PROGRESS' },
    { title: 'Send payment reminder to Priya', dueDate: 0, priority: 'HIGH', status: 'PENDING' },
    { title: 'Update event checklist for wedding', dueDate: 3, priority: 'MEDIUM', status: 'PENDING' },
    { title: 'Review vendor portfolio photos', dueDate: -1, priority: 'LOW', status: 'COMPLETED' },
    { title: 'Prepare event timeline document', dueDate: 5, priority: 'MEDIUM', status: 'PENDING' },
  ];

  for (const task of taskData) {
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + task.dueDate);
    await db.insert(employeeTasks).values({
      employeeId: employee.id,
      title: task.title,
      dueDate: dueDate.toISOString(),
      priority: task.priority as any,
      status: task.status as any,
    });
  }
  console.log('✅ Sample tasks created');

  // Create notifications
  const notifData = [
    { title: 'New Booking Assigned', message: 'You have been assigned a new booking', type: 'ASSIGNMENT' },
    { title: 'Follow-Up Reminder', message: 'You have a follow-up scheduled with Rahul Sharma at 10:30 AM today', type: 'FOLLOW_UP' },
    { title: 'Customer Reply', message: 'Priya Patel has responded to your message', type: 'BOOKING' },
    { title: 'Payment Received', message: 'Advance payment of ₹2,000 received for booking', type: 'PAYMENT' },
    { title: 'Vendor Update', message: 'Dream Decorators has confirmed availability', type: 'BOOKING' },
    { title: 'Overdue Follow-Up', message: 'You have 2 overdue follow-ups that need attention', type: 'FOLLOW_UP' },
  ];

  for (const n of notifData) {
    await db.insert(notifications).values({
      userId: employee.id,
      title: n.title,
      message: n.message,
      type: n.type as any,
      isRead: false,
    });
  }
  console.log('✅ Sample notifications created');

  console.log('\n🎉 Employee setup complete!');
  console.log('Employee login: employee@yopmail.com / employee123');
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(async () => { process.exit(0); });
