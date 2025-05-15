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
        "pri_01jsw881b64y680g737k4dx7fm": 150,  # Starter plan
        "pri_01jsw8ab6sd8bw2h7epy8tcp14": 500,  # Pro plan
        "pri_01jsw8dtn4araas7xez8e24mdh": 1100,  # Enterprise plan
    }
    
    return credit_map.get(price_id, 0)

def determine_credit_purchase_amount(price_id):
    """Determine the credit amount for credit purchase products"""
    # Map credit product price IDs to credit amounts
    credit_product_map = {
        "pri_01jtz766cqbgr935jgfwd3ktcs": 150,  # 150 credits package
        "pri_01jtz77rkb4m97m0nmtrn5ktcq": 350,  # 350 credits package 
        "pri_01jtz797bh3j54dbyzgq96tcqt": 500   # 500 credits package
    }
    
    return credit_product_map.get(price_id, 0)

def is_credit_product(price_id):
    """Check if the price ID belongs to a credit product"""
    credit_product_ids = [
        "pri_01jtz766cqbgr935jgfwd3ktcs",  # 150 credits
        "pri_01jtz77rkb4m97m0nmtrn5ktcq",  # 350 credits
        "pri_01jtz797bh3j54dbyzgq96tcqt"   # 500 credits
    ]
    
    return price_id in credit_product_ids

