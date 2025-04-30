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
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirm-password');
const togglePasswordBtn = document.getElementById('toggle-password');
const alertDiv = document.getElementById('alert');
const resetFormContainer = document.getElementById('reset-form-container');
const resetSuccess = document.getElementById('reset-success');
const passwordStrength = document.getElementById('password-strength');
const strengthValue = document.getElementById('strength-value');
const strengthBar = document.getElementById('strength-meter-bar');
const passwordMismatch = document.getElementById('password-mismatch');
const passwordMatch = document.getElementById('password-match');

// Password requirement elements
const reqLength = document.getElementById('req-length');
const reqUppercase = document.getElementById('req-uppercase');
const reqNumber = document.getElementById('req-number');
const reqSpecial = document.getElementById('req-special');

// Get the action code from the URL
const urlParams = new URLSearchParams(window.location.search);
const actionCode = urlParams.get('oobCode');
let email = '';

// If no action code is provided, redirect to the sign-in page
if (!actionCode) {
    window.location.href = '/signin.html';
} else {
    // Verify the action code is valid
    firebase.auth().verifyPasswordResetCode(actionCode)
        .then((userEmail) => {
            // Save the email for later use
            email = userEmail;
        })
        .catch((error) => {
            // Handle invalid or expired action code
            const errorCode = error.code;
            let errorMessage = '';
            
            switch (errorCode) {
                case 'auth/expired-action-code':
                    errorMessage = 'The password reset link has expired. Please request a new one.';
                    break;
                case 'auth/invalid-action-code':
                    errorMessage = 'The password reset link is invalid. Please request a new one.';
                    break;
                default:
                    errorMessage = 'Invalid password reset link. Please request a new one.';
            }
            
            showAlert(errorMessage, 'error');
            
            // Provide a link back to the forgot password page
            const resetFormContent = `
                <div class="auth-header">
                    <h1>Invalid Reset Link</h1>
                    <p>${errorMessage}</p>
                </div>
                <a href="/forgot-password.html" class="btn btn-primary">Request New Link</a>
            `;
            
            if (resetFormContainer) {
                resetFormContainer.innerHTML = resetFormContent;
            }
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

// Handle password reset
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
        submitButton.textContent = 'Processing...';
        
        // Confirm the password reset with Firebase
        firebase.auth().confirmPasswordReset(actionCode, newPassword)
            .then(() => {
                // Password reset successful
                resetFormContainer.style.display = 'none';
                resetSuccess.style.display = 'block';
                
                // Auto sign in the user after password reset
                if (email) {
                    return firebase.auth().signInWithEmailAndPassword(email, newPassword)
                        .catch(error => {
                            console.log('Auto sign-in failed, user will need to sign in manually');
                            console.error(error);
                            return Promise.resolve();
                        });
                }
                return Promise.resolve();
            })
            .then(() => {
                // Log analytics event (if you have analytics set up)
                if (firebase.analytics) {
                    firebase.analytics().logEvent('password_reset_complete');
                }
            })
            .catch((error) => {
                // Handle errors
                const errorCode = error.code;
                let errorMessage = '';
                
                switch (errorCode) {
                    case 'auth/expired-action-code':
                        errorMessage = 'The password reset link has expired. Please request a new one.';
                        break;
                    case 'auth/invalid-action-code':
                        errorMessage = 'The password reset link is invalid. Please request a new one.';
                        break;
                    case 'auth/user-disabled':
                        errorMessage = 'This account has been disabled.';
                        break;
                    case 'auth/user-not-found':
                        errorMessage = 'User not found.';
                        break;
                    case 'auth/weak-password':
                        errorMessage = 'Password is too weak. Please use a stronger password.';
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
}

// Show alert message
function showAlert(message, type) {
    if (alertDiv) {
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
}

// Add event listener for the "Go to Sign In" button
document.addEventListener('DOMContentLoaded', () => {
    const signInButton = document.querySelector('#reset-success .btn-primary');
    if (signInButton) {
        signInButton.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '/signin.html';
        });
    }
});