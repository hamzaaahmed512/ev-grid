using EvGrid.Domain.Enums;
using EvGrid.Domain.Exceptions;

namespace EvGrid.Domain.Entities;

public class ChargingPoint
{
    private decimal _powerKw;
    private decimal _pricePerKwh;

    public int Id { get; set; }
    public int StationId { get; set; }
    public Station? Station { get; set; }

    public string Label { get; set; } = string.Empty;
    public ConnectorType ConnectorType { get; set; }

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

    public decimal PricePerKwh
    {
        get => _pricePerKwh;
        set
        {
            if (value < 0)
            {
                throw new DomainException("PricePerKwh must be non-negative.");
            }
            _pricePerKwh = value;
        }
    }

    public ChargingPointStatus Status { get; set; } = ChargingPointStatus.Offline;
    public DateTime? LastHeartbeat { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation property
    public ICollection<StatusLog> StatusLogs { get; set; } = new List<StatusLog>();

    // EF Core parameterless constructor
    public ChargingPoint()
    {
    }

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
        ConnectorType = connectorType;
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
        LastHeartbeat = DateTime.UtcNow;

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
