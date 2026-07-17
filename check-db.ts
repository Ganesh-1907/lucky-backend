import db from './src/config/database';
import { vendors, users } from './db/schema/index';

(async () => {
  const v = await db.select().from(vendors);
  const u = await db.select().from(users);
  console.log('Vendors:', JSON.stringify(v, null, 2));
  console.log('Users:', JSON.stringify(u, null, 2));
  process.exit(0);
})();
