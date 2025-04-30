// Firebase configuration - Replace with your actual Firebase config
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

// Get elements
const resetForm = document.getElementById('reset-form');
const emailInput = document.getElementById('email');
const alertDiv = document.getElementById('alert');
const resetFormContainer = document.getElementById('reset-form-container');
const resetSuccess = document.getElementById('reset-success');

// Reset password
// 1. First, make sure your Firebase project is properly configured
// You need to add your domain to the authorized domains in Firebase Console:
// Authentication → Settings → Authorized Domains

// 2. Check that the actionCodeSettings is formatted correctly and has ABSOLUTE URL
// Replace this in your forgot-password-script.js:

resetForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const email = emailInput.value.trim();
    
    // Validate email
    if (!email) {
        showAlert('Please enter your email address', 'error');
        return;
    }
    
    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showAlert('Please enter a valid email address', 'error');
        return;
    }
    
    // Show loading state
    const submitButton = resetForm.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Sending...';
    
    // IMPORTANT: Define actionCodeSettings with ABSOLUTE URL (not relative)
    const actionCodeSettings = {
        // Full absolute URL is required (not just a relative path)
        url: 'https://www.yok-ai.com/newpwd.html',
        // This MUST be true
        handleCodeInApp: true,
        // Also recommended to add these for iOS and Android:
        iOS: {
            bundleId: 'com.yourdomain.app'
        },
        android: {
            packageName: 'com.yourdomain.app',
            installApp: false,
            minimumVersion: '12'
        },
        // Avoid localization issues
        dynamicLinkDomain: undefined
    };
    
    console.log("Sending reset email with settings:", actionCodeSettings);
    
    // Send password reset email with custom settings
    firebase.auth().sendPasswordResetEmail(email, actionCodeSettings)
        .then(() => {
            console.log("Reset email sent successfully with custom URL");
            // Show success message
            resetFormContainer.style.display = 'none';
            resetSuccess.style.display = 'block';
            
            // Log analytics event (if you have analytics set up)
            if (firebase.analytics) {
                firebase.analytics().logEvent('password_reset_email_sent', {
                    email_domain: email.split('@')[1]
                });
            }
        })
        .catch((error) => {
            console.error("Error sending reset email:", error);
            // Handle errors
            const errorCode = error.code;
            let errorMessage = '';
            
            switch (errorCode) {
                case 'auth/invalid-email':
                    errorMessage = 'Invalid email address format.';
                    break;
                case 'auth/user-not-found':
                    errorMessage = 'No account found with this email. Please check your email or sign up.';
                    break;
                case 'auth/too-many-requests':
                    errorMessage = 'Too many attempts. Please try again later.';
                    break;
                case 'auth/invalid-continue-uri':
                    errorMessage = 'The continue URL provided in the request is invalid.';
                    break;
                case 'auth/unauthorized-continue-uri':
                    errorMessage = 'The domain of the continue URL is not whitelisted.';
                    break;
                default:
                    errorMessage = 'An error occurred. Please try again.';
            }
            
            showAlert(errorMessage, 'error');
            console.error(error);
            
            // Reset button state
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        });
});

// Show alert message
function showAlert(message, type) {
    alertDiv.textContent = message;
    alertDiv.className = `alert alert-${type}`;
    alertDiv.style.display = 'block';
    
    // Auto-hide success alerts after 3 seconds
    if (type === 'success') {
        setTimeout(() => {
            alertDiv.style.display = 'none';
        }, 3000);
    }
    
    // Ensure the alert is visible
    alertDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Back to Sign In button functionality
document.addEventListener('DOMContentLoaded', () => {
    const backToSignInBtn = document.querySelector('#reset-success .btn-primary');
    if (backToSignInBtn) {
        backToSignInBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '/signin.html';
        });
    }
});