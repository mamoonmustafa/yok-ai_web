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
    
    if (status && status.active) {
        // User has active subscription
        
        // 1. Show subscription status
        const subscriptionCard = document.createElement('div');
        subscriptionCard.className = 'card';
        subscriptionCard.innerHTML = `
            <div class="card-header">
                <h3>Subscription Status</h3>
            </div>
            <div class="card-body">
                ${Dashboard.generateActiveSubscriptionHTML(status)}
            </div>
        `;
        subscriptionContainer.appendChild(subscriptionCard);
        
        // 2. Show credit usage
        const creditCard = document.createElement('div');
        creditCard.className = 'card';
        creditCard.innerHTML = `
            <div class="card-header">
                <h3>Credit Usage</h3>
            </div>
            <div class="card-body">
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
        
        // 3. Show license key and downloads
        if (licenseKeyCard) licenseKeyCard.style.display = 'block';
        if (downloadsContainer) downloadsContainer.style.display = 'block';
        
        // 4. Update credit usage display
        Dashboard.updateCreditUsage(creditUsage.used, creditUsage.total);
        
        // 5. Bind event handlers
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
    } else {
        // User has no subscription, show pricing plans
        const pricingTitle = document.createElement('div');
        pricingTitle.className = 'section-subheader';
        pricingTitle.innerHTML = '<h3>Choose a Plan</h3>';
        subscriptionContainer.appendChild(pricingTitle);
        
        // Create pricing grid
        const plansGrid = document.createElement('div');
        plansGrid.className = 'plans-grid';
        
        // Add plans to grid
        for (const planKey in SUBSCRIPTION_PLANS) {
            const plan = SUBSCRIPTION_PLANS[planKey];
            plansGrid.innerHTML += Dashboard.generatePlanHTML(plan);
        }
        
        subscriptionContainer.appendChild(plansGrid);
        
        // Hide license key and downloads
        if (licenseKeyCard) licenseKeyCard.style.display = 'none';
        if (downloadsContainer) downloadsContainer.style.display = 'none';
        
        // Bind events to subscribe buttons
        setTimeout(() => {
            const subscribeButtons = document.querySelectorAll('.subscribe-btn');
            subscribeButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    const planId = e.target.getAttribute('data-plan-id');
                    Dashboard.subscribeToPlan(planId);
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
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (domElements.userDropdown && 
                domElements.userDropdownToggle && 
                !domElements.userDropdownToggle.contains(e.target) && 
                !domElements.userDropdown.contains(e.target)) {
                domElements.userDropdown.classList.remove('active');
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
            // Reload user to check verification status
            if (firebase.auth().currentUser) {
                firebase.auth().currentUser.reload()
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
                        }
                    })
                    .catch(error => {
                        console.error("Error reloading user:", error);
                    });
            } else {
                // User is no longer signed in, stop checking
                Dashboard.stopVerificationCheck();
            }
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
     * Send verification email to the user
     */
    sendVerificationEmail: function() {
        if (!currentUser) return;
        
        // Disable resend button to prevent spam
        if (domElements.resendVerificationBtn) {
            domElements.resendVerificationBtn.disabled = true;
        }
        
        if (domElements.overlayResendVerificationBtn) {
            domElements.overlayResendVerificationBtn.disabled = true;
        }
        
        // Send verification email
        currentUser.sendEmailVerification()
            .then(() => {
                // Show success message
                Dashboard.showToast('Verification email sent! Please check your inbox.', 'success');
                
                // Re-enable button after delay
                setTimeout(() => {
                    if (domElements.resendVerificationBtn) {
                        domElements.resendVerificationBtn.disabled = false;
                    }
                    
                    if (domElements.overlayResendVerificationBtn) {
                        domElements.overlayResendVerificationBtn.disabled = false;
                    }
                }, 30000); // 30 seconds cooldown
            })
            .catch(error => {
                console.error("Error sending verification email:", error);
                
                // Show error message
                Dashboard.showToast('Failed to send verification email. Please try again later.', 'error');
                
                // Re-enable button
                if (domElements.resendVerificationBtn) {
                    domElements.resendVerificationBtn.disabled = false;
                }
                
                if (domElements.overlayResendVerificationBtn) {
                    domElements.overlayResendVerificationBtn.disabled = false;
                }
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
 * Load dashboard data
 */
loadDashboardData: function() {
    // Get token from Firebase
    currentUser.getIdToken(true).then(token => {
        // Store token for API calls
        localStorage.setItem('auth_token', token);
        
        // Update loading state
        Dashboard.updateLoadingState(true);
        
        // Call the API
        ApiService.getDashboardData()
            .then(data => {
                if (data && data.subscriptions) {
                    // Store data
                    subscriptionStatus = {
                        active: data.subscriptions.length > 0,
                        plan: data.subscriptions.length > 0 ? {
                            name: data.subscriptions[0].plan_name || 'Premium Plan',
                            id: data.subscriptions[0].plan_id
                        } : null,
                        id: data.subscriptions.length > 0 ? data.subscriptions[0].id : null,
                        amount: data.subscriptions.length > 0 ? data.subscriptions[0].amount : 0,
                        interval: data.subscriptions.length > 0 ? data.subscriptions[0].billing_period || 'month' : 'month',
                        nextBillingDate: data.subscriptions.length > 0 ? data.subscriptions[0].next_billing_date : null
                    };
                    
                    creditUsage = data.credit_usage || { used: 0, total: 0 };
                    licenseKey = data.license_keys && data.license_keys.length > 0 ? 
                        data.license_keys[0].key || data.license_keys[0] : null;
                    
                    // Update UI
                    Dashboard.updateSubscriptionUI(subscriptionStatus);
                    Dashboard.updateDashboardView(subscriptionStatus);
                    Dashboard.updateCreditUsage(creditUsage.used, creditUsage.total);
                    Dashboard.updateLicenseKeyDisplay();
                } else {
                    // No subscription data, show available plans
                    subscriptionStatus = null;
                    Dashboard.updateSubscriptionUI(null);
                    Dashboard.updateDashboardView(null);
                    Dashboard.showAvailablePlans();
                }
                
                // Update loading state
                Dashboard.updateLoadingState(false);
            })
            .catch(error => {
                console.error('Error loading dashboard data:', error);
                Dashboard.updateLoadingState(false);
                Dashboard.showToast('Failed to load dashboard data', 'error');
            });
    }).catch(error => {
        console.error('Error getting auth token:', error);
        Dashboard.showToast('Authentication error. Please sign in again.', 'error');
        
        // Redirect to sign in page
        setTimeout(() => {
            window.location.href = '/signin';
        }, 2000);
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
    // License key copy
    const copyLicenseBtn = document.getElementById('copy-license');
    const licenseKey = document.getElementById('license-key');
    
    if (copyLicenseBtn && licenseKey) {
        copyLicenseBtn.addEventListener('click', () => {
            // Get the license key text (unmask if needed)
            const key = licenseKey.getAttribute('data-full-key') || licenseKey.textContent;
            
            // Copy to clipboard
            navigator.clipboard.writeText(key).then(() => {
                Dashboard.showToast('License key copied to clipboard', 'success');
            }).catch(err => {
                console.error('Failed to copy license key:', err);
                Dashboard.showToast('Failed to copy license key', 'error');
            });
        });
    }
    
    // Download license key copy
    const copyDownloadLicenseBtn = document.getElementById('copy-download-license');
    const downloadLicenseKey = document.getElementById('download-license-key');
    
    if (copyDownloadLicenseBtn && downloadLicenseKey) {
        copyDownloadLicenseBtn.addEventListener('click', () => {
            // Get the license key text
            const key = downloadLicenseKey.getAttribute('data-full-key') || downloadLicenseKey.textContent;
            
            // Copy to clipboard
            navigator.clipboard.writeText(key).then(() => {
                Dashboard.showToast('License key copied to clipboard', 'success');
            }).catch(err => {
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
    const buyMoreCreditsBtn = document.getElementById('buy-more-credits');
    const buyCreditsModal = document.getElementById('buy-credits-modal');
    const buyPackageButtons = document.querySelectorAll('.buy-credit-btn');
    
    if (buyMoreCreditsBtn && buyCreditsModal) {
        buyMoreCreditsBtn.addEventListener('click', () => {
            Dashboard.openModal('buy-credits-modal');
        });
        
        // Buy credit package buttons
        buyPackageButtons.forEach(button => {
            button.addEventListener('click', () => {
                const amount = button.getAttribute('data-amount');
                const price = button.getAttribute('data-price');
                
                Dashboard.purchaseCredits(amount, price);
                
                // Close modal
                Dashboard.closeAllModals();
            });
        });
    }
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
            <div class="credit-info mb-16">
                <h4 class="mb-8">Credits</h4>
                <div class="credit-progress-container">
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
            <div class="subscription-actions">
                <button id="upgrade-subscription-btn" class="btn btn-primary">Upgrade Plan</button>
                <button id="buy-more-credits-btn" class="btn btn-outline">Buy More Credits</button>
                <button id="cancel-subscription-btn" class="btn btn-outline btn-danger">Cancel Subscription</button>
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
                Dashboard.subscribeToPlan(planId);
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
 * Subscribe to a plan
 */
subscribeToPlan: function(planId) {
    if (!currentUser) {
        Dashboard.showToast('You must be logged in to subscribe', 'error');
        return;
    }
    
    // Find plan by ID
    let selectedPlan = null;
    for (const planKey in SUBSCRIPTION_PLANS) {
        if (SUBSCRIPTION_PLANS[planKey].id === planId) {
            selectedPlan = SUBSCRIPTION_PLANS[planKey];
            break;
        }
    }
    
    if (!selectedPlan) {
        Dashboard.showToast('Invalid plan selected', 'error');
        return;
    }
    
    // Show loading
    Dashboard.showToast('Preparing subscription...', 'info');
    
    // Get customer data from API first
    currentUser.getIdToken(true).then(token => {
        localStorage.setItem('auth_token', token);
        
        return ApiService.getDashboardData();
    })
    .then(data => {
        if (!data || !data.customer || !data.customer.id) {
            throw new Error('Customer data not available');
        }
        
        // Create subscription using API
        return ApiService.createSubscription(data.customer.id, planId);
    })
    .then(subscription => {
        // Show success message
        Dashboard.showToast('Subscription activated successfully!', 'success');
        
        // Reload dashboard data to update UI
        Dashboard.loadDashboardData();
    })
    .catch(error => {
        console.error('Subscription error:', error);
        Dashboard.showToast('Failed to activate subscription: ' + error.message, 'error');
    });
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
 * Purchase additional credits
 */
purchaseCredits: function(amount, price) {
    if (!currentUser) {
        Dashboard.showToast('You must be logged in to purchase credits', 'error');
        return;
    }
    
    // Check if user has active subscription
    if (!subscriptionStatus || !subscriptionStatus.id) {
        Dashboard.showToast('You need an active subscription to purchase additional credits', 'error');
        return;
    }
    
    // Show loading
    Dashboard.showToast('Processing credit purchase...', 'info');
    
    ApiService.purchaseCredits(currentUser.uid, parseInt(amount))
        .then(result => {
            // Show success message
            Dashboard.showToast(`Successfully purchased ${amount} credits!`, 'success');
            
            // Reload dashboard data to update credit display
            Dashboard.loadDashboardData();
            
            // Create transaction record (now handled by the API)
        })
        .catch(error => {
            console.error('Credit purchase error:', error);
            Dashboard.showToast('Failed to purchase credits', 'error');
        });
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
 * Load transaction history
 */
loadTransactionHistory: function() {
    if (!currentUser) return;
    
    if (domElements.transactionsTable) {
        // Show loading
        domElements.transactionsTable.innerHTML = `
            <tr>
                <td colspan="5" class="text-center">
                    <div class="loading-indicator"><i class="fas fa-spinner fa-spin"></i> Loading transactions...</div>
                </td>
            </tr>
        `;
        
        // Get filter values
        const typeFilter = document.getElementById('transaction-type')?.value || 'all';
        const periodFilter = document.getElementById('transaction-period')?.value || 'all';
        
        // Get transactions from API
        ApiService.getTransactions(currentUser.uid, {
            type: typeFilter !== 'all' ? typeFilter : undefined,
            period: periodFilter !== 'all' ? periodFilter : undefined,
            limit: 20
        })
        .then(data => {
            // Process transactions
            transactionHistory = data || [];
            
            // Render transactions
            Dashboard.renderTransactionHistory();
        })
        .catch(error => {
            console.error('Error loading transactions:', error);
            domElements.transactionsTable.innerHTML = `
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
    }
},

