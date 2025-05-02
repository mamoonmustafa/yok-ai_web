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
            
            // Calculate password strength
            let strength = 0;
            
            // Length check
            if (password.length >= 8) {
                strength += 1;
            }
            
            // Character variety checks
            if (/[A-Z]/.test(password)) strength += 1;
            if (/[0-9]/.test(password)) strength += 1;
            if (/[^A-Za-z0-9]/.test(password)) strength += 1;
            
            // Update strength indicator
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
        
        // Check if elements exist before accessing their values
        const name = nameInput ? nameInput.value.trim() : '';
        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';
        const agreedToTerms = agreeTerms ? agreeTerms.checked : false;
        
        // Validate input fields
        if (!name || !email || !password) {
            showAlert('Please fill in all fields', 'error');
            return;
        }
        
        if (!agreedToTerms) {
            showAlert('You must agree to the Terms of Service and Privacy Policy', 'error');
            return;
        }
        
        // Disable the submit button to prevent multiple submissions
        const submitButton = signupForm.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Creating Account...';
        }
        
        // Create user with Firebase
        firebase.auth().createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                console.log("User created successfully");
                // Signed up successfully
                const user = userCredential.user;
                
                // Update profile with name
                return user.updateProfile({
                    displayName: name
                });
            })
            .then(() => {
                console.log("Profile updated successfully");
                // Save additional user data to Firestore if needed
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
                console.log("Attempting to send verification email");
                // Send email verification - this is the critical part
                const user = firebase.auth().currentUser;
                if (user) {
                    // Wait a moment before sending verification email
                    // (sometimes sending immediately after creation can fail)
                    return new Promise(resolve => {
                        setTimeout(() => {
                            user.sendEmailVerification({
                                url: window.location.origin + '/signin'
                            })
                            .then(() => {
                                console.log("Verification email sent successfully");
                                resolve();
                            })
                            .catch(error => {
                                console.error("Error sending verification email:", error);
                                // We'll continue even if this fails
                                resolve();
                            });
                        }, 1000);
                    });
                }
                return Promise.resolve();
            })
            .then(() => {
                showAlert('Account created successfully! Please check your email for verification. If you don\'t see it, check your spam folder.', 'success');
                
                // Redirect to dashboard after short delay
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 3000); // Increased delay to give user time to read the message
            })
            .catch((error) => {
                // Handle errors
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
                // Re-enable the submit button
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
            // Handle success
            const isNewUser = result.additionalUserInfo.isNewUser;
            const user = result.user;
            
            if (isNewUser && firebase.firestore && user) {
                // Save user data to Firestore for new users
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
            
            // Redirect to dashboard after short delay
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1500);
        })
        .catch((error) => {
            // Handle errors
            showAlert('Google sign-up failed. Please try again.', 'error');
            console.error(error);
        });
}

// Sign up with GitHub
function signUpWithGithub() {
    const provider = new firebase.auth.GithubAuthProvider();
    
    firebase.auth().signInWithPopup(provider)
        .then((result) => {
            // Handle success
            const isNewUser = result.additionalUserInfo.isNewUser;
            const user = result.user;
            
            if (isNewUser && firebase.firestore && user) {
                // Save user data to Firestore for new users
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
            
            // Redirect to dashboard after short delay
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1500);
        })
        .catch((error) => {
            // Handle errors
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
        
        // Auto-hide success alerts after 3 seconds
        if (type === 'success') {
            setTimeout(() => {
                alertDiv.style.display = 'none';
            }, 3000);
        }
    } else {
        console.log(`${type}: ${message}`);
    }
}

// Check if user is already signed in
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        // User is signed in, redirect to dashboard
        window.location.href = '/dashboard';
    }
});