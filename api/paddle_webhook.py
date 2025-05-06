from http.server import BaseHTTPRequestHandler
import json
import hmac
import hashlib
import os
import uuid
import requests
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Paddle webhook secret from environment variable (secure)
WEBHOOK_SECRET = os.getenv("PADDLE_WEBHOOK_SECRET")
API_KEY = os.getenv("PADDLE_API_KEY")
API_BASE_URL = os.getenv("PADDLE_API_BASE_URL", "https://sandbox-api.paddle.com")

# Headers for Paddle API authentication
headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# Initialize Firebase
def initialize_firebase():
    if not firebase_admin._apps:
        try:
            # Parse the Firebase service account JSON
            firebase_credentials_json = os.getenv("FIREBASE_SERVICE_ACCOUNT")
            firebase_credentials_dict = json.loads(firebase_credentials_json)
            cred = credentials.Certificate(firebase_credentials_dict)
            
            # Initialize the Firebase app
            firebase_admin.initialize_app(cred)
        except Exception as e:
            print(f"Firebase initialization error: {e}")
            return False
    return True

def verify_webhook_signature(data, signature, timestamp):
    """Verify the webhook signature to ensure it's from Paddle"""
    try:
        raw_payload = json.dumps(data).encode()
        expected_sig = hmac.new(
            WEBHOOK_SECRET.encode(),
            msg=f"{timestamp}.{raw_payload.decode()}".encode(),
            digestmod=hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(expected_sig, signature)
    except Exception as e:
        print(f"Signature verification error: {e}")
        return False

def generate_license_key():
    """Generate a unique license key"""
    return str(uuid.uuid4()).upper().replace('-', '-')

def determine_credit_allocation(price_id):
    """Determine how many credits to allocate based on the plan"""
    # Map price IDs to credit amounts
    credit_map = {
        "pri_01jsw881b64y680g737k4dx7fm": 100,  # Starter plan
        "pri_01jsw8ab6sd8bw2h7epy8tcp14": 500,  # Pro plan
        "pri_01jsw8dtn4araas7xez8e24mdh": 2000,  # Enterprise plan
        # Add other price IDs as needed
    }
    
    return credit_map.get(price_id, 0)

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # Read request data
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            webhook_data = json.loads(post_data)
            
            # Get signature from headers
            signature = self.headers.get('Paddle-Signature', '')
            timestamp = self.headers.get('Paddle-Timestamp', '')

            # Log the webhook request for debugging
            print(f"Received webhook: Event={webhook_data.get('event_type')}, Signature={signature[:10]}...")

            # Verify signature (security check)
            if not signature or not timestamp or not verify_webhook_signature(webhook_data, signature, timestamp):
                self.send_response(401)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'error': 'Invalid signature'
                }).encode())
                print("Webhook signature verification failed")
                return
            
            # Initialize Firebase (needed for database operations)
            if not initialize_firebase():
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': False,
                    'error': 'Failed to initialize Firebase'
                }).encode())
                return

            # Process webhook based on event type
            event_type = webhook_data.get('event_type', '')
            event_data = webhook_data.get('data', {})
            
            try:
                # Process different webhook events
                if event_type == 'subscription.created':
                    # Extract necessary data
                    subscription_id = event_data.get('id')
                    customer_id = event_data.get('customer_id')
                    
                    # For customer email, the path is different in Billing webhooks
                    customer_email = event_data.get('customer', {}).get('email')
                    
                    # For price/product IDs, the path is also different
                    price_id = None
                    if event_data.get('items') and len(event_data.get('items')) > 0:
                        price_id = event_data.get('items')[0].get('price', {}).get('id')
                    
                    # Generate a license key
                    license_key = generate_license_key()
                    
                    # Get custom data from the event for user identification
                    custom_data = event_data.get('custom_data', {})
                    user_id = custom_data.get('userId')
                    
                    # Get Firestore database
                    db = firestore.client()
                    
                    # Create subscription data to save
                    subscription_data = {
                        'id': subscription_id,
                        'status': 'active',
                        'active': True,  # Explicitly set active flag
                        'plan': {
                            'id': price_id,
                            'name': event_data.get('items', [{}])[0].get('price', {}).get('description', 'Unknown Plan')
                        },
                        'customer_id': customer_id,
                        'created_at': firestore.SERVER_TIMESTAMP,
                        'next_billing_date': event_data.get('next_billed_at'),
                        'license_key': license_key
                    }
                    
                    # Calculate credit allocation based on plan
                    credit_allocation = determine_credit_allocation(price_id)
                    
                    if user_id:
                        # Associate with Firebase user ID from custom data
                        user_ref = db.collection('users').doc(user_id)
                        
                        # Update the user document with subscription data
                        user_ref.update({
                            'subscription': subscription_data,
                            'creditUsage': {
                                'used': 0,
                                'total': credit_allocation
                            },
                            'licenseKey': license_key
                        })
                        
                        print(f"Subscription {subscription_id} associated with Firebase user {user_id}")
                    else:
                        # Fallback to email-based association if userId is not present
                        # Find the user with this email in Firestore
                        users_ref = db.collection('users')
                        query = users_ref.where('email', '==', customer_email).limit(1)
                        user_docs = query.get()
                        
                        if not user_docs or len(user_docs) == 0:
                            print(f"No user found with email {customer_email}")
                        else:
                            user_doc = user_docs[0]
                            found_user_id = user_doc.id
                            
                            # Update the user with subscription data
                            user_ref = db.collection('users').doc(found_user_id)
                            user_ref.update({
                                'subscription': subscription_data,
                                'creditUsage': {
                                    'used': 0,
                                    'total': credit_allocation
                                },
                                'licenseKey': license_key
                            })
                            
                            print(f"Subscription {subscription_id} associated with user {found_user_id} by email {customer_email}")
                    
                    # Log for verification
                    print(f"Created license key {license_key} for subscription {subscription_id}, customer {customer_email}")
                    
                elif event_type == 'subscription.updated':
                    # Extract data
                    subscription_id = event_data.get('id')
                    status = event_data.get('status')
                    
                    # Get custom data from the event for user identification
                    custom_data = event_data.get('custom_data', {})
                    user_id = custom_data.get('userId')
                    
                    # Get customer email
                    customer_email = event_data.get('customer', {}).get('email')
                    
                    # Get Firestore database
                    db = firestore.client()
                    
                    # Determine if subscription is active
                    is_active = status.lower() in ['active', 'trialing', 'past_due']
                    
                    if user_id:
                        # Update subscription status for user by ID
                        user_ref = db.collection('users').doc(user_id)
                        user_ref.update({
                            'subscription.status': status,
                            'subscription.active': is_active,  # Update active flag
                            'updatedAt': firestore.SERVER_TIMESTAMP
                        })
                        print(f"Updated subscription {subscription_id} status to {status} for user {user_id}")
                    else:
                        # Find user by email
                        users_ref = db.collection('users')
                        query = users_ref.where('email', '==', customer_email).limit(1)
                        user_docs = query.get()
                        
                        if user_docs and len(user_docs) > 0:
                            user_doc = user_docs[0]
                            found_user_id = user_doc.id
                            
                            user_ref = db.collection('users').doc(found_user_id)
                            user_ref.update({
                                'subscription.status': status,
                                'subscription.active': is_active,  # Update active flag
                                'updatedAt': firestore.SERVER_TIMESTAMP
                            })
                            print(f"Updated subscription {subscription_id} status to {status} for user {found_user_id} by email")
                    
                    # Log the event
                    print(f"Subscription {subscription_id} updated with status {status}")
                    
                elif event_type == 'subscription.cancelled':
                    # Extract data
                    subscription_id = event_data.get('id')
                    
                    # Get custom data from the event for user identification
                    custom_data = event_data.get('custom_data', {})
                    user_id = custom_data.get('userId')
                    
                    # Get customer email
                    customer_email = event_data.get('customer', {}).get('email')
                    
                    # Get Firestore database
                    db = firestore.client()
                    
                    if user_id:
                        # Update subscription status for user by ID
                        user_ref = db.collection('users').doc(user_id)
                        user_ref.update({
                            'subscription.status': 'cancelled',
                            'subscription.active': False,  # Set active flag to false
                            'updatedAt': firestore.SERVER_TIMESTAMP
                        })
                        print(f"Marked subscription {subscription_id} as cancelled for user {user_id}")
                    else:
                        # Find user by email
                        users_ref = db.collection('users')
                        query = users_ref.where('email', '==', customer_email).limit(1)
                        user_docs = query.get()
                        
                        if user_docs and len(user_docs) > 0:
                            user_doc = user_docs[0]
                            found_user_id = user_doc.id
                            
                            user_ref = db.collection('users').doc(found_user_id)
                            user_ref.update({
                                'subscription.status': 'cancelled',
                                'subscription.active': False,  # Set active flag to false
                                'updatedAt': firestore.SERVER_TIMESTAMP
                            })
                            print(f"Marked subscription {subscription_id} as cancelled for user {found_user_id} by email")
                    
                    # Log the event
                    print(f"Subscription {subscription_id} cancelled")
                
                # Return success response
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': True,
                    'event_processed': event_type
                }).encode())
                
            except Exception as e:
                print(f"Error processing webhook: {str(e)}")
                
                # Still return 200 to acknowledge receipt (Paddle will retry otherwise)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': False,
                    'error': str(e)
                }).encode())
                
        except Exception as e:
            print(f"Critical webhook error: {str(e)}")
            
            # Still return 200 to acknowledge receipt
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': False,
                'error': str(e)
            }).encode())