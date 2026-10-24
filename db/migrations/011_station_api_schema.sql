-- Ensure the station API schema exists without deleting existing listings.
CREATE TABLE IF NOT EXISTS stations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address TEXT,
    status VARCHAR(30) DEFAULT 'AVAILABLE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE stations
    ADD COLUMN IF NOT EXISTS city VARCHAR(50),
    ADD COLUMN IF NOT EXISTS price_per_kwh DECIMAL(6, 2);

CREATE TABLE IF NOT EXISTS connectors (
    id SERIAL PRIMARY KEY,
    station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    connector_type VARCHAR(50) NOT NULL,
    max_power_kw DECIMAL(6, 2) NOT NULL DEFAULT 50.00,
    price_per_kwh DECIMAL(6, 2) NOT NULL DEFAULT 45.00,
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_connectors_station ON connectors(station_id);
CREATE INDEX IF NOT EXISTS idx_connectors_type ON connectors(connector_type);
