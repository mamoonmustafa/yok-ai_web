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
API_HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# Initialize Firebase (for Vercel, this happens outside the handler)
firebase_app = None

def get_firestore_db():
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
    return firestore.client()

def verify_webhook_signature(data, signature, timestamp):
    """Verify the webhook signature to ensure it's from Paddle"""
    try:
        payload_str = json.dumps(data, separators=(',', ':'))
        raw_payload = payload_str.encode()
        expected_sig = hmac.new(
            WEBHOOK_SECRET.encode(),
            msg=f"{timestamp}.{payload_str}".encode(),
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
        "pri_01jsw8ab6sd8bw2h7epy8tcp14": 500,  # Pro plan (matched from your payload)
        "pri_01jsw8dtn4araas7xez8e24mdh": 2000,  # Enterprise plan
    }
    
    return credit_map.get(price_id, 0)

def get_customer_email(customer_id):
    """Get customer email from Paddle API using customer ID"""
    try:
        url = f"{API_BASE_URL}/customers/{customer_id}"
        response = requests.get(url, headers=API_HEADERS)
        
        if response.status_code == 200:
            customer_data = response.json()
            return customer_data.get('email')
        else:
            print(f"Failed to get customer data: {response.status_code}, {response.text}")
            return None
    except Exception as e:
        print(f"Error getting customer email: {e}")
        return None

