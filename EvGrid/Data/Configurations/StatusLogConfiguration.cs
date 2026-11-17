using EvGrid.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace EvGrid.Data.Configurations;

public class StatusLogConfiguration : IEntityTypeConfiguration<StatusLog>
{
    public void Configure(EntityTypeBuilder<StatusLog> builder)
    {
        builder.ToTable("status_logs");

        builder.HasKey(sl => sl.Id);

        builder.Property(sl => sl.PointId)
            .IsRequired();

        builder.Property(sl => sl.OldStatus)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(20);

        builder.Property(sl => sl.NewStatus)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(20);

        builder.Property(sl => sl.ChangedAt)
            .IsRequired();

        builder.Property(sl => sl.ChangedByUserId);

        // Composite index on (PointId, ChangedAt)
        builder.HasIndex(sl => new { sl.PointId, sl.ChangedAt })
            .HasDatabaseName("ix_status_logs_point_id_changed_at");

        // Relationships with Restrict delete behavior
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
