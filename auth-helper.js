/**
 * Yok-AI Authentication Helper Utilities
 * A collection of utility functions for handling authentication tasks
 */

// Firebase configuration - Replace with your actual Firebase config
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "your-project-id.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

/**
 * Initialize Firebase services
 * If Firebase is already initialized, this will not re-initialize
 */
function initializeFirebase() {
    // Check if Firebase is already initialized
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    
    return {
        auth: firebase.auth(),
        firestore: firebase.firestore(),
        analytics: firebase.analytics && firebase.analytics()
    };
}

/**
 * Check if a user is authenticated
 * @param {function} onAuthenticated - Callback when user is authenticated
 * @param {function} onUnauthenticated - Callback when user is not authenticated
 * @param {string} redirectUrl - URL to redirect to if user is not authenticated
 */
function checkAuth(onAuthenticated, onUnauthenticated, redirectUrl = '/signin') {
    const { auth } = initializeFirebase();
    
    auth.onAuthStateChanged((user) => {
        if (user) {
            // User is signed in
            if (typeof onAuthenticated === 'function') {
                onAuthenticated(user);
            }
        } else {
            // User is not signed in
            if (typeof onUnauthenticated === 'function') {
                onUnauthenticated();
            } else if (redirectUrl) {
                window.location.href = redirectUrl;
            }
        }
    });
}

/**
 * Sign out the current user
 * @param {string} redirectUrl - URL to redirect to after sign out
 */
function signOut(redirectUrl = '/signin') {
    const { auth } = initializeFirebase();
    
    auth.signOut()
        .then(() => {
            console.log('User signed out successfully');
            if (redirectUrl) {
                window.location.href = redirectUrl;
            }
        })
        .catch((error) => {
            console.error('Sign out error:', error);
        });
}

/**
 * Get the current user profile data including Firestore data
 * @param {function} callback - Function to call with user data
 */
function getCurrentUserProfile(callback) {
    const { auth, firestore } = initializeFirebase();
    const user = auth.currentUser;
    
    if (!user) {
        callback(null);
        return;
    }
    
    // Basic auth data
    const profile = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        emailVerified: user.emailVerified,
        providerData: user.providerData,
        lastSignInTime: user.metadata.lastSignInTime,
        creationTime: user.metadata.creationTime
    };
    
    // Get additional data from Firestore if available
    firestore.collection('users').doc(user.uid).get()
        .then((doc) => {
            if (doc.exists) {
                profile.userData = doc.data();
            }
            callback(profile);
        })
        .catch((error) => {
            console.error('Error getting user data:', error);
            callback(profile); // Return basic profile anyway
        });
}

/**
 * Update user profile data
 * @param {Object} profileData - Object containing profile fields to update
 * @param {function} callback - Callback function after update
 */
function updateUserProfile(profileData, callback) {
    const { auth, firestore } = initializeFirebase();
    const user = auth.currentUser;
    
    if (!user) {
        callback({
            success: false,
            error: 'No user is signed in'
        });
        return;
    }
    
    // Data to update in Auth profile
    const authUpdate = {};
    if (profileData.displayName) authUpdate.displayName = profileData.displayName;
    if (profileData.photoURL) authUpdate.photoURL = profileData.photoURL;
    
    // Data to update in Firestore
    const firestoreUpdate = { ...profileData };
    // Remove fields that are updated in Auth
    delete firestoreUpdate.displayName;
    delete firestoreUpdate.photoURL;
    
    // Update timestamp
    firestoreUpdate.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    
    // First update Auth profile if needed
    const authPromise = Object.keys(authUpdate).length > 0 
        ? user.updateProfile(authUpdate) 
        : Promise.resolve();
    
    // Then update Firestore profile if needed
    authPromise
        .then(() => {
            if (Object.keys(firestoreUpdate).length > 0) {
                return firestore.collection('users').doc(user.uid).update(firestoreUpdate);
            }
            return Promise.resolve();
        })
        .then(() => {
            callback({
                success: true,
                message: 'Profile updated successfully'
            });
        })
        .catch((error) => {
            console.error('Error updating profile:', error);
            callback({
                success: false,
                error: error.message
            });
        });
}

/**
 * Change user password
 * @param {string} currentPassword - Current password for verification
 * @param {string} newPassword - New password to set
 * @param {function} callback - Callback function after password change
 */
