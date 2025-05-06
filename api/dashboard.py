from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs
import json
from .auth import verify_token
from .paddle_api import (
    get_customer_by_email,
    get_subscriptions,
    get_license_keys,
    get_subscription_details
)

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
            # Get customer data from Paddle
            email = user_data.get('email')
            customer = get_customer_by_email(email)
            
            if not customer:
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
            
            # Debug logging
            print(f"Email: {email}, Customer ID: {customer.get('id')}")
            print(f"Found {len(processed_subscriptions)} subscriptions")
            for sub in processed_subscriptions:
                print(f"Subscription ID: {sub.get('id')}, Status: {sub.get('status')}, Active: {sub.get('active')}")
            
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