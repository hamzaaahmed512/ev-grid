from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.user import UserSignup, UserLogin, UserResponse, TokenResponse
from app.core.security import hash_password, verify_password, create_access_token
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])

# ==========================================
# 1. SIGNUP ENDPOINT
# ==========================================

@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(user_data: UserSignup, db: Session = Depends(get_db)):
    """
    Creates a new user account.
    Checks for duplicate emails, hashes password, and returns JWT token.
    """
    # 1. Check if email already registered
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address is already registered"
        )
    
    # 2. Hash password
    hashed_pw = hash_password(user_data.password)
    
    # 3. Create user instance
    new_user = User(
        name=user_data.name,
        email=user_data.email,
        password_hash=hashed_pw
    )
    
    # 4. Save to Supabase
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # 5. Generate JWT token
    access_token = create_access_token(
        data={"sub": str(new_user.id), "email": new_user.email}
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": new_user
    }

# ==========================================
# 2. LOGIN ENDPOINT
# ==========================================

@router.post("/login", response_model=TokenResponse)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """
    Authenticates user credentials and returns JWT token.
    """
    # 1. Find user by email
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # 2. Verify password
    if not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # 3. Generate JWT token
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email}
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

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