/**
 * Yok-AI Dashboard - Configuration File
 * Contains global configuration settings for the dashboard
 */

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAgOpPs_7Ox9UPexX3JHWDp9B9rUZqdFrA",
    authDomain: "yok-ai.firebaseapp.com",
    projectId: "yok-ai",
    storageBucket: "yok-ai.firebasestorage.app",
    messagingSenderId: "506924545426",
    appId: "1:506924545426:web:1ce90c20895906ca1abd4b",
    measurementId: "G-ZDPR66VLKK"
  };

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Paddle configuration - Replace with your Paddle vendor ID
const PADDLE_VENDOR_ID = 30514;

// Subscription plans - Should match your Paddle subscription plans
const SUBSCRIPTION_PLANS = {
    BASIC: {
        id: 'basic-plan-id',
        name: 'Basic',
        description: 'Perfect for individuals and small projects',
        price: 9.99,
        interval: 'month',
        credits: 100,
        features: [
            '100 Credits per month',
            'Basic support',
            'Single device',
            '1GB storage'
        ]
    },
    PRO: {
        id: 'pro-plan-id',
        name: 'Professional',
        description: 'Ideal for professionals and growing teams',
        price: 29.99,
        interval: 'month',
        credits: 500,
        features: [
            '500 Credits per month',
            'Priority support',
            'Up to 3 devices',
            '10GB storage',
            'Advanced analytics'
        ],
        popular: true
    },
    TEAM: {
        id: 'team-plan-id',
        name: 'Team',
        description: 'Best for teams and businesses',
        price: 79.99,
        interval: 'month',
        credits: 2000,
        features: [
            '2000 Credits per month',
            '24/7 support',
            'Unlimited devices',
            '50GB storage',
            'Advanced analytics',
            'Team management',
            'API access'
        ]
    }
};

// Additional credit packages
const CREDIT_PACKAGES = [
    {
        id: 'credit-100',
        amount: 100,
        price: 9.99
    },
    {
        id: 'credit-500',
        amount: 500,
        price: 39.99
    },
    {
        id: 'credit-1000',
        amount: 1000,
        price: 69.99
    }
];

// Software versions and download links
const SOFTWARE_INFO = {
    name: 'Yok-AI Desktop App',
    version: '1.0.0',
    releaseDate: 'May 1, 2025',
    platforms: {
        windows: {
            url: 'https://downloads.yok-ai.com/windows/YokAI-Setup-1.0.0.exe',
            size: '65 MB'
        },
        mac: {
            url: 'https://downloads.yok-ai.com/mac/YokAI-1.0.0.dmg',
            size: '68 MB'
        },
        linux: {
            url: 'https://downloads.yok-ai.com/linux/YokAI-1.0.0.AppImage',
            size: '62 MB'
        }
    }
};

// Dashboard configuration
const DASHBOARD_CONFIG = {
    refreshInterval: 5 * 60 * 1000, // Refresh data every 5 minutes
    toastDuration: 5000, // Toast message duration in milliseconds
    dateFormat: 'MMM DD, YYYY', // Date format
    creditAlertThreshold: 0.9, // Alert when credits used is 90% of total
};

// Utility functions
const Utils = {
    // Format currency
    formatCurrency: (amount) => {
        return '$' + parseFloat(amount).toFixed(2);
    },
    
    // Format date
    formatDate: (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    },
    
    // Format number with commas
    formatNumber: (number) => {
        return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    },
    
    // Get user initials from name
    getInitials: (name) => {
        if (!name) return 'U';
        const names = name.split(' ');
        if (names.length === 1) return names[0].charAt(0).toUpperCase();
        return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
    },
    
    // Truncate text
    truncateText: (text, length = 40) => {
        if (!text) return '';
        if (text.length <= length) return text;
        return text.substring(0, length) + '...';
    },
    
    // Generate random license key (for demo purposes)
    generateLicenseKey: () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let key = '';
        
        // Format: XXXX-XXXX-XXXX-XXXX
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                key += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            if (i < 3) key += '-';
        }
        
        return key;
    },
    
    // Mask license key for display
    maskLicenseKey: (key) => {
        if (!key) return '';
        const parts = key.split('-');
        if (parts.length !== 4) return key;
        
        return parts[0] + '-' + parts[1].substring(0, 2) + '**-****-' + parts[3].substring(2);
    }
};

// Event listeners map
const listeners = {};

// Custom event system
const EventBus = {
    // Subscribe to event
    on: (event, callback) => {
        if (!listeners[event]) {
            listeners[event] = [];
        }
        listeners[event].push(callback);
    },
    
    // Unsubscribe from event
    off: (event, callback) => {
        if (!listeners[event]) return;
        if (!callback) {
            delete listeners[event];
            return;
        }
        listeners[event] = listeners[event].filter(cb => cb !== callback);
    },
    
    // Emit event
    emit: (event, data) => {
        if (!listeners[event]) return;
        listeners[event].forEach(callback => callback(data));
    }
};