import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.core.security import decode_supabase_token, hash_password

# OAuth2 scheme - looks for 'Authorization: Bearer <token>' in request headers
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    Verifies a Supabase Auth access token and returns the matching
    application user. The local row is auto-provisioned the first time a
    Supabase identity is seen (linked by google_sub / Supabase uid, or by
    verified email for accounts that predate the auth migration).
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # 1. Verify the Supabase token (signature, audience and expiry)
    payload = decode_supabase_token(token)
    if payload is None:
        raise credentials_exception

    # 2. Resolve the identity from standard Supabase claims
    sub = payload.get("sub")
    email = (payload.get("email") or "").strip().lower()
    if not sub or not email:
        raise credentials_exception

    user = (
        db.query(User)
        .filter(
            or_(
                User.google_sub == sub,
                func.lower(User.email) == email,
            )
        )
        .first()
    )

    # 3. Auto-provision the local row for new Supabase identities
    if user is None:
        metadata = payload.get("user_metadata") or {}
        name = (metadata.get("full_name") or metadata.get("name") or email.split("@")[0])[:100]
        user = User(
            name=name,
            email=email,
            google_sub=sub,
            # Password auth is handled by Supabase; store an unusable hash
            # to satisfy the existing NOT NULL constraint.
            password_hash=hash_password(secrets.token_urlsafe(32)),
        )
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
        except Exception:
            db.rollback()
            raise credentials_exception

    return user


def require_business_owner(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Enforces that the authenticated user has the 'business_owner' role.
    Raises 403 Forbidden for any other role.
    """
    role = (current_user.role or "").strip().lower()
    if role != "business_owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Business owner access required.",
        )
    return current_user

