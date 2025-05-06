from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs
import json
import traceback
import sys
import os
from .auth import verify_token
from .paddle_api import (
    get_customer_by_email,
    get_subscriptions,
    get_license_keys,
    get_subscription_details
)

# Enable detailed logging for debugging
DETAILED_LOGGING = True

def log(message, level="INFO"):
    """Helper function to log messages with timestamps"""
    if DETAILED_LOGGING or level == "ERROR":
        print(f"[{level}] dashboard.py: {message}", file=sys.stderr)

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        log("Starting dashboard API request handling")
        
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
        
        log(f"Authorization header present: {auth_header is not None}")
        
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header[7:]
            log(f"Token extracted: {token[:10]}... (truncated)")
        
        if not token:
            error_msg = "Authorization token required"
            log(f"Error: {error_msg}", "ERROR")
            self.wfile.write(json.dumps({
                'error': error_msg
            }).encode())
            return
        
        # Verify token
        log("Verifying Firebase token")
        user_data = verify_token(token)
        if not user_data:
            error_msg = "Invalid or expired token"
            log(f"Error: {error_msg}", "ERROR")
            self.wfile.write(json.dumps({
                'error': error_msg
            }).encode())
            return
        
        log(f"Token verified successfully for user: {user_data.get('email')}")
        
        try:
            # Get customer data from Paddle
            email = user_data.get('email')
            log(f"Getting customer data from Paddle for email: {email}")
            
            customer = get_customer_by_email(email)
            
            if not customer:
                error_msg = "Customer not found in Paddle"
                log(f"Error: {error_msg}", "ERROR")
                log(f"User exists in Firebase but not in Paddle: {email}", "ERROR")
                
                # Return empty subscription data instead of error
                # This allows frontend to show pricing plans
                dashboard_data = {
                    'customer': None,
                    'subscriptions': [],
                    'license_keys': [],
                    'credit_usage': {
                        'used': 0,
                        'total': 0
                    },
                    'message': 'No Paddle customer found for this user'
                }
                
                self.wfile.write(json.dumps(dashboard_data).encode())
                return
            
            # Customer found
            log(f"Paddle customer found: ID={customer.get('id')}")
            
            # Get subscriptions
            log(f"Getting subscriptions for customer ID: {customer.get('id')}")
            subscriptions = get_subscriptions(customer['id'])
            
            log(f"Found {len(subscriptions)} subscriptions")
            
            # Process subscriptions to include active flag and detailed info
            processed_subscriptions = []
            license_keys = []
            
            # Detailed logging for subscriptions
            if not subscriptions:
                log("No subscriptions found for customer", "WARNING")
            
            for idx, subscription in enumerate(subscriptions):
                log(f"Processing subscription #{idx+1}: ID={subscription.get('id')}")
                
                # Get license keys for each subscription
                log(f"Getting license keys for subscription ID: {subscription.get('id')}")
                subscription_keys = get_license_keys(subscription['id'])
                license_keys.extend(subscription_keys)
                log(f"Found {len(subscription_keys)} license keys")
                
                # Get detailed subscription info
                log(f"Getting detailed info for subscription ID: {subscription.get('id')}")
                details = get_subscription_details(subscription['id'])
                
                if details:
                    log(f"Subscription details: status={details.get('status')}, "
                        f"plan={details.get('plan_name', 'Unknown')}, "
                        f"next_billing={details.get('next_billed_at')}")
                    
                    # Determine if subscription is active based on status
                    status = details.get('status', '').lower()
                    is_active = status in ['active', 'trialing', 'past_due']
                    
                    log(f"Subscription active status: {is_active} (based on status: {status})")
                    
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
                    log(f"Processed subscription added with active={is_active}")
                else:
                    log(f"Failed to get details for subscription ID: {subscription.get('id')}", "WARNING")
            
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
                        
                        credits = credit_map.get(plan_id, 0)
                        total_credits += credits
                        log(f"Adding {credits} credits for plan ID: {plan_id}")
            
            # Format the response
            dashboard_data = {
                'customer': customer,
                'subscriptions': processed_subscriptions,
                'license_keys': license_keys,
                'credit_usage': {
                    'used': 0,  # You would get this from your database
                    'total': total_credits
                }
            }
            
            # Log the final processed data structure (sensitive data redacted)
            log("Final dashboard data structure:")
            log(f"- Customer ID: {customer.get('id')}")
            log(f"- Number of subscriptions: {len(processed_subscriptions)}")
            log(f"- Number of license keys: {len(license_keys)}")
            log(f"- Credit usage: {dashboard_data['credit_usage']}")
            
            # Check if any subscription is active
            has_active_subscription = any(sub.get('active', False) for sub in processed_subscriptions)
            log(f"Has active subscription: {has_active_subscription}")
            
            # Return dashboard data
            log("Sending dashboard data response")
            self.wfile.write(json.dumps(dashboard_data).encode())
            
        except Exception as e:
            error_msg = str(e)
            log(f"Unhandled exception: {error_msg}", "ERROR")
            log(traceback.format_exc(), "ERROR")
            
            self.wfile.write(json.dumps({
                'error': error_msg,
                'trace': traceback.format_exc() if DETAILED_LOGGING else "See server logs for details"
            }).encode())
            
    def do_OPTIONS(self):
        # Handle preflight requests for CORS
        log("Handling OPTIONS request (CORS preflight)")
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()