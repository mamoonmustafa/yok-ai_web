/**
 * Yok-AI Dashboard - Main Dashboard Module
 * Handles core dashboard functionality, navigation, and UI elements
 */

// Initialize Dashboard module
const Dashboard = (() => {
    // Private variables
    let isSidebarCollapsed = false;
    let currentSection = 'dashboard-section';
    
    // DOM Elements
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    const pageTitle = document.getElementById('page-title');
    const userDropdownToggle = document.getElementById('user-dropdown-toggle');
    const userDropdown = document.getElementById('user-dropdown');
    const toastContainer = document.getElementById('toast-container');
    const modals = document.querySelectorAll('.modal');
    const modalContainers = document.querySelectorAll('.modal-container');
    const closeModalButtons = document.querySelectorAll('.modal-close');
    
    // Event Binding
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', toggleSidebar);
    }
    
    navLinks.forEach(link => {
        link.addEventListener('click', navigateToSection);
    });
    
    if (userDropdownToggle) {
        userDropdownToggle.addEventListener('click', toggleUserDropdown);
    }
    
    // Add click event outside user dropdown to close it
    document.addEventListener('click', (e) => {
        if (userDropdown && 
            userDropdownToggle && 
            !userDropdownToggle.contains(e.target) && 
            !userDropdown.contains(e.target)) {
            userDropdown.classList.remove('active');
        }
    });
    
    // Modal close buttons
    closeModalButtons.forEach(button => {
        button.addEventListener('click', () => {
            closeAllModals();
        });
    });
    
    // Close modals when clicking outside
    modalContainers.forEach(container => {
        container.addEventListener('click', (e) => {
            if (e.target === container) {
                closeAllModals();
            }
        });
    });
    
    // Initialize accordion functionality
    const accordionHeaders = document.querySelectorAll('.accordion-header');
    accordionHeaders.forEach(header => {
        header.addEventListener('click', toggleAccordion);
    });
    
    /**
     * Initialize the dashboard
     */
    function init() {
        // Set initial section based on URL hash
        const hash = window.location.hash;
        if (hash) {
            const sectionId = hash.substring(1) + '-section';
            if (document.getElementById(sectionId)) {
                activateSection(sectionId);
            }
        }
        
        // Listen for hash changes
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash;
            if (hash) {
                const sectionId = hash.substring(1) + '-section';
                if (document.getElementById(sectionId)) {
                    activateSection(sectionId);
                }
            }
        });
        
        // Check user verification status
        EventBus.on('auth:user-authenticated', (user) => {
            // Update UI based on verification status
            updateUIForVerification(user.emailVerified);
            
            // Add user info to user dropdown
            updateUserInfo(user);
        });
        
        // Listen for email verification events
        EventBus.on('auth:email-verified', (user) => {
            updateUIForVerification(true);
        });
        
        // Check for mobile devices and adjust sidebar accordingly
        if (window.innerWidth < 768) {
            collapseSidebar();
        }
        
        // Make copy buttons functional
        initCopyButtons();
        
        // Initialize buy credits modal
        initBuyCreditsModal();
        
        // Initialize cancel subscription modal
        initCancelSubscriptionModal();
        
        // Initialize analytics dashboard widgets
        loadDashboardData();
        
        // Attach resize event listener
        window.addEventListener('resize', handleResize);
    }
    
    /**
     * Handle window resize events
     */
    function handleResize() {
        if (window.innerWidth < 768 && !isSidebarCollapsed) {
            collapseSidebar();
        }
    }
    
    /**
     * Toggle sidebar collapse state
     */
    function toggleSidebar() {
        if (isSidebarCollapsed) {
            expandSidebar();
        } else {
            collapseSidebar();
        }
    }
    
    /**
     * Collapse the sidebar
     */
    function collapseSidebar() {
        document.body.classList.add('sidebar-collapsed');
        isSidebarCollapsed = true;
    }
    
    /**
     * Expand the sidebar
     */
    function expandSidebar() {
        document.body.classList.remove('sidebar-collapsed');
        isSidebarCollapsed = false;
    }
    
    /**
     * Navigate to a different section
     * @param {Event} e - Click event
     */
    function navigateToSection(e) {
        e.preventDefault();
        const sectionId = this.getAttribute('data-section');
        
        if (sectionId) {
            activateSection(sectionId);
            
            // Update URL hash without triggering hashchange event
            const hashName = sectionId.replace('-section', '');
            history.pushState(null, null, `#${hashName}`);
            
            // If on mobile, collapse sidebar
            if (window.innerWidth < 768) {
                collapseSidebar();
            }
        }
    }
    
    /**
     * Activate a specific section
     * @param {string} sectionId - ID of the section to activate
     */
    function activateSection(sectionId) {
        if (!sectionId) return;
        
        // Update current section
        currentSection = sectionId;
        
        // Update active nav link
        navLinks.forEach(link => {
            const linkSection = link.getAttribute('data-section');
            if (linkSection === sectionId) {
                link.parentElement.classList.add('active');
            } else {
                link.parentElement.classList.remove('active');
            }
        });
        
        // Show correct section and hide others
        const sections = document.querySelectorAll('.content-section');
        sections.forEach(section => {
            if (section.id === sectionId) {
                section.classList.add('active');
                
                // Update page title
                if (pageTitle) {
                    const sectionName = sectionId.replace('-section', '');
                    pageTitle.textContent = sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
                }
            } else {
                section.classList.remove('active');
            }
        });
        
        // Emit section change event
        EventBus.emit('dashboard:section-changed', sectionId);
    }
    
    /**
     * Toggle user dropdown menu
     */
    function toggleUserDropdown() {
        if (userDropdown) {
            userDropdown.classList.toggle('active');
        }
    }
    
    /**
     * Update UI based on verification status
     * @param {boolean} isVerified - Whether the user's email is verified
     */
    function updateUIForVerification(isVerified) {
        const verificationBanner = document.getElementById('verification-banner');
        const verificationOverlay = document.getElementById('verification-overlay');
        
        if (verificationBanner && verificationOverlay) {
            if (isVerified) {
                verificationBanner.style.display = 'none';
                verificationOverlay.style.display = 'none';
            } else {
                verificationBanner.style.display = 'block';
                verificationOverlay.style.display = 'flex';
            }
        }
    }
    
    /**
     * Update user information in the UI
     * @param {Object} user - Firebase user object
     */
    function updateUserInfo(user) {
        const userInitials = document.getElementById('user-initials');
        const userName = document.getElementById('user-name');
        
        if (userInitials && user) {
            userInitials.textContent = Utils.getInitials(user.displayName || user.email);
        }
        
        if (userName && user) {
            userName.textContent = user.displayName || user.email.split('@')[0];
        }
    }
    
    /**
     * Toggle accordion element
     */
    function toggleAccordion() {
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
    }
    
    /**
     * Initialize copy buttons functionality
     */
    function initCopyButtons() {
        // License key copy
        const copyLicenseBtn = document.getElementById('copy-license');
        const licenseKey = document.getElementById('license-key');
        
        if (copyLicenseBtn && licenseKey) {
            copyLicenseBtn.addEventListener('click', () => {
                // Get the license key text (unmask if needed)
                const key = licenseKey.getAttribute('data-full-key') || licenseKey.textContent;
                
                // Copy to clipboard
                navigator.clipboard.writeText(key).then(() => {
                    showToast('License key copied to clipboard', 'success');
                }).catch(err => {
                    console.error('Failed to copy license key:', err);
                    showToast('Failed to copy license key', 'error');
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
                    showToast('License key copied to clipboard', 'success');
                }).catch(err => {
                    console.error('Failed to copy license key:', err);
                    showToast('Failed to copy license key', 'error');
                });
            });
        }
    }
    
    /**
     * Initialize buy credits modal
     */
    function initBuyCreditsModal() {
        const buyMoreCreditsBtn = document.getElementById('buy-more-credits');
        const buyCreditsModal = document.getElementById('buy-credits-modal');
        const buyPackageButtons = document.querySelectorAll('.buy-credit-btn');
        
        if (buyMoreCreditsBtn && buyCreditsModal) {
            buyMoreCreditsBtn.addEventListener('click', () => {
                openModal('buy-credits-modal');
            });
            
            // Buy credit package buttons
            buyPackageButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const amount = button.getAttribute('data-amount');
                    const price = button.getAttribute('data-price');
                    
                    // Call subscription module to handle purchase
                    if (typeof Subscription !== 'undefined' && Subscription.purchaseCredits) {
                        Subscription.purchaseCredits(amount, price);
                    } else {
                        console.error('Subscription module not loaded');
                        showToast('Credit purchase functionality not available', 'error');
                    }
                    
                    // Close modal
                    closeAllModals();
                });
            });
        }
    }
    
    /**
     * Initialize cancel subscription modal
     */
    function initCancelSubscriptionModal() {
        const confirmCancelBtn = document.getElementById('confirm-cancel');
        
        if (confirmCancelBtn) {
            confirmCancelBtn.addEventListener('click', () => {
                // Call subscription module to handle cancellation
                if (typeof Subscription !== 'undefined' && Subscription.cancelSubscription) {
                    Subscription.cancelSubscription();
                } else {
                    console.error('Subscription module not loaded');
                    showToast('Subscription cancellation functionality not available', 'error');
                }
                
                // Close modal
                closeAllModals();
            });
        }
    }
    
    /**
     * Load dashboard data
     */
    function loadDashboardData() {
        // Update credit usage
        updateCreditUsage();
        
        // Load subscription status
        loadSubscriptionStatus();
        
        // Load usage analytics
        loadUsageAnalytics();
    }
    
    /**
     * Update credit usage display
     */
    function updateCreditUsage(used = 0, total = 0) {
        const creditsUsed = document.getElementById('credits-used');
        const creditsTotal = document.getElementById('credits-total');
        const creditProgress = document.getElementById('credit-progress');
        
        // If no parameters provided, try to get from Subscription module
        if (used === 0 && total === 0 && typeof Subscription !== 'undefined' && Subscription.getCreditUsage) {
            const usage = Subscription.getCreditUsage();
            used = usage.used;
            total = usage.total;
        }
        
        if (creditsUsed && creditsTotal && creditProgress) {
            creditsUsed.textContent = Utils.formatNumber(used);
            creditsTotal.textContent = Utils.formatNumber(total);
            
            // Calculate percentage
            const percentage = total > 0 ? (used / total) * 100 : 0;
            creditProgress.style.width = `${percentage}%`;
            
            // Change color based on usage
            if (percentage > 90) {
                creditProgress.className = 'progress strength-weak';
            } else if (percentage > 70) {
                creditProgress.className = 'progress strength-medium';
            } else {
                creditProgress.className = 'progress strength-strong';
            }
        }
    }
    
    /**
     * Load subscription status
     */
    function loadSubscriptionStatus() {
        const subscriptionStatusBody = document.getElementById('subscription-status-body');
        
        if (subscriptionStatusBody) {
            // If Subscription module is loaded, use it to get status
            if (typeof Subscription !== 'undefined' && Subscription.getSubscriptionStatus) {
                Subscription.getSubscriptionStatus().then(status => {
                    // Update UI with subscription info
                    if (status && status.active) {
                        subscriptionStatusBody.innerHTML = generateActiveSubscriptionHTML(status);
                    } else {
                        subscriptionStatusBody.innerHTML = generateInactiveSubscriptionHTML();
                    }
                }).catch(error => {
                    console.error('Error loading subscription status:', error);
                    subscriptionStatusBody.innerHTML = `
                        <div class="alert alert-error">
                            <i class="alert-icon fas fa-exclamation-circle"></i>
                            <div class="alert-content">
                                <div class="alert-title">Error Loading Subscription</div>
                                <div class="alert-message">There was a problem loading your subscription information. Please try again later.</div>
                            </div>
                        </div>
                    `;
                });
            } else {
                // No Subscription module, show placeholder
                subscriptionStatusBody.innerHTML = `
                    <div class="alert alert-info">
                        <i class="alert-icon fas fa-info-circle"></i>
                        <div class="alert-content">
                            <div class="alert-title">No Active Subscription</div>
                            <div class="alert-message">You don't have an active subscription. Choose a plan to get started.</div>
                        </div>
                    </div>
                    <div class="subscription-actions">
                        <a href="#subscription" data-section="subscription-section" class="btn btn-primary">View Plans</a>
                    </div>
                `;
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
                        <div class="subscription-detail-value">${status.plan.name}</div>
                    </div>
                    <div class="subscription-detail">
                        <div class="subscription-detail-label">Status</div>
                        <div class="subscription-detail-value">
                            <span class="badge badge-success">Active</span>
                        </div>
                    </div>
                    <div class="subscription-detail">
                        <div class="subscription-detail-label">Next Billing</div>
                        <div class="subscription-detail-value">${Utils.formatDate(status.nextBillingDate)}</div>
                    </div>
                    <div class="subscription-detail">
                        <div class="subscription-detail-label">Amount</div>
                        <div class="subscription-detail-value">${Utils.formatCurrency(status.amount)} / ${status.interval}</div>
                    </div>
                </div>
                <div class="subscription-actions">
                    <a href="#subscription" data-section="subscription-section" class="btn btn-primary">Manage Subscription</a>
                    <button class="btn btn-outline" id="buy-credits-btn">Buy More Credits</button>
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
                    <div class="alert-message">You don't have an active subscription. Choose a plan to get started.</div>
                </div>
            </div>
            <div class="subscription-actions">
                <a href="#subscription" data-section="subscription-section" class="btn btn-primary">View Plans</a>
            </div>
        `;
    }
    
    /**
     * Load usage analytics
     */
    function loadUsageAnalytics() {
        const chartContainer = document.getElementById('usage-chart');
        
        if (chartContainer && typeof Analytics !== 'undefined' && Analytics.renderUsageChart) {
            Analytics.renderUsageChart('usage-chart');
        } else if (chartContainer) {
            chartContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <i class="fas fa-chart-line"></i>
                    </div>
                    <div class="empty-state-title">No Usage Data Available</div>
                    <div class="empty-state-text">Usage data will appear here once you start using Yok-AI software.</div>
                </div>
            `;
        }
    }
    
    /**
     * Open a modal
     * @param {string} modalId - ID of the modal to open
     */
    function openModal(modalId) {
        const modalContainer = document.querySelector('.modal-container');
        const modal = document.getElementById(modalId);
        
        if (modalContainer && modal) {
            modalContainer.classList.add('active');
            
            // Small delay to trigger animation
            setTimeout(() => {
                modal.style.display = 'block';
            }, 10);
        }
    }
    
    /**
     * Close all modals
     */
    function closeAllModals() {
        const modalContainer = document.querySelector('.modal-container');
        const modals = document.querySelectorAll('.modal');
        
        if (modalContainer) {
            modalContainer.classList.remove('active');
        }
        
        modals.forEach(modal => {
            modal.style.display = 'none';
        });
    }
    
    /**
     * Show toast notification
     * @param {string} message - Toast message
     * @param {string} type - Toast type (success, error, warning, info)
     */
    function showToast(message, type = 'info') {
        if (!toastContainer) return;
        
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
        toastContainer.appendChild(toast);
        
        // Auto-remove after timeout
        const timeout = setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => {
                if (toastContainer.contains(toast)) {
                    toastContainer.removeChild(toast);
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
                    if (toastContainer.contains(toast)) {
                        toastContainer.removeChild(toast);
                    }
                }, 300);
            });
        }
    }
    
    // Public API
    return {
        init,
        activateSection,
        showToast,
        openModal,
        closeAllModals,
        updateCreditUsage,
        loadSubscriptionStatus,
        loadUsageAnalytics
    };
})();

// Initialize Dashboard module when document is ready
document.addEventListener('DOMContentLoaded', function() {
    Dashboard.init();
});