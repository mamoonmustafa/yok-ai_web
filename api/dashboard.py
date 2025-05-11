from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs
import json
import os
import datetime
from .auth import verify_token
from .paddle_api import (
    get_customer_by_email,
    get_subscriptions,
    get_license_keys,
    get_subscription_details
)
import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase
firebase_initialized = False
db = None

def initialize_firebase():
    global firebase_initialized, db
    if not firebase_initialized:
        try:
            # Parse the Firebase service account JSON
            firebase_credentials_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
            if not firebase_credentials_json:
                print("Firebase credentials not found in environment variables")
                return False
                
            firebase_credentials_dict = json.loads(firebase_credentials_json)
            cred = credentials.Certificate(firebase_credentials_dict)
            
            # Initialize the Firebase app
            if not firebase_admin._apps:
                firebase_admin.initialize_app(cred)
            
            db = firestore.client()
            firebase_initialized = True
            print("Firebase initialized successfully")
            return True
        except Exception as e:
            print(f"Firebase initialization error: {e}")
            return False
    return True
def convert_timestamps_to_strings(data):
    """Convert Firestore timestamp objects to ISO strings for JSON serialization"""
    if isinstance(data, firebase_admin.firestore.DocumentSnapshot):
        # Convert DocumentSnapshot to dict first
        data = data.to_dict()
        
    if isinstance(data, datetime.datetime):
        return data.isoformat()
    
    if isinstance(data, dict):
        for key, value in list(data.items()):
            data[key] = convert_timestamps_to_strings(value)
    
    elif isinstance(data, list):
        return [convert_timestamps_to_strings(item) for item in data]
    
    return data
