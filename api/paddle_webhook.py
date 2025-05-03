from http.server import BaseHTTPRequestHandler
import json
import hmac
import hashlib
import os
import uuid
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Paddle webhook secret from environment variable (secure)
WEBHOOK_SECRET = os.getenv("PADDLE_WEBHOOK_SECRET")
API_KEY = os.getenv("PADDLE_API_KEY")
API_BASE_URL = os.getenv("PADDLE_API_BASE_URL", "https://sandbox-api.paddle.com")

# Headers for Paddle API authentication
headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

def verify_webhook_signature(data, signature):
    """Verify the webhook signature to ensure it's from Paddle"""
    computed_signature = hmac.new(
        WEBHOOK_SECRET.encode(),
        msg=json.dumps(data).encode(),
        digestmod=hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(computed_signature, signature)

def generate_license_key():
    """Generate a unique license key"""
    return str(uuid.uuid4()).upper().replace('-', '-')

def create_license_key(subscription_id, customer_id, email, plan_id):
    """Create a license key for the subscription"""
    # Generate a license key
    license_key = generate_license_key()
    
    # Create license key in Paddle
    response = requests.post(
        f'{API_BASE_URL}/products/{plan_id}/generate-license',
        headers=headers,
        json={
            "customer_id": customer_id,
            "subscription_id": subscription_id,
            "quantity": 1
        }
    )
    
    if response.status_code in [200, 201]:
        # Successfully created license key in Paddle
        paddle_license_data = response.json().get('data', {})
        return paddle_license_data.get('key', license_key)
    else:
        # Use our generated key if Paddle API fails
        return license_key

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Read request data
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        webhook_data = json.loads(post_data)
        
        # Get signature from headers
        signature = self.headers.get('Paddle-Signature', '')
        
        # Verify signature (security check)
        if not verify_webhook_signature(webhook_data, signature):
            self.send_response(401)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'error': 'Invalid signature'
            }).encode())
            return
        
        # Process webhook based on event type
        event_type = webhook_data.get('event_type', '')
        event_data = webhook_data.get('data', {})
        
        try:
            # Process different webhook events
            if event_type == 'subscription.created':
                # Extract necessary data
                subscription_id = event_data.get('id')
                customer_id = event_data.get('customer_id')
                customer_email = event_data.get('customer', {}).get('email')
                plan_id = event_data.get('items', [{}])[0].get('price', {}).get('product_id')
                
                # Create a license key
                license_key = create_license_key(subscription_id, customer_id, customer_email, plan_id)
                
                # Log for verification (would be stored in Vercel logs)
                print(f"Created license key {license_key} for subscription {subscription_id}, customer {customer_email}")
                
            elif event_type == 'subscription.updated':
                # Log the event
                subscription_id = event_data.get('id')
                status = event_data.get('status')
                print(f"Subscription {subscription_id} updated with status {status}")
                
            elif event_type == 'subscription.cancelled':
                # Log the event
                subscription_id = event_data.get('id')
                print(f"Subscription {subscription_id} cancelled")
            
            # Return success response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'event_processed': event_type
            }).encode())
            
        except Exception as e:
            print(f"Error processing webhook: {str(e)}")
            
            # Still return 200 to acknowledge receipt (Paddle will retry otherwise)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': False,
                'error': str(e)
            }).encode())