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
            
            # Get license keys for each subscription
            license_keys = []
            for subscription in subscriptions:
                subscription_keys = get_license_keys(subscription['id'])
                license_keys.extend(subscription_keys)
                
                # Get detailed subscription info
                details = get_subscription_details(subscription['id'])
                if details:
                    subscription.update(details)
            
            # Format the response
            dashboard_data = {
                'customer': customer,
                'subscriptions': subscriptions,
                'license_keys': license_keys,
                'credit_usage': {
                    'used': 0,  # You would get this from your database
                    'total': 100  # This would be based on the subscription plan
                }
            }
            
            # Return dashboard data
            self.wfile.write(json.dumps(dashboard_data).encode())
            
        except Exception as e:
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