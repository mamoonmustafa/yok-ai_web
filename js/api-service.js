/**
 * API Service - Functions for interacting with the backend API
 */
const ApiService = {
    // Base API URL
    baseUrl: '/api',
    
    // Get authentication token
    getToken: function() {
        // Get Firebase auth token instead of local storage token
        return new Promise((resolve, reject) => {
            const user = firebase.auth().currentUser;
            if (user) {
                user.getIdToken(true)
                    .then(token => resolve(token))
                    .catch(error => reject(error));
            } else {
                reject(new Error('No authenticated user'));
            }
        });
    },
    
    // Set headers for API requests
    getHeaders: async function() {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        try {
            const token = await this.getToken();
            headers['Authorization'] = `Bearer ${token}`;
        } catch (error) {
            console.error('Failed to get auth token:', error);
        }
        
        return headers;
    },
    
    // Make API request
    request: async function(endpoint, method = 'GET', data = null) {
        const url = `${this.baseUrl}${endpoint}`;
        
        try {
            const headers = await this.getHeaders();
            
            const options = {
                method,
                headers,
                credentials: 'include'
            };
            
            if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                options.body = JSON.stringify(data);
            }
            
            const response = await fetch(url, options);
            
            if (!response.ok) {
                if (response.status === 401) {
                    // Token expired or invalid, redirect to login
                    window.location.href = '/signin';
                    return null;
                }
                
                const errorData = await response.json();
                throw new Error(errorData.error || 'API request failed');
            }
            
            return await response.json();
        } catch (error) {
            console.error(`API error (${method} ${endpoint}):`, error);
            throw error;
        }
    },
    
    // Dashboard data
    getDashboardData: function() {
        return this.request('/dashboard');
    },
    
    // Get transactions
    getTransactions: function(customerId, params = {}) {
        const queryString = Object.keys(params)
            .map(key => `${key}=${encodeURIComponent(params[key])}`)
            .join('&');
        
        return this.request(`/transactions?customer_id=${customerId}${queryString ? '&' + queryString : ''}`);
    },
    
    // Create subscription
    createSubscription: function(customerId, priceId) {
        return this.request('/subscription?action=create', 'POST', { 
            customer_id: customerId, 
            price_id: priceId 
        });
    },
    
    // Cancel subscription
    cancelSubscription: function(subscriptionId, immediate = false) {
        return this.request('/subscription?action=cancel', 'POST', { 
            subscription_id: subscriptionId, 
            immediate 
        });
    },
    
    // Purchase additional credits
    purchaseCredits: function(customerId, amount) {
        return this.request('/subscription?action=add_credits', 'POST', {
            customer_id: customerId,
            credit_amount: amount
        });
    },
    
    // Validate license (for software)
    validateLicense: function(licenseKey, deviceId) {
        return this.request('/license?action=validate', 'POST', { 
            license_key: licenseKey, 
            device_id: deviceId 
        });
    }
};