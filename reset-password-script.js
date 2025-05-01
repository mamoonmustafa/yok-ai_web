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
const loadingContainer = document.getElementById('loading-container');
const resetFormContainer = document.getElementById('reset-form-container');
const verifyEmailContainer = document.getElementById('verify-email-container');
const resultSuccess = document.getElementById('result-success');
const errorContainer = document.getElementById('error-container');

const resetForm = document.getElementById('reset-form');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirm-password');
const togglePasswordBtn = document.getElementById('toggle-password');
const alertDiv = document.getElementById('alert');
const verifyAlertDiv = document.getElementById('verify-alert');
const passwordStrength = document.getElementById('password-strength');
const strengthValue = document.getElementById('strength-value');
const strengthBar = document.getElementById('strength-meter-bar');
const passwordMismatch = document.getElementById('password-mismatch');
const passwordMatch = document.getElementById('password-match');

// Success elements
const successTitle = document.getElementById('success-title');
const successMessage = document.getElementById('success-message');
const successButton = document.getElementById('success-button');

// Error elements
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const errorButton = document.getElementById('error-button');

// Password requirement elements
const reqLength = document.getElementById('req-length');
const reqUppercase = document.getElementById('req-uppercase');
const reqNumber = document.getElementById('req-number');
const reqSpecial = document.getElementById('req-special');

// Parse URL parameters
const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode');
const actionCode = urlParams.get('oobCode');
const continueUrl = urlParams.get('continueUrl') || '/dashboard';
let email = '';

// Main function to handle different modes
function handleAction() {
    // If no action code is provided, redirect to the sign-in page
    if (!actionCode) {
        window.location.href = '/signin.html';
        return;
    }

    // Handle different action modes
    switch (mode) {
        case 'resetPassword':
            handleResetPassword();
            break;
        case 'verifyEmail':
            handleVerifyEmail();
            break;
        default:
            // Try to verify what type of action it is
            handleUnknownMode();
            break;
    }
}

// Handle reset password mode
function handleResetPassword() {
    // Hide loading, show reset form
    loadingContainer.style.display = 'none';
    resetFormContainer.style.display = 'block';

    // Verify the action code is valid
    firebase.auth().verifyPasswordResetCode(actionCode)
        .then((userEmail) => {
            // Save the email for later use
            email = userEmail;
        })
        .catch((error) => {
            // Handle invalid or expired action code
            handleError(error, 'Password Reset Link Error');
        });
}

// Handle email verification mode
function handleVerifyEmail() {
    // Hide loading, show verify email container
    loadingContainer.style.display = 'none';
    verifyEmailContainer.style.display = 'block';

    // Apply the verification code
    firebase.auth().applyActionCode(actionCode)
        .then(() => {
            // Email verified successfully
            verifyEmailContainer.style.display = 'none';
            
            // Get current user (if already signed in)
            const user = firebase.auth().currentUser;
            
            if (user) {
                // Reload user to update email verification status
                return user.reload().then(() => {
                    showSuccess(
                        'Email Verified!',
                        'Your email has been successfully verified. You can now access all features of your account.',
                        'Go to Dashboard',
                        continueUrl
                    );
                });
            } else {
                // User is not signed in
                showSuccess(
                    'Email Verified!',
                    'Your email has been successfully verified. Please sign in to access your account.',
                    'Sign In',
                    '/signin.html'
                );
            }
        })
        .catch((error) => {
            // Handle verification errors
            handleError(error, 'Email Verification Error');
        });
}

// Handle unknown mode - try to detect what type of action
function handleUnknownMode() {
    // First try if it's a password reset
    firebase.auth().verifyPasswordResetCode(actionCode)
        .then((userEmail) => {
            // It's a password reset
            email = userEmail;
            loadingContainer.style.display = 'none';
            resetFormContainer.style.display = 'block';
        })
        .catch((error) => {
            // Not a password reset, try email verification
            firebase.auth().checkActionCode(actionCode)
                .then((actionCodeInfo) => {
                    if (actionCodeInfo.operation === 'VERIFY_EMAIL') {
                        // It's an email verification
                        loadingContainer.style.display = 'none';
                        verifyEmailContainer.style.display = 'block';
                        
                        // Apply the verification code
                        firebase.auth().applyActionCode(actionCode)
                            .then(() => {
                                verifyEmailContainer.style.display = 'none';
                                showSuccess(
                                    'Email Verified!',
                                    'Your email has been successfully verified. You can now access all features of your account.',
                                    'Go to Dashboard',
                                    continueUrl
                                );
                            })
                            .catch((error) => {
                                handleError(error, 'Email Verification Error');
                            });
                    } else {
                        // Unknown operation
                        handleError({
                            code: 'auth/invalid-action',
                            message: 'The action code is invalid or expired.'
                        }, 'Invalid Link');
                    }
                })
                .catch((error) => {
                    // Not a valid action code
                    handleError(error, 'Invalid Link');
                });
        });
}

