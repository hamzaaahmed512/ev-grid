"""
VoltRelay - StatusLog SQLAlchemy Model
Maps to the 'status_logs' table in Supabase PostgreSQL (Migration 012).
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class StatusLog(Base):
    __tablename__ = "status_logs"

    id = Column(Integer, primary_key=True, index=True)
    point_id = Column(Integer, ForeignKey("connectors.id", ondelete="RESTRICT"), nullable=False, index=True)
    old_status = Column(String(20), nullable=True)
    new_status = Column(String(20), nullable=False)
    changed_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    changed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)

    # Relationships
    connector = relationship("Connector", back_populates="status_logs")
    changed_by_user = relationship("User")
