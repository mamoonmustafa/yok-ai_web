/**
 * Yok-AI Dashboard - Subscription Module
 * Manages subscription status, purchases, and Paddle integration
 */

// Initialize Subscription module
const Subscription = (() => {
    // Private variables
    let subscriptionStatus = null;
    let creditUsage = {
        used: 0,
        total: 0
    };
    let licenseKey = null;
    let transactionHistory = [];
    
    // DOM Elements
    const currentPlanBody = document.getElementById('current-plan-body');
    const availablePlansContainer = document.getElementById('available-plans-container');
    const availablePlansGrid = document.getElementById('available-plans');
    const licenseKeyElement = document.getElementById('license-key');
    const downloadLicenseKeyElement = document.getElementById('download-license-key');
    const transactionsTable = document.getElementById('transactions-body');
    
    /**
     * Initialize subscription functionality
     */
    function init() {
        // Load subscription status when dashboard is ready
        document.addEventListener('DOMContentLoaded', () => {
            loadSubscriptionStatus();
        });
        
        // Load subscription data when switching to subscription section
        EventBus.on('dashboard:section-changed', (sectionId) => {
            if (sectionId === 'subscription-section') {
                loadSubscriptionStatus();
                renderSubscriptionPlans();
            } else if (sectionId === 'downloads-section') {
                updateLicenseKeyDisplay();
            } else if (sectionId === 'billing-section') {
                loadTransactionHistory();
            }
        });
        
        // Initialize Paddle
        if (window.Paddle) {
            window.Paddle.Setup({ 
                vendor: PADDLE_VENDOR_ID 
            });
        }
        
        // Bind event handlers
        bindEvents();
    }
    
    /**
     * Bind event handlers for subscription-related elements
     */
    function bindEvents() {
        // Listen for user authentication
        EventBus.on('auth:user-authenticated', (user) => {
            loadSubscriptionStatus();
        });
        
        // Event delegation for dynamic subscription elements
        document.addEventListener('click', function(e) {
            // Cancel subscription button
            if (e.target && e.target.matches('#cancel-subscription-btn')) {
                Dashboard.openModal('cancel-subscription-modal');
            }
            
            // Upgrade subscription button
            if (e.target && e.target.matches('#upgrade-subscription-btn')) {
                showAvailablePlans();
            }
        });
    }
    
    /**
     * Load subscription status from Paddle API or Firebase
     */
    function loadSubscriptionStatus() {
        const user = firebase.auth().currentUser;
        if (!user) return Promise.reject('User not authenticated');
        
        // Show loading state
        updateLoadingState(true);
        
        return new Promise((resolve, reject) => {
            // Get subscription data from Firestore
            const db = firebase.firestore();
            
            db.collection('users').doc(user.uid).get()
                .then(doc => {
                    if (doc.exists) {
                        const userData = doc.data();
                        
                        // Check if user has subscription data
                        if (userData.subscription) {
                            subscriptionStatus = userData.subscription;
                            creditUsage = userData.creditUsage || { used: 0, total: 0 };
                            licenseKey = userData.licenseKey;
                            
                            // Update UI with subscription data
                            updateSubscriptionUI(subscriptionStatus);
                            
                            // Update credit usage display
                            if (typeof Dashboard !== 'undefined' && Dashboard.updateCreditUsage) {
                                Dashboard.updateCreditUsage(creditUsage.used, creditUsage.total);
                            }
                            
                            // Update license key display
                            updateLicenseKeyDisplay();
                            
                            resolve(subscriptionStatus);
                        } else {
                            // No subscription data, show available plans
                            subscriptionStatus = null;
                            updateSubscriptionUI(null);
                            showAvailablePlans();
                            resolve(null);
                        }
                    } else {
                        // User document doesn't exist, create it
                        createUserDocument(user)
                            .then(() => {
                                subscriptionStatus = null;
                                updateSubscriptionUI(null);
                                showAvailablePlans();
                                resolve(null);})
                                .catch(reject);
                        }
                    })
                    .catch(error => {
                        console.error('Error loading subscription data:', error);
                        updateLoadingState(false);
                        showSubscriptionError();
                        reject(error);
                    });
            });
        }
        
        /**
         * Create user document in Firestore
         */
        function createUserDocument(user) {
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
        }
        
        /**
         * Update subscription UI
         */
        function updateSubscriptionUI(status) {
            updateLoadingState(false);
            
            if (currentPlanBody) {
                if (status && status.active) {
                    // Active subscription
                    currentPlanBody.innerHTML = generateActiveSubscriptionHTML(status);
                    
                    // Bind event handlers
                    const cancelBtn = document.getElementById('cancel-subscription-btn');
                    if (cancelBtn) {
                        cancelBtn.addEventListener('click', () => {
                            Dashboard.openModal('cancel-subscription-modal');
                        });
                    }
                    
                    const upgradeBtn = document.getElementById('upgrade-subscription-btn');
                    if (upgradeBtn) {
                        upgradeBtn.addEventListener('click', showAvailablePlans);
                    }
                } else {
                    // No active subscription
                    currentPlanBody.innerHTML = generateInactiveSubscriptionHTML();
                }
            }
        }
        
        /**
         * Generate HTML for active subscription
         */
        function generateActiveSubscriptionHTML(status) {
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
        }
        
        /**
         * Generate HTML for inactive subscription
         */
        function generateInactiveSubscriptionHTML() {
            return `
                <div class="alert alert-info">
                    <i class="alert-icon fas fa-info-circle"></i>
                    <div class="alert-content">
                        <div class="alert-title">No Active Subscription</div>
                        <div class="alert-message">You don't have an active subscription. Choose a plan below to get started.</div>
                    </div>
                </div>
            `;
        }
        
        /**
         * Show subscription loading error
         */
        function showSubscriptionError() {
            if (currentPlanBody) {
                currentPlanBody.innerHTML = `
                    <div class="alert alert-error">
                        <i class="alert-icon fas fa-exclamation-circle"></i>
                        <div class="alert-content">
                            <div class="alert-title">Error Loading Subscription</div>
                            <div class="alert-message">There was a problem loading your subscription information. Please try again later.</div>
                        </div>
                    </div>
                    <button onclick="Subscription.loadSubscriptionStatus()" class="btn btn-primary mt-16">Try Again</button>
                `;
            }
        }
        
        /**
         * Show available subscription plans
         */
        function showAvailablePlans() {
            if (availablePlansContainer && availablePlansGrid) {
                availablePlansContainer.style.display = 'block';
                
                // Generate plan HTML
                let plansHTML = '';
                
                for (const planKey in SUBSCRIPTION_PLANS) {
                    const plan = SUBSCRIPTION_PLANS[planKey];
                    
                    // Skip current plan if upgrading
                    if (subscriptionStatus && subscriptionStatus.plan && subscriptionStatus.plan.id === plan.id) {
                        continue;
                    }
                    
                    plansHTML += generatePlanHTML(plan);
                }
                
                // Update plans grid
                availablePlansGrid.innerHTML = plansHTML;
                
                // Bind events to subscribe buttons
                const subscribeButtons = document.querySelectorAll('.subscribe-btn');
                subscribeButtons.forEach(button => {
                    button.addEventListener('click', (e) => {
                        const planId = e.target.getAttribute('data-plan-id');
                        subscribeToPlan(planId);
                    });
                });
            }
        }
        
        /**
         * Generate HTML for a subscription plan
         */
        function generatePlanHTML(plan) {
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
        }
        
        /**
         * Subscribe to a plan using Paddle
         */
        function subscribeToPlan(planId) {
            const user = firebase.auth().currentUser;
            if (!user) {
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
            
            // In a real implementation, you would integrate with Paddle
            // For this example, we'll simulate a successful subscription
            
            // Simulate Paddle API call
            setTimeout(() => {
                // Create subscription data
                const newSubscription = {
                    id: 'sub_' + Math.random().toString(36).substr(2, 9),
                    active: true,
                    plan: {
                        id: selectedPlan.id,
                        name: selectedPlan.name
                    },
                    amount: selectedPlan.price,
                    interval: selectedPlan.interval,
                    startDate: new Date().toISOString(),
                    nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // +30 days
                };
                
                // Update credit usage
                creditUsage = {
                    used: 0,
                    total: selectedPlan.credits || 0
                };
                
                // Generate license key if not exists
                if (!licenseKey) {
                    licenseKey = Utils.generateLicenseKey();
                }
                
                // Update subscription status
                subscriptionStatus = newSubscription;
                
                // Save to Firebase
                const db = firebase.firestore();
                db.collection('users').doc(user.uid).update({
                    subscription: newSubscription,
                    creditUsage: creditUsage,
                    licenseKey: licenseKey,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }).then(() => {
                    // Show success message
                    Dashboard.showToast('Subscription activated successfully!', 'success');
                    
                    // Update UI
                    updateSubscriptionUI(newSubscription);
                    
                    // Update credit usage display
                    if (typeof Dashboard !== 'undefined' && Dashboard.updateCreditUsage) {
                        Dashboard.updateCreditUsage(creditUsage.used, creditUsage.total);
                    }
                    
                    // Update license key display
                    updateLicenseKeyDisplay();
                    
                    // Hide available plans
                    if (availablePlansContainer) {
                        availablePlansContainer.style.display = 'none';
                    }
                    
                    // Create transaction record
                    createTransactionRecord({
                        type: 'subscription',
                        description: `${selectedPlan.name} Subscription`,
                        amount: selectedPlan.price,
                        date: new Date().toISOString(),
                        status: 'completed'
                    });
                }).catch(error => {
                    console.error('Error saving subscription:', error);
                    Dashboard.showToast('Error activating subscription', 'error');
                });
            }, 2000);
        }
        
        /**
         * Cancel subscription
         */
        function cancelSubscription() {
            const user = firebase.auth().currentUser;
            if (!user || !subscriptionStatus || !subscriptionStatus.active) {
                Dashboard.showToast('No active subscription to cancel', 'error');
                return;
            }
            
            // Show loading
            Dashboard.showToast('Processing cancellation...', 'info');
            
            // In a real implementation, you would integrate with Paddle
            // For this example, we'll simulate a successful cancellation
            
            // Simulate Paddle API call
            setTimeout(() => {
                // Update subscription data
                subscriptionStatus.canceledAt = new Date().toISOString();
                subscriptionStatus.active = false;
                
                // Save to Firebase
                const db = firebase.firestore();
                db.collection('users').doc(user.uid).update({
                    'subscription.canceledAt': subscriptionStatus.canceledAt,
                    'subscription.active': false,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }).then(() => {
                    // Show success message
                    Dashboard.showToast('Subscription canceled successfully. You can still use it until the end of the billing period.', 'success');
                    
                    // Update UI
                    updateSubscriptionUI(subscriptionStatus);
                    
                    // Create transaction record
                    createTransactionRecord({
                        type: 'cancellation',
                        description: 'Subscription Cancellation',
                        amount: 0,
                        date: new Date().toISOString(),
                        status: 'completed'
                    });
                }).catch(error => {
                    console.error('Error canceling subscription:', error);
                    Dashboard.showToast('Error canceling subscription', 'error');
                });
            }, 2000);
        }
        
        /**
         * Purchase additional credits
         */
        function purchaseCredits(amount, price) {
            const user = firebase.auth().currentUser;
            if (!user) {
                Dashboard.showToast('You must be logged in to purchase credits', 'error');
                return;
            }
            
            // Check if user has active subscription
            if (!subscriptionStatus || !subscriptionStatus.active) {
                Dashboard.showToast('You need an active subscription to purchase additional credits', 'error');
                return;
            }
            
            // Show loading
            Dashboard.showToast('Processing credit purchase...', 'info');
            
            // In a real implementation, you would integrate with Paddle
            // For this example, we'll simulate a successful purchase
            
            // Simulate Paddle API call
            setTimeout(() => {
                // Update credit usage
                creditUsage.total += parseInt(amount);
                
                // Save to Firebase
                const db = firebase.firestore();
                db.collection('users').doc(user.uid).update({
                    'creditUsage.total': creditUsage.total,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }).then(() => {
                    // Show success message
                    Dashboard.showToast(`Successfully purchased ${amount} credits!`, 'success');
                    
                    // Update credit usage display
                    if (typeof Dashboard !== 'undefined' && Dashboard.updateCreditUsage) {
                        Dashboard.updateCreditUsage(creditUsage.used, creditUsage.total);
                    }
                    
                    // Create transaction record
                    createTransactionRecord({
                        type: 'credit',
                        description: `${amount} Credit Purchase`,
                        amount: parseFloat(price),
                        date: new Date().toISOString(),
                        status: 'completed'
                    });
                }).catch(error => {
                    console.error('Error purchasing credits:', error);
                    Dashboard.showToast('Error purchasing credits', 'error');
                });
            }, 2000);
        }
        
        /**
         * Create a transaction record
         */
        function createTransactionRecord(transaction) {
            const user = firebase.auth().currentUser;
            if (!user) return Promise.reject('User not authenticated');
            
            const db = firebase.firestore();
            return db.collection('users').doc(user.uid).collection('transactions').add({
                ...transaction,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => {
                // Reload transaction history if we're on the billing section
                if (document.getElementById('billing-section').classList.contains('active')) {
                    loadTransactionHistory();
                }
            });
        }
        
        /**
         * Load transaction history
         */
        function loadTransactionHistory() {
            const user = firebase.auth().currentUser;
            if (!user) return;
            
            if (transactionsTable) {
                // Show loading
                transactionsTable.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center">
                            <div class="loading-indicator"><i class="fas fa-spinner fa-spin"></i> Loading transactions...</div>
                        </td>
                    </tr>
                `;
                
                // Get transactions from Firestore
                const db = firebase.firestore();
                db.collection('users').doc(user.uid).collection('transactions')
                    .orderBy('createdAt', 'desc')
                    .limit(20)
                    .get()
                    .then(snapshot => {
                        if (snapshot.empty) {
                            // No transactions
                            transactionsTable.innerHTML = `
                                <tr>
                                    <td colspan="5" class="text-center">
                                        <div class="empty-state">
                                            <div class="empty-state-icon">
                                                <i class="fas fa-receipt"></i>
                                            </div>
                                            <div class="empty-state-title">No Transactions</div>
                                            <div class="empty-state-text">You don't have any transactions yet.</div>
                                        </div>
                                    </td>
                                </tr>
                            `;
                            return;
                        }
                        
                        // Process transactions
                        transactionHistory = [];
                        snapshot.forEach(doc => {
                            transactionHistory.push({
                                id: doc.id,
                                ...doc.data()
                            });
                        });
                        
                        // Render transactions
                        renderTransactionHistory();
                    })
                    .catch(error => {
                        console.error('Error loading transactions:', error);
                        transactionsTable.innerHTML = `
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
            }
            
            /**
             * Render transaction history
             */
            function renderTransactionHistory() {
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
                    transactionsTable.innerHTML = `
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
                                ${transaction.invoiceUrl ? 
                                    `<a href="${transaction.invoiceUrl}" target="_blank" class="download-link">
                                        <i class="fas fa-download"></i> PDF
                                    </a>` : 
                                    '<span class="text-secondary">N/A</span>'
                                }
                            </td>
                        </tr>
                    `;
                });
                
                transactionsTable.innerHTML = tableHTML;
            }
            
            /**
             * Update license key display
             */
            function updateLicenseKeyDisplay() {
                if (licenseKeyElement && licenseKey) {
                    // Store full key as data attribute
                    licenseKeyElement.setAttribute('data-full-key', licenseKey);
                    
                    // Display masked key
                    licenseKeyElement.textContent = Utils.maskLicenseKey(licenseKey);
                }
                
                if (downloadLicenseKeyElement && licenseKey) {
                    // Store full key as data attribute
                    downloadLicenseKeyElement.setAttribute('data-full-key', licenseKey);
                    
                    // Display masked key
                    downloadLicenseKeyElement.textContent = Utils.maskLicenseKey(licenseKey);
                }
            }
            
            /**
             * Update loading state
             */
            function updateLoadingState(isLoading) {
                if (currentPlanBody) {
                    if (isLoading) {
                        currentPlanBody.innerHTML = `
                            <div class="loading-indicator">
                                <i class="fas fa-spinner fa-spin"></i> Loading subscription data...
                            </div>
                        `;
                    }
                }
            }
            
            /**
             * Get current subscription status
             */
            function getSubscriptionStatus() {
                return Promise.resolve(subscriptionStatus);
            }
            
            /**
             * Get credit usage statistics
             */
            function getCreditUsage() {
                return creditUsage;
            }
            
            // Public API
            return {
                init,
                loadSubscriptionStatus,
                subscribeToPlan,
                cancelSubscription,
                purchaseCredits,
                getSubscriptionStatus,
                getCreditUsage,
                loadTransactionHistory
            };
        })();
        
        // Initialize Subscription module
        document.addEventListener('DOMContentLoaded', function() {
            Subscription.init();
        });