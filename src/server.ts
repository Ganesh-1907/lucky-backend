import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import app from './app';

const PORT = process.env.API_PORT || 5000;

app.listen(PORT, () => {
  console.log(`\n🚀 Lucky Marketplace API running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
});
