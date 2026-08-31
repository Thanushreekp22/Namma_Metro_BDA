/**
 * Namma Metro Dashboard — Analytics & Route Search
 * ==================================================
 * - Top 10 busiest stations bar chart
 * - System-wide peak hours chart
 * - Per-line ridership doughnut chart
 * - Top 15 busiest routes table
 * - Route search with daily volume line charts
 * - Nearby stations with geospatial search
 */

// ── Chart.js Default Config ──
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(148, 163, 184, 0.08)';
Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";

// ── Chart instances ──
let topStationsChart = null;
let peakHoursChart = null;
let lineStatsChart = null;
let routeForwardChart = null;
let routeReverseChart = null;

// ── Tooltip Config ──
const tooltipConfig = {
  backgroundColor: 'rgba(10, 14, 26, 0.92)',
  titleColor: '#f1f5f9',
  bodyColor: '#94a3b8',
  borderColor: 'rgba(148, 163, 184, 0.15)',
  borderWidth: 1,
  cornerRadius: 8,
  padding: 12,
  titleFont: { weight: '600' }
};

// ── Load Dashboard ──
async function loadDashboard() {
  try {
    const [topStations, peakHours, lineStats, topRoutes, stationsData] = await Promise.all([
      fetch('/api/analytics/top-stations').then(r => r.json()),
      fetch('/api/analytics/peak-hours').then(r => r.json()),
      fetch('/api/analytics/line-stats').then(r => r.json()),
      fetch('/api/analytics/top-routes').then(r => r.json()),
      fetch('/api/stations').then(r => r.json())
    ]);

    // ── Summary Stats ──
    const totalPassengers = topStations.reduce((sum, s) => sum + s.total_passengers, 0);
    const totalTrips = topStations.reduce((sum, s) => sum + s.total_trips, 0);
    // Better: use line stats for true totals
    const lineTotal = lineStats.reduce((sum, l) => sum + l.passengers, 0);
    const lineTripTotal = lineStats.reduce((sum, l) => sum + l.trips, 0);

    document.getElementById('stat-stations').textContent = stationsData.length;
    document.getElementById('stat-trips').textContent = formatNumber(lineTripTotal);
    document.getElementById('stat-passengers').textContent = formatNumber(lineTotal);

    // ── Top Stations Bar Chart ──
    renderTopStationsChart(topStations);

    // ── Peak Hours Chart ──
    renderPeakHoursChart(peakHours);

    // ── Line Stats Doughnut ──
    renderLineStatsChart(lineStats);

    // ── Top Routes Table ──
    renderTopRoutesTable(topRoutes);

    console.log('📊 Dashboard loaded');
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

// ── Top 10 Stations ──
function renderTopStationsChart(data) {
  const ctx = document.getElementById('top-stations-chart');
  if (topStationsChart) topStationsChart.destroy();

  const labels = data.map(d => {
    const name = d.station_name || d.station_id;
    return name.length > 20 ? name.slice(0, 18) + '…' : name;
  });

  const colors = data.map(d => {
    const lc = window.LINE_COLORS || { Purple: '#a855f7', Green: '#22c55e', Yellow: '#eab308' };
    return (lc[d.line] || '#6366f1') + 'cc';
  });

  topStationsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Total Passengers',
        data: data.map(d => d.total_passengers),
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('cc', '')),
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.7
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipConfig,
          callbacks: {
            title: (items) => data[items[0].dataIndex].station_name || data[items[0].dataIndex].station_id,
            label: (ctx) => `${formatNumber(ctx.raw)} passengers (${data[ctx.dataIndex].line} Line)`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            callback: (val) => formatNumber(val),
            font: { size: 11 }
          },
          grid: { color: 'rgba(148, 163, 184, 0.06)' }
        },
        y: {
          ticks: { font: { size: 11 } },
          grid: { display: false }
        }
      }
    }
  });
}

// ── Peak Hours ──
function renderPeakHoursChart(data) {
  const ctx = document.getElementById('peak-hours-chart');
  if (peakHoursChart) peakHoursChart.destroy();

  // Ensure we have all 24 hours
  const hourData = new Array(24).fill(0);
  for (const d of data) {
    hourData[d.hour] = d.passengers;
  }

  // Create gradient
  const canvas = ctx;
  const chartCtx = canvas.getContext('2d');
  const gradient = chartCtx.createLinearGradient(0, 0, 0, 280);
  gradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
  gradient.addColorStop(1, 'rgba(99, 102, 241, 0.02)');

  peakHoursChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`),
      datasets: [{
        label: 'Passengers',
        data: hourData,
        fill: true,
        backgroundColor: gradient,
        borderColor: '#6366f1',
        borderWidth: 2.5,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#6366f1',
        pointBorderColor: '#0a0e1a',
        pointBorderWidth: 2,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#818cf8'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipConfig,
          callbacks: {
            label: (ctx) => `${formatNumber(ctx.raw)} passengers`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 0,
            font: { size: 10 },
            callback: (val, idx) => idx % 3 === 0 ? `${idx}:00` : ''
          },
          grid: { color: 'rgba(148, 163, 184, 0.05)' }
        },
        y: {
          ticks: {
            callback: (val) => formatNumber(val),
            font: { size: 11 }
          },
          grid: { color: 'rgba(148, 163, 184, 0.06)' },
          beginAtZero: true
        }
      }
    }
  });
}

// ── Line Stats Doughnut ──
function renderLineStatsChart(data) {
  const ctx = document.getElementById('line-stats-chart');
  if (lineStatsChart) lineStatsChart.destroy();

  const lc = { Purple: '#a855f7', Green: '#22c55e', Yellow: '#eab308' };

  lineStatsChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.line + ' Line'),
      datasets: [{
        data: data.map(d => d.passengers),
        backgroundColor: data.map(d => lc[d.line] || '#6366f1'),
        borderColor: '#111827',
        borderWidth: 3,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 16,
            usePointStyle: true,
            pointStyle: 'circle',
            font: { size: 12, weight: '500' }
          }
        },
        tooltip: {
          ...tooltipConfig,
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((ctx.raw / total) * 100).toFixed(1);
              return `${formatNumber(ctx.raw)} passengers (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// ── Top Routes Table ──
function renderTopRoutesTable(data) {
  const tbody = document.getElementById('top-routes-tbody');
  if (!tbody) return;

  tbody.innerHTML = data.map((r, i) => `
    <tr class="fade-in" style="animation-delay: ${i * 30}ms">
      <td class="rank">${i + 1}</td>
      <td>${r.from_name || r.from_station}</td>
      <td>${r.to_name || r.to_station}</td>
      <td class="passengers">${formatNumber(r.total_passengers)}</td>
    </tr>
  `).join('');
}

// ══════════════════════════════════
// ── Route Search
// ══════════════════════════════════

// Populate station dropdowns
async function populateStationDropdowns() {
  try {
    // Wait for allStations to be populated by map.js
    let attempts = 0;
    while ((!window.allStations || window.allStations.length === 0) && attempts < 50) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }

    const stations = window.allStations || [];
    if (stations.length === 0) {
      const res = await fetch('/api/stations');
      window.allStations = await res.json();
    }

    const fromSelect = document.getElementById('from-station');
    const toSelect = document.getElementById('to-station');

    // Group by line
    const byLine = {};
    for (const s of window.allStations) {
      if (!byLine[s.line]) byLine[s.line] = [];
      byLine[s.line].push(s);
    }

    for (const [line, stns] of Object.entries(byLine)) {
      stns.sort((a, b) => a.sequence - b.sequence);

      const fromGroup = document.createElement('optgroup');
      fromGroup.label = `${line} Line`;
      const toGroup = document.createElement('optgroup');
      toGroup.label = `${line} Line`;

      for (const s of stns) {
        const opt1 = new Option(s.name, s._id);
        const opt2 = new Option(s.name, s._id);
        fromGroup.appendChild(opt1);
        toGroup.appendChild(opt2);
      }

      fromSelect.appendChild(fromGroup);
      toSelect.appendChild(toGroup);
    }
  } catch (err) {
    console.error('Failed to populate dropdowns:', err);
  }
}

// Handle route search
document.getElementById('route-search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const from = document.getElementById('from-station').value;
  const to = document.getElementById('to-station').value;
  if (!from || !to) return;
  if (from === to) {
    alert('Please select different stations.');
    return;
  }
  runRouteSearch(from, to);
});

