"""
VoltRelay - Owner Analytics Service (Part 3)
Calculates earnings, statistics, and dashboard metrics for station owners.
"""

from datetime import datetime, date, time, timedelta, timezone
from typing import Optional, List, Dict, Any, Tuple
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.station import Station
from app.models.connector import Connector
from app.models.booking import Booking
from app.services.owner_bookings_service import list_upcoming_bookings


# ─── PURE FUNCTIONS ──────────────────────────────────────────────────────────

def compute_utilization_percent(booked_hours: float, open_hours: float) -> float:
    """
    Computes station utilization: (booked_hours / open_hours) * 100, capped at 100%.
    Returns 0.0 if open_hours <= 0.
    """
    if open_hours <= 0:
        return 0.0
    percent = (booked_hours / open_hours) * 100.0
    return min(100.0, max(0.0, round(percent, 2)))


def get_station_daily_open_hours(open_time: Optional[time], close_time: Optional[time]) -> float:
    """
    Returns operating hours per day.
    If open_time or close_time are None, assumes 24.0 hours per day.
    """
    if open_time is None or close_time is None:
        return 24.0
    t1 = open_time.hour + open_time.minute / 60.0 + open_time.second / 3600.0
    t2 = close_time.hour + close_time.minute / 60.0 + close_time.second / 3600.0
    diff = t2 - t1
    return max(0.0, round(diff, 2))


def _get_sql_expressions(db: Session, group_by: str = "day"):
    """
    Returns cross-dialect SQL expressions for duration, date grouping, price fallback,
    energy kWh, and revenue estimation. Works identically on SQLite and PostgreSQL.
    """
    is_sqlite = (db.bind.dialect.name == "sqlite") if db.bind else False
    if is_sqlite:
        duration_hours = (func.julianday(Booking.end_time) - func.julianday(Booking.start_time)) * 24.0
        date_group = func.strftime("%Y-%m-%d" if group_by == "day" else "%Y-%m", Booking.start_time)
    else:
        duration_hours = func.extract("epoch", Booking.end_time - Booking.start_time) / 3600.0
        date_group = func.to_char(Booking.start_time, "YYYY-MM-DD" if group_by == "day" else "YYYY-MM")

    # Price fallback: connector price if set, else station price, else 0
    price_expr = func.coalesce(Connector._price_per_kwh, Station.price_per_kwh, 0.0)
    energy_kwh = duration_hours * Connector.power_kw
    revenue = energy_kwh * price_expr
    return duration_hours, date_group, price_expr, energy_kwh, revenue


