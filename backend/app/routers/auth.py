from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.user import User
from app.schemas.user import UserProfileUpdate, UserResponse
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ==========================================
# 0. DEPRECATED CREDENTIAL ENDPOINTS
# ==========================================
# Custom JWT authentication was removed. Supabase Auth (email + Google
# OAuth) issues and refreshes all sessions; the frontend talks to Supabase
# directly and only sends the Supabase access token to this API.

@router.post("/signup", include_in_schema=False)
def signup():
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Sign-up moved to Supabase Auth. Use supabase.auth.signUp() from the frontend.",
    )


@router.post("/login", include_in_schema=False)
def login():
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Password login moved to Supabase Auth. Use supabase.auth.signInWithPassword() from the frontend.",
    )


@router.post("/google", include_in_schema=False)
def google_login():
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Google sign-in moved to Supabase Auth. Use supabase.auth.signInWithOAuth({ provider: 'google' }).",
    )

# ==========================================
# 3. GET CURRENT USER (PROTECTED ROUTE)
# ==========================================

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """
    Returns profile information of currently authenticated user.
    Requires: Authorization: Bearer <token>
    """
    return current_user

# ==========================================
# 4. UPDATE CURRENT USER PROFILE
# ==========================================

@router.patch("/profile", response_model=UserResponse)
def update_profile(
    profile_data: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Updates profile information of currently authenticated user.
    Requires: Authorization: Bearer <token>
    """
    update_dict = profile_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(current_user, field, value)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.patch("/me", response_model=UserResponse, include_in_schema=False)
def update_me(
    profile_data: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Alias for PATCH /auth/profile."""
    return update_profile(profile_data=profile_data, db=db, current_user=current_user)


# ==========================================
# 5. /users ROUTER ALIASES
# ==========================================

users_router = APIRouter(prefix="/users", tags=["Users"])


@users_router.get("/me", response_model=UserResponse)
def get_user_me(current_user: User = Depends(get_current_user)):
    """Return current user profile via /users/me."""
    return current_user


@users_router.patch("/me", response_model=UserResponse)
def update_user_me(
    profile_data: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update current user profile via /users/me."""
    return update_profile(profile_data=profile_data, db=db, current_user=current_user)