def handler(request):
    """Serverless function handler for Vercel"""
    # Check if it's a POST request
    if request['method'] != 'POST':
        return {
            'statusCode': 405,
            'body': json.dumps({'error': 'Method not allowed'})
        }
    
    try:
        # Parse request body
        body = json.loads(request['body'])
        headers = {k.lower(): v for k, v in request['headers'].items()}  # Normalize header keys to lowercase
        
        # Get signature from headers
        signature = headers.get('paddle-signature', '')
        timestamp = headers.get('paddle-timestamp', '')

        # Log the webhook request for debugging
        print(f"Received webhook: Event={body.get('event_type')}, Signature present: {bool(signature)}")

        # Verify signature (uncomment when ready to test with real Paddle webhooks)
        # if not signature or not timestamp or not verify_webhook_signature(body, signature, timestamp):
        #     print("Signature verification failed")
        #     return {
        #         'statusCode': 401,
        #         'body': json.dumps({'error': 'Invalid signature'})
        #     }
        
        # Initialize Firebase
        db = get_firestore_db()
        if not db:
            return {
                'statusCode': 500,
                'body': json.dumps({'success': False, 'error': 'Failed to initialize Firebase'})
            }

        # Process webhook based on event type
        event_type = body.get('event_type', '')
        event_data = body.get('data', {})
        
        # Log important data for debugging
        print(f"Processing event: {event_type}, ID: {event_data.get('id', 'N/A')}")
        
        if event_type == 'subscription.created':
            # Extract necessary data
            subscription_id = event_data.get('id')
            customer_id = event_data.get('customer_id')
            
            # Extract price information based on payload structure
            price_id = None
            plan_name = "Unknown Plan"
            
            if event_data.get('items') and len(event_data.get('items')) > 0:
                item = event_data.get('items')[0]
                price = item.get('price', {})
                price_id = price.get('id')
                plan_name = price.get('description') or price.get('name', "Unknown Plan")
            
            print(f"Subscription ID: {subscription_id}, Customer ID: {customer_id}, Price ID: {price_id}")
            
            # Generate a license key
            license_key = generate_license_key()
            
            # Calculate credit allocation based on plan
            credit_allocation = determine_credit_allocation(price_id)
            print(f"Credit allocation: {credit_allocation} for plan: {price_id}")
            
            # Get next billing date
            next_billing_date = event_data.get('next_billed_at')
            
            # Create subscription data
            subscription_data = {
                'id': subscription_id,
                'status': 'active',
                'active': True,
                'plan': {
                    'id': price_id,
                    'name': plan_name
                },
                'customer_id': customer_id,
                'created_at': firestore.SERVER_TIMESTAMP,
                'next_billing_date': next_billing_date,
                'amount': int(price.get('unit_price', {}).get('amount', 0)) / 100,
                'interval': price.get('billing_cycle', {}).get('interval', 'month'),
                'license_key': license_key
            }
            
            # Try to find the user by Paddle customer ID first
            users_ref = db.collection('users')
            query = users_ref.where('paddleCustomerId', '==', customer_id).limit(1)
            user_docs = list(query.stream())
            
            user_id = None
            user_email = None
            
            if user_docs and len(user_docs) > 0:
                # Found by customer ID
                user_doc = user_docs[0]
                user_id = user_doc.id
                user_email = user_doc.get('email')
                print(f"Found user by Paddle customer ID: {user_id}, email: {user_email}")
            else:
                # Try to get customer email from Paddle API
                customer_email = get_customer_email(customer_id)
                
                if customer_email:
                    # Try to find user by email
                    email_query = users_ref.where('email', '==', customer_email).limit(1)
                    email_user_docs = list(email_query.stream())
                    
                    if email_user_docs and len(email_user_docs) > 0:
                        user_doc = email_user_docs[0]
                        user_id = user_doc.id
                        user_email = customer_email
                        print(f"Found user by email: {user_id}, email: {user_email}")
                        
                        # Update the user with Paddle customer ID for future reference
                        user_ref = db.collection('users').doc(user_id)
                        user_ref.update({
                            'paddleCustomerId': customer_id
                        })
            
            if user_id:
                # Update user with subscription data
                user_ref = db.collection('users').doc(user_id)
                user_ref.update({
                    'subscription': subscription_data,
                    'creditUsage': {
                        'used': 0,
                        'total': credit_allocation
                    },
                    'licenseKey': license_key
                })
                
                print(f"Updated user {user_id} with subscription {subscription_id}, license key {license_key}")
                
                # Also create a transaction record
                transaction_data = {
                    'id': event_data.get('transaction_id', f"txn_{subscription_id}"),
                    'subscription_id': subscription_id,
                    'customer_id': customer_id,
                    'amount': int(price.get('unit_price', {}).get('amount', 0)) / 100,
                    'currency': event_data.get('currency_code', 'USD'),
                    'date': event_data.get('created_at'),
                    'status': 'completed',
                    'type': 'subscription_payment',
                    'description': f"Subscription payment for {plan_name}",
                    'created_at': firestore.SERVER_TIMESTAMP
                }
                
                db.collection('users').document(user_id).collection('transactions').add(transaction_data)
                print(f"Created transaction record for user {user_id}")
            else:
                print(f"No user found for customer ID {customer_id} or associated email")
        
        elif event_type == 'subscription.updated':
            # Extract data
            subscription_id = event_data.get('id')
            status = event_data.get('status')
            customer_id = event_data.get('customer_id')
            
            print(f"Updating subscription {subscription_id} to status {status}")
            
            # Determine if subscription is active
            is_active = status.lower() in ['active', 'trialing', 'past_due']
            
            # Find user by customer ID
            users_ref = db.collection('users')
            query = users_ref.where('paddleCustomerId', '==', customer_id).limit(1)
            user_docs = list(query.stream())
            
            if user_docs and len(user_docs) > 0:
                user_doc = user_docs[0]
                user_id = user_doc.id
                
                # Update subscription status
                user_ref = db.collection('users').doc(user_id)
                user_ref.update({
                    'subscription.status': status,
                    'subscription.active': is_active,
                    'subscription.updated_at': firestore.SERVER_TIMESTAMP
                })
                
                print(f"Updated subscription status to {status} for user {user_id}")
            else:
                # Try to get customer email from Paddle and find user by email
                customer_email = get_customer_email(customer_id)
                
                if customer_email:
                    email_query = users_ref.where('email', '==', customer_email).limit(1)
                    email_user_docs = list(email_query.stream())
                    
                    if email_user_docs and len(email_user_docs) > 0:
                        user_doc = email_user_docs[0]
                        user_id = user_doc.id
                        
                        # Update subscription status
                        user_ref = db.collection('users').doc(user_id)
                        user_ref.update({
                            'subscription.status': status,
                            'subscription.active': is_active,
                            'subscription.updated_at': firestore.SERVER_TIMESTAMP,
                            'paddleCustomerId': customer_id  # Add customer ID for future reference
                        })
                        
                        print(f"Updated subscription status to {status} for user {user_id} found by email")
                    else:
                        print(f"No user found with email {customer_email}")
                else:
                    print(f"Could not get email for customer {customer_id}")
        
        elif event_type == 'subscription.cancelled':
            # Extract data
            subscription_id = event_data.get('id')
            customer_id = event_data.get('customer_id')
            
            print(f"Cancelling subscription {subscription_id}")
            
            # Find user by customer ID
            users_ref = db.collection('users')
            query = users_ref.where('paddleCustomerId', '==', customer_id).limit(1)
            user_docs = list(query.stream())
            
            if user_docs and len(user_docs) > 0:
                user_doc = user_docs[0]
                user_id = user_doc.id
                
                # Update subscription status
                user_ref = db.collection('users').doc(user_id)
                user_ref.update({
                    'subscription.status': 'cancelled',
                    'subscription.active': False,
                    'subscription.canceled_at': firestore.SERVER_TIMESTAMP
                })
                
                print(f"Marked subscription as cancelled for user {user_id}")
            else:
                # Try to find user by email through Paddle API
                customer_email = get_customer_email(customer_id)
                
                if customer_email:
                    email_query = users_ref.where('email', '==', customer_email).limit(1)
                    email_user_docs = list(email_query.stream())
                    
                    if email_user_docs and len(email_user_docs) > 0:
                        user_doc = email_user_docs[0]
                        user_id = user_doc.id
                        
                        # Update subscription status
                        user_ref = db.collection('users').doc(user_id)
                        user_ref.update({
                            'subscription.status': 'cancelled',
                            'subscription.active': False,
                            'subscription.canceled_at': firestore.SERVER_TIMESTAMP,
                            'paddleCustomerId': customer_id  # Add customer ID for future reference
                        })
                        
                        print(f"Marked subscription as cancelled for user {user_id} found by email")
        
        # Return success response
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json'
            },
            'body': json.dumps({
                'success': True,
                'event_processed': event_type
            })
        }
    except Exception as e:
        print(f"Critical webhook error: {str(e)}")
        
        # Still return 200 to acknowledge receipt
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json'
            },
            'body': json.dumps({
                'success': False,
                'error': str(e)
            })
        }

# For Vercel serverless functions - needed for handler to be properly recognized
def lambda_handler(event, context):
    """AWS Lambda compatible handler"""
    return handler(event)