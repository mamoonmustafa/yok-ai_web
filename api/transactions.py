from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import parse_qs, urlparse
from .auth import verify_token
import os
import requests
import datetime
import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase
firebase_initialized = False
db = None

def initialize_firebase():
    global firebase_initialized, db
    if not firebase_initialized:
        try:
            firebase_credentials_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
            if firebase_credentials_json:
                firebase_credentials_dict = json.loads(firebase_credentials_json)
                cred = credentials.Certificate(firebase_credentials_dict)
                
                if not firebase_admin._apps:
                    firebase_admin.initialize_app(cred)
                
                db = firestore.client()
                firebase_initialized = True
                return True
        except Exception as e:
            print(f"Firebase initialization error: {e}")
    return firebase_initialized

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Set CORS headers
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        
        # Get authorization token
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
            # Initialize Firebase and get customer ID from Firestore
            if initialize_firebase():
                user_id = user_data.get('user_id')
                user_ref = db.collection('users').document(user_id)
                user_doc = user_ref.get()
                
                if user_doc.exists:
                    user_firestore_data = user_doc.to_dict()
                    paddle_customer_id = user_firestore_data.get('paddleCustomerId')
                    
                    if paddle_customer_id:
                        print(f"Found Paddle customer ID in Firestore: {paddle_customer_id}")
                        
                        # Get transactions directly using customer ID
                        API_KEY = os.getenv("PADDLE_API_KEY")
                        API_BASE_URL = os.getenv("PADDLE_API_BASE_URL", "https://sandbox-api.paddle.com")
                        
                        headers = {
                            "Authorization": f"Bearer {API_KEY}",
                            "Content-Type": "application/json"
                        }
                        
                        # Get transactions using customer ID - ensure API_BASE_URL is properly formatted
                        API_BASE_URL = API_BASE_URL.rstrip('/')
                        url = f'{API_BASE_URL}/transactions'
                        params = {
                            'customer_id': paddle_customer_id,
                            'status': ['completed', 'billed']  # Use list format for multiple statuses
                        }

                        print(f"Fetching transactions from URL: {url}")
                        print(f"With params: {params}")
                        print(f"API_BASE_URL from env: {API_BASE_URL}")
                        
                        response = requests.get(url, headers=headers, params=params)
                        
                        if response.status_code == 200:
                            data = response.json()
                            transactions = data.get('data', [])
                            
                            # Format transactions for frontend
                            formatted_transactions = []
                            for trans in transactions:
                                # Get amount
                                details = trans.get('details', {})
                                totals = details.get('totals', {})
                                amount = float(totals.get('grand_total', '0')) / 100
                                
                                # Get description from items
                                description = 'Payment'
                                items = trans.get('items', [])
                                if items:
                                    price = items[0].get('price', {})
                                    description = price.get('description') or price.get('name', 'Payment')
                                
                                formatted_transaction = {
                                    'id': trans.get('id'),
                                    'date': trans.get('billed_at') or trans.get('created_at', ''),
                                    'description': description,
                                    'amount': amount,
                                    'status': trans.get('status', 'completed'),
                                    'type': 'subscription',
                                    'invoiceUrl': None,
                                    'currency': trans.get('currency_code', 'USD')
                                }
                                formatted_transactions.append(formatted_transaction)
                            
                            self.wfile.write(json.dumps(formatted_transactions).encode())
                            return
                        else:
                            print(f"Paddle API error: {response.status_code} - {response.text}")
            
            # If we get here, something went wrong
            self.wfile.write(json.dumps([]).encode())
            
        except Exception as e:
            print(f"Error: {str(e)}")
            import traceback
            print(traceback.format_exc())
            self.wfile.write(json.dumps({
                'error': str(e)
            }).encode())
            
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()