/**
 * Render transaction history
 */
renderTransactionHistory: function() {
    if (!domElements.transactionsTable || !transactionHistory) return;
    
    // Check if transactions array exists and has items
    if (!Array.isArray(transactionHistory) || transactionHistory.length === 0) {
        domElements.transactionsTable.innerHTML = `
            <tr>
                <td colspan="5" class="text-center">
                    <div class="empty-state">
                        <div class="empty-state-icon">
                            <i class="fas fa-receipt"></i>
                        </div>
                        <div class="empty-state-title">No Transactions Yet</div>
                        <div class="empty-state-text">Your transaction history will appear here once you make a purchase.</div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
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
                const transactionDate = t.date ? new Date(t.date) : new Date(t.created_at || 0);
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
        // Handle date format safely
        const transactionDate = transaction.date ? 
            new Date(transaction.date) : 
            new Date(transaction.created_at || Date.now());
            
        // Safe fallbacks for all fields
        const description = transaction.description || transaction.type || 'Transaction';
        const amount = transaction.amount || 0;
        const status = transaction.status || 'completed';
        const invoiceUrl = transaction.invoice_url || transaction.receipt_url || null;
        
        tableHTML += `
            <tr>
                <td>${Utils.formatDate(transactionDate)}</td>
                <td>${description}</td>
                <td>${Utils.formatCurrency(amount)}</td>
                <td>
                    <span class="status-badge status-${status === 'completed' ? 'success' : status === 'pending' ? 'pending' : 'failed'}">
                        ${status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                </td>
                <td>
                    ${invoiceUrl ? 
                        `<a href="${invoiceUrl}" target="_blank" class="download-link">
                            <i class="fas fa-download"></i> PDF
                        </a>` : 
                        '<span class="text-secondary">N/A</span>'
                    }
                </td>
            </tr>
        `;
    });
    
    domElements.transactionsTable.innerHTML = tableHTML;
},

/**
 * Update license key display
 */
updateLicenseKeyDisplay: function() {
    if (domElements.licenseKeyElement && licenseKey) {
        // Store full key as data attribute
        domElements.licenseKeyElement.setAttribute('data-full-key', licenseKey);
        
        // Display masked key
        domElements.licenseKeyElement.textContent = Utils.maskLicenseKey(licenseKey);
    }
    
    if (domElements.downloadLicenseKeyElement && licenseKey) {
        // Store full key as data attribute
        domElements.downloadLicenseKeyElement.setAttribute('data-full-key', licenseKey);
        
        // Display masked key
        domElements.downloadLicenseKeyElement.textContent = Utils.maskLicenseKey(licenseKey);
    }
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
 * Load profile data
 */
loadProfileData: function() {
    if (!currentUser) return;
    
    // Show loading state
    Dashboard.setFormLoading(true);
    
    // Get user data from Firestore
    const db = firebase.firestore();
    
    db.collection('users').doc(currentUser.uid).get()
        .then(doc => {
            if (doc.exists) {
                const profileData = doc.data();
                
                // Populate form fields
                Dashboard.populateProfileForm(profileData);
            } else {
                // User document doesn't exist, create it
                return Dashboard.createUserDocument(currentUser);
            }
        })
        .catch(error => {
            console.error('Error loading profile data:', error);
            Dashboard.showToast('Error loading profile data', 'error');
        })
        .finally(() => {
            Dashboard.setFormLoading(false);
        });
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
 * Update profile information
 */
updateProfile: function(e) {
    e.preventDefault();
    
    if (!currentUser) {
        Dashboard.showToast('You must be logged in to update your profile', 'error');
        return;
    }
    
    // Get form values
    const name = domElements.profileName.value.trim();
    const company = domElements.profileCompany ? domElements.profileCompany.value.trim() : '';
    const role = domElements.profileRole ? domElements.profileRole.value.trim() : '';
    
    // Validate
    if (!name) {
        Dashboard.showToast('Name is required', 'error');
        domElements.profileName.focus();
        return;
    }
    
    // Show loading state
    Dashboard.setFormLoading(true);
    
    // Update Auth profile first
    currentUser.updateProfile({
        displayName: name
    }).then(() => {
        // Then update Firestore
        const db = firebase.firestore();
        
        return db.collection('users').doc(currentUser.uid).update({
            displayName: name,
            company: company,
            role: role,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }).then(() => {
        // Update successful
        Dashboard.showToast('Profile updated successfully', 'success');
        
        // Update UI with new name
        if (domElements.userNameElement) {
            domElements.userNameElement.textContent = name;
        }
        
        if (domElements.userInitialsElement) {
            domElements.userInitialsElement.textContent = Utils.getInitials(name);
        }
    }).catch(error => {
        console.error('Error updating profile:', error);
        Dashboard.showToast('Error updating profile', 'error');
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
 * Update password
 */
updatePassword: function(e) {
    e.preventDefault();
    
    if (!currentUser) {
        Dashboard.showToast('You must be logged in to change your password', 'error');
        return;
    }
    
    // Get form values
    const current = domElements.currentPassword.value;
    const newPass = domElements.newPassword.value;
    const confirmPass = domElements.confirmPassword.value;
    
    // Validate
    if (!current || !newPass || !confirmPass) {
        Dashboard.showToast('All password fields are required', 'error');
        return;
    }
    
    if (newPass !== confirmPass) {
        Dashboard.showToast('New passwords do not match', 'error');
        domElements.confirmPassword.focus();
        return;
    }
    
    // Check password strength
    if (newPass.length < 8) {
        Dashboard.showToast('Password must be at least 8 characters long', 'error');
        domElements.newPassword.focus();
        return;
    }
    
    // Show loading state
    Dashboard.setPasswordFormLoading(true);
    
    // Get credentials for reauthentication
    const credential = firebase.auth.EmailAuthProvider.credential(
        currentUser.email,
        current
    );
    
    // Reauthenticate user
    currentUser.reauthenticateWithCredential(credential)
        .then(() => {
            // Then update password
            return currentUser.updatePassword(newPass);
        })
        .then(() => {
            // Password updated successfully
            Dashboard.showToast('Password updated successfully', 'success');
            
            // Clear form
            domElements.passwordForm.reset();
        })
        .catch(error => {
            console.error('Error updating password:', error);
            
            // Handle specific errors
            if (error.code === 'auth/wrong-password') {
                Dashboard.showToast('Current password is incorrect', 'error');
                domElements.currentPassword.focus();
            } else if (error.code === 'auth/weak-password') {
                Dashboard.showToast('New password is too weak', 'error');
                domElements.newPassword.focus();
            } else {
                Dashboard.showToast('Error updating password', 'error');
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
}
};

// Utility functions
const Utils = {
    // Format currency
    formatCurrency: (amount) => {
        return '$' + parseFloat(amount || 0).toFixed(2);
    },

    // Format date
    formatDate: (timestamp) => {
        if (!timestamp) return 'N/A';
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return 'Invalid Date';
            const options = { year: 'numeric', month: 'short', day: 'numeric' };
            return date.toLocaleDateString('en-US', options);
        } catch (e) {
            console.error('Date formatting error:', e);
            return 'Invalid Date';
        }
    },

    // Format number with commas
    formatNumber: (number) => {
        return (number || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    },

    // Get user initials from name
    getInitials: (name) => {
        if (!name) return 'U';
        const names = name.split(' ');
        if (names.length === 1) return names[0].charAt(0).toUpperCase();
        return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
    },

    // Mask license key for display
    maskLicenseKey: (key) => {
        if (!key) return 'XXXX-XXXX-XXXX-XXXX';
        
        // If key has dashes, mask preserving the format
        if (key.includes('-')) {
            const parts = key.split('-');
            if (parts.length >= 4) {
                return parts[0] + '-' + parts[1].substring(0, 2) + '**-****-' + parts[3].substring(2);
            }
        }
        
        // Simple masking for keys without expected format
        if (key.length > 8) {
            return key.substring(0, 4) + '...' + key.substring(key.length - 4);
        }
        
        return key;
    }
};

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
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
});
