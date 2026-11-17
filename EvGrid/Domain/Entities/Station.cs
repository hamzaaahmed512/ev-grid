using EvGrid.Domain.Enums;
using EvGrid.Domain.Exceptions;

namespace EvGrid.Domain.Entities;

public class Station
{
    private TimeOnly _openTime;
    private TimeOnly _closeTime;

    public int Id { get; set; }
    public int OwnerId { get; set; }
    public User? Owner { get; set; }

    public string Name { get; set; } = string.Empty;
    public StationType Type { get; set; }
    public string Address { get; set; } = string.Empty;
    public decimal Latitude { get; set; }
    public decimal Longitude { get; set; }

    public TimeOnly OpenTime
    {
        get => _openTime;
        set
        {
            if (_closeTime != default && value >= _closeTime)
            {
                throw new DomainException($"OpenTime ({value}) must be earlier than CloseTime ({_closeTime}).");
            }
            _openTime = value;
        }
    }

    public TimeOnly CloseTime
    {
        get => _closeTime;
        set
        {
            if (_openTime != default && _openTime >= value)
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

    // Navigation property
    public ICollection<ChargingPoint> Points { get; set; } = new List<ChargingPoint>();

    // EF Core parameterless constructor
    public Station()
    {
    }

    public Station(
        int ownerId,
        string name,
        StationType type,
        string address,
        decimal latitude,
        decimal longitude,
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

        Points.Add(point);
        UpdatedAt = DateTime.UtcNow;
        return point;
    }

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
        Points.Add(point);
        UpdatedAt = DateTime.UtcNow;
    }

    private void ValidatePointLimit()
    {
        if (Type == StationType.P2P && Points.Count >= 1)
        {
            throw new DomainException("P2P station can have a maximum of 1 charging point.");
        }

        if (Type == StationType.B2P && Points.Count >= 6)
        {
            throw new DomainException("B2P station can have a maximum of 6 charging points.");
        }
    }
}
