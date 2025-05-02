from http.server import BaseHTTPRequestHandler
import json
import hmac
import hashlib
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Paddle webhook secret from environment variable (secure)
WEBHOOK_SECRET = os.getenv("PADDLE_WEBHOOK_SECRET")

def verify_webhook_signature(data, signature):
    """Verify the webhook signature to ensure it's from Paddle"""
    computed_signature = hmac.new(
        WEBHOOK_SECRET.encode(),
        msg=json.dumps(data).encode(),
        digestmod=hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(computed_signature, signature)

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
        
        # Process different webhook events
        if event_type == 'subscription.created':
            # Handle subscription created
            # You would update your database here
            pass
            
        elif event_type == 'subscription.updated':
            # Handle subscription updated
            pass
            
        elif event_type == 'subscription.cancelled':
            # Handle subscription cancelled
            pass
        
        # Return success response
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({
            'success': True
        }).encode())