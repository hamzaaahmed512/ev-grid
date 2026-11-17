using EvGrid.Domain.Entities;
using EvGrid.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace EvGrid.Data.Configurations;

public class StationConfiguration : IEntityTypeConfiguration<Station>
{
    public void Configure(EntityTypeBuilder<Station> builder)
    {
        // Map to the existing 'stations' table (no check constraints here — they live in SQL scripts)
        builder.ToTable("stations");

        builder.HasKey(s => s.Id);

        // owner_id — nullable (existing 272 rows have no owner yet)
        builder.Property(s => s.OwnerId)
            .IsRequired(false)
            .HasColumnName("owner_id");

        builder.Property(s => s.Name)
            .IsRequired()
            .HasMaxLength(150)
            .HasColumnName("name");

        // type — nullable on the C# side; DB column has DEFAULT 'B2P'
        builder.Property(s => s.Type)
            .IsRequired(false)
            .HasConversion<string>()
            .HasMaxLength(10)
            .HasColumnName("type");

        builder.Property(s => s.Address)
            .IsRequired(false)
            .HasMaxLength(500)
            .HasColumnName("address");

        // DB type is double precision — do NOT use HasPrecision (that generates numeric)
        builder.Property(s => s.Latitude)
            .IsRequired()
            .HasColumnName("latitude");

        builder.Property(s => s.Longitude)
            .IsRequired()
            .HasColumnName("longitude");

        // New nullable operating-hours columns
        builder.Property(s => s.OpenTime)
            .IsRequired(false)
            .HasColumnName("open_time");

        builder.Property(s => s.CloseTime)
            .IsRequired(false)
            .HasColumnName("close_time");

        // New rating column — numeric(3,2) with DEFAULT 0
        builder.Property(s => s.Rating)
            .IsRequired()
            .HasPrecision(3, 2)
            .HasDefaultValue(0m)
            .HasColumnName("rating");

        // is_active — new column, DEFAULT true
        builder.Property(s => s.IsActive)
            .IsRequired()
            .HasDefaultValue(true)
            .HasColumnName("is_active");

        // created_at — existing column
        builder.Property(s => s.CreatedAt)
            .IsRequired()
            .HasColumnName("created_at");

        // updated_at — new nullable column
        builder.Property(s => s.UpdatedAt)
            .IsRequired(false)
            .HasColumnName("updated_at");

        // Index on owner_id (matches SQL script's idx_stations_owner_id)
        builder.HasIndex(s => s.OwnerId)
            .HasDatabaseName("idx_stations_owner_id");

        // FK to users — nullable owner, Restrict delete
        builder.HasOne(s => s.Owner)
            .WithMany(u => u.Stations)
            .HasForeignKey(s => s.OwnerId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        // One-to-many to connectors table (via ChargingPoint entity)
        builder.HasMany(s => s.Connectors)
            .WithOne(p => p.Station)
            .HasForeignKey(p => p.StationId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
