import bcrypt
from typing import Optional

from jose import JWTError, jwt

from app.config import settings

# ==========================================
# 1. PASSWORD HASHING (DIRECT BCRYPT)
# ==========================================

def hash_password(password: str) -> str:
    """
    Hashes a plain-text password securely using bcrypt.
    """
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies if a plain password matches the hashed password.
    """
    password_bytes = plain_password.encode('utf-8')
    hashed_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(password_bytes, hashed_bytes)

# ==========================================
# 2. SUPABASE TOKEN VERIFICATION
# ==========================================
# Custom JWT signing/verification was removed. Supabase Auth issues and
# refreshes all sessions; this service only *verifies* Supabase access
# tokens using the project's JWT secret (HS256, aud = "authenticated").

def decode_supabase_token(token: str) -> Optional[dict]:
    """
    Verifies a Supabase Auth access token and returns its claims.
    Returns None when the token is missing configuration, malformed,
    expired, or fails signature/audience validation.
    """
    if not settings.SUPABASE_JWT_SECRET:
        # SUPABASE_JWT_SECRET is required to accept Supabase tokens.
        return None
    try:
        return jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError:
        return None


def create_access_token(data: dict, expires_delta: Optional[object] = None) -> str:
    """Compatibility helper for tests and token signing."""
    to_encode = data.copy()
    if "aud" not in to_encode:
        to_encode["aud"] = "authenticated"
    if "email" not in to_encode:
        to_encode["email"] = f"{to_encode.get('sub', 'user')}@example.com"
    secret = settings.SUPABASE_JWT_SECRET or getattr(settings, "SECRET_KEY", "default-secret-key")
    algo = getattr(settings, "ALGORITHM", "HS256")
    return jwt.encode(to_encode, secret, algorithm=algo)


def decode_access_token(token: str) -> Optional[dict]:
    """Compatibility helper for decoding tokens."""
    return decode_supabase_token(token)

