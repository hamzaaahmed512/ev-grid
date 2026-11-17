using EvGrid.Data;
using EvGrid.Data.Seed;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Add DbContext
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? builder.Configuration["DATABASE_URL"]
    ?? "Host=localhost;Database=evgrid_dev;Username=postgres;Password=postgres";

connectionString = AppDbContextFactory.ConvertPostgresUriToConnectionString(connectionString);

builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseNpgsql(connectionString)
           .UseSnakeCaseNamingConvention();
});

var app = builder.Build();

// Run Dev Seed in Development environment
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var dbContext = scope.ServiceProvider.GetService<AppDbContext>();
    if (dbContext != null)
    {
        try
        {
            if (dbContext.Database.CanConnect())
            {
                await DevDataSeeder.SeedAsync(dbContext, app.Environment);
            }
        }
        catch (Exception ex)
        {
            app.Logger.LogWarning(ex, "Could not run DevDataSeeder on startup.");
        }
    }
}

app.Run();

// Partial Program class for WebApplicationFactory / testing support if needed
public partial class Program { }
