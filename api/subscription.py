from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import parse_qs, urlparse
from .auth import verify_token
from .paddle_api import (
    create_subscription,
    cancel_subscription
)

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Set CORS headers for browser security
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
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
        
        # Parse URL to get the action
        parsed_url = urlparse(self.path)
        query_params = parse_qs(parsed_url.query)
        action = query_params.get('action', [''])[0]
        
        # Read request body
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        request_data = json.loads(post_data)
        
        try:
            # Handle different actions
            if action == 'create':
                customer_id = request_data.get('customer_id')
                price_id = request_data.get('price_id')
                
                if not customer_id or not price_id:
                    self.wfile.write(json.dumps({
                        'error': 'Customer ID and price ID are required'
                    }).encode())
                    return
                
                subscription = create_subscription(customer_id, price_id)
                self.wfile.write(json.dumps(subscription).encode())
                
            elif action == 'cancel':
                subscription_id = request_data.get('subscription_id')
                immediate = request_data.get('immediate', False)
                
                if not subscription_id:
                    self.wfile.write(json.dumps({
                        'error': 'Subscription ID is required'
                    }).encode())
                    return
                
                result = cancel_subscription(subscription_id, immediate)
                self.wfile.write(json.dumps({
                    'success': result
                }).encode())
                
            else:
                self.wfile.write(json.dumps({
                    'error': 'Invalid action'
                }).encode())
                
        except Exception as e:
            self.wfile.write(json.dumps({
                'error': str(e)
            }).encode())
            
    def do_OPTIONS(self):
        # Handle preflight requests for CORS
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()