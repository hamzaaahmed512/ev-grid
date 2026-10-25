-- ============================================
-- VoltRelay — Database Verification Queries
-- File: db/verify.sql
-- Purpose: Run these in Supabase SQL Editor
--          to check if data is correct.
-- ============================================

-- 1. Total stations count (Expected: 169)
SELECT COUNT(*) AS total_stations FROM stations;

-- 2. Total connectors count (Expected: ~200+)
SELECT COUNT(*) AS total_connectors FROM connectors;

-- 3. Total unique cities (Expected: ~55)
SELECT COUNT(DISTINCT city) AS total_cities FROM stations;

-- 4. Stations per city (Top 10)
SELECT city, COUNT(*) AS station_count
FROM stations
GROUP BY city
ORDER BY station_count DESC
LIMIT 10;

-- 5. Connector types breakdown
SELECT connector_type, COUNT(*) AS count
FROM connectors
GROUP BY connector_type
ORDER BY count DESC;

-- 6. AC vs DC breakdown
SELECT charging_type, COUNT(*) AS count
FROM connectors
GROUP BY charging_type;

-- 7. Price range (min, max, average)
SELECT 
    MIN(price_per_kwh) AS cheapest,
    MAX(price_per_kwh) AS most_expensive,
    ROUND(AVG(price_per_kwh), 2) AS average_price
FROM stations
WHERE price_per_kwh IS NOT NULL;

-- 8. Stations with most connectors
SELECT s.name, s.city, COUNT(c.id) AS connector_count
FROM stations s
JOIN connectors c ON s.id = c.station_id
GROUP BY s.id, s.name, s.city
ORDER BY connector_count DESC
LIMIT 5;

-- 9. Orphan check (koi connector bina station ke toh nahi?)
SELECT COUNT(*) AS orphan_connectors
FROM connectors c
LEFT JOIN stations s ON c.station_id = s.id
WHERE s.id IS NULL;
-- Expected: 0 (agar > 0 hai toh problem hai)

-- 10. Sample data check (pehli 5 stations with connectors)
SELECT 
    s.name,
    s.city,
    s.status,
    s.price_per_kwh,
    c.connector_type,
    c.power_kw,
    c.charging_type
FROM stations s
JOIN connectors c ON s.id = c.station_id
ORDER BY s.id
LIMIT 10;