def _generate_time_series_points(
    date_from: date,
    date_to: date,
    group_by: str,
    aggregated_dict: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Generates continuous time series points with zero-value points for gaps.
    """
    points = []
    if group_by == "day":
        curr = date_from
        while curr <= date_to:
            key = curr.strftime("%Y-%m-%d")
            data = aggregated_dict.get(key, {})
            points.append({
                "date": key,
                "period": key,
                "estimated_revenue": round(float(data.get("revenue", 0.0)), 2),
                "estimated_energy_kwh": round(float(data.get("energy_kwh", 0.0)), 2),
                "completed_bookings": int(data.get("completed_bookings", 0)),
            })
            curr += timedelta(days=1)
    else:  # month
        y, m = date_from.year, date_from.month
        end_y, end_m = date_to.year, date_to.month
        while (y < end_y) or (y == end_y and m <= end_m):
            key = f"{y:04d}-{m:02d}"
            data = aggregated_dict.get(key, {})
            points.append({
                "date": key,
                "period": key,
                "estimated_revenue": round(float(data.get("revenue", 0.0)), 2),
                "estimated_energy_kwh": round(float(data.get("energy_kwh", 0.0)), 2),
                "completed_bookings": int(data.get("completed_bookings", 0)),
            })
            m += 1
            if m > 12:
                m = 1
                y += 1
    return points


# ─── OWNER EARNINGS ──────────────────────────────────────────────────────────

def get_owner_earnings(
    db: Session,
    owner_id: int,
    date_from: date,
    date_to: date,
    group_by: str = "day",
    station_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Computes estimated earnings totals, time series with zero gap-filling,
    and per-station breakdown for COMPLETED bookings.
    """
    if station_id is not None:
        station = (
            db.query(Station)
            .filter(
                Station.id == station_id,
                Station.owner_id == owner_id,
                Station.is_active == True,
            )
            .first()
        )
        if not station:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Station not found",
            )

    start_dt = datetime.combine(date_from, time.min).replace(tzinfo=timezone.utc)
    end_dt = datetime.combine(date_to, time.max).replace(tzinfo=timezone.utc)

    duration_hours, date_group, price_expr, energy_expr, revenue_expr = _get_sql_expressions(db, group_by)

    # 1. Aggregated totals in SQL
    totals_query = (
        db.query(
            func.count(Booking.id).label("completed_bookings"),
            func.coalesce(func.sum(energy_expr), 0.0).label("energy_kwh"),
            func.coalesce(func.sum(revenue_expr), 0.0).label("revenue"),
        )
        .select_from(Booking)
        .join(Connector, Booking.connector_id == Connector.id)
        .join(Station, Booking.station_id == Station.id)
        .filter(
            Station.owner_id == owner_id,
            Station.is_active == True,
            func.upper(Booking.status) == "COMPLETED",
            Booking.start_time >= start_dt,
            Booking.start_time <= end_dt,
        )
    )
    if station_id is not None:
        totals_query = totals_query.filter(Station.id == station_id)

    totals_row = totals_query.one()
    total_rev = round(float(totals_row.revenue or 0.0), 2)
    total_kwh = round(float(totals_row.energy_kwh or 0.0), 2)
    total_count = int(totals_row.completed_bookings or 0)

    # 2. Time series aggregation in SQL
    ts_query = (
        db.query(
            date_group.label("period"),
            func.count(Booking.id).label("completed_bookings"),
            func.coalesce(func.sum(energy_expr), 0.0).label("energy_kwh"),
            func.coalesce(func.sum(revenue_expr), 0.0).label("revenue"),
        )
        .select_from(Booking)
        .join(Connector, Booking.connector_id == Connector.id)
        .join(Station, Booking.station_id == Station.id)
        .filter(
            Station.owner_id == owner_id,
            Station.is_active == True,
            func.upper(Booking.status) == "COMPLETED",
            Booking.start_time >= start_dt,
            Booking.start_time <= end_dt,
        )
    )
    if station_id is not None:
        ts_query = ts_query.filter(Station.id == station_id)

    ts_rows = ts_query.group_by(date_group).all()
    aggregated_dict = {
        r.period: {
            "completed_bookings": r.completed_bookings,
            "energy_kwh": r.energy_kwh,
            "revenue": r.revenue,
        }
        for r in ts_rows
    }
    time_series = _generate_time_series_points(date_from, date_to, group_by, aggregated_dict)

    # 3. Per-station breakdown in SQL
    st_breakdown_query = (
        db.query(
            Station.id.label("station_id"),
            func.count(Booking.id).label("completed_bookings"),
            func.coalesce(func.sum(energy_expr), 0.0).label("energy_kwh"),
            func.coalesce(func.sum(revenue_expr), 0.0).label("revenue"),
        )
        .select_from(Booking)
        .join(Connector, Booking.connector_id == Connector.id)
        .join(Station, Booking.station_id == Station.id)
        .filter(
            Station.owner_id == owner_id,
            Station.is_active == True,
            func.upper(Booking.status) == "COMPLETED",
            Booking.start_time >= start_dt,
            Booking.start_time <= end_dt,
        )
    )
    if station_id is not None:
        st_breakdown_query = st_breakdown_query.filter(Station.id == station_id)

    st_rows = st_breakdown_query.group_by(Station.id).all()
    st_dict = {r.station_id: r for r in st_rows}

    # Fetch all active stations for the owner to ensure stations with 0 bookings appear
    owner_stations_query = (
        db.query(Station.id, Station.name)
        .filter(Station.owner_id == owner_id, Station.is_active == True)
    )
    if station_id is not None:
        owner_stations_query = owner_stations_query.filter(Station.id == station_id)
    owner_stations = owner_stations_query.order_by(Station.id.asc()).all()

    station_breakdown = []
    for s_id, s_name in owner_stations:
        r = st_dict.get(s_id)
        station_breakdown.append({
            "station_id": s_id,
            "station_name": s_name,
            "estimated_revenue": round(float(r.revenue), 2) if r else 0.0,
            "estimated_energy_kwh": round(float(r.energy_kwh), 2) if r else 0.0,
            "completed_bookings": int(r.completed_bookings) if r else 0,
        })

    totals_payload = {
        "estimated_revenue": total_rev,
        "estimated_energy_kwh": total_kwh,
        "completed_bookings": total_count,
    }

    return {
        "estimated_revenue": total_rev,
        "estimated_energy_kwh": total_kwh,
        "completed_bookings": total_count,
        "totals": totals_payload,
        "time_series": time_series,
        "station_breakdown": station_breakdown,
    }


# ─── OWNER DASHBOARD ─────────────────────────────────────────────────────────

