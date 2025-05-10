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
            self.wfile.write(json.dumps({
                'error': 'Invalid or expired token'
            }).encode())
            return
        
        # Parse URL parameters
        parsed_url = urlparse(self.path)
        query_params = parse_qs(parsed_url.query)
        type_filter = query_params.get('type', ['all'])[0]
        period_filter = query_params.get('period', ['all'])[0]
        
        try:
            # Get user email from token
            email = user_data.get('email')
            if not email:
                self.wfile.write(json.dumps({
                    'error': 'User email not found'
                }).encode())
                return
            
            # Get customer from Paddle
            customer = get_customer_by_email(email)
            if not customer:
                # Return empty array if customer not found
                self.wfile.write(json.dumps([]).encode())
                return
            
            # Get Paddle API credentials
            API_KEY = os.getenv("PADDLE_API_KEY")
            API_BASE_URL = os.getenv("PADDLE_API_BASE_URL", "https://sandbox-api.paddle.com")
            
            headers = {
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json"
            }
            
            # Build query parameters for Paddle API
            params = {
                'customer_id': customer['id'],
                'per_page': 50,  # Get more results
                'status': 'billed,completed'  # Only get completed/billed transactions
            }
            
            # Apply date filter based on period
            if period_filter != 'all':
                now = datetime.datetime.now()
                cutoff_date = None
                
                if period_filter == 'month':
                    cutoff_date = now.replace(day=1)
                elif period_filter == '3month':
                    month = now.month - 3
                    year = now.year
                    if month <= 0:
                        month += 12
                        year -= 1
                    cutoff_date = now.replace(year=year, month=month, day=1)
                elif period_filter == 'year':
                    cutoff_date = now.replace(month=1, day=1)
                
                if cutoff_date:
                    params['billed_at[gte]'] = cutoff_date.strftime('%Y-%m-%dT00:00:00Z')
            
            # Get transactions from Paddle
            response = requests.get(
                f'{API_BASE_URL}/transactions',
                headers=headers,
                params=params
            )
            
            if response.status_code == 200:
                data = response.json()
                transactions = data.get('data', [])
                
                # Format transactions for frontend
                formatted_transactions = []
                
                for trans in transactions:
                    # Determine type based on transaction data
                    trans_type = 'subscription'
                    if trans.get('origin') == 'web':
                        trans_type = 'one_time'
                    elif trans.get('subscription_id'):
                        trans_type = 'subscription'
                    
                    # Apply type filter
                    if type_filter != 'all' and trans_type != type_filter:
                        continue
                    
                    # Get amount from totals
                    totals = trans.get('details', {}).get('totals', {})
                    amount = totals.get('grand_total', '0')
                    
                    # Convert amount from string to float
                    try:
                        amount_float = float(amount) / 100  # Convert from cents
                    except:
                        amount_float = 0
                    
                    # Format date
                    billed_at = trans.get('billed_at') or trans.get('created_at', '')
                    
                    # Build description
                    items = trans.get('items', [])
                    description = 'Payment'
                    
                    if items:
                        # Get product/price name from first item
                        item = items[0]
                        price_info = item.get('price', {})
                        description = price_info.get('description') or price_info.get('name', 'Payment')
                    
                    # Get invoice download URL if available
                    invoice_url = None
                    if trans.get('invoice_number'):
                        # Construct invoice URL format for Paddle
                        invoice_url = f"{API_BASE_URL}/invoices/{trans.get('invoice_id')}/pdf" if trans.get('invoice_id') else None
                    
                    formatted_transaction = {
                        'id': trans.get('id'),
                        'date': billed_at,
                        'description': description,
                        'amount': amount_float,
                        'status': trans.get('status', 'completed'),
                        'type': trans_type,
                        'invoiceUrl': invoice_url,
                        'invoice_number': trans.get('invoice_number'),
                        'currency': trans.get('currency_code', 'USD')
                    }
                    
                    formatted_transactions.append(formatted_transaction)
                
                # Sort by date descending
                formatted_transactions.sort(key=lambda x: x.get('date', ''), reverse=True)
                
                # Return formatted transactions
                self.wfile.write(json.dumps(formatted_transactions).encode())
            else:
                print(f"Paddle API error: {response.status_code} - {response.text}")
                self.wfile.write(json.dumps([]).encode())
                
        except Exception as e:
            print(f"Error loading transactions: {str(e)}")
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