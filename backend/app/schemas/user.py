from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field

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

class GoogleLogin(BaseModel):
    credential: str = Field(..., min_length=1, max_length=10000)

class UserProfileUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: Optional[str] = Field(default=None, min_length=1, max_length=100, description="Full name of user")
    phone: Optional[str] = Field(default=None, max_length=50, description="Phone number")
    city: Optional[str] = Field(default=None, max_length=100, description="City of residence")
    profile_image_url: Optional[str] = Field(default=None, max_length=1000, description="URL to user avatar/photo")

# ==========================================
# 2. RESPONSE SCHEMAS (Data sent TO frontend)
# ==========================================

class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    phone: Optional[str] = None
    city: Optional[str] = None
    profile_image_url: Optional[str] = None
    role: Optional[str] = "driver"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
