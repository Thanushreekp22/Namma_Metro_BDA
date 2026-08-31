/**
 * Journey Planner — Route computation between stations
 * =====================================================
 * Builds a weighted graph of the metro network from the `stations`
 * collection and computes the best journey using Dijkstra's algorithm.
 *
 * Graph model:
 *  - Ride edge        : consecutive stations on the same line (by `sequence`).
 *                       Weight = travel minutes (distance / avg speed + dwell time).
 *  - Interchange edge : stations sharing the same name across different lines
 *                       (e.g. Majestic on Purple/Green, RV Road on Green/Yellow).
 *                       Weight = INTERCHANGE_MIN minutes.
 *
 * Metrics produced per journey:
 *  - stops         : number of ride hops (stations travelled through)
 *  - distance_km   : sum of haversine segment lengths × track factor
 *  - fare          : Namma Metro-style 2 km slab model (₹10 → ₹60 max)
 *  - duration_min  : total minutes incl. dwell time + interchange penalty
 *  - interchanges  : where to change lines, and between which lines
 */

// ── Configuration ──
const RAIL_DISTANCE_FACTOR = 1.2;  // straight-line → approximate track distance
const AVG_SPEED_KMPH = 32.5;       // average commercial speed incl. stops
const DWELL_MIN_PER_STOP = 0.75;   // minutes spent at each intermediate station
const INTERCHANGE_MIN = 5;         // walking/boarding time per line change
const FARE_SLABS = [10, 15, 20, 30, 35, 40, 45, 50, 60, 60]; // ₹ per 2 km slab (max ₹60)

// ── Station cache (5 min TTL) — avoids re-fetching from MongoDB every search ──
let stationCache = { data: null, at: 0 };
const STATION_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Load all stations from the `stations` collection (cached).
 */
async function loadStations(db) {
  if (stationCache.data && Date.now() - stationCache.at < STATION_CACHE_TTL_MS) {
    return stationCache.data;
  }
  const stations = await db.collection('stations')
    .find({})
    .sort({ line: 1, sequence: 1 })
    .toArray();
  stationCache = { data: stations, at: Date.now() };
  return stations;
}

/** Drop the in-memory station cache (e.g. after re-seeding). */
function invalidateStationCache() {
  stationCache = { data: null, at: 0 };
}

/**
 * Great-circle distance between two [lng, lat] GeoJSON coordinates, in km.
 */
function haversineKm(coordA, coordB) {
  const toRad = (d) => (d * Math.PI) / 180;
  const [lng1, lat1] = coordA;
  const [lng2, lat2] = coordB;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Build the adjacency graph.
 * Returns { adj: Map<stationId, Array<{to, km, type}>>, byId: Map<stationId, station> }
 */
function buildGraph(stations) {
  const adj = new Map();
  const byId = new Map();
  for (const s of stations) {
    adj.set(s._id, []);
    byId.set(s._id, s);
  }

  // ── Ride edges: consecutive stations on the same line ──
  const byLine = new Map();
  for (const s of stations) {
    if (!byLine.has(s.line)) byLine.set(s.line, []);
    byLine.get(s.line).push(s);
  }
  for (const list of byLine.values()) {
    list.sort((a, b) => a.sequence - b.sequence);
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      const km =
        haversineKm(a.location.coordinates, b.location.coordinates) *
        RAIL_DISTANCE_FACTOR;
      adj.get(a._id).push({ to: b._id, km, type: 'ride' });
      adj.get(b._id).push({ to: a._id, km, type: 'ride' });
    }
  }

  // ── Interchange edges: same station name across different lines ──
  const byName = new Map();
  for (const s of stations) {
    const key = s.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(s);
  }
  for (const group of byName.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (a.line === b.line) continue;
        adj.get(a._id).push({ to: b._id, km: 0, type: 'interchange' });
        adj.get(b._id).push({ to: a._id, km: 0, type: 'interchange' });
      }
    }
  }

  return { adj, byId };
}

// ── Journey computation (Dijkstra + metrics) ──

/** Minutes cost of traversing an edge. */
function edgeMinutes(edge) {
  if (edge.type === 'interchange') return INTERCHANGE_MIN;
  return (edge.km / AVG_SPEED_KMPH) * 60 + DWELL_MIN_PER_STOP;
}

/** Namma Metro-style fare: 2 km slabs, ₹10 base, ₹60 max. */
function computeFare(km) {
  const slab = Math.min(Math.max(Math.ceil(km / 2), 1), FARE_SLABS.length);
  return FARE_SLABS[slab - 1];
}

/**
 * Compute the best journey between two station IDs.
 * Returns null if either station is unknown or no path exists.
 */
function planJourney(stations, fromId, toId) {
  const { adj, byId } = buildGraph(stations);
  if (!byId.has(fromId) || !byId.has(toId)) return null;

  // ── Dijkstra on minutes (graph is small — array scan is fine) ──
  const dist = new Map();
  const prev = new Map();
  const visited = new Set();
  for (const id of adj.keys()) dist.set(id, Infinity);
  dist.set(fromId, 0);

  for (;;) {
    let u = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) {
        best = d;
        u = id;
      }
    }
    if (u === null || u === toId) break;
    visited.add(u);
    for (const e of adj.get(u)) {
      const t = best + edgeMinutes(e);
      if (t < dist.get(e.to)) {
        dist.set(e.to, t);
        prev.set(e.to, { id: u, edge: e });
      }
    }
  }

  if (dist.get(toId) === Infinity) return null;

  // ── Reconstruct path (origin → destination) ──
  const chain = [];
  let cur = toId;
  while (cur !== fromId) {
    chain.push({ id: cur, via: prev.get(cur) });
    cur = prev.get(cur).id;
  }
  chain.push({ id: fromId, via: null });
  chain.reverse();
  const pathIds = chain.map((c) => c.id);

  // ── Metrics ──
  let distanceKm = 0;
  let stops = 0;
  const interchanges = [];
  for (let i = 1; i < chain.length; i++) {
    const e = chain[i].via.edge;
    if (e.type === 'ride') {
      distanceKm += e.km;
      stops += 1;
    } else {
      const leaving = byId.get(chain[i - 1].id);
      const arriving = byId.get(chain[i].id);
      interchanges.push({
        station_id: arriving._id,
        name: arriving.name,
        from_line: leaving.line,
        to_line: arriving.line
      });
    }
  }
  distanceKm = Math.round(distanceKm * 10) / 10;
  const durationMin = Math.max(1, Math.round(dist.get(toId)));
  const fare = computeFare(distanceKm);

  const from = byId.get(fromId);
  const to = byId.get(toId);
  const linesUsed = [];
  for (const id of pathIds) {
    const l = byId.get(id).line;
    if (!linesUsed.includes(l)) linesUsed.push(l);
  }

  return {
    from: { station_id: from._id, name: from.name, line: from.line },
    to: { station_id: to._id, name: to.name, line: to.line },
    stops,
    distance_km: distanceKm,
    fare,
    duration_min: durationMin,
    line_change: interchanges.length > 0,
    interchange_count: interchanges.length,
    interchanges,
    lines_used: linesUsed,
    path: pathIds.map((id) => {
      const s = byId.get(id);
      return { station_id: s._id, name: s.name, line: s.line, sequence: s.sequence };
    })
  };
}

module.exports = {
  loadStations,
  planJourney,
  computeFare,
  invalidateStationCache,
  FARE_SLABS,
  INTERCHANGE_MIN,
  AVG_SPEED_KMPH,
  RAIL_DISTANCE_FACTOR
};