async function runRouteSearch(from, to) {
  const btn = document.getElementById('btn-search-route');
  btn.textContent = 'Searching...';
  btn.disabled = true;

  try {
    // Journey plan + historical trip volume, in parallel
    const [routeRes, journeyRes] = await Promise.all([
      fetch(`/api/routes?from=${from}&to=${to}`),
      fetch(`/api/routes/journey?from=${from}&to=${to}`).catch(() => null)
    ]);
    const data = await routeRes.json();
    let journey = null;
    try { journey = journeyRes ? await journeyRes.json() : null; } catch { journey = null; }

    // Show results
    const resultsEl = document.getElementById('route-results');
    resultsEl.classList.add('visible');

    // Find station names
    const fromStation = (window.allStations || []).find(s => s._id === from);
    const toStation = (window.allStations || []).find(s => s._id === to);

    document.getElementById('route-from-name').textContent = (journey && journey.from?.name) || fromStation?.name || from;
    document.getElementById('route-to-name').textContent = (journey && journey.to?.name) || toStation?.name || to;
    document.getElementById('route-avg-passengers').textContent = formatNumber(data.avg_passengers_per_day);
    document.getElementById('route-total-trips').textContent = formatNumber(data.total_trips);
    document.getElementById('route-total-passengers').textContent = formatNumber(data.total_passengers);

    // ── Forward Chart ──
    renderRouteChart('route-forward-chart', data.forward_daily, '#6366f1', 'routeForward');

    // ── Reverse Chart ──
    renderRouteChart('route-reverse-chart', data.reverse_daily, '#a855f7', 'routeReverse');

    // ── Journey Details (stops / fare / distance / time / line change) ──
    if (journey && !journey.error) {
      renderJourney(journey);
    }

    // ── Refresh recent searches ──
    loadRecentSearches();

  } catch (err) {
    console.error('Route search failed:', err);
    alert('Failed to search route. Check console.');
  } finally {
    btn.textContent = 'Search Route';
    btn.disabled = false;
  }
}

function renderRouteChart(canvasId, dailyData, color, chartKey) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  // Destroy existing
  if (chartKey === 'routeForward' && routeForwardChart) routeForwardChart.destroy();
  if (chartKey === 'routeReverse' && routeReverseChart) routeReverseChart.destroy();

  const chartCtx = ctx.getContext('2d');
  const gradient = chartCtx.createLinearGradient(0, 0, 0, 280);
  gradient.addColorStop(0, color + '40');
  gradient.addColorStop(1, color + '05');

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dailyData.map(d => {
        const date = new Date(d.date);
        return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      }),
      datasets: [{
        label: 'Passengers',
        data: dailyData.map(d => d.passengers),
        fill: true,
        backgroundColor: gradient,
        borderColor: color,
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: color
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipConfig,
          callbacks: {
            title: (items) => dailyData[items[0].dataIndex].date,
            label: (ctx) => `${formatNumber(ctx.raw)} passengers`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 0,
            font: { size: 10 },
            maxTicksLimit: 12
          },
          grid: { color: 'rgba(148, 163, 184, 0.05)' }
        },
        y: {
          ticks: {
            callback: (val) => formatNumber(val),
            font: { size: 11 }
          },
          grid: { color: 'rgba(148, 163, 184, 0.06)' },
          beginAtZero: true
        }
      }
    }
  });

  if (chartKey === 'routeForward') routeForwardChart = chart;
  if (chartKey === 'routeReverse') routeReverseChart = chart;
}

// ══════════════════════════════════
// ── Nearby Stations
// ══════════════════════════════════

document.getElementById('nearby-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const lat = document.getElementById('nearby-lat').value;
  const lng = document.getElementById('nearby-lng').value;
  await searchNearby(lat, lng);
});

document.getElementById('btn-use-location').addEventListener('click', () => {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      document.getElementById('nearby-lat').value = pos.coords.latitude.toFixed(4);
      document.getElementById('nearby-lng').value = pos.coords.longitude.toFixed(4);
      searchNearby(pos.coords.latitude, pos.coords.longitude);
    },
    (err) => {
      alert('Unable to get your location: ' + err.message);
    }
  );
});

