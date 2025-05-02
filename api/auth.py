import os
import jwt
import json
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# JWT Secret Key from environment variable (secure)
JWT_SECRET = os.getenv("JWT_SECRET")

def generate_token(user_data):
    """Generate a JWT token for authenticated users"""
    expiration = datetime.utcnow() + timedelta(days=1)  # Token valid for 1 day
    
    payload = {
        'user_id': user_data.get('id'),
        'email': user_data.get('email'),
        'exp': expiration
    }
    
    token = jwt.encode(payload, JWT_SECRET, algorithm='HS256')
    return token

def verify_token(token):
    """Verify a JWT token and return user data if valid"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None