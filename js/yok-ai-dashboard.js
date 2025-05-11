/**
 * Yok-AI Dashboard - Main JavaScript File
 * Consolidated version of all functionality
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

// Paddle configuration
const PADDLE_VENDOR_ID = 30514;


// Configuration
// Replace with values from your sandbox account - only keeping price IDs, moving token to server
const CONFIG = {
    prices: {
      starter: {
        month: "pri_01jsw881b64y680g737k4dx7fm" // Replace with your price ID
      },
      pro: {
        month: "pri_01jsw8ab6sd8bw2h7epy8tcp14" // Replace with your price ID
      },
      enterprise: {
        month: "pri_01jsw8dtn4araas7xez8e24mdh", // Replace with your price ID
      },
      credits: {
        '100': "pri_01jtz766cqbgr935jgfwd3ktcs",  // Replace with your 100 credits price ID
        '500': "pri_01jtz77rkb4m97m0nmtrn5ktcq",  // Replace with your 500 credits price ID
        '1000': "pri_01jtz797bh3j54dbyzgq96tcqt"  // Replace with your 1000 credits price ID
      }
    }
};
  
// State
let currentBillingCycle = "month";
let paddleInitialized = false;
let clientToken = null;

/**
 * Set up global error handling
 */
function setupGlobalErrorHandling() {
    window.addEventListener('error', function(event) {
        console.error('Global error:', event.error);
        
        // Show user-friendly error message for uncaught exceptions
        Dashboard.showToast('An unexpected error occurred. Please try refreshing the page.', 'error');
        
        // Prevent default browser error handling
        event.preventDefault();
    });
    
    // Handle promise rejections
    window.addEventListener('unhandledrejection', function(event) {
        console.error('Unhandled promise rejection:', event.reason);
        
        // Show user-friendly error message
        if (event.reason && event.reason.message) {
            Dashboard.showToast(`Error: ${event.reason.message}`, 'error');
        } else {
            Dashboard.showToast('An unexpected error occurred with a background operation.', 'error');
        }
    });
}
/**
 * Fetch Paddle client token from server using Firebase authentication
 */
async function fetchClientToken() {
    try {
        // Make sure user is authenticated
        const user = firebase.auth().currentUser;
        if (!user) {
            console.error("No user logged in for token fetch");
            throw new Error("Authentication required");
        }
        
        // Get Firebase ID token
        const authToken = await user.getIdToken(true);
        
        // Call server token endpoint
        const response = await fetch('/api/paddle_token', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `API returned status ${response.status}`);
        }
        
        const data = await response.json();
        if (!data.clientToken) {
            throw new Error("No client token in API response");
        }
        
        return data.clientToken;
    } catch (error) {
        console.error("Error fetching Paddle client token:", error);
        throw error;
    }
}

/**
 * Initialize Paddle checkout with client token
 */
async function initializePaddle() {
    // Show loading indicator
    const loadingElement = document.getElementById('loading-indicator');
    if (loadingElement) loadingElement.style.display = 'block';
    
    try {
        // Check if user is authenticated
        if (!firebase.auth().currentUser) {
            throw new Error("Authentication required");
        }
        
        // Fetch token from server
        clientToken = await fetchClientToken();
        
        // Initialize Paddle with the token
        Paddle.Environment.set("sandbox"); // Change to "production" for live environment
        Paddle.Initialize({
            token: clientToken,
            eventCallback: function(event) {
                console.log("Paddle event:", event);
                
                // 1. Enhanced checkout event handling with better timeouts
                if (event.name === "checkout.completed") {
                    // Show a more informative message
                    Dashboard.showToast('Payment successful! Processing your subscription...', 'success');
                    
                    // Wait longer for webhook to process before first attempt
                    setTimeout(() => {
                        console.log("First attempt to reload dashboard data after checkout completion");
                        Dashboard.loadDashboardData();
                        
                        // Try again after another delay for webhook processing
                        setTimeout(() => {
                            console.log("Second attempt to reload dashboard data after checkout completion");
                            Dashboard.loadDashboardData();
                            
                            // One final attempt after a longer delay
                            setTimeout(() => {
                                console.log("Final attempt to reload dashboard data after checkout completion");
                                Dashboard.loadDashboardData();
                            }, 10000);
                        }, 5000);
                    }, 2000);
                }
            }
        });
        
        paddleInitialized = true;
        
        // Enable checkout buttons
        document.querySelectorAll('.subscribe-btn, .checkout-button, .buy-credit-btn').forEach(button => {
            button.disabled = false;
        });
        
        return true;
    } catch (error) {
        console.error("Paddle initialization error:", error);
        Dashboard.showToast('Failed to initialize payment system', 'error');
        throw error;
    } finally {
        // Hide loading indicator
        if (loadingElement) loadingElement.style.display = 'none';
    }
}

/**
 * Open Paddle checkout for subscription or credit purchase
 */
async function openCheckout(plan) {
    try {
        console.log('=== OpenCheckout Debug ===');
        console.log('Plan requested:', plan);
        console.log('CONFIG.prices:', CONFIG.prices);

        // Make sure Paddle is initialized
        if (!paddleInitialized) {
            Dashboard.showToast('Initializing payment system...', 'info');
            await initializePaddle();
        }
        
        // Get current user information from Firebase
        const user = firebase.auth().currentUser;
        if (!user) {
            Dashboard.showToast('User authentication required', 'error');
            return;
        }
        
        // Ensure email is properly stored in Firestore for webhook to match
        try {
            const db = firebase.firestore();
            await db.collection('users').doc(user.uid).update({
                email: user.email  // Ensure email field is explicitly set
            });
            console.log("Updated user email in Firestore for webhook matching");
        } catch (error) {
            console.warn("Could not update user email in Firestore:", error);
            // Continue anyway, might still work with authentication data
        }

        console.log("Current user:", {
            email: user.email,
            displayName: user.displayName,
            uid: user.uid
        });
        // Get the correct price ID based on plan type and billing cycle
        let priceId;
        
        if (plan === 'starter' || plan === 'pro' || plan === 'enterprise') {
            // For subscription plans
            priceId = CONFIG.prices[plan][currentBillingCycle || 'month'];
        } else if (plan.startsWith('credit-')) {
            // For credit purchases
            const creditAmount = plan.replace('credit-', '');
            console.log('Credit amount extracted:', creditAmount);
            console.log('Available credit prices:', CONFIG.prices.credits);
            priceId = CONFIG.prices.credits[String(creditAmount)];
            console.log('Credit price ID found:', priceId);
        } else {
            throw new Error(`Unknown plan type: ${plan}`);
        }
        
        if (!priceId) {
            console.error('Available plans:', CONFIG.prices);
            throw new Error(`No price ID found for plan: ${plan}`);
        }
        
        // Split the display name into first and last name if available
        let firstName = '';
        let lastName = '';
        if (user.displayName) {
            const nameParts = user.displayName.split(' ');
            firstName = nameParts[0] || '';
            lastName = nameParts.slice(1).join(' ') || '';
        }
        
        console.log("Opening checkout with user:", {
            email: user.email,
            firstName: firstName,
            lastName: lastName
        });
        // Open Paddle checkout with pre-filled customer info
        // Create checkout configuration object
        const checkoutConfig = {
            items: [
                {
                    priceId: priceId,
                    quantity: 1
                }
            ],
            customer: {
                email: user.email
            },
            settings: {
                theme: "light",
                displayMode: "overlay",
                variant: "one-page",
                successUrl: window.location.href + '?checkout=success',
                allowLogout: false
            }
        };
        
        console.log("Checkout configuration:", JSON.stringify(checkoutConfig));
        
        // Open Paddle checkout
        Paddle.Checkout.open(checkoutConfig);
    } catch (error) {
        console.error(`Checkout error:`, error);
        Dashboard.showToast(`Failed to open checkout: ${error.message}`, 'error');
    }
}

/**
 * Check system integration on page load
 */
function checkSystemIntegration() {
    // Check Firebase authentication
    if (typeof firebase === 'undefined' || !firebase.auth) {
        console.error("Firebase not initialized properly");
        alert("Error: Authentication system not loaded. Please try refreshing the page.");
        return false;
    }
    
    // Check Paddle availability
    if (typeof Paddle === 'undefined') {
        console.error("Paddle not loaded properly");
        // Don't alert here as Paddle might be loaded asynchronously
    }
    
    return true;
}
// Update prices if needed
function updatePrices() {
    // Implementation for updating displayed prices
    console.log("Prices updated");
}

