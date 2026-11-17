using EvGrid.Domain.Entities;
using EvGrid.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace EvGrid.Data.Configurations;

public class ChargingPointConfiguration : IEntityTypeConfiguration<ChargingPoint>
{
    public void Configure(EntityTypeBuilder<ChargingPoint> builder)
    {
        builder.ToTable("charging_points", t =>
        {
            t.HasCheckConstraint("CK_charging_points_power_kw_positive", "power_kw > 0");
            t.HasCheckConstraint("CK_charging_points_price_per_kwh_non_negative", "price_per_kwh >= 0");
        });

        builder.HasKey(cp => cp.Id);

        builder.Property(cp => cp.StationId)
            .IsRequired();

        builder.Property(cp => cp.Label)
            .IsRequired()
            .HasMaxLength(50);

        builder.Property(cp => cp.ConnectorType)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(20);

        builder.Property(cp => cp.PowerKw)
            .IsRequired()
            .HasPrecision(8, 2);

        builder.Property(cp => cp.PricePerKwh)
            .IsRequired()
            .HasPrecision(10, 2);

        builder.Property(cp => cp.Status)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(20)
            .HasDefaultValue(ChargingPointStatus.Offline)
            .HasSentinel(ChargingPointStatus.Offline);

        builder.Property(cp => cp.LastHeartbeat);

        builder.Property(cp => cp.IsActive)
            .IsRequired()
            .HasDefaultValue(true);

        builder.Property(cp => cp.CreatedAt)
            .IsRequired();

        // Index on StationId
        builder.HasIndex(cp => cp.StationId)
            .HasDatabaseName("ix_charging_points_station_id");

        // Relationships with Restrict delete behavior
        builder.HasOne(cp => cp.Station)
            .WithMany(s => s.Points)
            .HasForeignKey(cp => cp.StationId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(cp => cp.StatusLogs)
            .WithOne(sl => sl.Point)
            .HasForeignKey(sl => sl.PointId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