// Toggle password visibility
if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', function() {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            togglePasswordBtn.innerHTML = '<i class="far fa-eye-slash"></i>';
        } else {
            passwordInput.type = 'password';
            togglePasswordBtn.innerHTML = '<i class="far fa-eye"></i>';
        }
    });
}

// Check password strength and requirements
if (passwordInput) {
    passwordInput.addEventListener('input', function() {
        const password = passwordInput.value;
        
        // Update password match status if confirm password has value
        if (confirmPasswordInput && confirmPasswordInput.value) {
            checkPasswordsMatch();
        }
        
        if (password.length > 0) {
            passwordStrength.style.display = 'block';
            
            // Calculate password strength
            let strength = 0;
            
            // Length check
            if (password.length >= 8) {
                strength += 1;
                reqLength.classList.add('requirement-fulfilled');
                reqLength.querySelector('.icon').innerHTML = '✓';
            } else {
                reqLength.classList.remove('requirement-fulfilled');
                reqLength.querySelector('.icon').innerHTML = '○';
            }
            
            // Uppercase check
            if (/[A-Z]/.test(password)) {
                strength += 1;
                reqUppercase.classList.add('requirement-fulfilled');
                reqUppercase.querySelector('.icon').innerHTML = '✓';
            } else {
                reqUppercase.classList.remove('requirement-fulfilled');
                reqUppercase.querySelector('.icon').innerHTML = '○';
            }
            
            // Number check
            if (/[0-9]/.test(password)) {
                strength += 1;
                reqNumber.classList.add('requirement-fulfilled');
                reqNumber.querySelector('.icon').innerHTML = '✓';
            } else {
                reqNumber.classList.remove('requirement-fulfilled');
                reqNumber.querySelector('.icon').innerHTML = '○';
            }
            
            // Special character check
            if (/[^A-Za-z0-9]/.test(password)) {
                strength += 1;
                reqSpecial.classList.add('requirement-fulfilled');
                reqSpecial.querySelector('.icon').innerHTML = '✓';
            } else {
                reqSpecial.classList.remove('requirement-fulfilled');
                reqSpecial.querySelector('.icon').innerHTML = '○';
            }
            
            // Update strength indicator
            if (strength <= 2) {
                strengthValue.textContent = 'Weak';
                strengthBar.className = 'strength-weak';
                strengthBar.style.width = '33%';
            } else if (strength === 3) {
                strengthValue.textContent = 'Medium';
                strengthBar.className = 'strength-medium';
                strengthBar.style.width = '66%';
            } else {
                strengthValue.textContent = 'Strong';
                strengthBar.className = 'strength-strong';
                strengthBar.style.width = '100%';
            }
        } else {
            passwordStrength.style.display = 'none';
            
            // Reset requirements
            reqLength.classList.remove('requirement-fulfilled');
            reqUppercase.classList.remove('requirement-fulfilled');
            reqNumber.classList.remove('requirement-fulfilled');
            reqSpecial.classList.remove('requirement-fulfilled');
            
            reqLength.querySelector('.icon').innerHTML = '○';
            reqUppercase.querySelector('.icon').innerHTML = '○';
            reqNumber.querySelector('.icon').innerHTML = '○';
            reqSpecial.querySelector('.icon').innerHTML = '○';
        }
    });
}

// Check if passwords match
if (confirmPasswordInput) {
    confirmPasswordInput.addEventListener('input', checkPasswordsMatch);
}

function checkPasswordsMatch() {
    if (confirmPasswordInput.value && passwordInput.value) {
        if (confirmPasswordInput.value === passwordInput.value) {
            passwordMatch.style.display = 'block';
            passwordMismatch.style.display = 'none';
            return true;
        } else {
            passwordMatch.style.display = 'none';
            passwordMismatch.style.display = 'block';
            return false;
        }
    } else {
        passwordMatch.style.display = 'none';
        passwordMismatch.style.display = 'none';
        return false;
    }
}

