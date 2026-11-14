from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.core.security import decode_access_token

# OAuth2 scheme - looks for 'Authorization: Bearer <token>' in request headers
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    Validates incoming JWT token and returns the current authenticated User object.
    Used as a dependency in protected endpoints.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # 1. Decode token
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    
    # 2. Extract user ID from payload ('sub' claim)
    user_id_str = payload.get("sub")
    if user_id_str is None:
        raise credentials_exception
    
    user = None
    try:
        user_id = int(user_id_str)
        user = db.query(User).filter(User.id == user_id).first()
    except ValueError:
        # Supabase auth uses UUID strings for 'sub'
        email = payload.get("email")
        if email:
            normalized_email = email.strip().lower()
            user = db.query(User).filter(
                (User.google_sub == user_id_str) | (User.email == normalized_email)
            ).first()
        else:
            user = db.query(User).filter(User.google_sub == user_id_str).first()

    # 3. Guard against missing user
    if user is None:
        raise credentials_exception
    
    return user