def get_owner_dashboard(db: Session, owner_id: int) -> Dict[str, Any]:
    """
    Returns single-call summary of owner's business statistics, active connector counts,
    revenue trends, upcoming bookings, and 7-day utilization.
    """
    now_utc = datetime.now(timezone.utc)

    # 1. Total active stations
    total_stations = (
        db.query(func.count(Station.id))
        .filter(Station.owner_id == owner_id, Station.is_active == True)
        .scalar()
        or 0
    )

    # 2. Total active connectors across active stations
    total_connectors = (
        db.query(func.count(Connector.id))
        .join(Station, Connector.station_id == Station.id)
        .filter(
            Station.owner_id == owner_id,
            Station.is_active == True,
            Connector.is_active == True,
        )
        .scalar()
        or 0
    )

    # 3. Connectors count by status (active connectors only)
    status_query = (
        db.query(Connector.status, func.count(Connector.id))
        .join(Station, Connector.station_id == Station.id)
        .filter(
            Station.owner_id == owner_id,
            Station.is_active == True,
            Connector.is_active == True,
        )
        .group_by(Connector.status)
        .all()
    )
    connectors_by_status = {
        "AVAILABLE": 0,
        "CHARGING": 0,
        "FAULT": 0,
        "OFFLINE": 0,
        "DISABLED": 0,
    }
    for st_val, cnt in status_query:
        key = (st_val or "").strip().upper()
        connectors_by_status[key] = cnt

    # 4. Today's bookings count (UTC)
    today_start = datetime.combine(now_utc.date(), time.min).replace(tzinfo=timezone.utc)
    today_end = datetime.combine(now_utc.date(), time.max).replace(tzinfo=timezone.utc)
    today_bookings_count = (
        db.query(func.count(Booking.id))
        .join(Station, Booking.station_id == Station.id)
        .filter(
            Station.owner_id == owner_id,
            Station.is_active == True,
            Booking.start_time >= today_start,
            Booking.start_time <= today_end,
        )
        .scalar()
        or 0
    )

    # 5. Top 5 upcoming confirmed bookings
    upcoming_bookings = list_upcoming_bookings(db, owner_id=owner_id, limit=5)

    # 6. Revenue for this month and last month (COMPLETED bookings)
    duration_hours, _, price_expr, energy_expr, revenue_expr = _get_sql_expressions(db, group_by="day")

    year = now_utc.year
    month = now_utc.month
    this_month_start = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
    if month == 12:
        next_month_start = datetime(year + 1, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    else:
        next_month_start = datetime(year, month + 1, 1, 0, 0, 0, tzinfo=timezone.utc)

    if month == 1:
        last_month_start = datetime(year - 1, 12, 1, 0, 0, 0, tzinfo=timezone.utc)
    else:
        last_month_start = datetime(year, month - 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    last_month_end = this_month_start

    def _query_period_revenue(start_dt: datetime, end_dt: datetime) -> float:
        rev = (
            db.query(func.coalesce(func.sum(revenue_expr), 0.0))
            .select_from(Booking)
            .join(Connector, Booking.connector_id == Connector.id)
            .join(Station, Booking.station_id == Station.id)
            .filter(
                Station.owner_id == owner_id,
                Station.is_active == True,
                func.upper(Booking.status) == "COMPLETED",
                Booking.start_time >= start_dt,
                Booking.start_time < end_dt,
            )
            .scalar()
        )
        return round(float(rev or 0.0), 2)

    estimated_revenue_this_month = _query_period_revenue(this_month_start, next_month_start)
    estimated_revenue_last_month = _query_period_revenue(last_month_start, last_month_end)

    # 7. Utilization last 7 days per station
    window_start = now_utc - timedelta(days=7)
    window_end = now_utc

    booked_hours_query = (
        db.query(
            Booking.station_id,
            func.coalesce(func.sum(duration_hours), 0.0).label("booked_hours"),
        )
        .select_from(Booking)
        .join(Station, Booking.station_id == Station.id)
        .filter(
            Station.owner_id == owner_id,
            Station.is_active == True,
            func.upper(Booking.status).in_(["COMPLETED", "CONFIRMED"]),
            Booking.start_time >= window_start,
            Booking.start_time <= window_end,
        )
        .group_by(Booking.station_id)
        .all()
    )
    booked_dict = {r[0]: float(r[1]) for r in booked_hours_query}

    active_stations = (
        db.query(Station)
        .filter(Station.owner_id == owner_id, Station.is_active == True)
        .order_by(Station.id.asc())
        .all()
    )

    utilization_last_7_days = []
    for st in active_stations:
        daily_open = get_station_daily_open_hours(st.open_time, st.close_time)
        open_hours = daily_open * 7.0
        b_hours = booked_dict.get(st.id, 0.0)
        util_percent = compute_utilization_percent(b_hours, open_hours)
        utilization_last_7_days.append({
            "station_id": st.id,
            "station_name": st.name,
            "utilization_percent": util_percent,
            "booked_hours": round(b_hours, 2),
            "open_hours": round(open_hours, 2),
        })

    return {
        "total_stations": total_stations,
        "total_connectors": total_connectors,
        "connectors_by_status": connectors_by_status,
        "today_bookings_count": today_bookings_count,
        "upcoming_bookings": upcoming_bookings,
        "estimated_revenue_this_month": estimated_revenue_this_month,
        "estimated_revenue_last_month": estimated_revenue_last_month,
        "utilization_last_7_days": utilization_last_7_days,
    }
