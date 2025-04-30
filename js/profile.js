/**
 * Yok-AI Dashboard - Profile Module
 * Handles user profile management and settings
 */

// Initialize Profile module
const Profile = (() => {
    // Private variables
    let currentUser = null;
    let profileData = null;
    
    // DOM Elements
    const profileForm = document.getElementById('profile-form');
    const profileName = document.getElementById('profile-name');
    const profileEmail = document.getElementById('profile-email');
    const profileCompany = document.getElementById('profile-company');
    const profileRole = document.getElementById('profile-role');
    
    const passwordForm = document.getElementById('password-form');
    const currentPassword = document.getElementById('current-password');
    const newPassword = document.getElementById('new-password');
    const confirmPassword = document.getElementById('confirm-password');
    
    /**
     * Initialize profile functionality
     */
    function init() {
        // Load profile data when auth state changes
        EventBus.on('auth:user-authenticated', (user) => {
            currentUser = user;
            loadProfileData();
        });
        
        // Reload profile data when switching to profile section
        EventBus.on('dashboard:section-changed', (sectionId) => {
            if (sectionId === 'profile-section') {
                loadProfileData();
            }
        });
        
        // Bind form submission events
        if (profileForm) {
            profileForm.addEventListener('submit', updateProfile);
        }
        
        if (passwordForm) {
            passwordForm.addEventListener('submit', updatePassword);
        }
    }
    
    /**
     * Load profile data from Firebase
     */
    function loadProfileData() {
        if (!currentUser) return;
        
        // Show loading state
        setFormLoading(true);
        
        // Get user data from Firestore
        const db = firebase.firestore();
        
        db.collection('users').doc(currentUser.uid).get()
            .then(doc => {
                if (doc.exists) {
                    profileData = doc.data();
                    
                    // Populate form fields
                    populateProfileForm(profileData);
                } else {
                    // User document doesn't exist, create it
                    return createUserDocument(currentUser);
                }
            })
            .catch(error => {
                console.error('Error loading profile data:', error);
                Dashboard.showToast('Error loading profile data', 'error');
            })
            .finally(() => {
                setFormLoading(false);
            });
    }
    
    /**
     * Create user document in Firestore
     */
    function createUserDocument(user) {
        const db = firebase.firestore();
        
        const userData = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || '',
            emailVerified: user.emailVerified,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        return db.collection('users').doc(user.uid).set(userData)
            .then(() => {
                profileData = userData;
                populateProfileForm(profileData);
            })
            .catch(error => {
                console.error('Error creating user document:', error);
                Dashboard.showToast('Error creating profile', 'error');
            });
    }
    
    /**
     * Populate profile form with user data
     */
    function populateProfileForm(data) {
        if (!profileName || !profileEmail) return;
        
        // Set email (always from Auth)
        profileEmail.value = currentUser.email;
        
        // Set name
        if (profileName) {
            profileName.value = data.displayName || currentUser.displayName || '';
        }
        
        // Set company
        if (profileCompany) {
            profileCompany.value = data.company || '';
        }
        
        // Set role
        if (profileRole) {
            profileRole.value = data.role || '';
        }
    }
    
    /**
     * Update profile information
     */
    function updateProfile(e) {
        e.preventDefault();
        
        if (!currentUser) {
            Dashboard.showToast('You must be logged in to update your profile', 'error');
            return;
        }
        
        // Get form values
        const name = profileName.value.trim();
        const company = profileCompany ? profileCompany.value.trim() : '';
        const role = profileRole ? profileRole.value.trim() : '';
        
        // Validate
        if (!name) {
            Dashboard.showToast('Name is required', 'error');
            profileName.focus();
            return;
        }
        
        // Show loading state
        setFormLoading(true);
        
        // Update Auth profile first
        currentUser.updateProfile({
            displayName: name
        }).then(() => {
            // Then update Firestore
            const db = firebase.firestore();
            
            return db.collection('users').doc(currentUser.uid).update({
                displayName: name,
                company: company,
                role: role,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }).then(() => {
            // Update successful
            Dashboard.showToast('Profile updated successfully', 'success');
            
            // Update UI with new name
            const userNameElement = document.getElementById('user-name');
            const userInitialsElement = document.getElementById('user-initials');
            
            if (userNameElement) {
                userNameElement.textContent = name;
            }
            
            if (userInitialsElement) {
                userInitialsElement.textContent = Utils.getInitials(name);
            }
        }).catch(error => {
            console.error('Error updating profile:', error);
            Dashboard.showToast('Error updating profile', 'error');
        }).finally(() => {
            setFormLoading(false);
        });
    }
    
    /**
     * Update password
     */
    function updatePassword(e) {
        e.preventDefault();
        
        if (!currentUser) {
            Dashboard.showToast('You must be logged in to change your password', 'error');
            return;
        }
        
        // Get form values
        const current = currentPassword.value;
        const newPass = newPassword.value;
        const confirmPass = confirmPassword.value;
        
        // Validate
        if (!current || !newPass || !confirmPass) {
            Dashboard.showToast('All password fields are required', 'error');
            return;
        }
        
        if (newPass !== confirmPass) {
            Dashboard.showToast('New passwords do not match', 'error');
            confirmPassword.focus();
            return;
        }
        
        // Check password strength
        if (newPass.length < 8) {
            Dashboard.showToast('Password must be at least 8 characters long', 'error');
            newPassword.focus();
            return;
        }
        
        // Show loading state
        setPasswordFormLoading(true);
        
        // Get credentials for reauthentication
        const credential = firebase.auth.EmailAuthProvider.credential(
            currentUser.email,
            current
        );
        
        // Reauthenticate user
        currentUser.reauthenticateWithCredential(credential)
            .then(() => {
                // Then update password
                return currentUser.updatePassword(newPass);
            })
            .then(() => {
                // Password updated successfully
                Dashboard.showToast('Password updated successfully', 'success');
                
                // Clear form
                passwordForm.reset();
            })
            .catch(error => {
                console.error('Error updating password:', error);
                
                // Handle specific errors
                if (error.code === 'auth/wrong-password') {
                    Dashboard.showToast('Current password is incorrect', 'error');
                    currentPassword.focus();
                } else if (error.code === 'auth/weak-password') {
                    Dashboard.showToast('New password is too weak', 'error');
                    newPassword.focus();
                } else {
                    Dashboard.showToast('Error updating password', 'error');
                }
            })
            .finally(() => {
                setPasswordFormLoading(false);
            });
    }
    
    /**
     * Set profile form loading state
     */
    function setFormLoading(isLoading) {
        if (!profileForm) return;
        
        const submitButton = profileForm.querySelector('button[type="submit"]');
        
        if (submitButton) {
            submitButton.disabled = isLoading;
            submitButton.innerHTML = isLoading ? 
                '<i class="fas fa-spinner fa-spin"></i> Updating...' : 
                'Save Changes';
        }
        
        // Disable form fields
        const formFields = profileForm.querySelectorAll('input:not([disabled])');
        formFields.forEach(field => {
            field.disabled = isLoading;
        });
    }
    
    /**
     * Set password form loading state
     */
    function setPasswordFormLoading(isLoading) {
        if (!passwordForm) return;
        
        const submitButton = passwordForm.querySelector('button[type="submit"]');
        
        if (submitButton) {
            submitButton.disabled = isLoading;
            submitButton.innerHTML = isLoading ? 
                '<i class="fas fa-spinner fa-spin"></i> Updating...' : 
                'Update Password';
        }
        
        // Disable form fields
        const formFields = passwordForm.querySelectorAll('input');
        formFields.forEach(field => {
            field.disabled = isLoading;
        });
    }
    
    /**
     * Get profile data
     */
    function getProfileData() {
        return profileData;
    }
    
    // Public API
    return {
        init,
        loadProfileData,
        getProfileData
    };
})();

// Initialize Profile module when document is ready
document.addEventListener('DOMContentLoaded', function() {
    Profile.init();
});