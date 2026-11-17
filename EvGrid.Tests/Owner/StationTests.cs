using EvGrid.Domain.Entities;
using EvGrid.Domain.Enums;
using EvGrid.Domain.Exceptions;
using Xunit;

namespace EvGrid.Tests.Owner;

public class StationTests
{
    // Helper: creates a valid station with real lat/lng as double (matches DB double precision)
    private static Station CreateValidStation(StationType type = StationType.B2P)
    {
        return new Station(
            ownerId: 1,
            name: "Test Station",
            type: type,
            address: "123 Main Road, Lahore",
            latitude: 31.5204,     // double
            longitude: 74.3587,    // double
            openTime: new TimeOnly(8, 0),
            closeTime: new TimeOnly(20, 0)
        );
    }

    // ── Point-limit tests ──────────────────────────────────────────────────────

    [Fact]
    public void AddPoint_P2PStation_SinglePoint_Succeeds()
    {
        var station = CreateValidStation(StationType.P2P);

        var point = station.AddPoint("Bay 1", ConnectorType.Type2, 7.4m, 40.0m);

        Assert.Single(station.Connectors);
        Assert.Equal("Bay 1", point.Label);
        Assert.Equal(ConnectorType.Type2, point.ConnectorType);
        Assert.Equal(7.4m, point.PowerKw);
        Assert.Equal(40.0m, point.PricePerKwh);
    }

    [Fact]
    public void AddPoint_P2PStation_ExceedingLimit_ThrowsDomainException()
    {
        var station = CreateValidStation(StationType.P2P);
        station.AddPoint("Bay 1", ConnectorType.Type2, 7.4m, 40.0m);

        var ex = Assert.Throws<DomainException>(() =>
            station.AddPoint("Bay 2", ConnectorType.CCS2, 50.0m, 55.0m));

        Assert.Contains("maximum of 1", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void AddPoint_B2PStation_UpToSixPoints_Succeeds()
    {
        var station = CreateValidStation(StationType.B2P);

        for (int i = 1; i <= 6; i++)
        {
            station.AddPoint($"Bay {i}", ConnectorType.CCS2, 50.0m, 60.0m);
        }

        Assert.Equal(6, station.Connectors.Count);
    }

    [Fact]
    public void AddPoint_B2PStation_ExceedingLimit_ThrowsDomainException()
    {
        var station = CreateValidStation(StationType.B2P);
        for (int i = 1; i <= 6; i++)
        {
            station.AddPoint($"Bay {i}", ConnectorType.CCS2, 50.0m, 60.0m);
        }

        var ex = Assert.Throws<DomainException>(() =>
            station.AddPoint("Bay 7", ConnectorType.CCS2, 50.0m, 60.0m));

        Assert.Contains("maximum of 6", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    // ── Operating-hours validation tests ──────────────────────────────────────

    [Fact]
    public void Station_InvalidTimeRange_OpenLaterThanClose_ThrowsDomainException()
    {
        var ex = Assert.Throws<DomainException>(() => new Station(
            ownerId: 1,
            name: "Night Only Station",
            type: StationType.B2P,
            address: "Gulberg III",
            latitude: 31.5,
            longitude: 74.3,
            openTime: new TimeOnly(22, 0),
            closeTime: new TimeOnly(6, 0)
        ));

        Assert.Contains("must be earlier than CloseTime", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Station_InvalidTimeRange_OpenEqualToClose_ThrowsDomainException()
    {
        var ex = Assert.Throws<DomainException>(() => new Station(
            ownerId: 1,
            name: "Zero Hour Station",
            type: StationType.P2P,
            address: "DHA Phase 5",
            latitude: 31.5,
            longitude: 74.3,
            openTime: new TimeOnly(10, 0),
            closeTime: new TimeOnly(10, 0)
        ));

        Assert.Contains("must be earlier than CloseTime", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Station_ValidOperatingHours_Succeeds()
    {
        var station = new Station(
            ownerId: 1,
            name: "Standard Station",
            type: StationType.B2P,
            address: "Mall Road",
            latitude: 31.5,
            longitude: 74.3,
            openTime: new TimeOnly(6, 0),
            closeTime: new TimeOnly(23, 0)
        );

        Assert.Equal(new TimeOnly(6, 0), station.OpenTime);
        Assert.Equal(new TimeOnly(23, 0), station.CloseTime);
    }

    // ── Power and price validation tests ──────────────────────────────────────

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(-0.01)]
    public void AddPoint_InvalidPowerKw_ThrowsDomainException(decimal invalidPower)
    {
        var station = CreateValidStation();

        var ex = Assert.Throws<DomainException>(() =>
            station.AddPoint("Bay 1", ConnectorType.CCS2, invalidPower, 50.0m));

        Assert.Contains("PowerKw must be greater than zero", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(-0.01)]
    [InlineData(-100)]
    public void AddPoint_InvalidPricePerKwh_ThrowsDomainException(decimal invalidPrice)
    {
        var station = CreateValidStation();

        var ex = Assert.Throws<DomainException>(() =>
            station.AddPoint("Bay 1", ConnectorType.CCS2, 50.0m, invalidPrice));

        Assert.Contains("PricePerKwh must be non-negative", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    // ── ChargingPoint entity tests ─────────────────────────────────────────────

    [Fact]
    public void ChargingPoint_Defaults_AreOfflineAndActive()
    {
        var point = new ChargingPoint(
            stationId: 1,
            label: "Bay 1",
            connectorType: ConnectorType.Type2,
            powerKw: 22.0m,
            pricePerKwh: 35.0m
        );

        Assert.Equal(ChargingPointStatus.Offline, point.Status);
        Assert.True(point.IsActive);
        Assert.Null(point.LastSeen);
        Assert.NotEqual(default, point.CreatedAt);
    }

    [Fact]
    public void ChargingPoint_StatusChange_CreatesStatusLog()
    {
        var point = new ChargingPoint(
            stationId: 1,
            label: "Bay 1",
            connectorType: ConnectorType.CCS2,
            powerKw: 50.0m,
            pricePerKwh: 60.0m
        );

        var log = point.ChangeStatus(ChargingPointStatus.Available, changedByUserId: 42);

        Assert.Equal(ChargingPointStatus.Available, point.Status);
        Assert.NotNull(point.LastSeen);
        Assert.Single(point.StatusLogs);
        Assert.Equal(ChargingPointStatus.Offline, log.OldStatus);    // nullable but has value
        Assert.Equal(ChargingPointStatus.Available, log.NewStatus);
        Assert.Equal(42, log.ChangedByUserId);
    }
}
