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
import logging
from http.server import BaseHTTPRequestHandler
from .paddle_api import update_customer_name

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize Firebase
firebase_initialized = False
db = None

# Credit allocation maps
SUBSCRIPTION_CREDIT_MAP = {
    "pri_01jsw881b64y680g737k4dx7fm": 150,  # Starter plan
    "pri_01jsw8ab6sd8bw2h7epy8tcp14": 500,  # Pro plan
    "pri_01jsw8dtn4araas7xez8e24mdh": 1100,  # Enterprise plan
}

CREDIT_PURCHASE_MAP = {
    "pri_01jtz766cqbgr935jgfwd3ktcs": 150,  # 150 credits package
    "pri_01jtz77rkb4m97m0nmtrn5ktcq": 350,  # 350 credits package 
    "pri_01jtz797bh3j54dbyzgq96tcqt": 500   # 500 credits package
}

CREDIT_PRODUCT_IDS = list(CREDIT_PURCHASE_MAP.keys())

def initialize_firebase():
    """Initialize Firebase connection"""
    global firebase_initialized, db
    if firebase_initialized:
        return True
        
    try:
        # Parse the Firebase service account JSON
        firebase_credentials_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
        if not firebase_credentials_json:
            logger.error("Firebase credentials not found in environment variables")
            return False
            
        firebase_credentials_dict = json.loads(firebase_credentials_json)
        cred = credentials.Certificate(firebase_credentials_dict)
        
        # Initialize the Firebase app
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        
        db = firestore.client()
        firebase_initialized = True
        logger.info("Firebase initialized successfully")
        return True
    except Exception as e:
        logger.error(f"Firebase initialization error: {e}")
        logger.error(traceback.format_exc())
        return False

def generate_license_key():
    """Generate a unique license key"""
    return str(uuid.uuid4()).upper()

def determine_credit_allocation(price_id):
    """Determine how many credits to allocate based on the plan"""
    return SUBSCRIPTION_CREDIT_MAP.get(price_id, 0)

def determine_credit_purchase_amount(price_id):
    """Determine the credit amount for credit purchase products"""
    return CREDIT_PURCHASE_MAP.get(price_id, 0)

