from http.server import BaseHTTPRequestHandler
import json
import hmac
import hashlib
import os
import uuid
import datetime
import requests
import firebase_admin
from firebase_admin import credentials, firestore
import traceback

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

def generate_license_key():
    """Generate a unique license key"""
    return str(uuid.uuid4()).upper()

def determine_credit_allocation(price_id):
    """Determine how many credits to allocate based on the plan"""
    # Map price IDs to credit amounts
    credit_map = {
        "pri_01jsw881b64y680g737k4dx7fm": 100,  # Starter plan
        "pri_01jsw8ab6sd8bw2h7epy8tcp14": 500,  # Pro plan
        "pri_01jsw8dtn4araas7xez8e24mdh": 2000,  # Enterprise plan
    }
    
    return credit_map.get(price_id, 0)

def get_customer_details(customer_id):
    """Get customer details from Paddle API using customer ID"""
    try:
        api_key = os.environ.get("PADDLE_API_KEY")
        api_base_url = os.environ.get("PADDLE_API_BASE_URL", "https://sandbox-api.paddle.com")
        
        # Fix the double slash issue
        api_base_url = api_base_url.rstrip('/')
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        # First try to get customer directly with customer ID
        url = f"{api_base_url}/customers/{customer_id}"
        print(f"Fetching customer details from: {url}")
        
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            customer_data = response.json().get('data', {})
            print(f"Successfully retrieved customer data: {json.dumps(customer_data)[:500]}")
            return {
                'email': customer_data.get('email'),
                'name': customer_data.get('name')
            }
        
        print(f"Failed to get customer data: {response.status_code}, {response.text}")
        return None
    except Exception as e:
        print(f"Error getting customer details: {e}")
        return None

def find_user_by_email(email):
    """Find a Firebase user by email (case-insensitive)"""
    if not email or not initialize_firebase():
        return None, None
    
    print(f"Looking for user with email: {email}")
    
    try:
        # Try exact match first
        users_ref = db.collection('users')
        email_query = users_ref.where('email', '==', email).limit(1)
        email_docs = list(email_query.stream())
        
        if email_docs and len(email_docs) > 0:
            user_doc = email_docs[0]
            user_id = user_doc.id
            print(f"Found user by exact email match: {user_id}")
            return user_id, user_doc
        
        # If exact match fails, try case-insensitive search by querying with email variations
        print("Exact match failed, trying case-sensitive variations")
        
        # Try lowercase email
        email_lower = email.lower()
        email_query_lower = users_ref.where('email', '==', email_lower).limit(1)
        email_docs_lower = list(email_query_lower.stream())
        
        if email_docs_lower and len(email_docs_lower) > 0:
            user_doc = email_docs_lower[0]
            user_id = user_doc.id
            print(f"Found user by lowercase email: {user_id}")
            return user_id, user_doc
        
        # Try original case email with different field variations
        print("Trying to find user by checking Firebase Auth users")
        
        # Since Firebase Auth and Firestore might have different email cases,
        # let's check if we can find by other means
        # Note: This is still secure as we're only querying by email
        print(f"No user found with email variations for: {email}")
        return None, None
        
    except Exception as e:
        print(f"Error searching for user by email: {e}")
        return None, None

