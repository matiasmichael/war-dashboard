const express = require('express');
const path = require('path');

const app = express();
const PORT = 8440;

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '5m',
  etag: true
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔶 Iran War Update server running on port ${PORT}`);
  console.log(`   http://localhost:${PORT}`);
});
