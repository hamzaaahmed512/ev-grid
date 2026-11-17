using EvGrid.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace EvGrid.Data.Configurations;

public class StationConfiguration : IEntityTypeConfiguration<Station>
{
    public void Configure(EntityTypeBuilder<Station> builder)
    {
        builder.ToTable("stations", t =>
        {
            t.HasCheckConstraint("CK_stations_latitude_range", "latitude >= -90 AND latitude <= 90");
            t.HasCheckConstraint("CK_stations_longitude_range", "longitude >= -180 AND longitude <= 180");
        });

        builder.HasKey(s => s.Id);

        builder.Property(s => s.OwnerId)
            .IsRequired();

        builder.Property(s => s.Name)
            .IsRequired()
            .HasMaxLength(150);

        builder.Property(s => s.Type)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(20);

        builder.Property(s => s.Address)
            .IsRequired()
            .HasMaxLength(500);

        builder.Property(s => s.Latitude)
            .IsRequired()
            .HasPrecision(9, 6);

        builder.Property(s => s.Longitude)
            .IsRequired()
            .HasPrecision(9, 6);

        builder.Property(s => s.OpenTime)
            .IsRequired();

        builder.Property(s => s.CloseTime)
            .IsRequired();

        builder.Property(s => s.Rating)
            .IsRequired()
            .HasPrecision(3, 2)
            .HasDefaultValue(0m);

        builder.Property(s => s.IsActive)
            .IsRequired()
            .HasDefaultValue(true);

        builder.Property(s => s.CreatedAt)
            .IsRequired();

        builder.Property(s => s.UpdatedAt);

        // Index on OwnerId
        builder.HasIndex(s => s.OwnerId)
            .HasDatabaseName("ix_stations_owner_id");

        // Relationships with Restrict delete behavior
        builder.HasOne(s => s.Owner)
            .WithMany(u => u.Stations)
            .HasForeignKey(s => s.OwnerId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(s => s.Points)
            .WithOne(p => p.Station)
            .HasForeignKey(p => p.StationId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
