from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import parse_qs, urlparse
from .paddle_api import validate_license

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Set CORS headers for browser security
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
        # Parse URL to get the action
        parsed_url = urlparse(self.path)
        query_params = parse_qs(parsed_url.query)
        action = query_params.get('action', [''])[0]
        
        # Read request body
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        request_data = json.loads(post_data)
        
        try:
            # Handle validate action (used by software to validate license keys)
            if action == 'validate':
                license_key = request_data.get('license_key')
                device_id = request_data.get('device_id')
                
                if not license_key or not device_id:
                    self.wfile.write(json.dumps({
                        'valid': False,
                        'message': 'License key and device ID are required'
                    }).encode())
                    return
                
                # Validate the license
                result = validate_license(license_key, device_id)
                self.wfile.write(json.dumps(result).encode())
                
            else:
                self.wfile.write(json.dumps({
                    'error': 'Invalid action'
                }).encode())
                
        except Exception as e:
            self.wfile.write(json.dumps({
                'valid': False,
                'message': f'Server error: {str(e)}'
            }).encode())
            
    def do_OPTIONS(self):
        # Handle preflight requests for CORS
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()