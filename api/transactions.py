from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import parse_qs, urlparse
from .auth import verify_token
from .paddle_api import get_customer_by_email
import os
import requests
import datetime

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
            print("Token verification failed")
            self.wfile.write(json.dumps({
                'error': 'Invalid or expired token'
            }).encode())
            return
        
        print(f"User data from token: {user_data}")
        
        # Parse URL parameters
        parsed_url = urlparse(self.path)
        query_params = parse_qs(parsed_url.query)
        type_filter = query_params.get('type', ['all'])[0]
        period_filter = query_params.get('period', ['all'])[0]
        
        print(f"Filters - Type: {type_filter}, Period: {period_filter}")
        
        try:
            # Get user email from token
            email = user_data.get('email')
            if not email:
                print("No email found in user data")
                self.wfile.write(json.dumps({
                    'error': 'User email not found'
                }).encode())
                return
            
            print(f"User email: {email}")
            
            # Get customer from Paddle
            customer = get_customer_by_email(email)
            print(f"Customer lookup result: {customer}")
            
            if not customer:
                print("Customer not found in Paddle")
                # Return empty array if customer not found
                self.wfile.write(json.dumps([]).encode())
                return
            
            print(f"Customer ID: {customer.get('id')}")
            
            # Get Paddle API credentials
            API_KEY = os.getenv("PADDLE_API_KEY")
            API_BASE_URL = os.getenv("PADDLE_API_BASE_URL", "https://sandbox-api.paddle.com")
            
            # Build request to Paddle transactions endpoint
            headers = {
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json"
            }
            
            # Try to get transactions by customer_id
            params = {
                'customer_id': customer['id'],
                'per_page': 50
            }
            
            print(f"Requesting transactions with params: {params}")
            
            # Get transactions from Paddle
            url = f'{API_BASE_URL}/transactions'
            response = requests.get(url, headers=headers, params=params)
            
            print(f"Paddle API response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                transactions = data.get('data', [])
                
                print(f"Number of transactions found: {len(transactions)}")
                if transactions:
                    print(f"First transaction: {json.dumps(transactions[0], indent=2)[:500]}...")
                
                # Format transactions for frontend
                formatted_transactions = []
                
                for trans in transactions:
                    # Format transaction for frontend
                    formatted_transaction = {
                        'id': trans.get('id'),
                        'date': trans.get('billed_at') or trans.get('created_at', ''),
                        'description': 'Payment',  # Default description
                        'amount': 0,
                        'status': trans.get('status', 'completed'),
                        'type': 'subscription',
                        'invoiceUrl': None,
                        'currency': trans.get('currency_code', 'USD')
                    }
                    
                    # Get amount from transaction
                    details = trans.get('details', {})
                    if details:
                        totals = details.get('totals', {})
                        grand_total = totals.get('grand_total')
                        if grand_total:
                            # Convert from cents to dollars
                            formatted_transaction['amount'] = float(grand_total) / 100
                    
                    # Get description from items
                    items = trans.get('items', [])
                    if items:
                        item = items[0]
                        price = item.get('price', {})
                        formatted_transaction['description'] = price.get('description') or price.get('name', 'Payment')
                    
                    formatted_transactions.append(formatted_transaction)
                
                print(f"Formatted transactions: {len(formatted_transactions)}")
                
                # Return formatted transactions
                self.wfile.write(json.dumps(formatted_transactions).encode())
            else:
                print(f"Paddle API error: {response.status_code}")
                print(f"Response text: {response.text}")
                self.wfile.write(json.dumps([]).encode())
                
        except Exception as e:
            print(f"Error loading transactions: {str(e)}")
            import traceback
            print(traceback.format_exc())
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