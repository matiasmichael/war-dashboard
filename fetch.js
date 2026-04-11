// ===== CONVENIENCE WRAPPER =====
// Runs the full pipeline sequentially for manual use.
// In production, fetch-data.js (15m) and synthesize.js (1h) run independently.

const { execSync } = require('child_process');

console.log('🔶 Iran War Update — Full Pipeline (manual run)');
console.log(`   Time: ${new Date().toISOString()}\n`);

try {
  console.log('━━━ Step 1: Data Collection ━━━');
  execSync('node fetch-data.js', { stdio: 'inherit', cwd: __dirname });

  console.log('\n━━━ Step 2: AI Synthesis + Build ━━━');
  execSync('node synthesize.js', { stdio: 'inherit', cwd: __dirname });

  console.log('\n✅ Full pipeline complete.');
} catch (err) {
  console.error('\n❌ Pipeline failed:', err.message);
  process.exit(1);
}
