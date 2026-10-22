-- VoltRelay — Verification Queries

-- 1. Total Stations (Expected: 169)
SELECT COUNT(*) AS total_stations FROM stations;

-- 2. Total Connectors
SELECT COUNT(*) AS total_connectors FROM connectors;

-- 3. Total Cities (Expected: ~55)
SELECT COUNT(DISTINCT city) AS total_cities FROM stations;

-- 4. Stations Per City
SELECT city, COUNT(*) AS station_count 
FROM stations 
GROUP BY city 
ORDER BY station_count DESC;

-- 5. Connector Types Breakdown
SELECT connector_type, COUNT(*) AS count 
FROM connectors 
GROUP BY connector_type;