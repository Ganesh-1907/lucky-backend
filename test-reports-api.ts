import dotenv from 'dotenv';
dotenv.config();
import jwt from 'jsonwebtoken';
import axios from 'axios';

async function test() {
  try {
    const token = jwt.sign({ id: 1, role: 'ADMIN' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1d' });
    
    const reportsRes = await axios.get('http://localhost:5000/api/admin/reports?period=yearly', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log(JSON.stringify(reportsRes.data.data.topVendors, null, 2));
  } catch (error: any) {
    console.error(error.response?.data || error.message);
  }
}
test();