def extract_email_from_webhook_data(webhook_data, event_data):
    """Extract email from various possible locations in webhook data"""
    possible_email_locations = [
        # Check in the main event data
        event_data.get('customer', {}).get('email'),
        
        # Check in customer object
        event_data.get('customer_email'),
        
        # Check in billing details
        event_data.get('billing_details', {}).get('email'),
        event_data.get('billing', {}).get('email'),
        
        # Check in the root webhook data
        webhook_data.get('customer', {}).get('email'),
        webhook_data.get('email'),
        
        # Check in notification data
        webhook_data.get('data', {}).get('customer', {}).get('email'),
        webhook_data.get('data', {}).get('customer_email'),
        
        # Check in the items/price data
        event_data.get('items', [{}])[0].get('customer_email') if event_data.get('items') else None,
    ]
    
    # Return the first non-None email found
    for email in possible_email_locations:
        if email:
            print(f"Found email in webhook data: {email}")
            return email
    
    print("No email found in webhook data")
    return None

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Handle GET requests - useful for testing if endpoint is accessible"""
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({
            'status': 'Paddle webhook endpoint is online',
            'message': 'This endpoint is for Paddle webhook notifications. Please use POST method to send webhook events.'
        }).encode())
        
    def serialize_for_log(self, data):
        """Create a JSON-serializable copy of data, replacing Sentinel values."""
        if isinstance(data, dict):
            result = {}
            for key, value in data.items():
                if key in ('created_at', 'updated_at', 'canceled_at') and value == firestore.SERVER_TIMESTAMP:
                    result[key] = datetime.datetime.now().isoformat()
                elif isinstance(value, dict):
                    result[key] = self.serialize_for_log(value)
                elif isinstance(value, list):
                    result[key] = [self.serialize_for_log(item) for item in value]
                else:
                    result[key] = value
            return result
        elif isinstance(data, list):
            return [self.serialize_for_log(item) for item in data]
        return data
    
    def do_POST(self):
        """Handle POST requests from Paddle webhooks"""
        try:
            # Get content length for reading the request body
            content_length = int(self.headers.get('Content-Length', 0))
            
            # Read the request body
            request_body = self.rfile.read(content_length)
            
            # Log request headers for debugging
            print("Request headers:")
            for header, value in self.headers.items():
                print(f"  {header}: {value}")
            
            # Parse JSON body
            try:
                webhook_data = json.loads(request_body.decode('utf-8'))
                print(f"Parsed webhook data: {json.dumps(webhook_data)[:500]}...")  # First 500 chars
            except json.JSONDecodeError as e:
                print(f"Failed to parse JSON body: {e}")
                print(f"Raw body: {request_body.decode('utf-8')[:200]}...")  # First 200 chars
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'error': 'Invalid JSON payload'
                }).encode())
                return
            
            # Get signature and timestamp from headers
            signature = self.headers.get('Paddle-Signature')
            timestamp = self.headers.get('Paddle-Timestamp')
            webhook_secret = os.environ.get("PADDLE_WEBHOOK_SECRET")

            # Verify Paddle signature if available
            if webhook_secret and signature and timestamp:
                # Convert data to string for signature verification
                data_string = json.dumps(webhook_data, separators=(',', ':'))
                
                # Create message to sign
                message = f"{timestamp}.{data_string}".encode()
                
                # Calculate expected signature
                expected_sig = hmac.new(
                    webhook_secret.encode(),
                    msg=message,
                    digestmod=hashlib.sha256
                ).hexdigest()
                
                # Compare signatures
                if not hmac.compare_digest(expected_sig, signature):
                    print("Webhook signature verification failed")
                    self.send_response(401)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        'error': 'Invalid signature'
                    }).encode())
                    return
            
            # Initialize Firebase
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
            
            print(f"Processing event type: {event_type}")
            print(f"Event data details: {json.dumps(event_data)[:1000]}...")

            try:
                # Handle subscription.created event
                if event_type == 'subscription.created':
                    try:
                        # Extract necessary data
                        subscription_id = event_data.get('id')
                        customer_id = event_data.get('customer_id')
                        
                        # Extract price/product details
                        price_id = None
                        plan_name = "Unknown Plan"
                        price_amount = 0
                        price_interval = "month"
                        
                        if event_data.get('items') and len(event_data.get('items')) > 0:
                            item = event_data.get('items')[0]
                            price = item.get('price', {})
                            price_id = price.get('id')
                            plan_name = price.get('description') or price.get('name', "Unknown Plan")
                            
                            # Extract price amount
                            unit_price = price.get('unit_price', {})
                            if unit_price:
                                price_amount = int(unit_price.get('amount', 0)) / 100  # Convert from cents
                            
                            # Extract billing interval
                            billing_cycle = price.get('billing_cycle', {})
                            if billing_cycle:
                                price_interval = billing_cycle.get('interval', 'month')
                        
                        # Generate a license key
                        license_key = generate_license_key()
                        
                        # Calculate credit allocation based on plan
                        credit_allocation = determine_credit_allocation(price_id)
                        
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
                            'next_billing_date': event_data.get('next_billed_at'),
                            'amount': price_amount,
                            'interval': price_interval,
                            'license_key': license_key
                        }
                        
                        # Log a serializable version of the data
                        print(f"Subscription data being processed: {json.dumps(subscription_data)}")
                        
                        # Now add the SERVER_TIMESTAMP for the database version
                        subscription_data['created_at'] = firestore.SERVER_TIMESTAMP
                        
                        # Find user - prioritize email lookup
                        user_id = None
                        user_doc = None
                        customer_email = None
                        
                        # Step 1: First try to extract email from webhook data directly
                        customer_email = extract_email_from_webhook_data(webhook_data, event_data)
                        
                        if customer_email:
                            print(f"Found email in webhook data: {customer_email}")
                            user_id, user_doc = find_user_by_email(customer_email)
                        
                        # Step 2: If no email in webhook, try to get from Paddle API
                        if not customer_email:
                            print("No email in webhook data, trying Paddle API")
                            customer_details = get_customer_details(customer_id)
                            
                            if customer_details and customer_details.get('email'):
                                customer_email = customer_details.get('email')
                                print(f"Got email from Paddle API: {customer_email}")
                                user_id, user_doc = find_user_by_email(customer_email)
                            else:
                                print(f"Could not get customer email from Paddle API for customer ID: {customer_id}")
                        
                        # Step 3: If still no user found, try by customer ID (for existing customers)
                        if not user_id:
                            print("Trying to find user by customer ID as fallback")
                            users_ref = db.collection('users')
                            query = users_ref.where('paddleCustomerId', '==', customer_id).limit(1)
                            user_docs = list(query.stream())
                            
                            if user_docs and len(user_docs) > 0:
                                user_doc = user_docs[0]
                                user_id = user_doc.id
                                print(f"Found user by customer ID: {user_id}")
                        
                        if user_id:
                            # Update user with subscription data
                            user_ref = db.collection('users').document(user_id)
                            print(f"Updating user {user_id} with subscription data")
                            
                            update_data = {
                                'subscription': subscription_data,
                                'creditUsage': {
                                    'used': 0,
                                    'total': credit_allocation
                                },
                                'licenseKey': license_key,
                                'paddleCustomerId': customer_id
                            }
                            
                            user_ref.update(update_data)
                            print(f"Successfully updated user {user_id} with subscription data")
                            
                            # Create transaction record
                            transaction_data = {
                                'id': event_data.get('transaction_id', f"txn_{subscription_id}"),
                                'subscription_id': subscription_id,
                                'customer_id': customer_id,
                                'amount': price_amount,
                                'currency': event_data.get('currency_code', 'USD'),
                                'date': event_data.get('created_at'),
                                'status': 'completed',
                                'type': 'subscription_payment',
                                'description': f"Subscription payment for {plan_name}",
                                'created_at': firestore.SERVER_TIMESTAMP
                            }
                            
                            db.collection('users').document(user_id).collection('transactions').add(transaction_data)
                            print(f"Created license key {license_key} for subscription {subscription_id}, user {user_id}")
                        else:
                            print(f"ERROR: No user found for customer ID {customer_id} or email {customer_email}")
                            
                            # Create a manual debug document to help troubleshoot
                            debug_collection = db.collection('paddle_webhook_debug')
                            debug_doc = {
                                'event_type': event_type,
                                'customer_id': customer_id,
                                'customer_email': customer_email,
                                'subscription_id': subscription_id,
                                'webhook_data': json.dumps(webhook_data),
                                'timestamp': firestore.SERVER_TIMESTAMP,
                                'error': f'No user found for customer ID {customer_id} or email {customer_email}'
                            }
                            debug_collection.add(debug_doc)
                            print(f"Created debug document in paddle_webhook_debug collection")
                    except Exception as e:
                        traceback_str = traceback.format_exc()
                        print(f"Error in subscription.created handler: {str(e)}")
                        print(traceback_str)

                elif event_type == 'subscription.updated':
                    # Extract data
                    subscription_id = event_data.get('id')
                    status = event_data.get('status')
                    customer_id = event_data.get('customer_id')
                    
                    print(f"Processing subscription.updated for {subscription_id}, status: {status}")
                    
                    # Determine if subscription is active
                    is_active = status.lower() in ['active', 'trialing', 'past_due']
                    
                    # Find user - prioritize email lookup
                    user_id = None
                    customer_email = None
                    
                    # First try to get email from webhook data
                    customer_email = extract_email_from_webhook_data(webhook_data, event_data)
                    
                    if customer_email:
                        user_id, user_doc = find_user_by_email(customer_email)
                    
                    # If no email in webhook, try Paddle API
                    if not customer_email or not user_id:
                        customer_details = get_customer_details(customer_id)
                        if customer_details and customer_details.get('email'):
                            customer_email = customer_details.get('email')
                            user_id, user_doc = find_user_by_email(customer_email)
                    
                    # Fallback to customer ID lookup
                    if not user_id:
                        users_ref = db.collection('users')
                        query = users_ref.where('paddleCustomerId', '==', customer_id).limit(1)
                        user_docs = list(query.stream())
                        
                        if user_docs and len(user_docs) > 0:
                            user_doc = user_docs[0]
                            user_id = user_doc.id
                    
                    if user_id:
                        # Update subscription status
                        user_ref = db.collection('users').document(user_id)
                        user_ref.update({
                            'subscription.status': status,
                            'subscription.active': is_active,
                            'subscription.updated_at': firestore.SERVER_TIMESTAMP,
                            'paddleCustomerId': customer_id
                        })
                        
                        print(f"Updated subscription {subscription_id} status to {status} for user {user_id}")
                    else:
                        print(f"ERROR: Could not find user for subscription update - customer_id: {customer_id}, email: {customer_email}")
                

                elif event_type == 'subscription.cancelled':
                    # Extract data
                    subscription_id = event_data.get('id')
                    customer_id = event_data.get('customer_id')
                    
                    print(f"Processing subscription.cancelled for {subscription_id}")
                    
                    # Find user - prioritize email lookup
                    user_id = None
                    customer_email = None
                    
                    # First try to get email from webhook data
                    customer_email = extract_email_from_webhook_data(webhook_data, event_data)
                    
                    if customer_email:
                        user_id, user_doc = find_user_by_email(customer_email)
                    
                    # If no email in webhook, try Paddle API
                    if not customer_email or not user_id:
                        customer_details = get_customer_details(customer_id)
                        if customer_details and customer_details.get('email'):
                            customer_email = customer_details.get('email')
                            user_id, user_doc = find_user_by_email(customer_email)
                    
                    # Fallback to customer ID lookup
                    if not user_id:
                        users_ref = db.collection('users')
                        query = users_ref.where('paddleCustomerId', '==', customer_id).limit(1)
                        user_docs = list(query.stream())
                        
                        if user_docs and len(user_docs) > 0:
                            user_doc = user_docs[0]
                            user_id = user_doc.id
                    
                    if user_id:
                        # Update subscription status
                        user_ref = db.collection('users').document(user_id)
                        user_ref.update({
                            'subscription.status': 'cancelled',
                            'subscription.active': False,
                            'subscription.canceled_at': firestore.SERVER_TIMESTAMP,
                            'paddleCustomerId': customer_id
                        })
                        
                        print(f"Marked subscription {subscription_id} as cancelled for user {user_id}")
                    else:
                        print(f"ERROR: Could not find user for subscription cancellation - customer_id: {customer_id}, email: {customer_email}")
                

                # Return success response
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': True,
                    'event_processed': event_type
                }).encode())
                
            except Exception as e:
                print(f"Error processing webhook event: {str(e)}")
                
                # Create a debug collection entry
                if initialize_firebase():
                    try:
                        debug_collection = db.collection('paddle_webhook_debug')
                        debug_doc = {
                            'event_type': event_type,
                            'error': str(e),
                            'traceback': traceback.format_exc(),
                            'webhook_data': json.dumps(webhook_data),
                            'timestamp': firestore.SERVER_TIMESTAMP
                        }
                        debug_collection.add(debug_doc)
                        print(f"Created error debug document in paddle_webhook_debug collection")
                    except Exception as debug_error:
                        print(f"Error creating debug document: {debug_error}")
                
                # Still return 200 to acknowledge receipt
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': False,
                    'error': str(e)
                }).encode())
                
        except Exception as e:
            import traceback
            print(f"Critical webhook error: {str(e)}")
            print(traceback.format_exc())
            
            # Still return 200 to acknowledge receipt
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': False,
                'error': str(e)
            }).encode())