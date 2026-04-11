const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8440;

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '5m',
  etag: true
}));

// Serve data directory for static file access from archive page
app.use('/data', express.static(path.join(__dirname, 'data'), {
  maxAge: '1m',
  etag: true
}));

// ===== DAILY BRIEFING API =====

// GET /api/archive/dates — list available daily briefing dates
app.get('/api/archive/dates', (req, res) => {
  const dailyDir = path.join(__dirname, 'data', 'daily');
  try {
    if (!fs.existsSync(dailyDir)) {
      return res.json([]);
    }
    const files = fs.readdirSync(dailyDir)
      .filter(f => f.endsWith('.json') && f !== 'manifest.json')
      .map(f => f.replace('.json', ''))
      .sort((a, b) => b.localeCompare(a)); // Newest first
    res.json(files);
  } catch (e) {
    res.json([]);
  }
});

// GET /api/archive/:date — get a specific daily briefing
app.get('/api/archive/:date', (req, res) => {
  const dateStr = req.params.date;
  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }
  const filePath = path.join(__dirname, 'data', 'daily', `${dateStr}.json`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Daily briefing not found for this date.' });
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read daily briefing.' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔶 Iran War Update server running on port ${PORT}`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Daily Briefing: http://localhost:${PORT}/archive.html`);
});