def is_credit_product(price_id):
    """Check if the price ID belongs to a credit product"""
    return price_id in CREDIT_PRODUCT_IDS

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
        logger.info(f"Fetching customer details from: {url}")
        
        response = requests.get(url, headers=headers)
        logger.info(f"Response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            customer_data = data.get('data', {})
            # Log sanitized version of customer data
            logger.info("Successfully retrieved customer data")
            return {
                'email': customer_data.get('email'),
                'name': customer_data.get('name')
            }
        
        logger.error(f"Failed to get customer data: {response.status_code}")
        return None
    except Exception as e:
        logger.error(f"Error getting customer details: {e}")
        logger.error(traceback.format_exc())
        return None

def find_user_by_email(email):
    """Find a Firebase user by email"""
    if not email or not initialize_firebase():
        return None, None
    
    logger.info(f"Looking for user with email: {email}")
    
    try:
        # Try exact match first
        users_ref = db.collection('users')
        email_query = users_ref.where('email', '==', email).limit(1)
        email_docs = list(email_query.stream())
        
        if email_docs:
            user_doc = email_docs[0]
            user_id = user_doc.id
            logger.info(f"Found user by exact email match: {user_id}")
            return user_id, user_doc
        
        logger.info(f"No user found with email: {email}")
        return None, None
        
    except Exception as e:
        logger.error(f"Error searching for user by email: {e}")
        logger.error(traceback.format_exc())
        return None, None

def find_user_by_customer_id(customer_id):
    """Find a Firebase user by Paddle customer ID"""
    if not customer_id or not initialize_firebase():
        return None, None
    
    logger.info(f"Looking for user with customer_id: {customer_id}")
    
    try:
        users_ref = db.collection('users')
        query = users_ref.where('paddleCustomerId', '==', customer_id).limit(1)
        user_docs = list(query.stream())
        
        if user_docs:
            user_doc = user_docs[0]
            user_id = user_doc.id
            logger.info(f"Found user by customer ID: {user_id}")
            return user_id, user_doc
        
        logger.info(f"No user found with customer_id: {customer_id}")
        return None, None
    
    except Exception as e:
        logger.error(f"Error searching for user by customer ID: {e}")
        logger.error(traceback.format_exc())
        return None, None

def find_user(customer_id):
    """Find a user by customer ID, falling back to email lookup if needed"""
    # Try finding by customer ID first
    user_id, user_doc = find_user_by_customer_id(customer_id)
    
    if user_id:
        return user_id, user_doc
    
    # Fall back to email lookup
    customer_details = get_customer_details(customer_id)
    if customer_details and customer_details.get('email'):
        customer_email = customer_details.get('email')
        logger.info(f"Looking up user by email: {customer_email}")
        return find_user_by_email(customer_email)
    
    return None, None


def extract_price_info(event_data):
    """Extract price information from event data"""
    price_id = None
    plan_name = "Unknown Plan"
    price_amount = 0
    price_interval = "month"
    
    # Check for items in event data
    items = event_data.get('items', [])
    if not items and event_data.get('line_items'):
        items = event_data.get('line_items')
    if not items and event_data.get('details', {}).get('line_items'):
        items = event_data.get('details', {}).get('line_items')
    
    if items and len(items) > 0:
        item = items[0]
        price = item.get('price', {})
        price_id = price.get('id')
        plan_name = price.get('description') or price.get('name', "Unknown Plan")
        
        # Extract price amount
        unit_price = price.get('unit_price', {})
        if unit_price:
            if isinstance(unit_price, dict) and 'amount' in unit_price:
                price_amount = int(unit_price.get('amount', 0)) / 100  # Convert from cents
            elif isinstance(unit_price, (int, str)):
                price_amount = int(unit_price) / 100
        
        # Extract billing interval
        billing_cycle = price.get('billing_cycle', {})
        if billing_cycle:
            price_interval = billing_cycle.get('interval', 'month')
    
    return price_id, plan_name, price_amount, price_interval

def detect_renewal_or_plan_change(event_data, user_doc):
    """Detect if an event is a renewal or plan change"""
    is_renewal = False
    is_plan_change = False
    
    # Extract the new price ID
    price_id, _, _, _ = extract_price_info(event_data)
    
    # Check for plan change
    if user_doc and price_id:
        user_data = user_doc.to_dict()
        old_price_id = None
        
        if user_data and 'subscription' in user_data and 'plan' in user_data['subscription']:
            old_price_id = user_data['subscription']['plan'].get('id')
        
        # If price_id is different from old_price_id, it's a plan change
        if old_price_id and price_id != old_price_id:
            is_plan_change = True
            logger.info(f"Detected plan change: {old_price_id} -> {price_id}")
    
    # Check for renewal
    previously_billed_at = event_data.get('previously_billed_at')
    if previously_billed_at:
        try:
            # Parse the ISO timestamp
            prev_billing_time = datetime.datetime.fromisoformat(previously_billed_at.replace('Z', '+00:00'))
            current_time = datetime.datetime.now(datetime.timezone.utc)
            time_diff = current_time - prev_billing_time
            
            # If previous billing was within the last hour, consider it a renewal
            if time_diff.total_seconds() < 3600:  # 1 hour in seconds
                is_renewal = True
                logger.info("Detected subscription renewal")
        except Exception as e:
            logger.error(f"Error parsing billing dates: {e}")
    
    return is_renewal, is_plan_change

def create_debug_document(event_type, error_info, webhook_data, additional_data=None):
    """Create a debug document in Firebase for troubleshooting"""
    if not initialize_firebase():
        return
    
    try:
        debug_collection = db.collection('paddle_webhook_debug')
        debug_doc = {
            'event_type': event_type,
            'error': str(error_info) if isinstance(error_info, Exception) else error_info,
            'webhook_data': json.dumps(webhook_data)[:10000] if webhook_data else None,  # Limit data size
            'timestamp': firestore.SERVER_TIMESTAMP
        }
        
        # Add traceback if error_info is an exception
        if isinstance(error_info, Exception):
            debug_doc['traceback'] = traceback.format_exc()
        
        # Add any additional data
        if additional_data and isinstance(additional_data, dict):
            for key, value in additional_data.items():
                debug_doc[key] = value
        
        debug_collection.add(debug_doc)
        logger.info("Created debug document in paddle_webhook_debug collection")
    except Exception as debug_error:
        logger.error(f"Error creating debug document: {debug_error}")

def create_transaction_record(user_id, transaction_data):
    """Create a transaction record in Firebase"""
    if not user_id or not initialize_firebase():
        return False
    
    try:
        db.collection('users').document(user_id).collection('transactions').add(transaction_data)
        logger.info(f"Created transaction record for user {user_id}")
        return True
    except Exception as e:
        logger.error(f"Error creating transaction record: {e}")
        logger.error(traceback.format_exc())
        return False

def handle_subscription_created(event_data, webhook_data):
    """Handle subscription.created event"""
    try:
        # Extract necessary data
        subscription_id = event_data.get('id')
        customer_id = event_data.get('customer_id')
        
        # Extract price/product details
        price_id, plan_name, price_amount, price_interval = extract_price_info(event_data)
        
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
        logger.info(f"Processing subscription for plan: {plan_name}, credits: {credit_allocation}")
        
        # Now add the SERVER_TIMESTAMP for the database version
        subscription_data['created_at'] = firestore.SERVER_TIMESTAMP
        
        # Find user by getting customer ID
        user_id, user_doc = find_user(customer_id)
        
        if user_id:
            # Update user with subscription data
            user_ref = db.collection('users').document(user_id)
            
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
            logger.info(f"Successfully updated user {user_id} with subscription data")
            
            try:
                # Get the user's displayName from the Firestore document
                user_data = user_doc.to_dict()
                logger.info(f"[DEBUG] User data keys: {list(user_data.keys()) if user_data else None}")
    
                display_name = user_data.get('displayName')
                logger.info(f"[DEBUG] Found display name: {display_name}")

                if display_name:
                    # Update the customer name in Paddle
                    logger.info(f"[DEBUG] Calling update_customer_name with {customer_id} and {display_name}")
                    update_result = update_customer_name(customer_id, display_name)
                    logger.info(f"[DEBUG] update_customer_name result: {update_result}")
                    if not update_result:
                        logger.error(f"Failed to update Paddle customer name")
                else:
                    logger.info(f"No displayName found in Firestore for user {user_id}")
            except Exception as e:
                logger.error(f"Error updatings customer name in Paddle: {str(e)}")
                logger.error(traceback.format_exc())

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
            
            create_transaction_record(user_id, transaction_data)
            logger.info(f"Created license key {license_key} for subscription {subscription_id}, user {user_id}")
        else:
            logger.error(f"No user found for customer ID {customer_id}")
            
            # Create debug document for troubleshooting
            create_debug_document(
                'subscription.created',
                f'No user found for customer ID {customer_id}',
                webhook_data,
                {'customer_id': customer_id, 'subscription_id': subscription_id}
            )
            
        return True
    except Exception as e:
        logger.error(f"Error in subscription.created handler: {str(e)}")
        logger.error(traceback.format_exc())
        create_debug_document('subscription.created', e, webhook_data)
        return False
  
def handle_subscription_updated(event_data, webhook_data):
    """Handle subscription.updated event"""
    try:
        # Extract data
        subscription_id = event_data.get('id')
        status = event_data.get('status')
        customer_id = event_data.get('customer_id')
        
        logger.info(f"Processing subscription.updated for {subscription_id}, status: {status}")
        
        # Extract additional data
        next_billing_date = event_data.get('next_billed_at')
        
        # Extract price information
        price_id, plan_name, price_amount, price_interval = extract_price_info(event_data)
        
        # Determine if subscription is active
        is_active = status.lower() in ['active', 'trialing', 'past_due']
        
        # Find user by customer ID
        user_id, user_doc = find_user(customer_id)
        
        if user_id:
            # Check if this is a credit product purchase
            if is_credit_product(price_id):
                # Handle credit purchase
                credit_amount = determine_credit_purchase_amount(price_id)
                
                # Get current credit values
                user_data = user_doc.to_dict()
                current_credits = user_data.get('creditUsage', {}).get('total', 0)
                
                # Update user with additional credits
                user_ref = db.collection('users').document(user_id)
                
                update_data = {
                    'creditUsage.total': current_credits + credit_amount
                }
                
                logger.info(f"Adding {credit_amount} credits to user {user_id}. New total: {current_credits + credit_amount}")
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
                
                create_transaction_record(user_id, transaction_data)
                
            else:
                # Regular subscription update
                # Check if this is a renewal or plan change
                is_renewal, is_plan_change = detect_renewal_or_plan_change(event_data, user_doc)
                
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
                    
                    logger.info(f"Resetting credits for user {user_id} on {'renewal' if is_renewal else 'plan change'}. New total: {credit_allocation}")

                # Update user with subscription data
                user_ref = db.collection('users').document(user_id)
                user_ref.update(update_data)
                
                logger.info(f"Updated subscription {subscription_id} details for user {user_id}")
                
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
                    
                    create_transaction_record(user_id, transaction_data)
                
                # Update customer name in Paddle
                try:
                    # Get the user's displayName from Firestore
                    user_data = user_doc.to_dict()
                    display_name = user_data.get('displayName')
                    
                    if display_name:
                        # Update the customer name in Paddle
                        update_result = update_customer_name(customer_id, display_name)
                        if not update_result:
                            logger.error(f"Failed to update Paddle customer name")
                    else:
                        logger.info(f"No displayName found in Firestore for user {user_id}")
                except Exception as e:
                    logger.error(f"Error updating customer name in Paddle: {str(e)}")
                    logger.error(traceback.format_exc())
        else:
            logger.error(f"Could not find user for subscription update - customer_id: {customer_id}")
            create_debug_document(
                'subscription.updated',
                f"No user found for customer ID {customer_id}",
                webhook_data,
                {'customer_id': customer_id}
            )
        
        return True
    except Exception as e:
        logger.error(f"Error in subscription.updated handler: {str(e)}")
        logger.error(traceback.format_exc())
        create_debug_document('subscription.updated', e, webhook_data)
        return False

def handle_subscription_cancelled(event_data, webhook_data):
    """Handle subscription.cancelled event"""
    try:
        # Extract data
        subscription_id = event_data.get('id')
        customer_id = event_data.get('customer_id')
        
        logger.info(f"Processing subscription.cancelled for {subscription_id}")
        
        # Find user
        user_id, _ = find_user(customer_id)
        
        if user_id:
            # Update subscription status
            user_ref = db.collection('users').document(user_id)
            user_ref.update({
                'subscription.status': 'cancelled',
                'subscription.active': False,
                'subscription.canceled_at': firestore.SERVER_TIMESTAMP
            })
            
            logger.info(f"Marked subscription {subscription_id} as cancelled for user {user_id}")
            return True
        else:
            logger.error(f"Could not find user for subscription cancellation - customer_id: {customer_id}")
            create_debug_document(
                'subscription.cancelled',
                f"No user found for customer ID {customer_id}",
                webhook_data,
                {'customer_id': customer_id}
            )
            return False
    except Exception as e:
        logger.error(f"Error in subscription.cancelled handler: {str(e)}")
        logger.error(traceback.format_exc())
        create_debug_document('subscription.cancelled', e, webhook_data)
        return False


def handle_transaction(event_data, event_type, webhook_data):
    """Handle transaction.created or transaction.completed events"""
    try:
        # Extract necessary data
        transaction_id = event_data.get('id')
        customer_id = event_data.get('customer_id')
        origin = event_data.get('origin')
        
        logger.info(f"Processing {event_type} event with origin: {origin}")
        
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
        logger.info(f"Found {len(line_items)} items in transaction")
        
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
                
                logger.info(f"Found credit product: {price_id}, credit amount: {credit_amount}, price: {price_amount}")
                break
        
        # Process credit product if found
        if found_credit_product:
            # Find the user
            user_id, user_doc = find_user(customer_id)
            
            if user_id and user_doc:
                # Get current credit values
                user_data = user_doc.to_dict()
                current_credits = user_data.get('creditUsage', {}).get('total', 0)
                
                # Update user with additional credits
                user_ref = db.collection('users').document(user_id)
                
                update_data = {
                    'creditUsage.total': current_credits + credit_amount
                }
                
                logger.info(f"Adding {credit_amount} credits to user {user_id}. New total: {current_credits + credit_amount}")
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
                
                create_transaction_record(user_id, transaction_data)
                return True
            else:
                logger.error(f"Could not find user for credit purchase - customer_id: {customer_id}")
                
                # Create a debug document
                create_debug_document(
                    event_type,
                    f"No user found for customer ID {customer_id}",
                    webhook_data,
                    {
                        'customer_id': customer_id,
                        'price_id': price_id,
                        'credit_amount': credit_amount
                    }
                )
                return False
        else:
            # Not a credit product - may be handled by other event types
            logger.info("Transaction doesn't contain credit products - may be handled by other event types")
            return True
    except Exception as e:
        logger.error(f"Error processing transaction event: {str(e)}")
        logger.error(traceback.format_exc())
        create_debug_document(event_type, e, webhook_data)
        return False

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
            
            # Log request headers for debugging (sanitized)
            logger.info("Request headers received")
            
            # Parse JSON body
            try:
                webhook_data = json.loads(request_body.decode('utf-8'))
                logger.info(f"Received webhook event of type: {webhook_data.get('event_type', 'unknown')}")
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON body: {e}")
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
            
            logger.info(f"Processing event type: {event_type}")
            
            # Process different event types
            result = False
            if event_type == 'subscription.created':
                result = handle_subscription_created(event_data, webhook_data)
            elif event_type == 'subscription.updated':
                result = handle_subscription_updated(event_data, webhook_data)
            elif event_type == 'subscription.cancelled':
                result = handle_subscription_cancelled(event_data, webhook_data)
            elif event_type == 'transaction.created' or event_type == 'transaction.completed':
                result = handle_transaction(event_data, event_type, webhook_data)
            else:
                logger.info(f"Unhandled event type: {event_type}")
                result = True  # Return success for unhandled events
                
            # Return success response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': result,
                'event_processed': event_type
            }).encode())
                
        except Exception as e:
            logger.error(f"Critical webhook error: {str(e)}")
            logger.error(traceback.format_exc())
            
            # Create a debug entry if possible
            try:
                create_debug_document('critical_error', e, None)
            except:
                pass
            
            # Still return 200 to acknowledge receipt (Paddle will retry if non-200)
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