def get_customer_details(customer_id):
    """Get customer details from Paddle API using customer ID"""
    try:
        api_key = os.environ.get("PADDLE_API_KEY")
        api_base_url = os.environ.get("PADDLE_API_BASE_URL", "https://sandbox-api.paddle.com")
        
        # Fix the double slash issue
        api_base_url = api_base_url.rstrip('/')
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        # Get customer directly with customer ID
        url = f"{api_base_url}/customers/{customer_id}"
        print(f"Fetching customer details from: {url}")
        
        response = requests.get(url, headers=headers)
        print(f"Response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            customer_data = data.get('data', {})
            print(f"Successfully retrieved customer data: {json.dumps(customer_data)[:500]}")
            return {
                'email': customer_data.get('email'),
                'name': customer_data.get('name')
            }
        
        print(f"Failed to get customer data: {response.status_code}, {response.text}")
        return None
    except Exception as e:
        print(f"Error getting customer details: {e}")
        import traceback
        print(traceback.format_exc())
        return None

def find_user_by_email(email):
    """Find a Firebase user by email"""
    if not email or not initialize_firebase():
        return None, None
    
    print(f"Looking for user with email: {email}")
    
    try:
        # Try exact match first
        users_ref = db.collection('users')
        email_query = users_ref.where('email', '==', email).limit(1)
        email_docs = list(email_query.stream())
        
        if email_docs:
            user_doc = email_docs[0]
            user_id = user_doc.id
            print(f"Found user by exact email match: {user_id}")
            return user_id, user_doc
        
        print(f"No user found with email: {email}")
        return None, None
        
    except Exception as e:
        print(f"Error searching for user by email: {e}")
        import traceback
        print(traceback.format_exc())
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
                            # Better renewal detection
                            is_renewal = False
                            if previously_billed_at:
                                # Check if the previous billing is recent (within the last hour)
                                try:
                                    # Parse the ISO timestamp
                                    prev_billing_time = datetime.datetime.fromisoformat(previously_billed_at.replace('Z', '+00:00'))
                                    current_time = datetime.datetime.now(datetime.timezone.utc)
                                    time_diff = current_time - prev_billing_time
                                    
                                    # If previous billing was within the last hour, consider it a renewal
                                    if time_diff.total_seconds() < 3600:  # 1 hour in seconds
                                        is_renewal = True
                                        print(f"Detected subscription renewal for user {user_id}")
                                except Exception as e:
                                    print(f"Error parsing billing dates: {e}")

                            # Additional check for plan changes which should reset credits
                            is_plan_change = False
                            if not is_renewal and price_id:
                                # Get the old plan ID from the user's existing subscription
                                user_data = user_doc.to_dict()
                                old_price_id = None
                                
                                if user_data and 'subscription' in user_data and 'plan' in user_data['subscription']:
                                    old_price_id = user_data['subscription']['plan'].get('id')
                                
                                # If price_id is different from old_price_id, it's a plan change
                                if old_price_id and price_id != old_price_id:
                                    is_plan_change = True
                                    print(f"Detected plan change for user {user_id}: {old_price_id} -> {price_id}")
                                    
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
                        
                        # Find user by getting customer email from Paddle API
                        user_id = None
                        user_doc = None
                        customer_email = None
                        
                        # Get customer details from Paddle API
                        customer_details = get_customer_details(customer_id)
                        
                        if customer_details and customer_details.get('email'):
                            customer_email = customer_details.get('email')
                            print(f"Got email from Paddle API: {customer_email}")
                            user_id, user_doc = find_user_by_email(customer_email)
                        else:
                            print(f"Could not get customer email from Paddle API for customer ID: {customer_id}")
                        
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
                            
                            try:
                                # Get the user's displayName from the Firestore document
                                user_data = user_doc.to_dict()
                                display_name = user_data.get('displayName')
                                
                                if display_name:
                                    # Import the update_customer_name function
                                    from .paddle_api import update_customer_name
                                    
                                    # Update the customer name in Paddle
                                    update_result = update_customer_name(customer_id, display_name)
                                    if update_result:
                                        print(f"Successfully updated Paddle customer name to '{display_name}'")
                                    else:
                                        print(f"Failed to update Paddle customer name")
                                else:
                                    print(f"No displayName found in Firestore for user {user_id}")
                            except Exception as e:
                                print(f"Error updating customer name in Paddle: {str(e)}")
                                import traceback
                                print(traceback.format_exc())

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
                        print(f"Error in subscription.created handler: {str(e)}")
                        import traceback
                        print(traceback.format_exc())

                elif event_type == 'subscription.updated':
                    # Extract data
                    subscription_id = event_data.get('id')
                    status = event_data.get('status')
                    customer_id = event_data.get('customer_id')
                    
                    print(f"Processing subscription.updated for {subscription_id}, status: {status}")
                    
                    # Extract additional data for renewal detection
                    previously_billed_at = event_data.get('previously_billed_at')
                    next_billing_date = event_data.get('next_billed_at')
                    
                    # Determine if subscription is active
                    is_active = status.lower() in ['active', 'trialing', 'past_due']
                    
                    # Extract price information
                    price_id = None
                    plan_name = None
                    price_amount = 0
                    price_interval = "month"
                    
                    # Check if there are items
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
                    
                    # Find user by customer ID first
                    user_id = None
                    users_ref = db.collection('users')
                    query = users_ref.where('paddleCustomerId', '==', customer_id).limit(1)
                    user_docs = list(query.stream())
                    
                    if user_docs:
                        user_doc = user_docs[0]
                        user_id = user_doc.id
                    else:
                        # Fallback to email lookup
                        customer_details = get_customer_details(customer_id)
                        if customer_details and customer_details.get('email'):
                            customer_email = customer_details.get('email')
                            user_id, user_doc = find_user_by_email(customer_email)
                    
                    if user_id:
                        # Check if this is a credit product purchase
                        if is_credit_product(price_id):
                            # Get credit amount
                            credit_amount = determine_credit_purchase_amount(price_id)
                            
                            # Get current credit values
                            user_data = user_doc.to_dict()
                            current_credits = user_data.get('creditUsage', {}).get('total', 0)
                            used_credits = user_data.get('creditUsage', {}).get('used', 0)
                            
                            # Update user with additional credits
                            user_ref = db.collection('users').document(user_id)
                            
                            update_data = {
                                'creditUsage.total': current_credits + credit_amount
                            }
                            
                            print(f"Adding {credit_amount} credits to user {user_id}. New total: {current_credits + credit_amount}")
                            user_ref.update(update_data)
                            
                            # Create a transaction record for the credit purchase
                            transaction_data = {
                                'id': event_data.get('transaction_id', f"txn_credits_{uuid.uuid4()}"),
                                'subscription_id': subscription_id,
                                'customer_id': customer_id,
                                'amount': price_amount,
                                'currency': event_data.get('currency_code', 'USD'),
                                'date': firestore.SERVER_TIMESTAMP,
                                'status': 'completed',
                                'type': 'credit_purchase',
                                'description': f"Credit purchase: {credit_amount} credits",
                                'created_at': firestore.SERVER_TIMESTAMP
                            }
                            
                            db.collection('users').document(user_id).collection('transactions').add(transaction_data)
                            print(f"Created transaction record for credit purchase for user {user_id}")
                            
                        else:
                            # Regular subscription update
                            
                            # Check if this is a renewal by examining previously_billed_at
                            is_renewal = False
                            if previously_billed_at:
                                # Check if the previous billing is recent (within the last hour)
                                try:
                                    # Parse the ISO timestamp
                                    prev_billing_time = datetime.datetime.fromisoformat(previously_billed_at.replace('Z', '+00:00'))
                                    current_time = datetime.datetime.now(datetime.timezone.utc)
                                    time_diff = current_time - prev_billing_time
                                    
                                    # If previous billing was within the last hour, consider it a renewal
                                    if time_diff.total_seconds() < 3600:  # 1 hour in seconds
                                        is_renewal = True
                                        print(f"Detected subscription renewal for user {user_id}")
                                except Exception as e:
                                    print(f"Error parsing billing dates: {e}")
                            
                            # Create update data dictionary
                            update_data = {
                                'subscription.status': status,
                                'subscription.active': is_active,
                                'subscription.updated_at': firestore.SERVER_TIMESTAMP
                            }
                            
                            # Add conditional updates for fields that might have changed
                            if next_billing_date:
                                update_data['subscription.next_billing_date'] = next_billing_date
                            
                            if price_amount > 0:
                                update_data['subscription.amount'] = price_amount
                                
                            if price_interval:
                                update_data['subscription.interval'] = price_interval
                                
                            if price_id and plan_name:
                                update_data['subscription.plan.id'] = price_id
                                update_data['subscription.plan.name'] = plan_name
                            
                            # If this is a renewal or plan change, reset credits
                            if (is_renewal or is_plan_change) and price_id:
                                # Calculate new credit allocation based on the plan
                                credit_allocation = determine_credit_allocation(price_id)
                                
                                # Reset credits: set used to 0 and total to the plan allocation
                                update_data['creditUsage.used'] = 0
                                update_data['creditUsage.total'] = credit_allocation
                                
                                print(f"Resetting credits for user {user_id} on {'renewal' if is_renewal else 'plan change'}. New total: {credit_allocation}")

                            # Update user with subscription data
                            user_ref = db.collection('users').document(user_id)
                            user_ref.update(update_data)
                            
                            print(f"Updated subscription {subscription_id} details for user {user_id}")
                            
                            # Create a transaction record for the renewal if applicable
                            if is_renewal:
                                transaction_data = {
                                    'id': event_data.get('transaction_id', f"txn_renewal_{uuid.uuid4()}"),
                                    'subscription_id': subscription_id,
                                    'customer_id': customer_id,
                                    'amount': price_amount,
                                    'currency': event_data.get('currency_code', 'USD'),
                                    'date': firestore.SERVER_TIMESTAMP,
                                    'status': 'completed',
                                    'type': 'subscription_renewal',
                                    'description': f"Subscription renewal for {plan_name}",
                                    'created_at': firestore.SERVER_TIMESTAMP
                                }
                                
                                db.collection('users').document(user_id).collection('transactions').add(transaction_data)
                                print(f"Created transaction record for subscription renewal for user {user_id}")
                            
                            # Update customer name in Paddle
                            try:
                                # Get the user's displayName from Firestore
                                user_data = user_doc.to_dict()
                                display_name = user_data.get('displayName')
                                
                                if display_name:
                                    # Import the update_customer_name function
                                    from .paddle_api import update_customer_name
                                    
                                    # Update the customer name in Paddle
                                    update_result = update_customer_name(customer_id, display_name)
                                    if update_result:
                                        print(f"Successfully updated Paddle customer name to '{display_name}'")
                                    else:
                                        print(f"Failed to update Paddle customer name")
                                else:
                                    print(f"No displayName found in Firestore for user {user_id}")
                            except Exception as e:
                                print(f"Error updating customer name in Paddle: {str(e)}")
                                import traceback
                                print(traceback.format_exc())
                    else:
                        print(f"ERROR: Could not find user for subscription update - customer_id: {customer_id}")
                
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
                    
                    if user_docs:
                        user_doc = user_docs[0]
                        user_id = user_doc.id
                    else:
                        # Fallback to email lookup
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
                            'subscription.canceled_at': firestore.SERVER_TIMESTAMP
                        })
                        
                        print(f"Marked subscription {subscription_id} as cancelled for user {user_id}")
                    else:
                        print(f"ERROR: Could not find user for subscription cancellation - customer_id: {customer_id}")

                elif event_type == 'transaction.created' or event_type == 'transaction.completed':
                    try:
                        # Extract necessary data
                        transaction_id = event_data.get('id')
                        customer_id = event_data.get('customer_id')
                        origin = event_data.get('origin')
                        
                        print(f"Processing {event_type} event with origin: {origin}")
                        
                        # Get items from the transaction
                        line_items = []
                        
                        # Try different possible locations for items
                        if event_data.get('line_items'):
                            line_items = event_data.get('line_items')
                        elif event_data.get('items'):
                            line_items = event_data.get('items')
                        elif event_data.get('details', {}).get('line_items'):
                            line_items = event_data.get('details', {}).get('line_items')
                            
                        # Debug log the items found
                        print(f"Found {len(line_items)} items in transaction")
                        
                        # Check each item for credit products
                        found_credit_product = False
                        credit_amount = 0
                        price_amount = 0
                        price_id = None
                        
                        for item in line_items:
                            # Extract price ID from various possible locations
                            if 'price' in item and 'id' in item['price']:
                                price_id = item['price']['id']
                            elif 'price_id' in item:
                                price_id = item['price_id']
                            
                            # If we have a price ID, check if it's a credit product
                            if price_id and is_credit_product(price_id):
                                found_credit_product = True
                                credit_amount = determine_credit_purchase_amount(price_id)
                                
                                # Try to get price amount from various possible locations
                                if 'price' in item and 'unit_price' in item['price']:
                                    unit_price = item['price']['unit_price']
                                    if isinstance(unit_price, dict) and 'amount' in unit_price:
                                        price_amount = int(unit_price['amount']) / 100
                                    elif isinstance(unit_price, (int, str)):
                                        price_amount = int(unit_price) / 100
                                elif 'unit_price' in item:
                                    unit_price = item['unit_price']
                                    if isinstance(unit_price, dict) and 'amount' in unit_price:
                                        price_amount = int(unit_price['amount']) / 100
                                    elif isinstance(unit_price, (int, str)):
                                        price_amount = int(unit_price) / 100
                                
                                print(f"Found credit product: {price_id}, credit amount: {credit_amount}, price: {price_amount}")
                                break
                        
                        # Process credit product if found
                        if found_credit_product:
                            # Find the user
                            user_id = None
                            user_doc = None
                            
                            # Try to find user by customer ID
                            users_ref = db.collection('users')
                            query = users_ref.where('paddleCustomerId', '==', customer_id).limit(1)
                            user_docs = list(query.stream())
                            
                            if user_docs:
                                user_doc = user_docs[0]
                                user_id = user_doc.id
                            else:
                                # Fallback to email lookup
                                customer_details = get_customer_details(customer_id)
                                if customer_details and customer_details.get('email'):
                                    customer_email = customer_details.get('email')
                                    user_id, user_doc = find_user_by_email(customer_email)
                            
                            if user_id and user_doc:
                                # Get current credit values
                                user_data = user_doc.to_dict()
                                current_credits = user_data.get('creditUsage', {}).get('total', 0)
                                
                                # Update user with additional credits
                                user_ref = db.collection('users').document(user_id)
                                
                                update_data = {
                                    'creditUsage.total': current_credits + credit_amount
                                }
                                
                                print(f"Adding {credit_amount} credits to user {user_id}. New total: {current_credits + credit_amount}")
                                user_ref.update(update_data)
                                
                                # Create a transaction record for the credit purchase
                                transaction_data = {
                                    'id': transaction_id or f"txn_credits_{uuid.uuid4()}",
                                    'customer_id': customer_id,
                                    'amount': price_amount,
                                    'currency': event_data.get('currency_code', 'USD'),
                                    'date': firestore.SERVER_TIMESTAMP,
                                    'status': 'completed',
                                    'type': 'credit_purchase',
                                    'description': f"Credit purchase: {credit_amount} credits",
                                    'created_at': firestore.SERVER_TIMESTAMP
                                }
                                
                                db.collection('users').document(user_id).collection('transactions').add(transaction_data)
                                print(f"Created transaction record for credit purchase for user {user_id}")
                            else:
                                print(f"ERROR: Could not find user for credit purchase - customer_id: {customer_id}")
                                
                                # Create a debug document
                                debug_collection = db.collection('paddle_webhook_debug')
                                debug_doc = {
                                    'event_type': event_type,
                                    'customer_id': customer_id,
                                    'price_id': price_id,
                                    'credit_amount': credit_amount,
                                    'webhook_data': json.dumps(webhook_data),
                                    'timestamp': firestore.SERVER_TIMESTAMP,
                                    'error': f'No user found for customer ID {customer_id}'
                                }
                                debug_collection.add(debug_doc)
                    except Exception as e:
                        print(f"Error processing transaction event: {str(e)}")
                        import traceback
                        print(traceback.format_exc())
                        
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
                import traceback
                print(traceback.format_exc())
                
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
            print(f"Critical webhook error: {str(e)}")
            import traceback
            print(traceback.format_exc())
            
            # Still return 200 to acknowledge receipt
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': False,
                'error': str(e)
            }).encode())
    
    def do_OPTIONS(self):
        # Handle preflight requests for CORS
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()