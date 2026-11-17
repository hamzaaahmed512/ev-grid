using EvGrid.Domain.Enums;
using EvGrid.Domain.Exceptions;

namespace EvGrid.Domain.Entities;

public class Station
{
    private TimeOnly? _openTime;
    private TimeOnly? _closeTime;

    public int Id { get; set; }

    /// <summary>
    /// FK to users.id. Nullable — existing 272 rows have no owner yet.
    /// </summary>
    public int? OwnerId { get; set; }
    public User? Owner { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// P2P or B2P. Nullable — existing rows get default 'B2P' via SQL migration.
    /// </summary>
    public StationType? Type { get; set; }

    public string? Address { get; set; }

    // DB column type is double precision
    public double Latitude { get; set; }
    public double Longitude { get; set; }

    // DB columns are nullable (new owner-module columns)
    public TimeOnly? OpenTime
    {
        get => _openTime;
        set
        {
            if (value.HasValue && _closeTime.HasValue && value.Value >= _closeTime.Value)
            {
                throw new DomainException($"OpenTime ({value}) must be earlier than CloseTime ({_closeTime}).");
            }
            _openTime = value;
        }
    }

    public TimeOnly? CloseTime
    {
        get => _closeTime;
        set
        {
            if (value.HasValue && _openTime.HasValue && _openTime.Value >= value.Value)
            {
                throw new DomainException($"OpenTime ({_openTime}) must be earlier than CloseTime ({value}).");
            }
            _closeTime = value;
        }
    }

    public decimal Rating { get; set; } = 0m;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    // Navigation property — maps to connectors table
    public ICollection<ChargingPoint> Connectors { get; set; } = new List<ChargingPoint>();

    // EF Core parameterless constructor
    public Station()
    {
    }

    /// <summary>
    /// Full constructor for creating a new owner-managed station.
    /// </summary>
    public Station(
        int ownerId,
        string name,
        StationType type,
        string address,
        double latitude,
        double longitude,
        TimeOnly openTime,
        TimeOnly closeTime,
        decimal rating = 0m)
    {
        if (openTime >= closeTime)
        {
            throw new DomainException($"OpenTime ({openTime}) must be earlier than CloseTime ({closeTime}).");
        }

        OwnerId = ownerId;
        Name = name;
        Type = type;
        Address = address;
        Latitude = latitude;
        Longitude = longitude;
        _openTime = openTime;
        _closeTime = closeTime;
        Rating = rating;
        IsActive = true;
        CreatedAt = DateTime.UtcNow;
    }

    public void SetOperatingHours(TimeOnly openTime, TimeOnly closeTime)
    {
        if (openTime >= closeTime)
        {
            throw new DomainException($"OpenTime ({openTime}) must be earlier than CloseTime ({closeTime}).");
        }
        _openTime = openTime;
        _closeTime = closeTime;
        UpdatedAt = DateTime.UtcNow;
    }

    /// <summary>
    /// Domain method: add a connector/charging point to this station.
    /// Enforces P2P ≤ 1 and B2P ≤ 6 limits, plus powerKw and pricePerKwh validation.
    /// </summary>
    public ChargingPoint AddPoint(string label, ConnectorType connectorType, decimal powerKw, decimal pricePerKwh)
    {
        ValidatePointLimit();

        if (powerKw <= 0)
        {
            throw new DomainException("PowerKw must be greater than zero.");
        }

        if (pricePerKwh < 0)
        {
            throw new DomainException("PricePerKwh must be non-negative.");
        }

        var point = new ChargingPoint
        {
            StationId = Id,
            Station = this,
            Label = label,
            ConnectorType = connectorType,
            PowerKw = powerKw,
            PricePerKwh = pricePerKwh,
            Status = ChargingPointStatus.Offline,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        Connectors.Add(point);
        UpdatedAt = DateTime.UtcNow;
        return point;
    }

    /// <summary>
    /// Overload accepting a pre-built ChargingPoint — applies same domain rules.
    /// </summary>
    public void AddPoint(ChargingPoint point)
    {
        ArgumentNullException.ThrowIfNull(point);

        ValidatePointLimit();

        if (point.PowerKw <= 0)
        {
            throw new DomainException("PowerKw must be greater than zero.");
        }

        if (point.PricePerKwh < 0)
        {
            throw new DomainException("PricePerKwh must be non-negative.");
        }

        point.Station = this;
        point.StationId = Id;
        Connectors.Add(point);
        UpdatedAt = DateTime.UtcNow;
    }

    private void ValidatePointLimit()
    {
        if (Type == StationType.P2P && Connectors.Count >= 1)
        {
            throw new DomainException("P2P station can have a maximum of 1 charging point.");
        }

        if (Type == StationType.B2P && Connectors.Count >= 6)
        {
            throw new DomainException("B2P station can have a maximum of 6 charging points.");
        }
    }
}
