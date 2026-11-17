using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace EvGrid.Data;

public class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var basePath = Directory.GetCurrentDirectory();
        
        var configuration = new ConfigurationBuilder()
            .SetBasePath(basePath)
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile("appsettings.Development.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? configuration["DATABASE_URL"]
            ?? "Host=localhost;Database=evgrid_dev;Username=postgres;Password=postgres";

        // Convert postgresql:// URI format to Npgsql connection string format if needed
        connectionString = ConvertPostgresUriToConnectionString(connectionString);

        var optionsBuilder = new DbContextOptionsBuilder<AppDbContext>();
        optionsBuilder.UseNpgsql(connectionString)
                      .UseSnakeCaseNamingConvention();

        return new AppDbContext(optionsBuilder.Options);
    }

    public static string ConvertPostgresUriToConnectionString(string connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString) || !connectionString.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase) && !connectionString.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase))
        {
            return connectionString;
        }

        try
        {
            var uri = new Uri(connectionString);
            var userInfo = uri.UserInfo.Split(':');
            var username = Uri.UnescapeDataString(userInfo[0]);
            var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "";
            var host = uri.Host;
            var port = uri.Port > 0 ? uri.Port : 5432;
            var database = uri.AbsolutePath.TrimStart('/');

            var builder = new Npgsql.NpgsqlConnectionStringBuilder
            {
                Host = host,
                Port = port,
                Database = string.IsNullOrEmpty(database) ? "postgres" : database,
                Username = username,
                Password = password,
                SslMode = Npgsql.SslMode.Prefer
            };

            return builder.ConnectionString;
        }
        catch
        {
            return connectionString;
        }
    }
}
