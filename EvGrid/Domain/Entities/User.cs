namespace EvGrid.Domain.Entities;

public class User
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string? Role { get; set; } = "driver";
    public string? Phone { get; set; }
    public string? City { get; set; }
    public string? ProfileImageUrl { get; set; }
    public Guid? SupabaseUid { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    // Navigation properties
    public ICollection<Station> Stations { get; set; } = new List<Station>();
}