// Toggle billing cycle
function toggleBillingCycle(cycle) {
    currentBillingCycle = cycle;
    updatePrices();
    
    // Update UI to reflect the selected cycle
    document.querySelectorAll('.billing-toggle').forEach(button => {
        if (button.dataset.cycle === cycle) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}
// Subscription plans
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

// Dashboard configuration
const DASHBOARD_CONFIG = {
    refreshInterval: 5 * 60 * 1000, // Refresh data every 5 minutes
    toastDuration: 5000, // Toast message duration in milliseconds
    dateFormat: 'MMM DD, YYYY', // Date format
    creditAlertThreshold: 0.9, // Alert when credits used is 90% of total
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

// Global variables
let currentUser = null;
let isEmailVerified = false;
let subscriptionStatus = null;
let creditUsage = { used: 0, total: 0 };
let licenseKey = null;
let transactionHistory = [];
let currentSection = 'dashboard-section';
let checkVerificationInterval = null;
const verificationCheckDelay = 10000; // Check every 10 seconds if email is verified

// DOM Elements
const domElements = {
    verificationBanner: document.getElementById('verification-banner'),
    resendVerificationBtn: document.getElementById('resend-verification'),
    overlayResendVerificationBtn: document.getElementById('overlay-resend-verification'),
    verificationOverlay: document.getElementById('verification-overlay'),
    signOutBtn: document.getElementById('sign-out'),
    dropdownSignOutBtn: document.getElementById('dropdown-sign-out'),
    userInitialsElement: document.getElementById('user-initials'),
    userNameElement: document.getElementById('user-name'),
    userDropdownToggle: document.getElementById('user-dropdown-toggle'),
    userDropdown: document.getElementById('user-dropdown'),
    navLinks: document.querySelectorAll('.nav-link'),
    contentSections: document.querySelectorAll('.content-section'),
    toastContainer: document.getElementById('toast-container'),
    modals: document.querySelectorAll('.modal'),
    modalContainers: document.querySelectorAll('.modal-container'),
    closeModalButtons: document.querySelectorAll('.modal-close'),
    currentPlanBody: document.getElementById('current-plan-body'),
    availablePlansContainer: document.getElementById('available-plans-container'),
    availablePlansGrid: document.getElementById('available-plans'),
    licenseKeyElement: document.getElementById('license-key'),
    downloadLicenseKeyElement: document.getElementById('download-license-key'),
    transactionsTable: document.getElementById('transactions-body'),
    profileForm: document.getElementById('profile-form'),
    profileName: document.getElementById('profile-name'),
    profileEmail: document.getElementById('profile-email'),
    profileCompany: document.getElementById('profile-company'),
    profileRole: document.getElementById('profile-role'),
    passwordForm: document.getElementById('password-form'),
    currentPassword: document.getElementById('current-password'),
    newPassword: document.getElementById('new-password'),
    confirmPassword: document.getElementById('confirm-password'),
    usageChart: document.getElementById('usage-chart'),
    creditsUsed: document.getElementById('credits-used'),
    creditsTotal: document.getElementById('credits-total'),
    creditProgress: document.getElementById('credit-progress'),
    buyMoreCreditsBtn: document.getElementById('buy-more-credits'),
    accordionHeaders: document.querySelectorAll('.accordion-header')
};

// Main Dashboard Object
const Dashboard = {
    /**
     * Initialize the dashboard
     */
    init: function() {
        // Check authentication state
        firebase.auth().onAuthStateChanged(function(user) {
            if (user) {
                // User is signed in
                currentUser = user;
                isEmailVerified = user.emailVerified;
                Dashboard.updateUIForVerification(isEmailVerified);
                Dashboard.updateUserInfo(user);

                // If email is not verified, start checking periodically
                if (!isEmailVerified) {
                    Dashboard.startVerificationCheck();
                }
                
                // Now that user is authenticated, initialize Paddle
                initializePaddle().then(() => {
                    console.log("Paddle initialized successfully after authentication");
                }).catch(error => {
                    console.error("Failed to initialize Paddle:", error);
                    Dashboard.showToast('Payment system initialization failed', 'error');
                });

                // Save user data if it's a new user
                Dashboard.saveUserData(user);
                
                // Load dashboard data
                Dashboard.loadDashboardData();
            } else {
                // User is not signed in, redirect to sign in page
                window.location.href = '/signin';
            }
        });
        
        // Set up event listeners
        Dashboard.setupEventListeners();
        
        // Initialize accordion functionality
        Dashboard.initAccordion();
        
        // Initialize copy buttons
        Dashboard.initCopyButtons();
        
        // Initialize buy credits modal
        Dashboard.initBuyCreditsModal();
        
        // Initialize cancel subscription modal
        Dashboard.initCancelSubscriptionModal();
    },
    
    /**
     * Update dashboard content based on subscription status
     */
    updateDashboardView: function(status) {
        const subscriptionContainer = document.getElementById('subscription-container');
        const licenseKeyCard = document.getElementById('license-key-card');
        const downloadsContainer = document.getElementById('downloads-container');
        
        if (!subscriptionContainer) return;
        
        // Clear subscription container
        subscriptionContainer.innerHTML = '';
        
        // Log subscription status for debugging
        console.log("Subscription status:", status);
        
        // Convert status.active to boolean if it's a string
        if (status && typeof status.active === 'string') {
            status.active = status.active.toLowerCase() === 'true';
        }
        
        // Check if status exists AND is active (explicit boolean check)
        if (status && status.active === true) {
            // User has active subscription
            const subscriptionCard = document.createElement('div');
            subscriptionCard.className = 'card minimal';
            subscriptionCard.innerHTML = `
                <div class="card-body">
                    <h3>Subscription Status</h3>
                    ${Dashboard.generateActiveSubscriptionHTML(status)}
                </div>
            `;
            subscriptionContainer.appendChild(subscriptionCard);
            
            const supportNotice = document.createElement('div');
            supportNotice.className = 'info-notice mt-3';
            supportNotice.innerHTML = `
                <i class="fas fa-info-circle"></i>
                <p>For subscription changes or cancellations, please contact <a href="mailto:support@yok-ai.com">support@yok-ai.com</a></p>
            `;
            subscriptionContainer.appendChild(supportNotice);

            // Show credit usage
            const creditCard = document.createElement('div');
            creditCard.className = 'card minimal';
            creditCard.innerHTML = `
                <div class="card-body">
                    <h3>Credit Usage</h3>
                    <div id="credit-progress-container">
                        <div class="credit-info">
                            <span id="credits-used">0</span>
                            <span> / </span>
                            <span id="credits-total">0</span>
                            <span> credits used</span>
                        </div>
                        <div class="progress-bar">
                            <div id="credit-progress" class="progress" style="width: 0%"></div>
                        </div>
                    </div>
                    <div class="credit-actions">
                        <button id="buy-more-credits" class="btn btn-outline">Buy More Credits</button>
                    </div>
                </div>
            `;
            subscriptionContainer.appendChild(creditCard);
            
            // Show license key and downloads
            if (licenseKeyCard) licenseKeyCard.style.display = 'block';
            if (downloadsContainer) downloadsContainer.style.display = 'block';
            
            // Update credit usage display
            Dashboard.updateCreditUsage(creditUsage.used, creditUsage.total);
            
            // Add this setTimeout to ensure the button exists before binding events
            setTimeout(() => {
                const buyMoreCreditsBtn = document.getElementById('buy-more-credits');
                if (buyMoreCreditsBtn) {
                    buyMoreCreditsBtn.addEventListener('click', () => {
                        console.log('Buy More Credits clicked');
                        Dashboard.openModal('buy-credits-modal');
                    });
                }
            }, 0);
            // Bind event handlers
            const buyMoreCreditsBtn = document.getElementById('buy-more-credits');
            if (buyMoreCreditsBtn) {
                buyMoreCreditsBtn.addEventListener('click', () => {
                    Dashboard.openModal('buy-credits-modal');
                });
            }
            
            const cancelBtn = document.getElementById('cancel-subscription-btn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    Dashboard.openModal('cancel-subscription-modal');
                });
            }
            
            const upgradeBtn = document.getElementById('upgrade-subscription-btn');
            if (upgradeBtn) {
                upgradeBtn.addEventListener('click', Dashboard.showAvailablePlans);
            }
        } 
        else if (status && status.id) {
            // Has subscription ID but not active (pending, error state)
            const pendingCard = document.createElement('div');
            pendingCard.className = 'card minimal';
            pendingCard.innerHTML = `
                <div class="card-body">
                    <h3>Subscription Processing</h3>
                    <div class="alert alert-info">
                        <i class="alert-icon fas fa-info-circle"></i>
                        <div class="alert-content">
                            <div class="alert-title">Subscription Being Processed</div>
                            <div class="alert-message">Your subscription is being processed. This may take a few moments. If this message persists, please refresh the page.</div>
                        </div>
                    </div>
                    <button id="refresh-subscription-btn" class="btn btn-primary mt-16">Refresh Status</button>
                </div>
            `;
            subscriptionContainer.appendChild(pendingCard);
            
            // Add event listener for the refresh button
            setTimeout(() => {
                const refreshBtn = document.getElementById('refresh-subscription-btn');
                if (refreshBtn) {
                    refreshBtn.addEventListener('click', Dashboard.loadDashboardData);
                }
            }, 0);
            
            // Hide license key and downloads until active
            if (licenseKeyCard) licenseKeyCard.style.display = 'none';
            if (downloadsContainer) downloadsContainer.style.display = 'none';
        } 
        else {
            // No subscription data, show pricing plans
            const pricingTitle = document.createElement('div');
            pricingTitle.className = 'section-subheader';
            pricingTitle.innerHTML = '<h3>Choose a Plan</h3>';
            subscriptionContainer.appendChild(pricingTitle);
            
            // Create pricing grid with hard-coded plans
            const plansGrid = document.createElement('div');
            plansGrid.className = 'plans-grid';
            
            // Hard-coded plan HTML
            plansGrid.innerHTML = `
                <!-- Starter Plan -->
                <div class="plan-card">
                    <div class="plan-header">
                        <div class="plan-name">Starter</div>
                        <div class="plan-price">$9.99</div>
                        <div class="plan-billing">per month</div>
                    </div>
                    <div class="plan-features">
                        <ul>
                            <li><i class="fas fa-check"></i> 100 Credits per month</li>
                            <li><i class="fas fa-check"></i> Basic support</li>
                            <li><i class="fas fa-check"></i> Single device</li>
                            <li><i class="fas fa-check"></i> 1GB storage</li>
                        </ul>
                    </div>
                    <div class="plan-action">
                        <button class="btn btn-primary subscribe-btn" data-plan="starter">
                            Subscribe Now
                        </button>
                    </div>
                </div>
                
                <!-- Pro Plan -->
                <div class="plan-card popular">
                    <div class="plan-popular">Most Popular</div>
                    <div class="plan-header">
                        <div class="plan-name">Professional</div>
                        <div class="plan-price">$29.99</div>
                        <div class="plan-billing">per month</div>
                    </div>
                    <div class="plan-features">
                        <ul>
                            <li><i class="fas fa-check"></i> 500 Credits per month</li>
                            <li><i class="fas fa-check"></i> Priority support</li>
                            <li><i class="fas fa-check"></i> Up to 3 devices</li>
                            <li><i class="fas fa-check"></i> 10GB storage</li>
                            <li><i class="fas fa-check"></i> Advanced analytics</li>
                        </ul>
                    </div>
                    <div class="plan-action">
                        <button class="btn btn-primary subscribe-btn" data-plan="pro">
                            Subscribe Now
                        </button>
                    </div>
                </div>
                
                <!-- Enterprise Plan -->
                <div class="plan-card">
                    <div class="plan-header">
                        <div class="plan-name">Enterprise</div>
                        <div class="plan-price">$79.99</div>
                        <div class="plan-billing">per month</div>
                    </div>
                    <div class="plan-features">
                        <ul>
                            <li><i class="fas fa-check"></i> 2000 Credits per month</li>
                            <li><i class="fas fa-check"></i> 24/7 support</li>
                            <li><i class="fas fa-check"></i> Unlimited devices</li>
                            <li><i class="fas fa-check"></i> 50GB storage</li>
                            <li><i class="fas fa-check"></i> Advanced analytics</li>
                            <li><i class="fas fa-check"></i> Team management</li>
                            <li><i class="fas fa-check"></i> API access</li>
                        </ul>
                    </div>
                    <div class="plan-action">
                        <button class="btn btn-primary subscribe-btn" data-plan="enterprise">
                            Subscribe Now
                        </button>
                    </div>
                </div>
            `;
            
            subscriptionContainer.appendChild(plansGrid);
            
            // Hide license key and downloads
            if (licenseKeyCard) licenseKeyCard.style.display = 'none';
            if (downloadsContainer) downloadsContainer.style.display = 'none';
            
            // Bind events to subscribe buttons
            setTimeout(() => {
                const subscribeButtons = document.querySelectorAll('.subscribe-btn');
                subscribeButtons.forEach(button => {
                    button.addEventListener('click', (e) => {
                        const plan = e.target.getAttribute('data-plan');
                        console.log(`Plan selected: ${plan}`); // Debug log
                        openCheckout(plan);
                    });
                });
            }, 0);
        }
    },
    /**
     * Setup event listeners
     */
    setupEventListeners: function() {
        // User dropdown toggle
        if (domElements.userDropdownToggle) {
            domElements.userDropdownToggle.addEventListener('click', function() {
                if (domElements.userDropdown) {
                    domElements.userDropdown.classList.toggle('active');
                }
            });
        }
        
        // Add event delegation for dynamically created buy credits button
        document.addEventListener('click', function(e) {
            if (e.target && e.target.id === 'buy-more-credits') {
                e.preventDefault();
                console.log('Buy More Credits clicked (delegated)');
                Dashboard.openModal('buy-credits-modal');
            }
        });
        
        // Navigation links
        domElements.navLinks.forEach(link => {
            link.addEventListener('click', function() {
                const sectionId = this.getAttribute('data-section');
                if (sectionId) {
                    Dashboard.activateSection(sectionId);
                }
            });
        });
        
        // Verification email buttons
        if (domElements.resendVerificationBtn) {
            domElements.resendVerificationBtn.addEventListener('click', Dashboard.sendVerificationEmail);
        }
        
        if (domElements.overlayResendVerificationBtn) {
            domElements.overlayResendVerificationBtn.addEventListener('click', Dashboard.sendVerificationEmail);
        }
        
        // Sign out buttons
        if (domElements.signOutBtn) {
            domElements.signOutBtn.addEventListener('click', Dashboard.signOut);
        }
        
        if (domElements.dropdownSignOutBtn) {
            domElements.dropdownSignOutBtn.addEventListener('click', Dashboard.signOut);
        }
        
        // Modal close buttons
        domElements.closeModalButtons.forEach(button => {
            button.addEventListener('click', Dashboard.closeAllModals);
        });
        
        // Close modals when clicking outside
        domElements.modalContainers.forEach(container => {
            container.addEventListener('click', function(e) {
                if (e.target === container) {
                    Dashboard.closeAllModals();
                }
            });
        });
        
        // Profile form submission
        if (domElements.profileForm) {
            domElements.profileForm.addEventListener('submit', Dashboard.updateProfile);
        }
        
        // Password form submission
        if (domElements.passwordForm) {
            domElements.passwordForm.addEventListener('submit', Dashboard.updatePassword);
        }
        
        // Buy more credits button
        if (domElements.buyMoreCreditsBtn) {
            domElements.buyMoreCreditsBtn.addEventListener('click', function() {
                Dashboard.openModal('buy-credits-modal');
            });
        }
    },
    
    /**
     * Initialize accordion functionality
     */
    initAccordion: function() {
        domElements.accordionHeaders.forEach(header => {
            header.addEventListener('click', function() {
                const targetId = this.getAttribute('data-target');
                const target = document.getElementById(targetId);
                
                if (target) {
                    // Toggle current accordion
                    target.classList.toggle('show');
                    
                    // Update icon
                    const icon = this.querySelector('i');
                    if (icon) {
                        if (target.classList.contains('show')) {
                            icon.style.transform = 'rotate(180deg)';
                        } else {
                            icon.style.transform = 'rotate(0deg)';
                        }
                    }
                }
            });
        });
    },
    
    /**
     * Save user data to Firestore for new users
     */
    saveUserData: function(user) {
        const db = firebase.firestore();
        const userRef = db.collection('users').doc(user.uid);
        
        // Check if user exists in Firestore
        userRef.get().then((doc) => {
            if (!doc.exists) {
                // New user, create profile
                userRef.set({
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName || '',
                    emailVerified: user.emailVerified,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                    creditUsage: {
                        used: 0,
                        total: 0
                    }
                }).catch(error => {
                    console.error("Error saving user data:", error);
                });
            } else {
                // Existing user, update last login
                userRef.update({
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                    emailVerified: user.emailVerified
                }).catch(error => {
                    console.error("Error updating user data:", error);
                });
            }
        }).catch(error => {
            console.error("Error checking user existence:", error);
        });
    },
    
    /**
     * Start checking for email verification periodically
     */
    startVerificationCheck: function() {
        // Clear any existing interval
        if (checkVerificationInterval) {
            clearInterval(checkVerificationInterval);
        }
        
        // Start new interval
        checkVerificationInterval = setInterval(() => {
            if (!currentUser) {
                Dashboard.stopVerificationCheck();
                return;
            }
            
            // Reload user to check verification status
            currentUser.reload()
                .then(() => {
                    // Get fresh user data
                    currentUser = firebase.auth().currentUser;
                    
                    // Check if email is now verified
                    if (currentUser.emailVerified) {
                        isEmailVerified = true;
                        
                        // Stop checking
                        Dashboard.stopVerificationCheck();
                        
                        // Update UI
                        Dashboard.updateUIForVerification(true);
                        
                        // Update user data in Firestore
                        const db = firebase.firestore();
                        db.collection('users').doc(currentUser.uid).update({
                            emailVerified: true
                        }).catch(error => {
                            console.error("Error updating verification status:", error);
                        });
                        
                        // Show success message
                        Dashboard.showToast('Email verified successfully!', 'success');
                        
                        // Reload dashboard data
                        Dashboard.loadDashboardData();
                    }
                })
                .catch(error => {
                    console.error("Error reloading user:", error);
                });
        }, verificationCheckDelay);
    },
    
    /**
     * Stop checking for email verification
     */
    stopVerificationCheck: function() {
        if (checkVerificationInterval) {
            clearInterval(checkVerificationInterval);
            checkVerificationInterval = null;
        }
    },
    
    /**
     * Send verification email using Firebase
     */
    sendVerificationEmail: function() {
        if (!currentUser) {
            Dashboard.showToast('You must be logged in to verify your email', 'error');
            return;
        }
        
        // Disable resend buttons to prevent spam
        const resendButtons = [
            document.getElementById('resend-verification'),
            document.getElementById('overlay-resend-verification')
        ];
        
        resendButtons.forEach(button => {
            if (button) button.disabled = true;
        });
        
        // Show loading state
        Dashboard.showToast('Sending verification email...', 'info');
        
        // Send verification email using Firebase
        currentUser.sendEmailVerification()
            .then(() => {
                // Success
                Dashboard.showToast('Verification email sent! Please check your inbox.', 'success');
                
                // Re-enable buttons after 30 seconds to prevent spam
                setTimeout(() => {
                    resendButtons.forEach(button => {
                        if (button) button.disabled = false;
                    });
                }, 30000);
            })
            .catch(error => {
                console.error('Error sending verification email:', error);
                Dashboard.showToast('Failed to send verification email: ' + error.message, 'error');
                
                // Re-enable buttons
                resendButtons.forEach(button => {
                    if (button) button.disabled = false;
                });
            });
    },
    
    /**
     * Update UI based on verification status
     */
    updateUIForVerification: function(isVerified) {
        if (domElements.verificationBanner && domElements.verificationOverlay) {
            if (isVerified) {
                domElements.verificationBanner.style.display = 'none';
                domElements.verificationOverlay.style.display = 'none';
                
                // Enable all interactions
                Dashboard.enableInteractions();
            } else {
                domElements.verificationBanner.style.display = 'block';
                domElements.verificationOverlay.style.display = 'flex';
                
                // Disable all interactive elements except sign out
                Dashboard.disableInteractions();
            }
        }
    },
    
    /**
     * Disable interactive elements when email is not verified
     */
    disableInteractions: function() {
        // Enable only sign out functionality
        const signOutBtn = document.getElementById('sign-out');
        if (signOutBtn) {
            signOutBtn.style.pointerEvents = 'auto';
        }
        
        const dropdownSignOutBtn = document.getElementById('dropdown-sign-out');
        if (dropdownSignOutBtn) {
            dropdownSignOutBtn.style.pointerEvents = 'auto';
        }
        
        // We don't actually disable other elements,
        // as the overlay prevents interaction with them
    },
    
    /**
     * Enable all interactive elements when email is verified
     */
    enableInteractions: function() {
        // Remove any disabled state (not needed in practice due to overlay approach)
    },
    
    /**
     * Update user information in the UI
     */
    updateUserInfo: function(user) {
        if (domElements.userInitialsElement && user) {
            domElements.userInitialsElement.textContent = Utils.getInitials(user.displayName || user.email);
        }
        
        if (domElements.userNameElement && user) {
            domElements.userNameElement.textContent = user.displayName || user.email.split('@')[0];
        }
        
        // Update the profile display elements in the profile section
        const profileNameDisplay = document.getElementById('profile-name-display');
        const profileEmailDisplay = document.getElementById('profile-email-display');
        
        if (profileNameDisplay) {
            profileNameDisplay.textContent = user.displayName || user.email.split('@')[0];
        }
        
        if (profileEmailDisplay) {
            profileEmailDisplay.textContent = user.email;
        }
    },

    /**
     * Sign out the current user
     */
    signOut: function() {
        firebase.auth().signOut()
            .then(() => {
                // Redirect to sign in page
                window.location.href = '/signin';
            })
            .catch(error => {
                console.error("Error signing out:", error);
                Dashboard.showToast('Failed to sign out. Please try again.', 'error');
            });
    },
    
    /**
         * Activate a specific section
         */
    activateSection: function(sectionId) {
        if (!sectionId) return;
        
        // Update current section
        currentSection = sectionId;
        
        // Update active nav link
        domElements.navLinks.forEach(link => {
            const linkSection = link.getAttribute('data-section');
            if (linkSection === sectionId) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
        
        // Show correct section and hide others
        domElements.contentSections.forEach(section => {
            if (section.id === sectionId) {
                section.classList.add('active');
            } else {
                section.classList.remove('active');
            }
        });
        
        // Load section-specific data
        Dashboard.loadSectionData(sectionId);
    },

    /**
     * Load section-specific data
     */
    loadSectionData: function(sectionId) {
        switch(sectionId) {
            case 'dashboard-section':
                Dashboard.loadDashboardData();
                break;
            case 'subscription-section':
                Dashboard.loadSubscriptionStatus();
                Dashboard.renderSubscriptionPlans();
                break;
            case 'downloads-section':
                Dashboard.updateLicenseKeyDisplay();
                break;
            case 'billing-section':
                Dashboard.loadTransactionHistory();
                break;
            case 'profile-section':
                Dashboard.loadProfileData();
                break;
        }
    },

    /**
     * Load dashboard data using Firebase authentication
     */
    loadDashboardData: function() {
        if (!currentUser) {
            console.error("No authenticated user to load dashboard data");
            return;
        }
        
        // Show loading state
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) loadingIndicator.style.display = 'block';
        
        console.log("Starting dashboard data load");
        
        // Get Firebase token
        currentUser.getIdToken(true)
            .then(token => {
                console.log("Firebase token obtained, calling dashboard API");
                // Call the API with Firebase token
                return fetch('/api/dashboard', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`API error: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log("Dashboard API response:", data);
                // Handle the dashboard data
                if (data) {
                    // Store subscription data - check for properly formed subscription with active flag
                    if (data.subscriptions && data.subscriptions.length > 0) {
                        subscriptionStatus = data.subscriptions[0];
                        
                        // Ensure 'active' is a boolean
                        if (typeof subscriptionStatus.active === 'string') {
                            subscriptionStatus.active = subscriptionStatus.active.toLowerCase() === 'true';
                        }
                        
                        console.log("Subscription status:", subscriptionStatus);
                    } else {
                        subscriptionStatus = null;
                    }
                    
                    // Store credit usage data
                    creditUsage = data.credit_usage || { used: 0, total: 0 };
                    
                    // Store license key
                    licenseKey = data.license_keys && data.license_keys.length > 0 ? 
                        data.license_keys[0].key : null;
                    
                    // Update UI with retrieved data
                    Dashboard.updateDashboardView(subscriptionStatus);
                    Dashboard.updateCreditUsage(creditUsage.used, creditUsage.total);
                    Dashboard.updateLicenseKeyDisplay();
                } else {
                    // No data returned, show available plans
                    console.log("No dashboard data returned from API");
                    subscriptionStatus = null;
                    Dashboard.updateDashboardView(null);
                }
            })
            .catch(error => {
                console.error('Error loading dashboard data:', error);
                Dashboard.showToast('Failed to load dashboard data. Please try again later.', 'error');
            })
            .finally(() => {
                // Hide loading indicator
                if (loadingIndicator) loadingIndicator.style.display = 'none';
            });
    },
    

    /**
     * Show toast notification
     */
    showToast: function(message, type = 'info') {
        if (!domElements.toastContainer) return;
        
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        // Set toast icon based on type
        let icon = 'info-circle';
        switch (type) {
            case 'success':
                icon = 'check-circle';
                break;
            case 'error':
                icon = 'exclamation-circle';
                break;
            case 'warning':
                icon = 'exclamation-triangle';
                break;
        }
        
        // Set toast content
        toast.innerHTML = `
            <i class="toast-icon fas fa-${icon}"></i>
            <div class="toast-content">
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close">&times;</button>
        `;
        
        // Add toast to container
        domElements.toastContainer.appendChild(toast);
        
        // Auto-remove after timeout
        const timeout = setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => {
                if (domElements.toastContainer.contains(toast)) {
                    domElements.toastContainer.removeChild(toast);
                }
            }, 300);
        }, DASHBOARD_CONFIG.toastDuration || 5000);
        
        // Close button functionality
        const closeBtn = toast.querySelector('.toast-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                clearTimeout(timeout);
                toast.classList.add('hide');
                setTimeout(() => {
                    if (domElements.toastContainer.contains(toast)) {
                        domElements.toastContainer.removeChild(toast);
                    }
                }, 300);
            });
        }
    },

    /**
     * Open a modal
     */
    openModal: function(modalId) {
        const modalContainer = document.querySelector('.modal-container');
        const modal = document.getElementById(modalId);
        
        if (modalContainer && modal) {
            modalContainer.classList.add('active');
            
            // Small delay to trigger animation
            setTimeout(() => {
                modal.style.display = 'block';
            }, 10);
        }
    },

    /**
     * Close all modals
     */
    closeAllModals: function() {
        const modalContainer = document.querySelector('.modal-container');
        const modals = document.querySelectorAll('.modal');
        
        if (modalContainer) {
            modalContainer.classList.remove('active');
        }
        
        modals.forEach(modal => {
            modal.style.display = 'none';
        });
    },

    /**
     * Initialize copy buttons functionality
     */
    initCopyButtons: function() {
        // License key copy button in the dashboard section
        const copyLicenseBtn = document.getElementById('copy-license');
        if (copyLicenseBtn) {
            copyLicenseBtn.addEventListener('click', () => {
                const licenseKeyElement = document.getElementById('license-key');
                if (!licenseKeyElement) return;
                
                // Get the full key from data attribute
                const key = licenseKeyElement.getAttribute('data-full-key');
                if (!key) {
                    Dashboard.showToast('License key not available', 'error');
                    return;
                }
                
                // Copy to clipboard
                navigator.clipboard.writeText(key)
                    .then(() => {
                        Dashboard.showToast('License key copied to clipboard', 'success');
                    })
                    .catch(err => {
                        console.error('Failed to copy license key:', err);
                        Dashboard.showToast('Failed to copy license key', 'error');
                    });
            });
        }
        
        // License key copy button in the downloads section
        const copyDownloadLicenseBtn = document.getElementById('copy-download-license');
        if (copyDownloadLicenseBtn) {
            copyDownloadLicenseBtn.addEventListener('click', () => {
                const downloadLicenseKey = document.getElementById('download-license-key');
                if (!downloadLicenseKey) return;
                
                // Get the full key from data attribute
                const key = downloadLicenseKey.getAttribute('data-full-key');
                if (!key) {
                    Dashboard.showToast('License key not available', 'error');
                    return;
                }
                
                // Copy to clipboard
                navigator.clipboard.writeText(key)
                    .then(() => {
                        Dashboard.showToast('License key copied to clipboard', 'success');
                    })
                    .catch(err => {
                        console.error('Failed to copy license key:', err);
                        Dashboard.showToast('Failed to copy license key', 'error');
                    });
            });
        }
    },

    /**
     * Initialize buy credits modal
     */
    initBuyCreditsModal: function() {
        console.log('Initializing buy credits modal with event delegation');
        
        // Use event delegation for all credit-related clicks
        document.addEventListener('click', function(e) {
            // Check if target is a buy-credit-btn or its child
            const creditBtn = e.target.closest('.buy-credit-btn');
            if (creditBtn) {
                e.preventDefault();
                e.stopPropagation();
                
                const amount = creditBtn.getAttribute('data-amount');
                console.log('Credit button clicked - Amount:', amount);
                
                if (amount) {
                    // Call openCheckout with credit- prefix
                    openCheckout(`credit-${amount}`);
                    
                    // Close modal
                    Dashboard.closeAllModals();
                }
            }
        });
    },

    /**
     * Initialize cancel subscription modal
     */
    initCancelSubscriptionModal: function() {
        const confirmCancelBtn = document.getElementById('confirm-cancel');
        
        if (confirmCancelBtn) {
            confirmCancelBtn.addEventListener('click', () => {
                Dashboard.cancelSubscription();
                
                // Close modal
                Dashboard.closeAllModals();
            });
        }
    },

    /**
     * Load subscription status
     */
    loadSubscriptionStatus: function() {
        if (!currentUser) return Promise.reject('User not authenticated');
        
        // Show loading state
        Dashboard.updateLoadingState(true);
        
        return new Promise((resolve, reject) => {
            // Get subscription data from Firestore
            const db = firebase.firestore();
            
            db.collection('users').doc(currentUser.uid).get()
                .then(doc => {
                    if (doc.exists) {
                        const userData = doc.data();
                        
                        // Check if user has subscription data
                        if (userData.subscription) {
                            subscriptionStatus = userData.subscription;
                            creditUsage = userData.creditUsage || { used: 0, total: 0 };
                            licenseKey = userData.licenseKey;
                            
                            // Update UI with subscription data
                            Dashboard.updateSubscriptionUI(subscriptionStatus);
                            Dashboard.updateDashboardView(subscriptionStatus); // Add this line
                            
                            // Update credit usage display
                            Dashboard.updateCreditUsage(creditUsage.used, creditUsage.total);
                            
                            // Update license key display
                            Dashboard.updateLicenseKeyDisplay();
                            
                            resolve(subscriptionStatus);
                        } else {
                            // No subscription data, show available plans
                            subscriptionStatus = null;
                            Dashboard.updateSubscriptionUI(null);
                            Dashboard.updateDashboardView(null); // Add this line
                            Dashboard.showAvailablePlans();
                            resolve(null);
                        }

                    } else {
                        // User document doesn't exist, create it
                        Dashboard.createUserDocument(currentUser)
                            .then(() => {
                                subscriptionStatus = null;
                                Dashboard.updateSubscriptionUI(null);
                                Dashboard.showAvailablePlans();
                                resolve(null);
                            })
                            .catch(reject);
                    }
                })
                .catch(error => {
                    console.error('Error loading subscription data:', error);
                    Dashboard.updateLoadingState(false);
                    Dashboard.showSubscriptionError();
                    reject(error);
                });
        });
    },

    /**
     * Create user document in Firestore
     */
    createUserDocument: function(user) {
        const db = firebase.firestore();
        
        return db.collection('users').doc(user.uid).set({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || '',
            emailVerified: user.emailVerified,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
            creditUsage: {
                used: 0,
                total: 0
            }
        });
    },

    /**
     * Update subscription UI
     */
    updateSubscriptionUI: function(status) {
        Dashboard.updateLoadingState(false);
        
        if (domElements.currentPlanBody) {
            if (status && status.active) {
                // Active subscription
                domElements.currentPlanBody.innerHTML = Dashboard.generateActiveSubscriptionHTML(status);
                
                // Bind event handlers
                const cancelBtn = document.getElementById('cancel-subscription-btn');
                if (cancelBtn) {
                    cancelBtn.addEventListener('click', () => {
                        Dashboard.openModal('cancel-subscription-modal');
                    });
                }
                
                const upgradeBtn = document.getElementById('upgrade-subscription-btn');
                if (upgradeBtn) {
                    upgradeBtn.addEventListener('click', Dashboard.showAvailablePlans);
                }
                
                const buyMoreCreditsBtn = document.getElementById('buy-more-credits-btn');
                if (buyMoreCreditsBtn) {
                    buyMoreCreditsBtn.addEventListener('click', () => {
                        Dashboard.openModal('buy-credits-modal');
                    });
                }
            } else {
                // No active subscription
                domElements.currentPlanBody.innerHTML = Dashboard.generateInactiveSubscriptionHTML();
            }
        }
    },

    /**
     * Generate HTML for active subscription
     */
    generateActiveSubscriptionHTML: function(status) {
        return `
            <div class="subscription-active">
                <div class="subscription-details">
                    <div class="subscription-detail">
                        <div class="subscription-detail-label">Current Plan</div>
                        <div class="subscription-detail-value">${status.plan.name || 'Unknown'}</div>
                    </div>
                    <div class="subscription-detail">
                        <div class="subscription-detail-label">Status</div>
                        <div class="subscription-detail-value">
                            <span class="badge badge-success">Active</span>
                        </div>
                    </div>
                    <div class="subscription-detail">
                        <div class="subscription-detail-label">Next Billing</div>
                        <div class="subscription-detail-value">${Utils.formatDate(status.nextBillingDate) || 'Unknown'}</div>
                    </div>
                    <div class="subscription-detail">
                        <div class="subscription-detail-label">Amount</div>
                        <div class="subscription-detail-value">${Utils.formatCurrency(status.amount || 0)} / ${status.interval || 'month'}</div>
                    </div>
                </div>
                <div class="credit-info-container">
                    <h4>Credits</h4>
                    <div class="credit-info">
                        <span class="credits-used">${Utils.formatNumber(creditUsage.used)}</span>
                        <span> / </span>
                        <span class="credits-total">${Utils.formatNumber(creditUsage.total)}</span>
                        <span> credits used</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress" style="width: ${creditUsage.total > 0 ? (creditUsage.used / creditUsage.total) * 100 : 0}%"></div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Generate HTML for inactive subscription
     */
    generateInactiveSubscriptionHTML: function() {
        return `
            <div class="alert alert-info">
                <i class="alert-icon fas fa-info-circle"></i>
                <div class="alert-content">
                    <div class="alert-title">No Active Subscription</div>
                    <div class="alert-message">You don't have an active subscription. Choose a plan below to get started.</div>
                </div>
            </div>
        `;
    },

    /**
     * Show subscription loading error
     */
    showSubscriptionError: function() {
        if (domElements.currentPlanBody) {
            domElements.currentPlanBody.innerHTML = `
                <div class="alert alert-error">
                    <i class="alert-icon fas fa-exclamation-circle"></i>
                    <div class="alert-content">
                        <div class="alert-title">Error Loading Subscription</div>
                        <div class="alert-message">There was a problem loading your subscription information. Please try again later.</div>
                    </div>
                </div>
                <button onclick="Dashboard.loadSubscriptionStatus()" class="btn btn-primary mt-16">Try Again</button>
            `;
        }
    },

    /**
     * Update loading state
     */
    updateLoadingState: function(isLoading) {
        if (domElements.currentPlanBody) {
            if (isLoading) {
                domElements.currentPlanBody.innerHTML = `
                    <div class="loading-indicator">
                        <i class="fas fa-spinner fa-spin"></i> Loading subscription data...
                    </div>
                `;
            }
        }
    },

    /**
     * Show available subscription plans
     */
    showAvailablePlans: function() {
        if (domElements.availablePlansContainer && domElements.availablePlansGrid) {
            domElements.availablePlansContainer.style.display = 'block';
            
            // Generate plan HTML
            let plansHTML = '';
            
            for (const planKey in SUBSCRIPTION_PLANS) {
                const plan = SUBSCRIPTION_PLANS[planKey];
                
                // Skip current plan if upgrading
                if (subscriptionStatus && subscriptionStatus.plan && subscriptionStatus.plan.id === plan.id) {
                    continue;
                }
                
                plansHTML += Dashboard.generatePlanHTML(plan);
            }
            
            // Update plans grid
            domElements.availablePlansGrid.innerHTML = plansHTML;
            
            // Bind events to subscribe buttons
            const subscribeButtons = document.querySelectorAll('.subscribe-btn');
            subscribeButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    const planId = e.target.getAttribute('data-plan-id');
                    // Replace this line to call openCheckout instead of subscribeToPlan
                    openCheckout(planId);
                });
            });
        }
    },
    /**
     * Generate HTML for a subscription plan
     */
    generatePlanHTML: function(plan) {
        // Generate features list
        let featuresHTML = '';
        if (plan.features && plan.features.length > 0) {
            featuresHTML = '<ul>';
            plan.features.forEach(feature => {
                featuresHTML += `<li><i class="fas fa-check"></i> ${feature}</li>`;
            });
            featuresHTML += '</ul>';
        }
        
        return `
            <div class="plan-card ${plan.popular ? 'popular' : ''}">
                ${plan.popular ? '<div class="plan-popular">Most Popular</div>' : ''}
                <div class="plan-header">
                    <div class="plan-name">${plan.name}</div>
                    <div class="plan-price">${Utils.formatCurrency(plan.price)}</div>
                    <div class="plan-billing">per ${plan.interval}</div>
                </div>
                <div class="plan-features">
                    ${featuresHTML}
                </div>
                <div class="plan-action">
                    <button class="btn btn-primary subscribe-btn" data-plan-id="${plan.id}">
                        Subscribe Now
                    </button>
                </div>
            </div>
        `;
    },


    /**
     * Cancel subscription
     */
    cancelSubscription: function() {
        if (!currentUser || !subscriptionStatus || !subscriptionStatus.id) {
            Dashboard.showToast('No active subscription to cancel', 'error');
            return;
        }
        
        // Show loading
        Dashboard.showToast('Processing cancellation...', 'info');
        
        ApiService.cancelSubscription(subscriptionStatus.id, false)
            .then(result => {
                // Show success message
                Dashboard.showToast('Subscription canceled successfully. You can still use it until the end of the billing period.', 'success');
                
                // Reload dashboard data to update UI
                Dashboard.loadDashboardData();
            })
            .catch(error => {
                console.error('Cancellation error:', error);
                Dashboard.showToast('Failed to cancel subscription', 'error');
            });
    },

    /**
     * Purchase additional credits using Paddle checkout
     */
    purchaseCredits: function(amount, price) {
        if (!currentUser) {
            Dashboard.showToast('You must be logged in to purchase credits', 'error');
            return;
        }
        
        console.log('Purchase credits called - Amount:', amount, 'Price:', price);
        
        // Call openCheckout with credit- prefix
        openCheckout(`credit-${amount}`);
    },


    /**
     * Create a transaction record
     */
    createTransactionRecord: function(transaction) {
        if (!currentUser) return Promise.reject('User not authenticated');
        
        const db = firebase.firestore();
        return db.collection('users').doc(currentUser.uid).collection('transactions').add({
            ...transaction,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            // Reload transaction history if we're on the billing section
            if (document.getElementById('billing-section').classList.contains('active')) {
                Dashboard.loadTransactionHistory();
            }
        });
    },

    /**
     * Load transaction history with Firebase authentication
     */
    loadTransactionHistory: function() {
        if (!currentUser) {
            console.error("No authenticated user to load transactions");
            return;
        }
        
        const transactionsBody = document.getElementById('transactions-body');
        if (!transactionsBody) return;
        
        // Show loading indicator
        transactionsBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center">
                    <div class="loading-indicator"><i class="fas fa-spinner fa-spin"></i> Loading transactions...</div>
                </td>
            </tr>
        `;
        
        // Get filter values if they exist
        const typeFilter = document.getElementById('transaction-type')?.value || 'all';
        const periodFilter = document.getElementById('transaction-period')?.value || 'all';
        
        // Build query parameters
        const queryParams = new URLSearchParams();
        if (typeFilter !== 'all') queryParams.append('type', typeFilter);
        if (periodFilter !== 'all') queryParams.append('period', periodFilter);
        
        // Get Firebase token
        currentUser.getIdToken(true)
            .then(token => {
                // Call the API with Firebase token
                return fetch(`/api/transactions?${queryParams.toString()}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`API error: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // Store transaction data
                transactionHistory = data || [];
                
                // Render transactions
                Dashboard.renderTransactionHistory();
            })
            .catch(error => {
                console.error('Error loading transactions:', error);
                transactionsBody.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center">
                            <div class="alert alert-error">
                                <i class="alert-icon fas fa-exclamation-circle"></i>
                                <div class="alert-content">
                                    <div class="alert-title">Error Loading Transactions</div>
                                    <div class="alert-message">There was a problem loading your transaction history. Please try again later.</div>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            });
    },

    /**
     * Render transaction history
     */
    renderTransactionHistory: function() {
        const transactionsTable = document.getElementById('transactions-body');
        if (!transactionsTable || !transactionHistory) return;
        
        // Get filter values
        const typeFilter = document.getElementById('transaction-type')?.value || 'all';
        const periodFilter = document.getElementById('transaction-period')?.value || 'all';
        
        // Filter transactions
        let filteredTransactions = [...transactionHistory];
        
        // Apply type filter
        if (typeFilter !== 'all') {
            filteredTransactions = filteredTransactions.filter(t => t.type === typeFilter);
        }
        
        // Apply period filter
        if (periodFilter !== 'all') {
            const now = new Date();
            let cutoffDate;
            
            switch (periodFilter) {
                case 'month':
                    cutoffDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
                case '3month':
                    cutoffDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
                    break;
                case 'year':
                    cutoffDate = new Date(now.getFullYear(), 0, 1);
                    break;
            }
            
            if (cutoffDate) {
                filteredTransactions = filteredTransactions.filter(t => {
                    const transactionDate = new Date(t.date);
                    return transactionDate >= cutoffDate;
                });
            }
        }
        
        // Generate table HTML
        if (filteredTransactions.length === 0) {
            domElements.transactionsTable.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center">
                        <div class="empty-state">
                            <div class="empty-state-icon">
                                <i class="fas fa-filter"></i>
                            </div>
                            <div class="empty-state-title">No Matching Transactions</div>
                            <div class="empty-state-text">No transactions match your current filters. Try changing your filter settings.</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
        
        let tableHTML = '';
        
        filteredTransactions.forEach(transaction => {
            tableHTML += `
                <tr>
                    <td>${Utils.formatDate(transaction.date)}</td>
                    <td>${transaction.description}</td>
                    <td>${Utils.formatCurrency(transaction.amount)}</td>
                    <td>
                        <span class="status-badge status-${transaction.status === 'completed' ? 'success' : transaction.status === 'pending' ? 'pending' : 'failed'}">
                            ${transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                        </span>
                    </td>
                    <td>
                        ${transaction.invoiceId ? 
                            `<button class="btn btn-sm btn-outline" onclick="Dashboard.requestInvoice('${transaction.id}')">
                                <i class="fas fa-envelope"></i> Send Invoice
                            </button>` : 
                            '<span class="text-secondary">N/A</span>'
                        }
                    </td>
                </tr>
            `;
        });
        
        transactionsTable.innerHTML = tableHTML;
    },

    /**
     * Update license key display
     */
    updateLicenseKeyDisplay: function() {
        if (!licenseKey) return;
        
        // Update license key element in dashboard view
        const licenseKeyElement = document.getElementById('license-key');
        if (licenseKeyElement) {
            // Store full key as data attribute
            licenseKeyElement.setAttribute('data-full-key', licenseKey);
            // Display masked key for security
            licenseKeyElement.textContent = Utils.maskLicenseKey(licenseKey);
        }
        
        // Update license key element in download section
        const downloadLicenseKeyElement = document.getElementById('download-license-key');
        if (downloadLicenseKeyElement) {
            downloadLicenseKeyElement.setAttribute('data-full-key', licenseKey);
            downloadLicenseKeyElement.textContent = Utils.maskLicenseKey(licenseKey);
        }
        
        // Initialize copy buttons if not already done
        Dashboard.initCopyButtons();
    },

    /**
     * Update credit usage display
     */
    updateCreditUsage: function(used = 0, total = 0) {
        // If no parameters provided, use stored values
        used = used || creditUsage.used;
        total = total || creditUsage.total;
        
        if (domElements.creditsUsed && domElements.creditsTotal && domElements.creditProgress) {
            domElements.creditsUsed.textContent = Utils.formatNumber(used);
            domElements.creditsTotal.textContent = Utils.formatNumber(total);
            
            // Calculate percentage
            const percentage = total > 0 ? (used / total) * 100 : 0;
            domElements.creditProgress.style.width = `${percentage}%`;
            
            // Change color based on usage
            if (percentage > 90) {
                domElements.creditProgress.className = 'progress strength-weak';
            } else if (percentage > 70) {
                domElements.creditProgress.className = 'progress strength-medium';
            } else {
                domElements.creditProgress.className = 'progress strength-strong';
            }
        }
    },

    /**
     * Load usage analytics
     */
    loadUsageAnalytics: function() {
        if (!domElements.usageChart) return;
        
        // Show loading state
        domElements.usageChart.innerHTML = `
            <div class="chart-placeholder">
                <div class="loading-indicator"><i class="fas fa-spinner fa-spin"></i> Loading analytics...</div>
            </div>
        `;
        
        // In a real implementation, you would load actual usage data
        // For this example, we'll generate sample data
        const data = Dashboard.generateSampleAnalyticsData();
        
        // Render chart
        Dashboard.renderUsageChart(data);
    },

    /**
     * Generate sample analytics data
     */
    generateSampleAnalyticsData: function() {
        const data = [];
        const today = new Date();
        
        // Generate data for the last 30 days
        for (let i = 29; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            
            // Random usage values with a slight upward trend
            const factor = 1 + (30 - i) / 100;
            
            data.push({
                date: date.toISOString().slice(0, 10),
                creditUsed: Math.floor(Math.random() * 10 * factor) + 1,
                apiCalls: Math.floor(Math.random() * 50 * factor) + 5,
                featureUsage: {
                    feature1: Math.floor(Math.random() * 20 * factor),
                    feature2: Math.floor(Math.random() * 15 * factor),
                    feature3: Math.floor(Math.random() * 10 * factor)
                }
            });
        }
        
        return data;
    },

    /**
     * Render usage chart
     */
    renderUsageChart: function(usageData) {
        if (!domElements.usageChart || !window.Chart) return;
        
        // Prepare chart data
        const labels = usageData.map(item => Dashboard.formatDateForChart(item.date));
        const creditData = usageData.map(item => item.creditUsed);
        const apiCallData = usageData.map(item => item.apiCalls);
        
        // Create canvas if it doesn't exist
        let canvas = domElements.usageChart.querySelector('canvas');
        
        if (!canvas) {
            canvas = document.createElement('canvas');
            domElements.usageChart.innerHTML = '';
            domElements.usageChart.appendChild(canvas);
        }
        
        const ctx = canvas.getContext('2d');
        
        // Create chart
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Credits Used',
                        data: creditData,
                        borderColor: '#0071e3',
                        backgroundColor: 'rgba(0, 113, 227, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true
                    },
                    {
                        label: 'API Calls',
                        data: apiCallData,
                        borderColor: '#34c759',
                        backgroundColor: 'rgba(52, 199, 89, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Credits Used'
                        }
                    },
                    y1: {
                        position: 'right',
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'API Calls'
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    }
                }
            }
        });
    },

    /**
     * Format date for chart display
     */
    formatDateForChart: function(dateString) {
        const date = new Date(dateString);
        const options = { month: 'short', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    },

    /**
     * Load profile data with Firebase authentication
     */
    loadProfileData: function() {
        if (!currentUser) {
            console.error("No authenticated user to load profile data");
            return;
        }
        
        // Update profile display elements
        const profileNameDisplay = document.getElementById('profile-name-display');
        const profileEmailDisplay = document.getElementById('profile-email-display');
        
        if (profileNameDisplay) {
            profileNameDisplay.textContent = currentUser.displayName || currentUser.email.split('@')[0];
        }
        
        if (profileEmailDisplay) {
            profileEmailDisplay.textContent = currentUser.email;
        }
    },

    /**
     * Populate profile form with user data
     */
    populateProfileForm: function(data) {
        if (!domElements.profileName || !domElements.profileEmail) return;
        
        // Set email (always from Auth)
        domElements.profileEmail.value = currentUser.email;
        
        // Set name
        if (domElements.profileName) {
            domElements.profileName.value = data.displayName || currentUser.displayName || '';
        }
        
        // Set company
        if (domElements.profileCompany) {
            domElements.profileCompany.value = data.company || '';
        }
        
        // Set role
        if (domElements.profileRole) {
            domElements.profileRole.value = data.role || '';
        }
    },

    /**
     * Update profile with Firebase authentication
     */
    updateProfile: function(e) {
        e.preventDefault();
        
        if (!currentUser) {
            Dashboard.showToast('You must be logged in to update your profile', 'error');
            return;
        }
        
        // Get form values
        const name = document.getElementById('profile-name')?.value.trim() || '';
        const company = document.getElementById('profile-company')?.value.trim() || '';
        const role = document.getElementById('profile-role')?.value.trim() || '';
        
        // Validate
        if (!name) {
            Dashboard.showToast('Name is required', 'error');
            document.getElementById('profile-name')?.focus();
            return;
        }
        
        // Show loading state
        Dashboard.setFormLoading(true);
        
        // Update Firebase Authentication profile
        currentUser.updateProfile({
            displayName: name
        }).then(() => {
            // Update Firestore with additional profile data
            const db = firebase.firestore();
            return db.collection('users').doc(currentUser.uid).update({
                displayName: name,
                company: company,
                role: role,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }).then(() => {
            // Success! Update UI elements with new data
            Dashboard.showToast('Profile updated successfully', 'success');
            
            // Update user display name in the header
            const userNameElement = document.getElementById('user-name');
            if (userNameElement) {
                userNameElement.textContent = name;
            }
            
            // Update user initials in the header
            const userInitialsElement = document.getElementById('user-initials');
            if (userInitialsElement) {
                userInitialsElement.textContent = Utils.getInitials(name);
            }
        }).catch(error => {
            console.error('Error updating profile:', error);
            Dashboard.showToast('Failed to update profile', 'error');
        }).finally(() => {
            Dashboard.setFormLoading(false);
        });
    },

    /**
     * Set profile form loading state
     */
    setFormLoading: function(isLoading) {
        if (!domElements.profileForm) return;
        
        const submitButton = domElements.profileForm.querySelector('button[type="submit"]');
        
        if (submitButton) {
            submitButton.disabled = isLoading;
            submitButton.innerHTML = isLoading ? 
                '<i class="fas fa-spinner fa-spin"></i> Updating...' : 
                'Save Changes';
        }
        
        // Disable form fields
        const formFields = domElements.profileForm.querySelectorAll('input:not([disabled])');
        formFields.forEach(field => {
            field.disabled = isLoading;
        });
    },

    /**
     * Update password with Firebase authentication
     */
    updatePassword: function(e) {
        e.preventDefault();
        
        if (!currentUser) {
            Dashboard.showToast('You must be logged in to change your password', 'error');
            return;
        }
        
        // Get form values
        const currentPasswordElement = document.getElementById('current-password');
        const newPasswordElement = document.getElementById('new-password');
        const confirmPasswordElement = document.getElementById('confirm-password');
        
        if (!currentPasswordElement || !newPasswordElement || !confirmPasswordElement) {
            console.error("Password form elements not found");
            return;
        }
        
        const currentPassword = currentPasswordElement.value;
        const newPassword = newPasswordElement.value;
        const confirmPassword = confirmPasswordElement.value;
        
        // Validate
        if (!currentPassword || !newPassword || !confirmPassword) {
            Dashboard.showToast('All password fields are required', 'error');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            Dashboard.showToast('New passwords do not match', 'error');
            confirmPasswordElement.focus();
            return;
        }
        
        // Check password strength
        if (newPassword.length < 8) {
            Dashboard.showToast('Password must be at least 8 characters long', 'error');
            newPasswordElement.focus();
            return;
        }
        
        // Set loading state
        Dashboard.setPasswordFormLoading(true);
        
        // Reauthenticate with Firebase before changing password
        const credential = firebase.auth.EmailAuthProvider.credential(
            currentUser.email,
            currentPassword
        );
        
        currentUser.reauthenticateWithCredential(credential)
            .then(() => {
                // Password reauthentication successful, now update password
                return currentUser.updatePassword(newPassword);
            })
            .then(() => {
                // Password update successful
                Dashboard.showToast('Password updated successfully', 'success');
                currentPasswordElement.value = '';
                newPasswordElement.value = '';
                confirmPasswordElement.value = '';
            })
            .catch(error => {
                console.error('Error updating password:', error);
                
                // Handle specific Firebase error codes
                if (error.code === 'auth/wrong-password') {
                    Dashboard.showToast('Current password is incorrect', 'error');
                    currentPasswordElement.focus();
                } else if (error.code === 'auth/weak-password') {
                    Dashboard.showToast('New password is too weak', 'error');
                    newPasswordElement.focus();
                } else {
                    Dashboard.showToast('Failed to update password: ' + error.message, 'error');
                }
            })
            .finally(() => {
                Dashboard.setPasswordFormLoading(false);
            });
    },

    /**
     * Set password form loading state
     */
    setPasswordFormLoading: function(isLoading) {
        if (!domElements.passwordForm) return;
        
        const submitButton = domElements.passwordForm.querySelector('button[type="submit"]');
        
        if (submitButton) {
            submitButton.disabled = isLoading;
            submitButton.innerHTML = isLoading ? 
                '<i class="fas fa-spinner fa-spin"></i> Updating...' : 
                'Update Password';
        }
        
        // Disable form fields
        const formFields = domElements.passwordForm.querySelectorAll('input');
        formFields.forEach(field => {
            field.disabled = isLoading;
        });
    },

    /**
     * Render subscription plans
     */
    renderSubscriptionPlans: function() {
        Dashboard.showAvailablePlans();
    },

    requestInvoice: function(transactionId) {
        if (!currentUser || !transactionId) {
            Dashboard.showToast('Unable to request invoice', 'error');
            return;
        }
        
        Dashboard.showToast('Sending invoice to your email...', 'info');
        
        // Call the same transactions endpoint with POST method
        currentUser.getIdToken(true)
            .then(token => {
                return fetch('/api/transactions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ transactionId: transactionId })
                });
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to send invoice');
                }
                return response.json();
            })
            .then(data => {
                Dashboard.showToast('Invoice sent to your email!', 'success');
            })
            .catch(error => {
                console.error('Invoice request error:', error);
                Dashboard.showToast('Failed to send invoice', 'error');
            });
    }
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

    // Initialize everything when DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
        
        setupGlobalErrorHandling();

        // Check system integration
        if (!checkSystemIntegration()) return;

        Dashboard.init();

        // Add transaction filter event listeners
        const transactionTypeFilter = document.getElementById('transaction-type');
        const transactionPeriodFilter = document.getElementById('transaction-period');

        if (transactionTypeFilter) {
            transactionTypeFilter.addEventListener('change', Dashboard.renderTransactionHistory);
        }

        if (transactionPeriodFilter) {
            transactionPeriodFilter.addEventListener('change', Dashboard.renderTransactionHistory);
        }

        // Set up billing cycle toggles if present
        document.querySelectorAll('.billing-toggle').forEach(button => {
            button.addEventListener('click', () => {
                toggleBillingCycle(button.dataset.cycle);
            });
        });

        // Set up checkout buttons if present
        document.querySelectorAll('.checkout-button').forEach(button => {
            button.addEventListener('click', () => {
                openCheckout(button.dataset.plan);
            });
            // Disable buttons until Paddle is initialized
            button.disabled = true;
        });

        // Check URL for success parameters
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('checkout') && urlParams.get('checkout') === 'success') {
            Dashboard.showToast('Payment successful! Your subscription is now active.', 'success');
            
            // Clear the URL parameter
            const newUrl = window.location.href.split('?')[0];
            window.history.replaceState({}, document.title, newUrl);
        }

    });
