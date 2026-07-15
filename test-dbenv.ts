import dotenv from 'dotenv';
import path from 'path';
// Simulate the path from server.ts (backend/src/server.ts)
dotenv.config({ path: path.resolve(__dirname, '../.env') });
console.log('From server.ts path:', process.env.DATABASE_URL?.substring(0, 50) || 'NOT SET');
process.exit(0);
