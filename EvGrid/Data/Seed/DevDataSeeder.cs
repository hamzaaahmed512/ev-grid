using EvGrid.Domain.Entities;
using EvGrid.Domain.Enums;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;

namespace EvGrid.Data.Seed;

public static class DevDataSeeder
{
    public static async Task SeedAsync(AppDbContext context, IWebHostEnvironment environment)
    {
        if (!environment.IsDevelopment())
        {
            return;
        }

        // 1. BusinessOwner user if none exists
        var businessOwner = await context.Users
            .FirstOrDefaultAsync(u => u.Email == "owner@evgrid.pk" || u.Role == "BusinessOwner");

        if (businessOwner == null)
        {
            businessOwner = new User
            {
                Name = "Apex Charging Network Owner",
                Email = "owner@evgrid.pk",
                PasswordHash = "AQAAAAIAAYagAAAAEExampleDevPasswordHashForTestingOnly123456=",
                Role = "BusinessOwner",
                Phone = "+92-300-1234567",
                City = "Lahore",
                CreatedAt = DateTime.UtcNow
            };

            context.Users.Add(businessOwner);
            await context.SaveChangesAsync();
        }

        // 2. 1 B2P station with 3 charging points (Type2 7kW, CCS2 50kW, CCS2 50kW)
        const string stationName = "Apex Gulberg Super Hub";
        var existingStation = await context.Stations
            .Include(s => s.Points)
            .FirstOrDefaultAsync(s => s.Name == stationName && s.OwnerId == businessOwner.Id);

        if (existingStation == null)
        {
            var station = new Station(
                ownerId: businessOwner.Id,
                name: stationName,
                type: StationType.B2P,
                address: "Plot 12-B, Main Boulevard, Gulberg III, Lahore",
                latitude: 31.520400m,
                longitude: 74.358700m,
                openTime: new TimeOnly(6, 0),
                closeTime: new TimeOnly(23, 0),
                rating: 4.8m
            );

            // Add 3 charging points using domain method:
            // Point 1: Type2 7kW
            station.AddPoint(
                label: "Bay 1 - AC Fast",
                connectorType: ConnectorType.Type2,
                powerKw: 7.00m,
                pricePerKwh: 45.00m
            );

            // Point 2: CCS2 50kW
            station.AddPoint(
                label: "Bay 2 - DC Super",
                connectorType: ConnectorType.CCS2,
                powerKw: 50.00m,
                pricePerKwh: 65.00m
            );

            // Point 3: CCS2 50kW
            station.AddPoint(
                label: "Bay 3 - DC Super",
                connectorType: ConnectorType.CCS2,
                powerKw: 50.00m,
                pricePerKwh: 65.00m
            );

            context.Stations.Add(station);
            await context.SaveChangesAsync();
        }
    }
}
