import os
import requests
from dotenv import load_dotenv

# Load environment variables - Vercel will use environment variables from settings
load_dotenv()

# Paddle API configuration from environment variables (secure)
API_KEY = os.getenv("PADDLE_API_KEY")
API_BASE_URL = os.getenv("PADDLE_API_BASE_URL", "https://sandbox-api.paddle.com")

# Headers for authentication
headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

def get_customer_by_email(email):
    """Retrieve customer information using email address"""
    print(f"Looking up customer with email: {email}")
    
    # The Paddle API might require exact parameter formatting
    # url = f'{API_BASE_URL}/customers'
    url = f'{API_BASE_URL.rstrip("/")}/customers'
    params = {
        'email': email,
        'status': 'active'  # Only look for active customers
    }
    
    print(f"API URL: {url}")
    print(f"Headers: {headers}")
    
    try:
        response = requests.get(
            url,
            headers=headers,
            params=params
        )
        
        print(f"Response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            customers = data.get('data', [])
            
            if customers:
                # Return the first matching customer
                customer = customers[0]
                print(f"Found customer ID: {customer.get('id')}")
                return customer
            else:
                print("No customers found with this email")
        else:
            print(f"API Error: {response.status_code} - {response.text}")
            
    except Exception as e:
        print(f"Exception: {str(e)}")
    
    return None


def get_subscriptions(customer_id):
    """Get all subscriptions for a customer"""
    response = requests.get(
        f'{API_BASE_URL}/subscriptions',
        headers=headers,
        params={'customer_id': customer_id}
    )
    if response.status_code == 200:
        return response.json()['data']
    return []

def get_subscription_details(subscription_id):
    """Get detailed information about a specific subscription"""
    response = requests.get(
        f'{API_BASE_URL}/subscriptions/{subscription_id}',
        headers=headers
    )
    if response.status_code == 200:
        return response.json()['data']
    return None

def get_license_keys(subscription_id):
    """Get license keys for a subscription"""
    response = requests.get(
        f'{API_BASE_URL}/subscriptions/{subscription_id}/license-keys',
        headers=headers
    )
    if response.status_code == 200:
        return response.json()['data']
    return []

def create_subscription(customer_id, price_id):
    """Create a subscription for the customer"""
    payload = {
        "customer_id": customer_id,
        "items": [
            {
                "price_id": price_id,
                "quantity": 1
            }
        ]
    }
    
    response = requests.post(
        f'{API_BASE_URL}/subscriptions',
        headers=headers,
        json=payload
    )
    
    if response.status_code == 201:
        return response.json()['data']
    return None

def cancel_subscription(subscription_id, immediate=False):
    """Cancel a subscription"""
    payload = {
        "effective_from": "immediately" if immediate else "next_billing_period"
    }
    response = requests.post(
        f'{API_BASE_URL}/subscriptions/{subscription_id}/cancel',
        headers=headers,
        json=payload
    )
    return response.status_code == 200

def get_transactions(customer_id, limit=10):
    """Get transaction history for a customer"""
    response = requests.get(
        f'{API_BASE_URL}/transactions',
        headers=headers,
        params={'customer_id': customer_id, 'per_page': limit}
    )
    if response.status_code == 200:
        return response.json()['data']
    return []

def validate_license(license_key, device_id):
    """Validate a license key against Paddle's records"""
    # This is a simplified example - in a real implementation you would
    # check the license key against your database or Paddle's API
    
    # For example, first look up subscriptions by license key
    # Here we simulate a successful validation
    return {
        "valid": True,
        "tier": "premium",
        "features": ["feature1", "feature2", "feature3"],
        "message": "License validated successfully"
    }

def update_customer_name(customer_id, name):
    """Update the customer's name in Paddle"""
    print(f"Updating name for customer {customer_id} to '{name}'")
    
    try:
        api_key = os.environ.get("PADDLE_API_KEY")
        api_base_url = os.environ.get("PADDLE_API_BASE_URL", "https://api.paddle.com")
        
        # Fix the double slash issue
        api_base_url = api_base_url.rstrip('/')
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Paddle-Version": "2023-01-10"  # Correct version from documentation
        }
        
        # Only send the name field in the request
        data = {
            "name": name
        }
        
        url = f'{api_base_url}/customers/{customer_id}'
        print(f"Making request to: {url}")
        
        response = requests.patch(
            url,
            headers=headers,
            json=data
        )
        
        print(f"Response status code: {response.status_code}")
        if response.status_code >= 400:
            print(f"Response body: {response.text}")

        if response.status_code in [200, 201, 202, 204]:
            print(f"Successfully updated customer name in Paddle")
            return True
        else:
            print(f"Failed to update customer name: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"Exception updating customer name: {str(e)}")
        return False