class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Set CORS headers for browser security
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        
        # Get authorization token from headers
        auth_header = self.headers.get('Authorization')
        token = None
        
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header[7:]
        
        if not token:
            self.wfile.write(json.dumps({
                'error': 'Authorization token required'
            }).encode())
            return
        
        # Verify token
        user_data = verify_token(token)
        if not user_data:
            self.wfile.write(json.dumps({
                'error': 'Invalid or expired token'
            }).encode())
            return
        
        try:
            # First try to get subscription data from Firebase
            if initialize_firebase():
                # Get the user ID from the token
                user_id = user_data.get('user_id')
                
                if user_id:
                    print(f"Looking up Firebase data for user: {user_id}")
                    user_ref = db.collection('users').document(user_id)
                    user_doc = user_ref.get()
                    
                    if user_doc.exists:
                        user_data_firestore = user_doc.to_dict()
                        print(f"Found user data in Firestore: {user_id}")
                        
                        # Check if user has subscription data stored in Firebase
                        if 'subscription' in user_data_firestore and user_data_firestore['subscription'].get('active', False):
                            # User has an active subscription in Firebase
                            subscription_data = user_data_firestore['subscription']
                            license_key = user_data_firestore.get('licenseKey')
                            credit_usage = user_data_firestore.get('creditUsage', {'used': 0, 'total': 0})
                            
                            print(f"Found active subscription in Firestore for user {user_id}")
                            
                            # Format the response with data from Firestore
                            dashboard_data = {
                                'customer': {'id': user_data_firestore.get('paddleCustomerId')},
                                'subscriptions': [subscription_data],
                                'license_keys': [{'key': license_key}] if license_key else [],
                                'credit_usage': user_data_firestore.get('creditUsage', {'used': 0, 'total': 0})
                            }

                            # Convert timestamps to strings for JSON serialization
                            dashboard_data = convert_timestamps_to_strings(dashboard_data)

                            # Return dashboard data
                            self.wfile.write(json.dumps(dashboard_data).encode())
                            return
                        else:
                            print(f"No active subscription found in Firestore for user {user_id}")
                    else:
                        print(f"User document not found in Firestore for user {user_id}")
            
            # If we reach this point, either Firebase wasn't initialized or the user doesn't have
            # an active subscription in Firestore. Fall back to Paddle API.

            # Get customer data from Paddle
            email = user_data.get('email')
            print(f"Falling back to Paddle API for user email: {email}")
            customer = get_customer_by_email(email)
            
            if not customer:
                print(f"Customer not found in Paddle for email: {email}")
                self.wfile.write(json.dumps({
                    'error': 'Customer not found in Paddle'
                }).encode())
                return
            
            # Get subscriptions
            subscriptions = get_subscriptions(customer['id'])
            
            # Process subscriptions to include active flag and detailed info
            processed_subscriptions = []
            license_keys = []
            
            for subscription in subscriptions:
                # Get license keys for each subscription
                subscription_keys = get_license_keys(subscription['id'])
                license_keys.extend(subscription_keys)
                
                # Get detailed subscription info
                details = get_subscription_details(subscription['id'])
                
                if details:
                    # Determine if subscription is active based on status
                    status = details.get('status', '').lower()
                    is_active = status in ['active', 'trialing', 'past_due']
                    
                    # Create processed subscription with active flag
                    processed_subscription = {
                        **subscription,
                        'status': status,
                        'active': is_active,  # Add explicit active flag for frontend
                        'plan': {
                            'id': details.get('price_id', ''),
                            'name': details.get('plan_name', 'Unknown Plan')
                        },
                        'nextBillingDate': details.get('next_billed_at'),
                        'amount': details.get('amount', 0),
                        'interval': details.get('billing_cycle', 'month')
                    }
                    
                    processed_subscriptions.append(processed_subscription)
            
            # Determine credit allocation based on subscription
            total_credits = 0
            if processed_subscriptions:
                # Default allocation by plan
                for subscription in processed_subscriptions:
                    if subscription.get('active'):
                        plan_id = subscription.get('plan', {}).get('id', '')
                        
                        # Map plans to credit amounts
                        credit_map = {
                            "pri_01jsw881b64y680g737k4dx7fm": 100,  # Starter plan
                            "pri_01jsw8ab6sd8bw2h7epy8tcp14": 500,  # Pro plan
                            "pri_01jsw8dtn4araas7xez8e24mdh": 2000,  # Enterprise plan
                        }
                        
                        total_credits += credit_map.get(plan_id, 0)

            # If user has an active subscription in Paddle but not in Firebase, update Firebase
            if processed_subscriptions and any(sub.get('active') for sub in processed_subscriptions) and initialize_firebase():
                active_sub = next((sub for sub in processed_subscriptions if sub.get('active')), None)
                
                if active_sub and user_data.get('user_id'):
                    try:
                        print(f"Updating Firebase with active subscription from Paddle API")
                        user_ref = db.collection('users').document(user_data.get('user_id'))
                        
                        # Generate a license key if none exists
                        if not license_keys:
                            import uuid
                            license_key = str(uuid.uuid4()).upper()
                        else:
                            license_key = license_keys[0].get('key')
                        
                        # Update user document in Firebase
                        user_ref.update({
                            'subscription': active_sub,
                            'creditUsage': {
                                'used': 0,
                                'total': total_credits
                            },
                            'licenseKey': license_key,
                            'paddleCustomerId': customer['id']
                        })
                        print(f"Successfully updated Firebase from Paddle API data")
                    except Exception as e:
                        print(f"Error updating Firebase from Paddle API: {str(e)}")
            
            # Debug logging
            print(f"Email: {email}, Customer ID: {customer.get('id')}")
            print(f"Found {len(processed_subscriptions)} subscriptions")
            for sub in processed_subscriptions:
                print(f"Subscription ID: {sub.get('id')}, Status: {sub.get('status')}, Active: {sub.get('active')}")
            
            # Format the response
            credit_usage_data = {'used': 0, 'total': total_credits}
            if user_data and user_data.get('user_id'):
                try:
                    user_ref = db.collection('users').document(user_data.get('user_id'))
                    user_doc = user_ref.get()
                    if user_doc.exists:
                        user_firestore_data = user_doc.to_dict()
                        credit_usage_data = user_firestore_data.get('creditUsage', {'used': 0, 'total': total_credits})
                except:
                    pass

            dashboard_data = {
                'customer': customer,
                'subscriptions': processed_subscriptions,
                'license_keys': license_keys,
                'credit_usage': credit_usage_data
            }
            
            # Return dashboard data
            self.wfile.write(json.dumps(dashboard_data).encode())
            
        except Exception as e:
            print(f"Dashboard error: {str(e)}")
            self.wfile.write(json.dumps({
                'error': str(e)
            }).encode())
            
    def do_OPTIONS(self):
        # Handle preflight requests for CORS
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()