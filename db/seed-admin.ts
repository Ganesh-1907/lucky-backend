import { db } from '../src/config/database';
import * as bcrypt from 'bcryptjs';
import { users } from './schema/index';

async function main() {
  console.log('🌱 Creating Admin user...');

  const adminPassword = await bcrypt.hash('admin123', 12);
  const [admin] = await db.insert(users).values({
    email: 'admin@yopmail.com',
    password: adminPassword,
    name: 'Super Admin',
    role: 'ADMIN',
    isActive: true,
    emailVerified: true,
  }).onConflictDoNothing().returning();

  if (admin) {
    console.log('✅ Admin user created:', admin.email);
  } else {
    console.log('ℹ️  Admin user already exists, skipped.');
  }

  console.log('\n🎉 Admin setup complete!');
  console.log('Login: admin@yopmail.com / admin123');
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(async () => { process.exit(0); });