// Handle password reset form submission
if (resetForm) {
    resetForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const newPassword = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        
        // Basic validation
        if (!newPassword || !confirmPassword) {
            showAlert('Please fill in all fields', 'error');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            showAlert('Passwords do not match', 'error');
            return;
        }
        
        // Check password requirements
        if (newPassword.length < 8) {
            showAlert('Password must be at least 8 characters long', 'error');
            return;
        }
        
        if (!/[A-Z]/.test(newPassword)) {
            showAlert('Password must contain at least one uppercase letter', 'error');
            return;
        }
        
        if (!/[0-9]/.test(newPassword)) {
            showAlert('Password must contain at least one number', 'error');
            return;
        }
        
        if (!/[^A-Za-z0-9]/.test(newPassword)) {
            showAlert('Password must contain at least one special character', 'error');
            return;
        }
        
        // Show loading state
        const submitButton = resetForm.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.innerHTML = '<div class="spinner"></div> Processing...';
        
        // Confirm the password reset with Firebase
        firebase.auth().confirmPasswordReset(actionCode, newPassword)
            .then(() => {
                // Password reset successful
                resetFormContainer.style.display = 'none';
                
                // Auto sign in the user after password reset
                if (email) {
                    return firebase.auth().signInWithEmailAndPassword(email, newPassword)
                        .then(() => {
                            showSuccess(
                                'Password Reset Successful!', 
                                'Your password has been reset successfully. You are now signed in.',
                                'Go to Dashboard',
                                continueUrl
                            );
                        })
                        .catch(error => {
                            console.log('Auto sign-in failed, user will need to sign in manually');
                            console.error(error);
                            showSuccess(
                                'Password Reset Successful!', 
                                'Your password has been reset successfully. Please sign in with your new password.',
                                'Go to Sign In',
                                '/signin.html'
                            );
                            return Promise.resolve();
                        });
                } else {
                    showSuccess(
                        'Password Reset Successful!', 
                        'Your password has been reset successfully. Please sign in with your new password.',
                        'Go to Sign In',
                        '/signin.html'
                    );
                    return Promise.resolve();
                }
            })
            .then(() => {
                // Log analytics event (if you have analytics set up)
                if (firebase.analytics) {
                    firebase.analytics().logEvent('password_reset_complete');
                }
            })
            .catch((error) => {
                // Reset button state
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText;
                
                // Handle errors
                handleError(error, 'Password Reset Error');
            });
    });
}

// Show alert message
function showAlert(message, type, alertElement = alertDiv) {
    if (alertElement) {
        alertElement.textContent = message;
        alertElement.className = `alert alert-${type}`;
        alertElement.style.display = 'block';
        
        // Auto-hide success alerts after 3 seconds
        if (type === 'success') {
            setTimeout(() => {
                alertElement.style.display = 'none';
            }, 3000);
        }
        
        // Ensure the alert is visible
        alertElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Show success screen
function showSuccess(title, message, buttonText, buttonHref) {
    // Hide all other containers
    loadingContainer.style.display = 'none';
    resetFormContainer.style.display = 'none';
    verifyEmailContainer.style.display = 'none';
    errorContainer.style.display = 'none';
    
    // Set success content
    successTitle.textContent = title;
    successMessage.textContent = message;
    successButton.textContent = buttonText;
    successButton.href = buttonHref;
    
    // Show success container
    resultSuccess.style.display = 'block';
}

// Handle errors
function handleError(error, errorType) {
    // Hide all other containers
    loadingContainer.style.display = 'none';
    resetFormContainer.style.display = 'none';
    verifyEmailContainer.style.display = 'none';
    resultSuccess.style.display = 'none';
    
    // Get error details
    const errorCode = error.code;
    let errorMsg = '';
    
    switch (errorCode) {
        case 'auth/expired-action-code':
            errorMsg = 'The link has expired. Please request a new one.';
            break;
        case 'auth/invalid-action-code':
            errorMsg = 'The link is invalid. Please request a new one.';
            break;
        case 'auth/user-disabled':
            errorMsg = 'This account has been disabled.';
            break;
        case 'auth/user-not-found':
            errorMsg = 'User not found.';
            break;
        case 'auth/weak-password':
            errorMsg = 'Password is too weak. Please use a stronger password.';
            break;
        default:
            errorMsg = error.message || 'An error occurred. Please try again.';
    }
    
    // Set error content
    errorTitle.textContent = errorType;
    errorMessage.textContent = errorMsg;
    
    // Show error container
    errorContainer.style.display = 'block';
}

// Add event listeners for buttons
document.addEventListener('DOMContentLoaded', () => {
    // Success button
    if (successButton) {
        successButton.addEventListener('click', (e) => {
            // If the href is not # or javascript:void(0), let it navigate normally
            if (successButton.href !== '#' && !successButton.href.startsWith('javascript:')) {
                return;
            }
            e.preventDefault();
            window.location.href = successButton.getAttribute('href') || '/signin.html';
        });
    }
    
    // Error button
    if (errorButton) {
        errorButton.addEventListener('click', (e) => {
            if (errorButton.href !== '#' && !errorButton.href.startsWith('javascript:')) {
                return;
            }
            e.preventDefault();
            window.location.href = errorButton.getAttribute('href') || '/signin.html';
        });
    }
});

// Initialize the page
handleAction();