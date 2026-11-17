using EvGrid.Domain.Entities;
using EvGrid.Domain.Enums;
using EvGrid.Domain.Exceptions;
using Xunit;

namespace EvGrid.Tests.Owner;

public class StationTests
{
    private static Station CreateValidStation(StationType type = StationType.B2P)
    {
        return new Station(
            ownerId: 1,
            name: "Test Station",
            type: type,
            address: "123 Main Road, Lahore",
            latitude: 31.5204m,
            longitude: 74.3587m,
            openTime: new TimeOnly(8, 0),
            closeTime: new TimeOnly(20, 0)
        );
    }

    [Fact]
    public void AddPoint_P2PStation_SinglePoint_Succeeds()
    {
        // Arrange
        var station = CreateValidStation(StationType.P2P);

        // Act
        var point = station.AddPoint("Bay 1", ConnectorType.Type2, 7.4m, 40.0m);

        // Assert
        Assert.Single(station.Points);
        Assert.Equal("Bay 1", point.Label);
        Assert.Equal(ConnectorType.Type2, point.ConnectorType);
        Assert.Equal(7.4m, point.PowerKw);
        Assert.Equal(40.0m, point.PricePerKwh);
    }

    [Fact]
    public void AddPoint_P2PStation_ExceedingLimit_ThrowsDomainException()
    {
        // Arrange
        var station = CreateValidStation(StationType.P2P);
        station.AddPoint("Bay 1", ConnectorType.Type2, 7.4m, 40.0m);

        // Act & Assert
        var ex = Assert.Throws<DomainException>(() =>
            station.AddPoint("Bay 2", ConnectorType.CCS2, 50.0m, 55.0m));

        Assert.Contains("maximum of 1", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void AddPoint_B2PStation_UpToSixPoints_Succeeds()
    {
        // Arrange
        var station = CreateValidStation(StationType.B2P);

        // Act
        for (int i = 1; i <= 6; i++)
        {
            station.AddPoint($"Bay {i}", ConnectorType.CCS2, 50.0m, 60.0m);
        }

        // Assert
        Assert.Equal(6, station.Points.Count);
    }

    [Fact]
    public void AddPoint_B2PStation_ExceedingLimit_ThrowsDomainException()
    {
        // Arrange
        var station = CreateValidStation(StationType.B2P);
        for (int i = 1; i <= 6; i++)
        {
            station.AddPoint($"Bay {i}", ConnectorType.CCS2, 50.0m, 60.0m);
        }

        // Act & Assert
        var ex = Assert.Throws<DomainException>(() =>
            station.AddPoint("Bay 7", ConnectorType.CCS2, 50.0m, 60.0m));

        Assert.Contains("maximum of 6", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Station_InvalidTimeRange_OpenLaterThanClose_ThrowsDomainException()
    {
        // Act & Assert
        var ex = Assert.Throws<DomainException>(() => new Station(
            ownerId: 1,
            name: "Night Only Station",
            type: StationType.B2P,
            address: "Gulberg III",
            latitude: 31.5m,
            longitude: 74.3m,
            openTime: new TimeOnly(22, 0),
            closeTime: new TimeOnly(6, 0)
        ));

        Assert.Contains("must be earlier than CloseTime", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Station_InvalidTimeRange_OpenEqualToClose_ThrowsDomainException()
    {
        // Act & Assert
        var ex = Assert.Throws<DomainException>(() => new Station(
            ownerId: 1,
            name: "Zero Hour Station",
            type: StationType.P2P,
            address: "DHA Phase 5",
            latitude: 31.5m,
            longitude: 74.3m,
            openTime: new TimeOnly(10, 0),
            closeTime: new TimeOnly(10, 0)
        ));

        Assert.Contains("must be earlier than CloseTime", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Station_ValidOperatingHours_Succeeds()
    {
        // Arrange & Act
        var station = new Station(
            ownerId: 1,
            name: "Standard Station",
            type: StationType.B2P,
            address: "Mall Road",
            latitude: 31.5m,
            longitude: 74.3m,
            openTime: new TimeOnly(6, 0),
            closeTime: new TimeOnly(23, 0)
        );

        // Assert
        Assert.Equal(new TimeOnly(6, 0), station.OpenTime);
        Assert.Equal(new TimeOnly(23, 0), station.CloseTime);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(-0.01)]
    public void AddPoint_InvalidPowerKw_ThrowsDomainException(decimal invalidPower)
    {
        // Arrange
        var station = CreateValidStation();

        // Act & Assert
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
        // Arrange
        var station = CreateValidStation();

        // Act & Assert
        var ex = Assert.Throws<DomainException>(() =>
            station.AddPoint("Bay 1", ConnectorType.CCS2, 50.0m, invalidPrice));

        Assert.Contains("PricePerKwh must be non-negative", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ChargingPoint_Defaults_AreOfflineAndActive()
    {
        // Arrange & Act
        var point = new ChargingPoint(
            stationId: 1,
            label: "Bay 1",
            connectorType: ConnectorType.Type2,
            powerKw: 22.0m,
            pricePerKwh: 35.0m
        );

        // Assert
        Assert.Equal(ChargingPointStatus.Offline, point.Status);
        Assert.True(point.IsActive);
        Assert.Null(point.LastHeartbeat);
        Assert.NotEqual(default, point.CreatedAt);
    }

    [Fact]
    public void ChargingPoint_StatusChange_CreatesStatusLog()
    {
        // Arrange
        var point = new ChargingPoint(
            stationId: 1,
            label: "Bay 1",
            connectorType: ConnectorType.CCS2,
            powerKw: 50.0m,
            pricePerKwh: 60.0m
        );

        // Act
        var log = point.ChangeStatus(ChargingPointStatus.Available, changedByUserId: 42);

        // Assert
        Assert.Equal(ChargingPointStatus.Available, point.Status);
        Assert.NotNull(point.LastHeartbeat);
        Assert.Single(point.StatusLogs);
        Assert.Equal(ChargingPointStatus.Offline, log.OldStatus);
        Assert.Equal(ChargingPointStatus.Available, log.NewStatus);
        Assert.Equal(42, log.ChangedByUserId);
    }
}
