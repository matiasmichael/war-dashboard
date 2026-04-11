// ===== Iran War Update — Client-Side JavaScript =====

// ===== LIVE TIMESTAMP RE-COMPUTATION =====
function computeTimeAgo(dateStr) {
  var now = new Date();
  var date = new Date(dateStr);
  var diffMs = now - date;
  var diffMins = Math.floor(diffMs / 60000);
  var diffHours = Math.floor(diffMs / 3600000);
  var diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return diffMins + 'm ago';
  if (diffHours < 24) return diffHours + 'h ago';
  if (diffDays < 7) return diffDays + 'd ago';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function refreshAllTimestamps() {
  document.querySelectorAll('.time-ago[data-date]').forEach(function(el) {
    el.textContent = computeTimeAgo(el.getAttribute('data-date'));
  });
}

// Run on load and every 30 seconds
refreshAllTimestamps();
setInterval(refreshAllTimestamps, 30000);

// ===== PAGE FRESHNESS SIGNAL =====
function updateFreshness() {
  var meta = document.querySelector('meta[name="data-generated-at"]');
  if (!meta) return;
  var generatedAt = new Date(meta.getAttribute('content'));
  var now = new Date();
  var diffMs = now - generatedAt;
  var diffMins = Math.floor(diffMs / 60000);
  var dot = document.getElementById('liveDot');
  var freshLabel = document.getElementById('headerFreshness');

  if (diffMins < 1) {
    freshLabel.textContent = 'Updated just now';
  } else if (diffMins < 60) {
    freshLabel.textContent = 'Updated ' + diffMins + 'm ago';
  } else {
    var diffHours = Math.floor(diffMins / 60);
    freshLabel.textContent = 'Updated ' + diffHours + 'h ago';
  }

  dot.classList.remove('fresh', 'recent', 'stale');
  if (diffMins < 15) {
    dot.classList.add('fresh');
  } else if (diffMins < 60) {
    dot.classList.add('recent');
  } else {
    dot.classList.add('stale');
  }
}
updateFreshness();
setInterval(updateFreshness, 30000);

// ===== CARD TOGGLE =====
function toggleCard(card, e) {
  if (e && e.target.closest('a')) return;
  if (e && e.target.closest('.share-btn')) return;
  card.classList.toggle('expanded');
  var btn = card.querySelector('.expand-btn');
  if (btn) {
    btn.textContent = card.classList.contains('expanded') ? 'Show less' : 'Read more';
  }
}

// ===== SOURCE FILTER =====
var activeSourceFilter = 'all';
var activeTimeFilter = null;

function applyFilters() {
  var cards = document.querySelectorAll('.card');
  var visible = 0;
  var now = new Date();
  cards.forEach(function(card) {
    var sourceMatch = true;
    var timeMatch = true;

    if (activeSourceFilter !== 'all') {
      sourceMatch = card.getAttribute('data-source') === activeSourceFilter;
    }

    if (activeTimeFilter) {
      var dateStr = card.getAttribute('data-date');
      if (dateStr) {
        var articleDate = new Date(dateStr);
        var diffMs = now - articleDate;
        var diffHours = diffMs / 3600000;
        if (activeTimeFilter === '1h') {
          timeMatch = diffHours <= 1;
        } else if (activeTimeFilter === '3h') {
          timeMatch = diffHours <= 3;
        } else if (activeTimeFilter === '6h') {
          timeMatch = diffHours <= 6;
        } else if (activeTimeFilter === 'today') {
          var todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
          var articleDayStr = articleDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
          timeMatch = todayStr === articleDayStr;
        }
      }
    }

    if (sourceMatch && timeMatch) {
      card.style.display = '';
      visible++;
    } else {
      card.style.display = 'none';
    }
  });
  document.getElementById('articleCount').textContent = visible + ' articles shown';
}

function filterSource(source) {
  document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
  event.target.classList.add('active');
  activeSourceFilter = source;
  applyFilters();
}

function filterTime(period, btn) {
  var wasActive = btn.classList.contains('active');
  document.querySelectorAll('.time-filter-btn').forEach(function(b) { b.classList.remove('active'); });
  if (wasActive) {
    activeTimeFilter = null;
  } else {
    btn.classList.add('active');
    activeTimeFilter = period;
  }
  applyFilters();
}

// ===== SHARE BUTTON =====
function shareArticle(e) {
  e.stopPropagation();
  var btn = e.currentTarget;
  var title = btn.dataset.title;
  var url = btn.dataset.url;
  if (navigator.share) {
    navigator.share({ title: title, url: url }).catch(function() {});
  } else {
    navigator.clipboard.writeText(url).then(function() {
      btn.classList.add('copied');
      setTimeout(function() { btn.classList.remove('copied'); }, 1500);
    }).catch(function() {});
  }
}

// ===== BACK TO TOP BUTTON =====
var backToTopBtn = document.getElementById('backToTop');
window.addEventListener('scroll', function() {
  if (window.scrollY > 500) {
    backToTopBtn.classList.add('visible');
  } else {
    backToTopBtn.classList.remove('visible');
  }
});

// ===== UPDATE TOAST (show after 1 hour) =====
setTimeout(function() {
  document.getElementById('updateToast').classList.add('visible');
}, 1 * 60 * 60 * 1000);
