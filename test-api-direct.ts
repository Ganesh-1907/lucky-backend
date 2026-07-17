import jwt from 'jsonwebtoken';
import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
  const token = jwt.sign({ id: 1, role: 'ADMIN' }, process.env.JWT_SECRET || 'lucky123', { expiresIn: '1d' });
  const req = http.request('http://localhost:5000/api/admin/reports?period=yearly', {
    headers: { 'Authorization': `Bearer ${token}` }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('API RESPONSE:', data);
    });
  });
  req.on('error', console.error);
  req.end();
})();
