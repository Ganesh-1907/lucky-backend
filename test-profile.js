const http = require('http');

async function run() {
  try {
    // 1. Register a user
    const regRes = await fetch('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        email: 'testprofile@example.com',
        password: 'password123',
        role: 'CLIENT'
      })
    });
    let regData = await regRes.json();
    if (!regRes.ok && regData.error !== 'Email already registered') {
      console.log('Register failed', regData);
      return;
    }

    // 2. Login
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'testprofile@example.com',
        password: 'password123',
      })
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) {
      console.log('Login failed', loginData);
      return;
    }
    const token = loginData.data.accessToken;

    // 3. Update Profile
    const updateRes = await fetch('http://localhost:5000/api/auth/profile', {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'Test User Updated',
        phone: '1234567890',
        city: 'New York'
      })
    });
    const updateData = await updateRes.json();
    console.log('Update Profile Response:', updateData);
  } catch (err) {
    console.error(err);
  }
}
run();
