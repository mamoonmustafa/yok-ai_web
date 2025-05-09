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
        
        # If direct customer fetch fails, try listing customers with a filter
        url = f"{api_base_url}/customers"
        print(f"Direct customer fetch failed with status {response.status_code}. Trying to list customers with filter")
        
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            customers_data = response.json().get('data', [])
            
            # Find the customer with matching ID
            for customer in customers_data:
                if customer.get('id') == customer_id:
                    print(f"Found customer in list: {json.dumps(customer)[:500]}")
                    return {
                        'email': customer.get('email'),
                        'name': customer.get('name')
                    }
        
        print(f"Failed to get customer data: {response.status_code}, {response.text}")
        return None
    except Exception as e:
        print(f"Error getting customer details: {e}")
        return None

def find_user_by_email(email):
    """Find a Firebase user by email (case-insensitive)"""
    if not email or not initialize_firebase():
        return None
    
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
        
        # If exact match fails, try case-insensitive search
        print("Exact match failed, trying case-insensitive search")
        email_lower = email.lower()
        all_users = list(users_ref.limit(100).stream())  # Limit to 100 users for performance
        
        for user_doc in all_users:
            user_data = user_doc.to_dict()
            user_email = user_data.get('email', '').lower()
            
            if user_email == email_lower:
                user_id = user_doc.id
                print(f"Found user by case-insensitive email: {user_id}")
                return user_id, user_doc
        
        print(f"No user found with email: {email}")
        return None, None
    except Exception as e:
        print(f"Error searching for user by email: {e}")
        return None, None

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
                        
                        # Create subscription data - WITHOUT the SERVER_TIMESTAMP for now
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
                        
                        # Try to find user by Paddle customer ID
                        user_id = None
                        user_doc = None
                        
                        # Step 1: Try to find user by customer ID
                        users_ref = db.collection('users')
                        query = users_ref.where('paddleCustomerId', '==', customer_id).limit(1)
                        user_docs = list(query.stream())
                        
                        if user_docs and len(user_docs) > 0:
                            # Found user by customer ID
                            user_doc = user_docs[0]
                            user_id = user_doc.id
                            print(f"Found user by customer ID: {user_id}")
                        else:
                            # Step 2: Try to get customer details from Paddle
                            customer_details = get_customer_details(customer_id)
                            
                            if customer_details and customer_details.get('email'):
                                customer_email = customer_details.get('email')
                                print(f"Customer email from Paddle API: {customer_email}")
                                
                                # Step 3: Try to find user by email
                                user_id, user_doc = find_user_by_email(customer_email)
                                
                                if not user_id:
                                    # Step 4: Try to find email in raw data from webhook
                                    print("Looking for email in webhook data...")
                                    # Look in various possible locations in webhook data
                                    possible_email_locations = [
                                        event_data.get('customer', {}).get('email'),
                                        webhook_data.get('customer', {}).get('email'),
                                        webhook_data.get('email'),
                                        event_data.get('email')
                                    ]
                                    
                                    for email in possible_email_locations:
                                        if email:
                                            print(f"Found email in webhook data: {email}")
                                            user_id, user_doc = find_user_by_email(email)
                                            if user_id:
                                                break
                            else:
                                print(f"Could not retrieve customer email from Paddle API for customer ID: {customer_id}")
                        
                        if not user_id:
                            # Last resort - print all users for debugging
                            try:
                                print("No user found. Here are the first 10 users in the database:")
                                all_users = list(users_ref.limit(10).stream())
                                for user in all_users:
                                    user_data = user.to_dict()
                                    print(f"User ID: {user.id}, Email: {user_data.get('email')}")
                            except Exception as e:
                                print(f"Error listing users: {e}")
                                                
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
                            print(f"ERROR: No user found for customer ID {customer_id}")
                            
                            # Create a manual debug document to help troubleshoot
                            debug_collection = db.collection('paddle_webhook_debug')
                            debug_doc = {
                                'event_type': event_type,
                                'customer_id': customer_id,
                                'subscription_id': subscription_id,
                                'webhook_data': json.dumps(webhook_data),
                                'timestamp': firestore.SERVER_TIMESTAMP,
                                'error': 'No user found for customer ID'
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
                    
                    # Find user by customer ID
                    user_id = None
                    users_ref = db.collection('users')
                    query = users_ref.where('paddleCustomerId', '==', customer_id).limit(1)
                    user_docs = list(query.stream())
                    
                    if user_docs and len(user_docs) > 0:
                        user_doc = user_docs[0]
                        user_id = user_doc.id
                        
                        # Update subscription status
                        user_ref = db.collection('users').document(user_id)
                        user_ref.update({
                            'subscription.status': status,
                            'subscription.active': is_active,
                            'subscription.updated_at': firestore.SERVER_TIMESTAMP
                        })
                        
                        print(f"Updated subscription {subscription_id} status to {status} for user {user_id}")
                    else:
                        # Try to find user by email using customer API
                        customer_details = get_customer_details(customer_id)
                        
                        if customer_details and customer_details.get('email'):
                            customer_email = customer_details.get('email')
                            user_id, user_doc = find_user_by_email(customer_email)
                            
                            if user_id:
                                # Update subscription status
                                user_ref = db.collection('users').document(user_id)
                                user_ref.update({
                                    'subscription.status': status,
                                    'subscription.active': is_active,
                                    'subscription.updated_at': firestore.SERVER_TIMESTAMP,
                                    'paddleCustomerId': customer_id
                                })
                                
                                print(f"Updated subscription {subscription_id} status to {status} for user {user_id} found by email")
                            else:
                                print(f"ERROR: Could not find user with email {customer_email} for subscription update")
                        else:
                            print(f"ERROR: Could not find customer email for customer_id {customer_id}")
                

                elif event_type == 'subscription.cancelled':
                    # Extract data
                    subscription_id = event_data.get('id')
                    customer_id = event_data.get('customer_id')
                    
                    print(f"Processing subscription.cancelled for {subscription_id}")
                    
                    # Find user by customer ID
                    user_id = None
                    users_ref = db.collection('users')
                    query = users_ref.where('paddleCustomerId', '==', customer_id).limit(1)
                    user_docs = list(query.stream())
                    
                    if user_docs and len(user_docs) > 0:
                        user_doc = user_docs[0]
                        user_id = user_doc.id
                        
                        # Update subscription status
                        user_ref = db.collection('users').document(user_id)
                        user_ref.update({
                            'subscription.status': 'cancelled',
                            'subscription.active': False,
                            'subscription.canceled_at': firestore.SERVER_TIMESTAMP
                        })
                        
                        print(f"Marked subscription {subscription_id} as cancelled for user {user_id}")
                    else:
                        # Try to find user by email from Paddle API
                        customer_details = get_customer_details(customer_id)
                        
                        if customer_details and customer_details.get('email'):
                            customer_email = customer_details.get('email')
                            user_id, user_doc = find_user_by_email(customer_email)
                            
                            if user_id:
                                # Update subscription status
                                user_ref = db.collection('users').document(user_id)
                                user_ref.update({
                                    'subscription.status': 'cancelled',
                                    'subscription.active': False,
                                    'subscription.canceled_at': firestore.SERVER_TIMESTAMP,
                                    'paddleCustomerId': customer_id
                                })
                                
                                print(f"Marked subscription {subscription_id} as cancelled for user {user_id} found by email")
                            else:
                                print(f"ERROR: Could not find user with email {customer_email} for subscription cancellation")
                        else:
                            print(f"ERROR: Could not find customer email for customer_id {customer_id}")
                

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