async function searchNearby(lat, lng) {
  try {
    const res = await fetch(`/api/stations/nearby?lat=${lat}&lng=${lng}&limit=10`);
    const data = await res.json();

    const container = document.getElementById('nearby-results');
    const lc = { Purple: '#a855f7', Green: '#22c55e', Yellow: '#eab308' };

    container.innerHTML = data.map((s, i) => {
      const distKm = (s.distance_meters / 1000).toFixed(2);
      const color = lc[s.line] || '#6366f1';
      return `
        <div class="nearby-card fade-in" style="animation-delay: ${i * 50}ms; border-left: 3px solid ${color};">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong style="font-size:15px;">${s.name}</strong>
            <span class="distance">${distKm} km</span>
          </div>
          <span class="popup-line-badge ${s.line.toLowerCase()}" style="margin-bottom:4px;">
            ● ${s.line} Line
          </span>
          <div style="margin-top:8px;font-size:12px;color:var(--text-muted);">
            ${s.is_interchange ? '⇄ Interchange Station · ' : ''}
            Station #${s.sequence} · ${s.distance_meters.toFixed(0)}m away
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Nearby search failed:', err);
  }
}

// ══════════════════════════════════
// ── Journey Planner Rendering
// ══════════════════════════════════

function renderJourney(j) {
  document.getElementById('jd-stops').textContent = j.stops;
  document.getElementById('jd-distance').textContent = j.distance_km + ' km';
  document.getElementById('jd-fare').textContent = '₹' + j.fare;
  document.getElementById('jd-time').textContent = j.duration_min + ' min';

  const lineChangeEl = document.getElementById('jd-line-change');
  const infoEl = document.getElementById('jd-interchange-info');
  if (j.line_change) {
    lineChangeEl.textContent = 'Yes';
    lineChangeEl.style.color = 'var(--warning)';
    infoEl.textContent = j.interchanges
      .map(ic => `${ic.name} (${ic.from_line} → ${ic.to_line})`)
      .join(' · ');
  } else {
    lineChangeEl.textContent = 'No';
    lineChangeEl.style.color = 'var(--success)';
    infoEl.textContent = 'Same line · direct journey';
  }

  renderRoutePath(j.path || []);

  const noteEl = document.getElementById('journey-note');
  const searched = j.search_count ? `searched ${j.search_count} time${j.search_count > 1 ? 's' : ''}` : 'first search';
  const computed = j.computed_at ? `first computed ${new Date(j.computed_at).toLocaleString()}` : 'computed just now';
  noteEl.textContent = `💾 Plan stored in MongoDB (journeys collection) · ${searched} · ${computed} · Route via ${j.lines_used.join(' + ')} Line`;
}

function renderRoutePath(path) {
  const el = document.getElementById('route-path');
  const lc = window.LINE_COLORS || { Purple: '#a855f7', Green: '#22c55e', Yellow: '#eab308' };

  el.innerHTML = path.map((s, i) => {
    const isInterchange =
      (i > 0 && path[i - 1].line !== s.line) ||
      (i < path.length - 1 && path[i + 1].line !== s.line);
    const arrow = i < path.length - 1 ? '<span class="path-arrow">➜</span>' : '';
    return `<span class="path-chip${isInterchange ? ' interchange' : ''}" title="${s.name} · ${s.line} Line · Station #${s.sequence}">
      <span class="dot" style="background:${lc[s.line] || '#6366f1'}"></span>${s.name}${isInterchange ? ' ⇄' : ''}
    </span>${arrow}`;
  }).join('');
}

// ── Recent Searches (from MongoDB · route_plans) ──
async function loadRecentSearches() {
  try {
    const res = await fetch('/api/routes/recent');
    const items = await res.json();
    const el = document.getElementById('recent-searches');
    if (!items || !items.length) {
      el.innerHTML = '<span class="recent-label">🕘 Recent searches</span><span style="font-size:12px;color:var(--text-muted);">No journeys planned yet — search above to get started.</span>';
      return;
    }
    el.innerHTML = '<span class="recent-label">🕘 Recent searches</span>' + items.map(it =>
      `<button type="button" class="recent-chip" data-from="${it.from}" data-to="${it.to}" title="₹${it.fare} · ${it.duration_min} min · ${it.stops} stops">
        ${it.from_name} → ${it.to_name}
      </button>`
    ).join('');

    el.querySelectorAll('.recent-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.getElementById('from-station').value = chip.dataset.from;
        document.getElementById('to-station').value = chip.dataset.to;
        runRouteSearch(chip.dataset.from, chip.dataset.to);
      });
    });
  } catch (err) {
    console.error('Failed to load recent searches:', err);
  }
}

// ── Initialize ──
populateStationDropdowns();
loadRecentSearches();
