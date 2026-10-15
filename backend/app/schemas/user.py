from pydantic import BaseModel, EmailStr, Field
from datetime import datetime

# ==========================================
# 1. REQUEST SCHEMAS (Data sent BY frontend)
# ==========================================

class UserSignup(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Full name of user")
    email: EmailStr = Field(..., description="Valid email address")
    password: str = Field(..., min_length=6, max_length=100, description="Password (at least 6 characters)")

class UserLogin(BaseModel):
    email: EmailStr
    password: str

# ==========================================
# 2. RESPONSE SCHEMAS (Data sent TO frontend)
# ==========================================

class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    created_at: datetime

    class Config:
        from_attributes = True  # Allows Pydantic to read SQLAlchemy model objects

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse