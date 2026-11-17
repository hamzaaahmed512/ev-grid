using EvGrid.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace EvGrid.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Station> Stations => Set<Station>();
    /// <summary>Maps to the 'connectors' table (each row = one bookable charging plug).</summary>
    public DbSet<ChargingPoint> Connectors => Set<ChargingPoint>();
    public DbSet<StatusLog> StatusLogs => Set<StatusLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}
