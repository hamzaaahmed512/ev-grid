using EvGrid.Domain.Enums;

namespace EvGrid.Domain.Entities;

public class StatusLog
{
    public int Id { get; set; }
    public int PointId { get; set; }
    public ChargingPoint? Point { get; set; }

    public ChargingPointStatus OldStatus { get; set; }
    public ChargingPointStatus NewStatus { get; set; }
    public DateTime ChangedAt { get; set; } = DateTime.UtcNow;

    public int? ChangedByUserId { get; set; }
    public User? ChangedByUser { get; set; }

    public StatusLog()
    {
    }

    public StatusLog(
        int pointId,
        ChargingPointStatus oldStatus,
        ChargingPointStatus newStatus,
        DateTime changedAt,
        int? changedByUserId = null)
    {
        PointId = pointId;
        OldStatus = oldStatus;
        NewStatus = newStatus;
        ChangedAt = changedAt;
        ChangedByUserId = changedByUserId;
    }
}
