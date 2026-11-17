using EvGrid.Domain.Enums;
using EvGrid.Domain.Exceptions;

namespace EvGrid.Domain.Entities;

/// <summary>
/// Maps to the real 'connectors' table in the database.
/// Each row = one bookable charging plug at a station.
/// </summary>
public class ChargingPoint
{
    private decimal _powerKw;

    public int Id { get; set; }
    public int StationId { get; set; }
    public Station? Station { get; set; }

    // ── Existing DB columns ────────────────────────────────────────────────────

    /// <summary>
    /// DB column: connector_type (varchar 20). Stored as string in DB.
    /// Domain code uses the ConnectorType enum via the property below.
    /// </summary>
    public string ConnectorTypeRaw { get; set; } = string.Empty;

    /// <summary>
    /// Domain-friendly view of ConnectorTypeRaw.
    /// Accepts any ConnectorType enum member; writes its name to ConnectorTypeRaw.
    /// </summary>
    public ConnectorType ConnectorType
    {
        get => Enum.TryParse<ConnectorType>(ConnectorTypeRaw.Replace(" ", ""), ignoreCase: true, out var result)
               ? result
               : ConnectorType.Type2;
        set => ConnectorTypeRaw = value.ToString();
    }

    public decimal PowerKw
    {
        get => _powerKw;
        set
        {
            if (value <= 0)
            {
                throw new DomainException("PowerKw must be greater than zero.");
            }
            _powerKw = value;
        }
    }

    /// <summary>DB column: status (varchar 30). DB stores uppercase e.g. "AVAILABLE".</summary>
    public ChargingPointStatus Status { get; set; } = ChargingPointStatus.Offline;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>DB column: charging_type (varchar 5). E.g. "AC", "DC". May be null.</summary>
    public string? ChargingType { get; set; }

    /// <summary>DB column: charger_id (integer). Legacy reference. May be null.</summary>
    public int? ChargerId { get; set; }

    /// <summary>DB column: last_seen. Existing heartbeat field used by live status module.</summary>
    public DateTime? LastSeen { get; set; }

    /// <summary>DB column: current_power_kw. Live telemetry, default 0.</summary>
    public decimal CurrentPowerKw { get; set; } = 0m;

    // ── New owner-module columns (added by 012_station_owner_module.sql) ───────

    /// <summary>Human-readable bay label, e.g. "Bay 1". Nullable — not in original schema.</summary>
    public string? Label { get; set; }

    /// <summary>Price per kWh for this connector. Nullable until set by owner.</summary>
    public decimal? PricePerKwh
    {
        get => _pricePerKwh;
        set
        {
            if (value.HasValue && value.Value < 0)
            {
                throw new DomainException("PricePerKwh must be non-negative.");
            }
            _pricePerKwh = value;
        }
    }
    private decimal? _pricePerKwh;

    /// <summary>Soft-delete flag added by owner module. Nullable — existing rows get default true.</summary>
    public bool? IsActive { get; set; } = true;

    // Navigation property
    public ICollection<StatusLog> StatusLogs { get; set; } = new List<StatusLog>();

    // EF Core parameterless constructor
    public ChargingPoint()
    {
    }

    /// <summary>
    /// Full constructor for creating a new owner-managed connector.
    /// </summary>
    public ChargingPoint(
        int stationId,
        string label,
        ConnectorType connectorType,
        decimal powerKw,
        decimal pricePerKwh,
        ChargingPointStatus status = ChargingPointStatus.Offline)
    {
        if (powerKw <= 0)
        {
            throw new DomainException("PowerKw must be greater than zero.");
        }

        if (pricePerKwh < 0)
        {
            throw new DomainException("PricePerKwh must be non-negative.");
        }

        StationId = stationId;
        Label = label;
        ConnectorType = connectorType;      // sets ConnectorTypeRaw via property
        _powerKw = powerKw;
        _pricePerKwh = pricePerKwh;
        Status = status;
        IsActive = true;
        CreatedAt = DateTime.UtcNow;
    }

    public StatusLog ChangeStatus(ChargingPointStatus newStatus, int? changedByUserId = null)
    {
        var oldStatus = Status;
        Status = newStatus;
        LastSeen = DateTime.UtcNow;

        var log = new StatusLog
        {
            PointId = Id,
            Point = this,
            OldStatus = oldStatus,
            NewStatus = newStatus,
            ChangedAt = DateTime.UtcNow,
            ChangedByUserId = changedByUserId
        };

        StatusLogs.Add(log);
        return log;
    }
}
