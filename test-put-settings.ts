import jwt from 'jsonwebtoken';
import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

const token = jwt.sign({ userId: 1, role: 'ADMIN' }, process.env.JWT_SECRET || 'lucky123', { expiresIn: '1d' });
const data = JSON.stringify({ siteName: 'Test Site', autoApproveVendors: true });

const req = http.request('http://localhost:5000/api/admin/settings', {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let d = '';
  res.on('data', c => d+=c);
  res.on('end', () => console.log('PUT response:', d));
});
req.write(data);
req.end();
