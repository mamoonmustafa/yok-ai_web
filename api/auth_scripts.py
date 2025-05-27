import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Parse URL to get script type
        parsed_url = urlparse(self.path)
        query_params = parse_qs(parsed_url.query)
        script_type = query_params.get('type', ['signin'])[0]
        
        # Set headers
        self.send_response(200)
        self.send_header('Content-Type', 'application/javascript')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        # Get Firebase config from environment
        firebase_config = {
            'apiKey': os.environ.get('NEXT_PUBLIC_FIREBASE_API_KEY'),
            'authDomain': os.environ.get('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
            'projectId': os.environ.get('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
            'storageBucket': os.environ.get('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
            'messagingSenderId': os.environ.get('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
            'appId': os.environ.get('NEXT_PUBLIC_FIREBASE_APP_ID'),
            'measurementId': os.environ.get('NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID')
        }
        
        # Generate complete JavaScript based on type
        js_content = self.generate_script(script_type, firebase_config)
        self.wfile.write(js_content.encode('utf-8'))
    
    def generate_script(self, script_type, config):
        # Base Firebase initialization
        base_js = f"""
// Firebase configuration
const firebaseConfig = {str(config).replace("'", '"')};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
"""
        
        if script_type == 'signin':
            return base_js + self.get_signin_script()
        elif script_type == 'signup':
            return base_js + self.get_signup_script()
        elif script_type == 'forgot-password':
            return base_js + self.get_forgot_password_script()
        elif script_type == 'reset-password':
            return base_js + self.get_reset_password_script()
        else:
            return base_js + "console.log('Unknown script type');"
    
    def get_signin_script(self):
        return """
// Get elements
const signinForm = document.getElementById('signin-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const togglePasswordBtn = document.getElementById('toggle-password');
const alertDiv = document.getElementById('alert');
const rememberMeCheckbox = document.getElementById('remember-me');

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

// Sign in with email and password
if (signinForm) {
    signinForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const email = emailInput.value;
        const password = passwordInput.value;
        
        if (!email || !password) {
            showAlert('Please enter both email and password', 'error');
            return;
        }
        
        const persistence = rememberMeCheckbox && rememberMeCheckbox.checked 
            ? firebase.auth.Auth.Persistence.LOCAL 
            : firebase.auth.Auth.Persistence.SESSION;

        firebase.auth().setPersistence(persistence)
            .then(() => {
                return firebase.auth().signInWithEmailAndPassword(email, password);
            })
            .then((userCredential) => {
                showAlert('Signed in successfully!', 'success');
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 1500);
            })
            .catch((error) => {
                const errorCode = error.code;
                let errorMessage = '';
                
                switch (errorCode) {
                    case 'auth/invalid-email':
                        errorMessage = 'Invalid email address format.';
                        break;
                    case 'auth/user-disabled':
                        errorMessage = 'This account has been disabled.';
                        break;
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                        errorMessage = 'Invalid email or password.';
                        break;
                    default:
                        errorMessage = 'An error occurred during sign in. Please try again.';
                }
                
                showAlert(errorMessage, 'error');
                console.error(error);
            });
    });
}

// Sign in with Google
function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    
    firebase.auth().signInWithPopup(provider)
        .then((result) => {
            showAlert('Signed in successfully with Google!', 'success');
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1500);
        })
        .catch((error) => {
            showAlert('Google sign-in failed. Please try again.', 'error');
            console.error(error);
        });
}

// Sign in with GitHub
function signInWithGithub() {
    const provider = new firebase.auth.GithubAuthProvider();
    
    firebase.auth().signInWithPopup(provider)
        .then((result) => {
            showAlert('Signed in successfully with GitHub!', 'success');
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1500);
        })
        .catch((error) => {
            showAlert('GitHub sign-in failed. Please try again.', 'error');
            console.error(error);
        });
}

// Show alert message
function showAlert(message, type) {
    if (alertDiv) {
        alertDiv.textContent = message;
        alertDiv.className = `alert alert-${type}`;
        alertDiv.style.display = 'block';
        
        if (type === 'success') {
            setTimeout(() => {
                alertDiv.style.display = 'none';
            }, 3000);
        }
    }
}

// Check if user is already signed in
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        window.location.href = '/dashboard';
    }
});
"""

    def get_signup_script(self):
        return """
// Get elements
const signupForm = document.getElementById('signup-form');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const togglePasswordBtn = document.getElementById('toggle-password');
const passwordStrength = document.getElementById('password-strength');
const strengthValue = document.getElementById('strength-value');
const strengthBar = document.getElementById('strength-meter-bar');
const agreeTerms = document.getElementById('agree-terms');
const alertDiv = document.getElementById('alert');

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

// Check password strength
if (passwordInput) {
    passwordInput.addEventListener('input', function() {
        const password = passwordInput.value;
        
        if (password.length > 0 && passwordStrength) {
            passwordStrength.style.display = 'block';
            
            let strength = 0;
            
            if (password.length >= 8) strength += 1;
            if (/[A-Z]/.test(password)) strength += 1;
            if (/[0-9]/.test(password)) strength += 1;
            if (/[^A-Za-z0-9]/.test(password)) strength += 1;
            
            if (strengthValue && strengthBar) {
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
            }
        } else if (passwordStrength) {
            passwordStrength.style.display = 'none';
        }
    });
}

// Sign up with email and password
if (signupForm) {
    signupForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const name = nameInput ? nameInput.value.trim() : '';
        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';
        const agreedToTerms = agreeTerms ? agreeTerms.checked : false;
        
        if (!name || !email || !password) {
            showAlert('Please fill in all fields', 'error');
            return;
        }
        
        if (!agreedToTerms) {
            showAlert('You must agree to the Terms of Service and Privacy Policy', 'error');
            return;
        }
        
        const submitButton = signupForm.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Creating Account...';
        }
        
        firebase.auth().createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                const user = userCredential.user;
                return user.updateProfile({
                    displayName: name
                });
            })
            .then(() => {
                const currentUser = firebase.auth().currentUser;
                if (firebase.firestore && currentUser) {
                    return firebase.firestore().collection('users').doc(currentUser.uid).set({
                        name: name,
                        email: email,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        emailVerified: false
                    });
                }
                return Promise.resolve();
            })
            .then(() => {
                const user = firebase.auth().currentUser;
                if (user) {
                    return new Promise(resolve => {
                        setTimeout(() => {
                            user.sendEmailVerification()
                                .then(() => {
                                    console.log("Verification email sent successfully");
                                    resolve();
                                })
                                .catch(error => {
                                    console.error("Error sending verification email:", error);
                                    showAlert('Note: We had trouble sending the verification email. You can request it again from the dashboard.', 'warning');
                                    resolve();
                                });
                        }, 2000);
                    });
                }
                return Promise.resolve();
            })
            .then(() => {
                showAlert('Account created successfully! Please check your email for verification.', 'success');
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 3000);
            })
            .catch((error) => {
                const errorCode = error.code;
                let errorMessage = '';
                
                switch (errorCode) {
                    case 'auth/email-already-in-use':
                        errorMessage = 'This email is already in use. Please sign in instead.';
                        break;
                    case 'auth/invalid-email':
                        errorMessage = 'Invalid email address format.';
                        break;
                    case 'auth/weak-password':
                        errorMessage = 'Password is too weak. Please use at least 6 characters.';
                        break;
                    default:
                        errorMessage = 'An error occurred during sign up: ' + error.message;
                }
                
                showAlert(errorMessage, 'error');
                console.error(error);
            })
            .finally(() => {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Create Account';
                }
            });
    });
}

// Sign up with Google
function signUpWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    
    firebase.auth().signInWithPopup(provider)
        .then((result) => {
            const isNewUser = result.additionalUserInfo.isNewUser;
            const user = result.user;
            
            if (isNewUser && firebase.firestore && user) {
                firebase.firestore().collection('users').doc(user.uid).set({
                    name: user.displayName || '',
                    email: user.email,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    signupMethod: 'google'
                })
                .then(() => {
                    showAlert('Account created successfully with Google!', 'success');
                })
                .catch((error) => {
                    console.error("Error saving user data:", error);
                    showAlert('Signed in with Google!', 'success');
                });
            } else {
                showAlert('Signed in successfully with Google!', 'success');
            }
            
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1500);
        })
        .catch((error) => {
            showAlert('Google sign-up failed. Please try again.', 'error');
            console.error(error);
        });
}

// Sign up with GitHub  
function signUpWithGithub() {
    const provider = new firebase.auth.GithubAuthProvider();
    
    firebase.auth().signInWithPopup(provider)
        .then((result) => {
            const isNewUser = result.additionalUserInfo.isNewUser;
            const user = result.user;
            
            if (isNewUser && firebase.firestore && user) {
                firebase.firestore().collection('users').doc(user.uid).set({
                    name: user.displayName || '',
                    email: user.email,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    signupMethod: 'github'
                })
                .then(() => {
                    showAlert('Account created successfully with GitHub!', 'success');
                })
                .catch((error) => {
                    console.error("Error saving user data:", error);
                    showAlert('Signed in with GitHub!', 'success');
                });
            } else {
                showAlert('Signed in successfully with GitHub!', 'success');
            }
            
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1500);
        })
        .catch((error) => {
            showAlert('GitHub sign-up failed. Please try again.', 'error');
            console.error(error);
        });
}

// Show alert message
function showAlert(message, type) {
    if (alertDiv) {
        alertDiv.textContent = message;
        alertDiv.className = `alert alert-${type}`;
        alertDiv.style.display = 'block';
        
        if (type === 'success') {
            setTimeout(() => {
                alertDiv.style.display = 'none';
            }, 3000);
        }
    } else {
        console.log(`${type}: ${message}`);
    }
}
"""

    def get_forgot_password_script(self):
        return """
// Get elements
const resetForm = document.getElementById('reset-form');
const emailInput = document.getElementById('email');
const alertDiv = document.getElementById('alert');
const resetFormContainer = document.getElementById('reset-form-container');
const resetSuccess = document.getElementById('reset-success');

// Reset password form handler
if (resetForm) {
    resetForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const email = emailInput.value.trim();
        
        if (!email) {
            showAlert('Please enter your email address', 'error');
            return;
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showAlert('Please enter a valid email address', 'error');
            return;
        }
        
        const submitButton = resetForm.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = 'Sending...';
        
        const actionCodeSettings = {
            url: 'https://www.yok-ai.com/account',
            handleCodeInApp: true
        };
        
        firebase.auth().sendPasswordResetEmail(email, actionCodeSettings)
            .then(() => {
                resetFormContainer.style.display = 'none';
                resetSuccess.style.display = 'block';
                
                if (firebase.analytics) {
                    firebase.analytics().logEvent('password_reset_email_sent', {
                        email_domain: email.split('@')[1]
                    });
                }
            })
            .catch((error) => {
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
                    default:
                        errorMessage = 'An error occurred. Please try again.';
                }
                
                showAlert(errorMessage, 'error');
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
        
        if (type === 'success') {
            setTimeout(() => {
                alertDiv.style.display = 'none';
            }, 3000);
        }
        
        alertDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Back to Sign In button functionality
document.addEventListener('DOMContentLoaded', () => {
    const backToSignInBtn = document.querySelector('#reset-success .btn-primary');
    if (backToSignInBtn) {
        backToSignInBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '/signin';
        });
    }
});
"""

    def get_reset_password_script(self):
        return """
// Get elements and URL parameters
const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode');
const actionCode = urlParams.get('oobCode');
const continueUrl = urlParams.get('continueUrl') || '/dashboard';
let email = '';

const loadingContainer = document.getElementById('loading-container');
const resetFormContainer = document.getElementById('reset-form-container');
const verifyEmailContainer = document.getElementById('verify-email-container');
const resultSuccess = document.getElementById('result-success');
const errorContainer = document.getElementById('error-container');
const resetForm = document.getElementById('reset-form');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirm-password');
const alertDiv = document.getElementById('alert');

// Main function to handle different modes
function handleAction() {
    if (!actionCode) {
        window.location.href = '/signin';
        return;
    }

    switch (mode) {
        case 'resetPassword':
            handleResetPassword();
            break;
        case 'verifyEmail':
            handleVerifyEmail();
            break;
        default:
            handleUnknownMode();
            break;
    }
}

// Handle reset password mode
function handleResetPassword() {
    if (loadingContainer) loadingContainer.style.display = 'none';
    if (resetFormContainer) resetFormContainer.style.display = 'block';

    firebase.auth().verifyPasswordResetCode(actionCode)
        .then((userEmail) => {
            email = userEmail;
        })
        .catch((error) => {
            handleError(error, 'Password Reset Link Error');
        });
}

// Handle email verification mode
function handleVerifyEmail() {
    if (loadingContainer) loadingContainer.style.display = 'none';
    if (verifyEmailContainer) verifyEmailContainer.style.display = 'block';

    firebase.auth().applyActionCode(actionCode)
        .then(() => {
            if (verifyEmailContainer) verifyEmailContainer.style.display = 'none';
            
            const user = firebase.auth().currentUser;
            
            if (user) {
                return user.reload().then(() => {
                    showSuccess(
                        'Email Verified!',
                        'Your email has been successfully verified. You can now access all features of your account.',
                        'Go to Dashboard',
                        continueUrl
                    );
                });
            } else {
                showSuccess(
                    'Email Verified!',
                    'Your email has been successfully verified. Please sign in to access your account.',
                    'Sign In',
                    '/signin'
                );
            }
        })
        .catch((error) => {
            handleError(error, 'Email Verification Error');
        });
}

// Handle unknown mode
function handleUnknownMode() {
    firebase.auth().verifyPasswordResetCode(actionCode)
        .then((userEmail) => {
            email = userEmail;
            if (loadingContainer) loadingContainer.style.display = 'none';
            if (resetFormContainer) resetFormContainer.style.display = 'block';
        })
        .catch((error) => {
            firebase.auth().checkActionCode(actionCode)
                .then((actionCodeInfo) => {
                    if (actionCodeInfo.operation === 'VERIFY_EMAIL') {
                        if (loadingContainer) loadingContainer.style.display = 'none';
                        if (verifyEmailContainer) verifyEmailContainer.style.display = 'block';
                        
                        firebase.auth().applyActionCode(actionCode)
                            .then(() => {
                                if (verifyEmailContainer) verifyEmailContainer.style.display = 'none';
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
                        handleError({
                            code: 'auth/invalid-action',
                            message: 'The action code is invalid or expired.'
                        }, 'Invalid Link');
                    }
                })
                .catch((error) => {
                    handleError(error, 'Invalid Link');
                });
        });
}

// Handle password reset form submission
if (resetForm) {
    resetForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const newPassword = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        
        if (!newPassword || !confirmPassword) {
            showAlert('Please fill in all fields', 'error');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            showAlert('Passwords do not match', 'error');
            return;
        }
        
        if (newPassword.length < 8) {
            showAlert('Password must be at least 8 characters long', 'error');
            return;
        }
        
        const submitButton = resetForm.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.innerHTML = '<div class="spinner"></div> Processing...';
        
        firebase.auth().confirmPasswordReset(actionCode, newPassword)
            .then(() => {
                if (resetFormContainer) resetFormContainer.style.display = 'none';
                
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
                            showSuccess(
                                'Password Reset Successful!', 
                                'Your password has been reset successfully. Please sign in with your new password.',
                                'Go to Sign In',
                                '/signin'
                            );
                            return Promise.resolve();
                        });
                } else {
                    showSuccess(
                        'Password Reset Successful!', 
                        'Your password has been reset successfully. Please sign in with your new password.',
                        'Go to Sign In',
                        '/signin'
                    );
                    return Promise.resolve();
                }
            })
            .catch((error) => {
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText;
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
        
        if (type === 'success') {
            setTimeout(() => {
                alertElement.style.display = 'none';
            }, 3000);
        }
        
        alertElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Show success screen
function showSuccess(title, message, buttonText, buttonHref) {
    const successTitle = document.getElementById('success-title');
    const successMessage = document.getElementById('success-message');
    const successButton = document.getElementById('success-button');
    
    if (loadingContainer) loadingContainer.style.display = 'none';
    if (resetFormContainer) resetFormContainer.style.display = 'none';
    if (verifyEmailContainer) verifyEmailContainer.style.display = 'none';
    if (errorContainer) errorContainer.style.display = 'none';
    
    if (successTitle) successTitle.textContent = title;
    if (successMessage) successMessage.textContent = message;
    if (successButton) {
        successButton.textContent = buttonText;
        successButton.href = buttonHref;
    }
    
    if (resultSuccess) resultSuccess.style.display = 'block';
}

// Handle errors
function handleError(error, errorType) {
    const errorTitle = document.getElementById('error-title');
    const errorMessage = document.getElementById('error-message');
    
    if (loadingContainer) loadingContainer.style.display = 'none';
    if (resetFormContainer) resetFormContainer.style.display = 'none';
    if (verifyEmailContainer) verifyEmailContainer.style.display = 'none';
    if (resultSuccess) resultSuccess.style.display = 'none';
    
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
    
    if (errorTitle) errorTitle.textContent = errorType;
    if (errorMessage) errorMessage.textContent = errorMsg;
    if (errorContainer) errorContainer.style.display = 'block';
}

// Initialize the page
handleAction();
"""