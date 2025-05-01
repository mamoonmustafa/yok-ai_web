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
const signinForm = document.getElementById('signin-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const togglePasswordBtn = document.getElementById('toggle-password');
const alertDiv = document.getElementById('alert');
const rememberMeCheckbox = document.getElementById('remember-me');

// Toggle password visibility
togglePasswordBtn.addEventListener('click', function() {
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        togglePasswordBtn.innerHTML = '<i class="far fa-eye-slash"></i>';
    } else {
        passwordInput.type = 'password';
        togglePasswordBtn.innerHTML = '<i class="far fa-eye"></i>';
    }
});

// Sign in with email and password
signinForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const email = emailInput.value;
    const password = passwordInput.value;
    
    // Validate input fields
    if (!email || !password) {
        showAlert('Please enter both email and password', 'error');
        return;
    }
    
    // Set persistence based on "Remember me" checkbox
    const persistence = rememberMeCheckbox && rememberMeCheckbox.checked 
        ? firebase.auth.Auth.Persistence.LOCAL 
        : firebase.auth.Auth.Persistence.SESSION;

    firebase.auth().setPersistence(persistence)
        .then(() => {
            // Sign in with Firebase
            return firebase.auth().signInWithEmailAndPassword(email, password);
        })
        .then((userCredential) => {
            // Signed in successfully
            const user = userCredential.user;
            showAlert('Signed in successfully!', 'success');
            
            // Redirect to dashboard after short delay
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1500);
        })
        .catch((error) => {
            // Handle errors
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

// Sign in with Google
function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    
    firebase.auth().signInWithPopup(provider)
        .then((result) => {
            // Handle success
            showAlert('Signed in successfully with Google!', 'success');
            
            // Redirect to dashboard after short delay
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1500);
        })
        .catch((error) => {
            // Handle errors
            showAlert('Google sign-in failed. Please try again.', 'error');
            console.error(error);
        });
}

// Sign in with GitHub
function signInWithGithub() {
    const provider = new firebase.auth.GithubAuthProvider();
    
    firebase.auth().signInWithPopup(provider)
        .then((result) => {
            // Handle success
            showAlert('Signed in successfully with GitHub!', 'success');
            
            // Redirect to dashboard after short delay
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1500);
        })
        .catch((error) => {
            // Handle errors
            showAlert('GitHub sign-in failed. Please try again.', 'error');
            console.error(error);
        });
}

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
}

// Check if user is already signed in
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        // User is signed in, redirect to dashboard
        window.location.href = '/dashboard';
    }
});