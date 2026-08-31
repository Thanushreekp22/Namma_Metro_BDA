# 🚇 Namma Metro Analytics — MongoDB Big Data Project

> Interactive web dashboard for exploring **synthetic** Bengaluru Metro (Namma Metro) ridership data, powered by **MongoDB** aggregation pipelines.

## 📋 Overview

This project demonstrates MongoDB's capabilities for storing, querying, and aggregating large datasets (~1M+ trip documents). It features:

- **83 real Namma Metro stations** across 3 operational lines (Purple, Green, Yellow)
- **~1 million synthetic trip records** with realistic bimodal ridership patterns
- **Interactive Leaflet.js map** with station markers, line polylines, and on-click stats
- **Journey planner** — number of stops, line changes, fare, distance & time to reach between any two stations (Dijkstra over the station graph, stored in MongoDB)
- **Route search** showing historical trip volume between any two stations
- **Recent searches** — every planned journey is persisted in MongoDB and shown as clickable history
- **Analytics dashboard** with top stations, peak hours, and busiest routes
- **Geospatial search** using MongoDB's `$geoNear` and 2dsphere index

## 🛠️ Tech Stack

| Layer     | Technology              |
|-----------|------------------------|
| Database  | MongoDB Atlas (cloud) — free M0 tier works |
| Backend   | Node.js + Express       |
| Frontend  | HTML/CSS/JS (no framework) |
| Map       | Leaflet.js + CartoDB Dark tiles |
| Charts    | Chart.js                |
| Styling   | Vanilla CSS (dark glassmorphism) |

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- A **MongoDB Atlas** cluster (free M0 tier is enough) — [create one here](https://www.mongodb.com/cloud/atlas/register)

### Atlas Setup (one time)

1. Create a free cluster (M0) on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register).
2. **Database Access** → create a database user (username + password).
3. **Network Access** → add your IP address (or `0.0.0.0/0` for demos).
4. **Database → Connect → Drivers** → copy the connection string (`mongodb+srv://...`).

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy .env.example to .env and paste your Atlas connection string (see below)

# 3. Seed the database (83 stations + ~5 lakh trip documents into Atlas, takes a few minutes)
npm run seed

# 4. Start the server
npm start
```

Open **http://localhost:3000** in your browser.

### Environment Variables (`.env`)

Copy `.env.example` to `.env` and paste your Atlas connection string:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
DB_NAME=blr_metro
PORT=3000
```

> ⚠️ `.env` is git-ignored — never commit real credentials. Use `.env.example` as the template.
> 💡 Local MongoDB also works if you prefer: `MONGODB_URI=mongodb://localhost:27017`

## 📁 Project Structure

```
blr-metro-bda/
├── data/
│   └── stations.json          # 83 stations with name/line/sequence/lat-lng
├── scripts/
│   └── seed.js                # Generates + inserts synthetic trips
├── server/
│   ├── index.js               # Express app entry point
│   ├── db.js                  # MongoDB connection singleton
│   ├── journeyPlanner.js      # Station graph + Dijkstra + fare/time model
│   └── routes/
│       ├── stations.js        # Station CRUD + stats
│       ├── routes.js          # Route search (from→to)
│       └── analytics.js       # Dashboard aggregations
├── public/
│   ├── index.html             # Main HTML (SPA-style)
│   ├── style.css              # Dark glassmorphism theme
│   ├── map.js                 # Leaflet map + markers
│   └── dashboard.js           # Charts + analytics
├── .env                       # MongoDB connection config
└── package.json
```

## 📊 MongoDB Features Demonstrated

| Feature | Usage |
|---------|-------|
| **2dsphere Index** | Geospatial "nearest station" queries via `$geoNear` |
| **Compound Index** | `{from_station, to_station, timestamp}` for fast route lookups |
| **Aggregation Pipeline** | `$match`, `$group`, `$sort`, `$limit`, `$lookup`, `$project` |
| **$group by $hour** | Peak hours analysis from timestamps |
| **$dateToString** | Daily breakdown aggregations |
| **Volume** | ~5 lakh (500K+) trip documents |
| **Upsert + `$inc`** | Journey plans cached in `journeys` with `search_count` counters |
| **Unique compound index** | `{from, to}` on `journeys` prevents duplicate plans |
| **4 collections** | `stations`, `trips`, `journeys`, `route_plans` |

## 🧭 Journey Planner Model

Journeys between any two stations are computed with **Dijkstra's algorithm** over a graph built from the `stations` collection:

| Component | Model |
|-----------|-------|
| Ride edges | Consecutive stations on the same line (by `sequence`) |
| Interchange edges | Same station name across different lines (Majestic: Purple ↔ Green, RV Road: Green ↔ Yellow) |
| Distance | Sum of haversine segment lengths × 1.2 track factor |
| Time | distance ÷ 32.5 km/h + 0.75 min dwell per stop + 5 min per interchange |
| Fare | Namma Metro-style 2 km slabs: ₹10 base → ₹60 max |

Every planned journey is **persisted to MongoDB**: cached in `journeys` (with a `search_count`) and logged to `route_plans`, which powers the clickable "Recent searches" UI.

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stations` | GET | List all 83 stations |
| `/api/stations/:id/stats` | GET | Hourly/daily ridership for a station |
| `/api/stations/nearby?lat=&lng=` | GET | Find nearest stations (geospatial) |
| `/api/routes?from=&to=` | GET | Trip volume between two stations |
| `/api/routes/journey?from=&to=` | GET | Journey planner: stops, fare, distance, time, line changes (stored in MongoDB) |
| `/api/routes/recent` | GET | Last 8 planned journeys (from `route_plans`) |
| `/api/analytics/top-stations` | GET | Top 10 busiest stations |
| `/api/analytics/top-routes` | GET | Top 15 busiest OD pairs |
| `/api/analytics/peak-hours` | GET | System-wide hourly distribution |
| `/api/analytics/line-stats` | GET | Per-line passenger totals |

## ⚠️ Data Disclaimer

All ridership data is **synthetic/generated** for demonstration purposes. Station names and locations are based on real Namma Metro stations, but trip volumes and passenger counts are entirely fictional. This project is a MongoDB Big Data Analytics course assignment.

## 📝 License

ISC