function changePassword(currentPassword, newPassword, callback) {
    const { auth } = initializeFirebase();
    const user = auth.currentUser;
    
    if (!user) {
        callback({
            success: false,
            error: 'No user is signed in'
        });
        return;
    }
    
    // Get credentials with current password
    const credential = firebase.auth.EmailAuthProvider.credential(
        user.email,
        currentPassword
    );
    
    // Reauthenticate
    user.reauthenticateWithCredential(credential)
        .then(() => {
            // Change password
            return user.updatePassword(newPassword);
        })
        .then(() => {
            callback({
                success: true,
                message: 'Password changed successfully'
            });
        })
        .catch((error) => {
            console.error('Error changing password:', error);
            
            let errorMessage = 'Failed to change password';
            
            if (error.code === 'auth/wrong-password') {
                errorMessage = 'Current password is incorrect';
            } else if (error.code === 'auth/weak-password') {
                errorMessage = 'New password is too weak';
            }
            
            callback({
                success: false,
                error: errorMessage
            });
        });
}

/**
 * Send password reset email
 * @param {string} email - Email address to send reset link to
 * @param {function} callback - Callback function after sending email
 */
function sendPasswordResetEmail(email, callback) {
    const { auth } = initializeFirebase();
    
    auth.sendPasswordResetEmail(email)
        .then(() => {
            callback({
                success: true,
                message: 'Password reset email sent successfully'
            });
        })
        .catch((error) => {
            console.error('Error sending password reset email:', error);
            
            let errorMessage = 'Failed to send password reset email';
            
            if (error.code === 'auth/user-not-found') {
                errorMessage = 'No account found with this email address';
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = 'Invalid email address format';
            }
            
            callback({
                success: false,
                error: errorMessage
            });
        });
}

/**
 * Send email verification
 * @param {function} callback - Callback function after sending verification email
 */
function sendEmailVerification(callback) {
    const { auth } = initializeFirebase();
    const user = auth.currentUser;
    
    if (!user) {
        callback({
            success: false,
            error: 'No user is signed in'
        });
        return;
    }
    
    user.sendEmailVerification()
        .then(() => {
            callback({
                success: true,
                message: 'Verification email sent successfully'
            });
        })
        .catch((error) => {
            console.error('Error sending verification email:', error);
            callback({
                success: false,
                error: error.message
            });
        });
}

/**
 * Delete user account
 * @param {string} password - Current password for verification (only needed for email/password auth)
 * @param {function} callback - Callback function after deletion
 */
function deleteAccount(password, callback) {
    const { auth, firestore } = initializeFirebase();
    const user = auth.currentUser;
    
    if (!user) {
        callback({
            success: false,
            error: 'No user is signed in'
        });
        return;
    }
    
    // Prepare for reauthentication if needed
    let reauthPromise;
    
    // Check if user is using email/password authentication
    const emailProvider = user.providerData.find(
        provider => provider.providerId === 'password'
    );
    
    if (emailProvider && password) {
        // Email/password auth requires reauthentication
        const credential = firebase.auth.EmailAuthProvider.credential(
            user.email,
            password
        );
        reauthPromise = user.reauthenticateWithCredential(credential);
    } else {
        // No reauthentication needed for other providers
        reauthPromise = Promise.resolve();
    }
    
    // First delete user data from Firestore
    reauthPromise
        .then(() => {
            return firestore.collection('users').doc(user.uid).delete();
        })
        .then(() => {
            // Then delete the user account
            return user.delete();
        })
        .then(() => {
            callback({
                success: true,
                message: 'Account deleted successfully'
            });
        })
        .catch((error) => {
            console.error('Error deleting account:', error);
            
            let errorMessage = 'Failed to delete account';
            
            if (error.code === 'auth/wrong-password') {
                errorMessage = 'Password is incorrect';
            } else if (error.code === 'auth/requires-recent-login') {
                errorMessage = 'Please sign in again before deleting your account';
            }
            
            callback({
                success: false,
                error: errorMessage
            });
        });
}

// Export utilities for use in other files
const YokAIAuth = {
    initializeFirebase,
    checkAuth,
    signOut,
    getCurrentUserProfile,
    updateUserProfile,
    changePassword,
    sendPasswordResetEmail,
    sendEmailVerification,
    deleteAccount
};

// Make available globally if needed
window.YokAIAuth = YokAIAuth;