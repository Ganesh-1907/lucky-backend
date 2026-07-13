import nodemailer from 'nodemailer';

const appName = 'Repair Boy';

function getTransporter() {
  const host = process.env.SMTP_HOST || '';
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.EMAIL_USER || process.env.SMTP_USER || '';
  const pass = process.env.EMAIL_PASSWORD || process.env.SMTP_PASS || '';

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && (process.env.EMAIL_USER || process.env.SMTP_USER) && (process.env.EMAIL_PASSWORD || process.env.SMTP_PASS));
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn('[Email] SMTP not configured. Skipping email send.');
    return;
  }

  const fromEmail = process.env.ADMIN_EMAIL || process.env.SMTP_FROM || 'noreply@example.com';
  const transporter = getTransporter();

  await transporter.sendMail({
    from: `"${appName}" <${fromEmail}>`,
    to,
    subject,
    html,
  });
}

// ── Templates ──────────────────────────────────────────

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  await sendEmail(
    to,
    `Welcome to ${appName}!`,
    `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Welcome to ${appName}!</h2>
      <p>Hi ${name},</p>
      <p>Your account has been created successfully. You can now browse services, book appointments, and more.</p>
      <p style="margin-top: 20px;">Best regards,<br/>The ${appName} Team</p>
    </div>`
  );
}

export async function sendBookingConfirmationEmail(
  to: string,
  name: string,
  booking: { number: string; date: string; timeSlot: string; service: string; amount: string; status: string }
): Promise<void> {
  await sendEmail(
    to,
    `Booking Confirmed — ${booking.number}`,
    `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Booking Confirmed!</h2>
      <p>Hi ${name},</p>
      <p>Your booking has been created successfully.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Booking #</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${booking.number}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Service</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${booking.service}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Date</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${booking.date}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Time</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${booking.timeSlot}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Amount</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">₹${booking.amount}</td></tr>
        <tr><td style="padding: 8px; color: #6b7280;">Status</td><td style="padding: 8px; font-weight: bold; color: #f59e0b;">${booking.status}</td></tr>
      </table>
      <p style="margin-top: 20px;">Best regards,<br/>The ${appName} Team</p>
    </div>`
  );
}

export async function sendNewBookingVendorEmail(
  to: string,
  businessName: string,
  booking: { number: string; date: string; timeSlot: string; clientName: string; service: string }
): Promise<void> {
  await sendEmail(
    to,
    `New Booking — ${booking.number}`,
    `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">New Booking Received!</h2>
      <p>Hi ${businessName},</p>
      <p>You have a new booking on ${appName}.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Booking #</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${booking.number}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Client</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${booking.clientName}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Service</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${booking.service}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Date</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${booking.date}</td></tr>
        <tr><td style="padding: 8px; color: #6b7280;">Time</td><td style="padding: 8px;">${booking.timeSlot}</td></tr>
      </table>
      <p style="margin-top: 20px;">Best regards,<br/>The ${appName} Team</p>
    </div>`
  );
}

export async function sendPaymentReceiptEmail(
  to: string,
  name: string,
  payment: { orderId: string; amount: string; bookingNumber: string; type: string }
): Promise<void> {
  await sendEmail(
    to,
    `Payment Received — ${payment.bookingNumber}`,
    `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Payment Successful!</h2>
      <p>Hi ${name},</p>
      <p>Your ${payment.type.toLowerCase()} payment has been received.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Booking #</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${payment.bookingNumber}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Payment ID</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${payment.orderId}</td></tr>
        <tr><td style="padding: 8px; color: #6b7280;">Amount</td><td style="padding: 8px; font-weight: bold;">₹${payment.amount}</td></tr>
      </table>
      <p style="margin-top: 20px;">Best regards,<br/>The ${appName} Team</p>
    </div>`
  );
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetLink: string
): Promise<void> {
  await sendEmail(
    to,
    `Reset Your ${appName} Password`,
    `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Password Reset Request</h2>
      <p>Hi ${name},</p>
      <p>Click the button below to reset your password. This link expires in 1 hour.</p>
      <a href="${resetLink}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Reset Password</a>
      <p style="color: #6b7280; font-size: 14px;">If you didn't request this, ignore this email.</p>
      <p style="margin-top: 20px;">Best regards,<br/>The ${appName} Team</p>
    </div>`
  );
}

export async function sendBookingStatusUpdateEmail(
  to: string,
  name: string,
  booking: { number: string; status: string; service: string }
): Promise<void> {
  const statusColors: Record<string, string> = {
    CONFIRMED: '#22c55e',
    IN_PROGRESS: '#3b82f6',
    COMPLETED: '#16a34a',
    CANCELLED: '#ef4444',
  };

  await sendEmail(
    to,
    `Booking ${booking.status} — ${booking.number}`,
    `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${statusColors[booking.status] || '#2563eb'};">Booking ${booking.status}</h2>
      <p>Hi ${name},</p>
      <p>Your booking status has been updated.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Booking #</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${booking.number}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Service</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${booking.service}</td></tr>
        <tr><td style="padding: 8px; color: #6b7280;">Status</td><td style="padding: 8px; font-weight: bold; color: ${statusColors[booking.status] || '#2563eb'}; text-transform: uppercase;">${booking.status}</td></tr>
      </table>
      <p style="margin-top: 20px;">Best regards,<br/>The ${appName} Team</p>
    </div>`
  );
}
