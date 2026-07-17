import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const token = jwt.sign({ userId: 2 }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });

async function run() {
  console.log("Token:", token);
  try {
    const res = await fetch('http://localhost:5000/api/vendors/analytics?range=30d', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const text = await res.text();
    console.log("Analytics response:", res.status, text);
    
    const res2 = await fetch('http://localhost:5000/api/vendors/notifications', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const text2 = await res2.text();
    console.log("Notifications response:", res2.status, text2);
  } catch (e) {
    console.error(e);
  }
}
run();
