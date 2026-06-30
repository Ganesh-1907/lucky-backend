import { db } from '../src/config/database';
import * as bcrypt from 'bcryptjs';
import { users } from './schema/index';

async function main() {
  console.log('🌱 Creating Investor user...');

  const investorPassword = await bcrypt.hash('investor123', 12);
  const [investor] = await db.insert(users).values({
    email: 'investor@yopmail.com',
    password: investorPassword,
    name: 'Investor User',
    phone: '+91 9876543220',
    role: 'INVESTOR',
    city: 'Mumbai',
    isActive: true,
    emailVerified: true,
  }).onConflictDoUpdate({ target: users.email, set: { role: 'INVESTOR', password: investorPassword } }).returning();

  console.log('✅ Investor user created:', investor.email);
  console.log('\n🎉 Investor setup complete!');
  console.log('Investor login: investor@yopmail.com / investor123');
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(async () => { process.exit(0); });
