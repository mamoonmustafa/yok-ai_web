/**
 * Yok-AI Dashboard - Authentication Module
 * Manages user authentication, email verification, and related functionality
 */

// Initialize Authentication module
const Auth = (() => {
    // Private variables
    let currentUser = null;
    let isEmailVerified = false;
    let checkVerificationInterval = null;
    const verificationCheckDelay = 10000; // Check every 10 seconds if email is verified
    
    // DOM Elements
    const verificationBanner = document.getElementById('verification-banner');
    const resendVerificationBtn = document.getElementById('resend-verification');
    const overlayResendVerificationBtn = document.getElementById('overlay-resend-verification');
    const verificationOverlay = document.getElementById('verification-overlay');
    const signOutBtn = document.getElementById('sign-out');
    const dropdownSignOutBtn = document.getElementById('dropdown-sign-out');
    const userInitialsElement = document.getElementById('user-initials');
    const userNameElement = document.getElementById('user-name');
    
    // Event Binding
    if (resendVerificationBtn) {
        resendVerificationBtn.addEventListener('click', sendVerificationEmail);
    }
    
    if (overlayResendVerificationBtn) {
        overlayResendVerificationBtn.addEventListener('click', sendVerificationEmail);
    }
    
    if (signOutBtn) {
        signOutBtn.addEventListener('click', signOut);
    }
    
    if (dropdownSignOutBtn) {
        dropdownSignOutBtn.addEventListener('click', signOut);
    }
    
    /**
     * Initialize authentication state monitoring
     */
    function init() {
        // Check if user is authenticated
        firebase.auth().onAuthStateChanged(function(user) {
            if (user) {
                // User is signed in
                currentUser = user;
                isEmailVerified = user.emailVerified;
                updateUI();
                
                // If email is not verified, start checking periodically
                if (!isEmailVerified) {
                    startVerificationCheck();
                }
                
                // Save user data if it's a new user
                saveUserData(user);
                
                // Notify other modules that user is authenticated
                EventBus.emit('auth:user-authenticated', user);
            } else {
                // User is not signed in, redirect to sign in page
                window.location.href = '/signin.html';
            }
        });
    }
    
    /**
     * Save user data to Firestore for new users
     */
    function saveUserData(user) {
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
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
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
    }
    
    /**
     * Update UI based on authentication and verification status
     */
    function updateUI() {
        // Update user details in header
        if (userInitialsElement && currentUser) {
            userInitialsElement.textContent = Utils.getInitials(currentUser.displayName || currentUser.email);
        }
        
        if (userNameElement && currentUser) {
            userNameElement.textContent = currentUser.displayName || currentUser.email.split('@')[0];
        }
        
        // Show/hide verification banner and overlay
        if (verificationBanner && verificationOverlay) {
            if (currentUser && !isEmailVerified) {
                verificationBanner.style.display = 'block';
                verificationOverlay.style.display = 'flex';
                
                // Disable all interactive elements except sign out
                disableInteractions();
            } else {
                verificationBanner.style.display = 'none';
                verificationOverlay.style.display = 'none';
                
                // Enable all interactions
                enableInteractions();
            }
        }
    }
    
    /**
     * Disable interactive elements when email is not verified
     */
    function disableInteractions() {
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
    }
    
    /**
     * Enable all interactive elements when email is verified
     */
    function enableInteractions() {
        // Remove any disabled state (not needed in practice due to overlay approach)
    }
    
    /**
     * Start checking for email verification periodically
     */
    function startVerificationCheck() {
        // Clear any existing interval
        if (checkVerificationInterval) {
            clearInterval(checkVerificationInterval);
        }
        
        // Start new interval
        checkVerificationInterval = setInterval(() => {
            // Reload user to check verification status
            firebase.auth().currentUser.reload()
                .then(() => {
                    // Get fresh user data
                    currentUser = firebase.auth().currentUser;
                    
                    // Check if email is now verified
                    if (currentUser.emailVerified) {
                        isEmailVerified = true;
                        
                        // Stop checking
                        stopVerificationCheck();
                        
                        // Update UI
                        updateUI();
                        
                        // Update user data in Firestore
                        const db = firebase.firestore();
                        db.collection('users').doc(currentUser.uid).update({
                            emailVerified: true
                        }).catch(error => {
                            console.error("Error updating verification status:", error);
                        });
                        
                        // Show success message
                        showToast('Email verified successfully!', 'success');
                        
                        // Notify other modules
                        EventBus.emit('auth:email-verified', currentUser);
                    }
                })
                .catch(error => {
                    console.error("Error reloading user:", error);
                });
        }, verificationCheckDelay);
    }
    
    /**
     * Stop checking for email verification
     */
    function stopVerificationCheck() {
        if (checkVerificationInterval) {
            clearInterval(checkVerificationInterval);
            checkVerificationInterval = null;
        }
    }
    
    /**
     * Send verification email to the user
     */
    function sendVerificationEmail() {
        if (!currentUser) return;
        
        // Disable resend button to prevent spam
        if (resendVerificationBtn) {
            resendVerificationBtn.disabled = true;
        }
        
        if (overlayResendVerificationBtn) {
            overlayResendVerificationBtn.disabled = true;
        }
        
        // Send verification email
        currentUser.sendEmailVerification()
            .then(() => {
                // Show success message
                showToast('Verification email sent! Please check your inbox.', 'success');
                
                // Re-enable button after delay
                setTimeout(() => {
                    if (resendVerificationBtn) {
                        resendVerificationBtn.disabled = false;
                    }
                    
                    if (overlayResendVerificationBtn) {
                        overlayResendVerificationBtn.disabled = false;
                    }
                }, 30000); // 30 seconds cooldown
            })
            .catch(error => {
                console.error("Error sending verification email:", error);
                
                // Show error message
                showToast('Failed to send verification email. Please try again later.', 'error');
                
                // Re-enable button
                if (resendVerificationBtn) {
                    resendVerificationBtn.disabled = false;
                }
                
                if (overlayResendVerificationBtn) {
                    overlayResendVerificationBtn.disabled = false;
                }
            });
    }
    
    /**
     * Sign out the current user
     */
    function signOut() {
        firebase.auth().signOut()
            .then(() => {
                // Redirect to sign in page
                window.location.href = '/signin.html';
            })
            .catch(error => {
                console.error("Error signing out:", error);
                showToast('Failed to sign out. Please try again.', 'error');
            });
    }
    
    /**
     * Check if user is verified
     */
    function isUserVerified() {
        return isEmailVerified;
    }
    
    /**
     * Get current user
     */
    function getUser() {
        return currentUser;
    }
    
    /**
     * Display toast notification
     */
    function showToast(message, type = 'info') {
        // Check if Dashboard.showToast exists
        if (typeof Dashboard !== 'undefined' && Dashboard.showToast) {
            Dashboard.showToast(message, type);
        } else {
            // Fallback if Dashboard module not loaded yet
            console.log(`${type.toUpperCase()}: ${message}`);
            
            // Create simple toast
            const toastContainer = document.getElementById('toast-container');
            if (toastContainer) {
                const toast = document.createElement('div');
                toast.className = `toast toast-${type}`;
                toast.innerHTML = `
                    <i class="toast-icon fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                    <div class="toast-content">
                        <div class="toast-message">${message}</div>
                    </div>
                    <button class="toast-close">&times;</button>
                `;
                
                // Add toast to container
                toastContainer.appendChild(toast);
                
                // Auto-remove after timeout
                setTimeout(() => {
                    toast.classList.add('hide');
                    setTimeout(() => {
                        toastContainer.removeChild(toast);
                    }, 300);
                }, 5000);
                
                // Close button functionality
                const closeBtn = toast.querySelector('.toast-close');
                if (closeBtn) {
                    closeBtn.addEventListener('click', () => {
                        toast.classList.add('hide');
                        setTimeout(() => {
                            toastContainer.removeChild(toast);
                        }, 300);
                    });
                }
            }
        }
    }
    
    // Public API
    return {
        init,
        sendVerificationEmail,
        signOut,
        isUserVerified,
        getUser
    };
})();

// Initialize Auth module when document is ready
document.addEventListener('DOMContentLoaded', function() {
    Auth.init();
});