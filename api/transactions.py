from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import parse_qs, urlparse
from .auth import verify_token
import os
import requests
import datetime
import firebase_admin
from firebase_admin import credentials, firestore, auth

# Initialize Firebase
firebase_initialized = False
db = None

# Add these global variables
API_KEY = os.getenv("PADDLE_API_KEY")
API_BASE_URL = os.getenv("PADDLE_API_BASE_URL", "https://api.paddle.com").rstrip('/')

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
                        API_BASE_URL = os.getenv("PADDLE_API_BASE_URL", "https://api.paddle.com")
                        
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
                                print(f"Processing transaction: {json.dumps(trans, indent=2)}")
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
                                
                                # Look for invoice in different places
                                invoice_id = trans.get('invoice_id')
                                invoice_number = trans.get('invoice_number')
                                # Check if there's invoice info in details
                                if not invoice_id and 'invoice' in trans:
                                    invoice_id = trans['invoice'].get('id')
                                # Check billing details
                                if not invoice_id:
                                    billing = trans.get('billing', {})
                                    invoice_id = billing.get('invoice_id')

                                print(f"Found invoice_id: {invoice_id}, invoice_number: {invoice_number}")

                                formatted_transaction = {
                                    'id': trans.get('id'),
                                    'date': trans.get('billed_at') or trans.get('created_at', ''),
                                    'description': description,
                                    'amount': amount,
                                    'status': trans.get('status', 'completed'),
                                    'type': 'subscription',
                                    'invoiceId': trans.get('invoice_id'),  # ADD THIS LINE
                                    'invoiceNumber': trans.get('invoice_number'),  # ADD THIS LINE
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

    def do_POST(self):
        """Handle POST request to send invoice email"""
        # Set CORS headers for POST
        self.send_response(200)
        self.send_header('Content-Type', 'application/json') 
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        
        try:
            # Get authorization token
            auth_header = self.headers.get('Authorization', '')
            if not auth_header.startswith('Bearer '):
                self.end_headers()
                self.wfile.write(json.dumps({
                    'error': 'No valid authorization token provided'
                }).encode())
                return
                
            token = auth_header.split(' ')[1]
            
            # Initialize Firebase if needed
            if not firebase_initialized:
                initialize_firebase()
            
            # Verify Firebase token
            try:
                decoded_token = auth.verify_id_token(token)
                user_id = decoded_token['uid']
            except Exception as e:
                print(f"Token verification failed: {e}")
                self.end_headers()
                self.wfile.write(json.dumps({
                    'error': 'Invalid authorization token'
                }).encode())
                return
            
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
            
            transaction_id = data.get('transactionId')
            print(f"Received transaction ID: {transaction_id}")
            
            if not transaction_id:
                self.end_headers()
                self.wfile.write(json.dumps({
                    'error': 'Transaction ID required'
                }).encode())
                return
            
            # Get Paddle API credentials
            API_KEY = os.getenv("PADDLE_API_KEY")
            API_BASE_URL = os.getenv("PADDLE_API_BASE_URL", "https://api.paddle.com").rstrip('/')
            
            # Get the transaction to find the invoice ID
            headers = {
                "Authorization": f"Bearer {API_KEY}",
                "Accept": "application/json"
            }
            
            # First, try to get the transaction
            url = f"{API_BASE_URL}/transactions/{transaction_id}"
            print(f"Fetching transaction from: {url}")
            
            response = requests.get(url, headers=headers)
            print(f"Transaction response status: {response.status_code}")
            
            if response.status_code != 200:
                print(f"Failed to get transaction: {response.status_code}")
                print(f"Response: {response.text}")
                
                # If transaction not found, let's check if we can get the invoice directly
                # Sometimes the transaction ID is actually an invoice ID
                invoice_url = f"{API_BASE_URL}/invoices/{transaction_id}"
                print(f"Trying to fetch as invoice from: {invoice_url}")
                
                invoice_response = requests.get(invoice_url, headers=headers)
                
                if invoice_response.status_code == 200:
                    # It was an invoice ID, not a transaction ID
                    invoice_id = transaction_id
                else:
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        'error': 'Transaction not found'
                    }).encode())
                    return
            else:
                # Get invoice ID from transaction
                transaction_data = response.json()
                print(f"Transaction data: {json.dumps(transaction_data, indent=2)}")

                # Look for invoice in various places within the Paddle response
                invoice_id = None

                # Try different paths in the response
                data_obj = transaction_data.get('data', {})
                invoice_id = data_obj.get('invoice_id')

                if not invoice_id:
                    # Check billing field
                    billing = data_obj.get('billing', {})
                    invoice_id = billing.get('invoice_id')

                if not invoice_id:
                    # Check details
                    details = data_obj.get('details', {})
                    invoice_id = details.get('invoice_id')

                if not invoice_id:
                    print("No invoice ID found in transaction data")
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        'error': 'No invoice found for this transaction',
                        'details': 'Transaction exists but no invoice associated'
                    }).encode())
                    return
            
            print(f"Invoice ID found: {invoice_id}")
            
            # Get the invoice details first to see if it exists
            invoice_details_url = f"{API_BASE_URL}/invoices/{invoice_id}"
            invoice_details_response = requests.get(invoice_details_url, headers=headers)
            
            if invoice_details_response.status_code != 200:
                print(f"Invoice not found: {invoice_details_response.status_code}")
                print(f"Response: {invoice_details_response.text}")
                self.end_headers()
                self.wfile.write(json.dumps({
                    'error': 'Invoice not found'
                }).encode())
                return
                
            # Now get the PDF (which in Paddle also sends the email)
            pdf_url = f"{API_BASE_URL}/invoices/{invoice_id}/pdf"
            print(f"Getting invoice PDF from: {pdf_url}")
            
            pdf_response = requests.get(pdf_url, headers=headers)
            
            if pdf_response.status_code == 200:
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True,
                    "message": "Invoice email sent successfully",
                    "invoiceId": invoice_id
                }).encode())
            else:
                print(f"Failed to get invoice PDF: {pdf_response.status_code}")
                print(f"Response: {pdf_response.text}")
                self.end_headers()
                self.wfile.write(json.dumps({
                    'error': 'Failed to send invoice email'
                }).encode())
            
        except Exception as e:
            print(f"Send invoice error: {e}")
            import traceback
            print(traceback.format_exc())
            
            if not self._headers_buffer:  # Only send headers if not already sent
                self.end_headers()
            
            self.wfile.write(json.dumps({
                'error': str(e)
            }).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()