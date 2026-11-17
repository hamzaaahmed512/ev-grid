using EvGrid.Domain.Entities;
using EvGrid.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace EvGrid.Data.Configurations;

public class StatusLogConfiguration : IEntityTypeConfiguration<StatusLog>
{
    // DB stores uppercase status strings; enum is TitleCase
    private static readonly ValueConverter<ChargingPointStatus?, string?> OldStatusConverter =
        new ValueConverter<ChargingPointStatus?, string?>(
            v => v.HasValue ? v.Value.ToString().ToUpperInvariant() : null,
            v => ParseNullableStatus(v));

    private static readonly ValueConverter<ChargingPointStatus, string> NewStatusConverter =
        new ValueConverter<ChargingPointStatus, string>(
            v => v.ToString().ToUpperInvariant(),
            v => ParseStatus(v));

    private static ChargingPointStatus? ParseNullableStatus(string? v)
    {
        if (v == null) return null;
        return Enum.TryParse<ChargingPointStatus>(v, ignoreCase: true, out var result)
            ? result
            : (ChargingPointStatus?)null;
    }

    private static ChargingPointStatus ParseStatus(string v)
    {
        return Enum.TryParse<ChargingPointStatus>(v, ignoreCase: true, out var result)
            ? result
            : ChargingPointStatus.Offline;
    }

    public void Configure(EntityTypeBuilder<StatusLog> builder)
    {
        builder.ToTable("status_logs");

        builder.HasKey(sl => sl.Id);

        builder.Property(sl => sl.PointId)
            .IsRequired()
            .HasColumnName("point_id");

        // old_status is nullable in DB (first ever status has no previous state)
        builder.Property(sl => sl.OldStatus)
            .IsRequired(false)
            .HasColumnName("old_status")
            .HasMaxLength(20)
            .HasConversion(OldStatusConverter);

        builder.Property(sl => sl.NewStatus)
            .IsRequired()
            .HasColumnName("new_status")
            .HasMaxLength(20)
            .HasConversion(NewStatusConverter);

        builder.Property(sl => sl.ChangedAt)
            .IsRequired()
            .HasColumnName("changed_at");

        builder.Property(sl => sl.ChangedByUserId)
            .IsRequired(false)
            .HasColumnName("changed_by_user_id");

        // Composite index on (point_id, changed_at)
        builder.HasIndex(sl => new { sl.PointId, sl.ChangedAt })
            .HasDatabaseName("idx_status_logs_point_id_changed_at");

        // Relationships
        builder.HasOne(sl => sl.Point)
            .WithMany(cp => cp.StatusLogs)
            .HasForeignKey(sl => sl.PointId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(sl => sl.ChangedByUser)
            .WithMany()
            .HasForeignKey(sl => sl.ChangedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
