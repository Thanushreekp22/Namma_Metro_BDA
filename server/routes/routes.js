/**
 * Routes API
 * GET /api/routes?from=STATION_A&to=STATION_B
 * Returns historical trip volume between two stations over the last 90 days.
 */
const express = require('express');
const router = express.Router();
const { getDB } = require('../db');
const { loadStations, planJourney } = require('../journeyPlanner');

// Ensure persistence indexes are created once per process
let journeyIndexesReady = false;
async function ensureJourneyIndexes(db) {
  if (journeyIndexesReady) return;
  await db.collection('journeys').createIndex({ from: 1, to: 1 }, { unique: true });
  await db.collection('route_plans').createIndex({ searched_at: -1 });
  journeyIndexesReady = true;
}

/**
 * GET /api/routes?from=WHITEFIELD&to=MAJESTIC
 * Returns:
 *  - daily breakdown of trip volume and passengers
 *  - average passengers per day
 *  - total trips and passengers
 */
router.get('/', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to query params are required' });
    }

    const db = getDB();

    // Daily breakdown
    const dailyPipeline = [
      {
        $match: {
          from_station: from,
          to_station: to
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
          },
          total_passengers: { $sum: '$passenger_count' },
          trip_count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ];

    // Also get the reverse direction
    const reverseDailyPipeline = [
      {
        $match: {
          from_station: to,
          to_station: from
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
          },
          total_passengers: { $sum: '$passenger_count' },
          trip_count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ];

    // Total aggregate
    const totalPipeline = [
      {
        $match: {
          $or: [
            { from_station: from, to_station: to },
            { from_station: to, to_station: from }
          ]
        }
      },
      {
        $group: {
          _id: null,
          total_passengers: { $sum: '$passenger_count' },
          total_trips: { $sum: 1 }
        }
      }
    ];

    const [daily, reverseDaily, totalArr] = await Promise.all([
      db.collection('trips').aggregate(dailyPipeline).toArray(),
      db.collection('trips').aggregate(reverseDailyPipeline).toArray(),
      db.collection('trips').aggregate(totalPipeline).toArray()
    ]);

    const total = totalArr[0] || { total_passengers: 0, total_trips: 0 };
    const daysWithData = Math.max(daily.length, 1);
    const avgPassengersPerDay = Math.round(total.total_passengers / daysWithData);

    res.json({
      from_station: from,
      to_station: to,
      total_passengers: total.total_passengers,
      total_trips: total.total_trips,
      avg_passengers_per_day: avgPassengersPerDay,
      forward_daily: daily.map(d => ({
        date: d._id,
        passengers: d.total_passengers,
        trips: d.trip_count
      })),
      reverse_daily: reverseDaily.map(d => ({
        date: d._id,
        passengers: d.total_passengers,
        trips: d.trip_count
      }))
    });
  } catch (err) {
    console.error('Error fetching route data:', err);
    res.status(500).json({ error: 'Failed to fetch route data' });
  }
});

/**
 * GET /api/routes/journey?from=WHITEFIELD&to=MAGADI_ROAD
 * Plans a journey between two stations:
 *  - number of stops, distance, fare, time to reach, line changes
 *  - full station-by-station path
 * Results are cached in the `journeys` collection (upsert + search_count)
 * and every search is logged to `route_plans` for history.
 */
router.get('/journey', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to query params are required' });
    }
    if (from === to) {
      return res.status(400).json({ error: 'from and to must be different stations' });
    }

    const db = getDB();
    await ensureJourneyIndexes(db);

    // 1. Load station graph (cached) and compute the journey
    const stations = await loadStations(db);
    if (!stations.length) {
      return res.status(503).json({ error: 'Stations not seeded yet. Run npm run seed.' });
    }
    const plan = planJourney(stations, from, to);
    if (!plan) {
      return res.status(404).json({ error: 'Station not found or no route available' });
    }

    // 2. Persist: upsert the plan into `journeys` (cache + analytics)
    await db.collection('journeys').updateOne(
      { from, to },
      {
        $set: {
          from,
          to,
          from_name: plan.from.name,
          from_line: plan.from.line,
          to_name: plan.to.name,
          to_line: plan.to.line,
          stops: plan.stops,
          distance_km: plan.distance_km,
          fare: plan.fare,
          duration_min: plan.duration_min,
          line_change: plan.line_change,
          interchange_count: plan.interchange_count,
          interchanges: plan.interchanges,
          lines_used: plan.lines_used,
          path: plan.path,
          updated_at: new Date()
        },
        $setOnInsert: { computed_at: new Date() },
        $inc: { search_count: 1 }
      },
      { upsert: true }
    );

    // 3. Persist: log every search into `route_plans` (history)
    await db.collection('route_plans').insertOne({
      from,
      to,
      from_name: plan.from.name,
      to_name: plan.to.name,
      stops: plan.stops,
      distance_km: plan.distance_km,
      fare: plan.fare,
      duration_min: plan.duration_min,
      line_change: plan.line_change,
      searched_at: new Date()
    });

    // 4. Return plan + persistence metadata
    const stored = await db.collection('journeys').findOne(
      { from, to },
      { projection: { computed_at: 1, search_count: 1 } }
    );

    res.json({
      ...plan,
      computed_at: stored?.computed_at || null,
      search_count: stored?.search_count || 1,
      stored_in: 'journeys'
    });
  } catch (err) {
    console.error('Error planning journey:', err);
    res.status(500).json({ error: 'Failed to plan journey' });
  }
});

/**
 * GET /api/routes/recent
 * Returns the last 8 planned journeys (from `route_plans`).
 */
router.get('/recent', async (req, res) => {
  try {
    const db = getDB();
    const plans = await db.collection('route_plans')
      .find({})
      .sort({ searched_at: -1 })
      .limit(8)
      .project({ from: 1, to: 1, from_name: 1, to_name: 1, stops: 1, fare: 1, duration_min: 1, searched_at: 1 })
      .toArray();
    res.json(plans);
  } catch (err) {
    console.error('Error fetching recent journeys:', err);
    res.status(500).json({ error: 'Failed to fetch recent journeys' });
  }
});

module.exports = router;
