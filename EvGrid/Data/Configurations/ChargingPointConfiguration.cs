using EvGrid.Domain.Entities;
using EvGrid.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace EvGrid.Data.Configurations;

/// <summary>
/// EF Core configuration for ChargingPoint entity, which maps to the real 'connectors' table.
/// </summary>
public class ChargingPointConfiguration : IEntityTypeConfiguration<ChargingPoint>
{
    // DB stores uppercase ("AVAILABLE", "OFFLINE"); enum members are TitleCase ("Available")
    private static readonly ValueConverter<ChargingPointStatus, string> StatusConverter =
        new ValueConverter<ChargingPointStatus, string>(
            v => v.ToString().ToUpperInvariant(),
            v => ParseStatus(v));

    private static ChargingPointStatus ParseStatus(string v)
    {
        return Enum.TryParse<ChargingPointStatus>(v, ignoreCase: true, out var result)
            ? result
            : ChargingPointStatus.Offline;
    }

    public void Configure(EntityTypeBuilder<ChargingPoint> builder)
    {
        // Maps to the existing 'connectors' table (no check constraints here — in SQL scripts)
        builder.ToTable("connectors");

        builder.HasKey(cp => cp.Id);

        builder.Property(cp => cp.StationId)
            .IsRequired()
            .HasColumnName("station_id");

        // ── Existing columns ──────────────────────────────────────────────────

        // DB stores raw strings like "Type 2", "CCS2" — mapped via ConnectorTypeRaw
        builder.Property(cp => cp.ConnectorTypeRaw)
            .IsRequired()
            .HasMaxLength(20)
            .HasColumnName("connector_type");

        // Ignore the computed ConnectorType property — it's backed by ConnectorTypeRaw
        builder.Ignore(cp => cp.ConnectorType);

        builder.Property(cp => cp.PowerKw)
            .IsRequired()
            .HasPrecision(8, 2)
            .HasColumnName("power_kw");

        // Status — DB stores uppercase. Use a named ValueConverter (not inline lambda).
        builder.Property(cp => cp.Status)
            .IsRequired()
            .HasColumnName("status")
            .HasMaxLength(30)
            .HasConversion(StatusConverter)
            .HasDefaultValue(ChargingPointStatus.Offline)
            .HasSentinel(ChargingPointStatus.Offline);

        builder.Property(cp => cp.CreatedAt)
            .IsRequired()
            .HasColumnName("created_at");

        builder.Property(cp => cp.ChargingType)
            .IsRequired(false)
            .HasMaxLength(5)
            .HasColumnName("charging_type");

        builder.Property(cp => cp.ChargerId)
            .IsRequired(false)
            .HasColumnName("charger_id");

        builder.Property(cp => cp.LastSeen)
            .IsRequired(false)
            .HasColumnName("last_seen");

        builder.Property(cp => cp.CurrentPowerKw)
            .IsRequired(false)
            .HasDefaultValue(0m)
            .HasColumnName("current_power_kw");

        // ── New owner-module columns (012_station_owner_module.sql) ───────────

        builder.Property(cp => cp.Label)
            .IsRequired(false)
            .HasMaxLength(50)
            .HasColumnName("label");

        builder.Property(cp => cp.PricePerKwh)
            .IsRequired(false)
            .HasPrecision(10, 2)
            .HasColumnName("price_per_kwh");

        builder.Property(cp => cp.IsActive)
            .IsRequired(false)
            .HasDefaultValue(true)
            .HasColumnName("is_active");

        // ── Indexes ───────────────────────────────────────────────────────────

        // Real index name from information_schema
        builder.HasIndex(cp => cp.StationId)
            .HasDatabaseName("idx_connectors_station");

        // ── Relationships ─────────────────────────────────────────────────────

        builder.HasOne(cp => cp.Station)
            .WithMany(s => s.Connectors)
            .HasForeignKey(cp => cp.StationId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(cp => cp.StatusLogs)
            .WithOne(sl => sl.Point)
            .HasForeignKey(sl => sl.PointId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
