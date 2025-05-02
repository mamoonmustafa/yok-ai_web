from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import parse_qs, urlparse
from .auth import verify_token
from .paddle_api import get_transactions

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
        
        # Parse URL parameters
        parsed_url = urlparse(self.path)
        query_params = parse_qs(parsed_url.query)
        customer_id = query_params.get('customer_id', [''])[0]
        limit = int(query_params.get('limit', ['10'])[0])
        
        if not customer_id:
            self.wfile.write(json.dumps({
                'error': 'Customer ID is required'
            }).encode())
            return
        
        try:
            # Get transactions
            transactions = get_transactions(customer_id, limit)
            
            # Return transactions
            self.wfile.write(json.dumps(transactions).encode())
            
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