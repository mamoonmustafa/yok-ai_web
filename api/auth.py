import os
import json
import firebase_admin
from firebase_admin import credentials, auth
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Firebase Admin SDK safely in serverless environment
firebase_app = None

def initialize_firebase():
    global firebase_app
    if not firebase_admin._apps:
        try:
            # Parse the Firebase service account JSON
            firebase_credentials_json = os.getenv("FIREBASE_SERVICE_ACCOUNT")
            firebase_credentials_dict = json.loads(firebase_credentials_json)
            cred = credentials.Certificate(firebase_credentials_dict)
            
            # Initialize the Firebase app
            firebase_app = firebase_admin.initialize_app(cred)
        except Exception as e:
            print(f"Firebase initialization error: {e}")
            return None
    return firebase_admin.get_app()

def verify_token(token):
    """Verify a Firebase ID token and return user data if valid"""
    try:
        # Ensure Firebase is initialized
        app = initialize_firebase()
        if not app:
            return None
            
        # Verify the Firebase ID token
        decoded_token = auth.verify_id_token(token)
        
        # Create a user data object with expected fields
        user_data = {
            'user_id': decoded_token.get('uid'),
            'email': decoded_token.get('email'),
            'exp': decoded_token.get('exp')
        }
        
        return user_data
    except Exception as e:
        print(f"Token verification error: {e}")
        return None
    
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
