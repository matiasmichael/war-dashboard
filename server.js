// ===== HTTP SERVER =====
// Serves the Astro-built static site from dist/ and archive API.

const express = require('express');
const path = require('path');
const fs = require('fs');
const { PORT } = require('./src/config');

const app = express();

// Serve static files from dist/ (Astro build output)
app.use(express.static(path.join(__dirname, 'dist'), {
  maxAge: '5m',
  etag: true
}));

// Redirect old archive.html URL to new Astro route
app.get('/archive.html', (req, res) => {
  res.redirect(301, '/archive/' + (req.url.includes('#') ? req.url.split('#')[1] : ''));
});

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
      .sort((a, b) => b.localeCompare(a));
    res.json(files);
  } catch (e) {
    res.json([]);
  }
});

// GET /api/archive/:date — get a specific daily briefing
app.get('/api/archive/:date', (req, res) => {
  const dateStr = req.params.date;
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
  console.log(`   Daily Briefing: http://localhost:${PORT}/archive`);
});
