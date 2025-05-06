const crypto = require('crypto');
const admin = require('firebase-admin');

// Initialize Firebase (only once)
let firebaseInitialized = false;
const initializeFirebase = () => {
  if (firebaseInitialized || admin.apps.length > 0) return true;
  
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseInitialized = true;
    return true;
  } catch (error) {
    console.error("Firebase initialization error:", error);
    return false;
  }
};

// Verify Paddle signature
const verifyWebhookSignature = (data, signature, timestamp) => {
  try {
    const payload = `${timestamp}.${JSON.stringify(data)}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.PADDLE_WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
};

// Generate license key
const generateLicenseKey = () => {
  return require('crypto').randomUUID().toUpperCase().replace(/-/g, '-');
};

// Credit allocation based on plan
const determineCreditAllocation = (priceId) => {
  const creditMap = {
    "pri_01jsw881b64y680g737k4dx7fm": 100,  // Starter plan
    "pri_01jsw8ab6sd8bw2h7epy8tcp14": 500,  // Pro plan
    "pri_01jsw8dtn4araas7xez8e24mdh": 2000, // Enterprise plan
  };
  
  return creditMap[priceId] || 0;
};

// Handler function
module.exports = async (req, res) => {
  console.log("Paddle webhook received");
  
  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Get webhook data
    const webhookData = req.body;
    const signature = req.headers['paddle-signature'];
    const timestamp = req.headers['paddle-timestamp'];
    
    console.log(`Webhook: Event=${webhookData.event_type}, Signature=${signature?.substring(0, 10)}...`);
    
    // Verify signature
    if (!signature || !timestamp || !verifyWebhookSignature(webhookData, signature, timestamp)) {
      console.error("Invalid signature");
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    // Initialize Firebase
    if (!initializeFirebase()) {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to initialize Firebase' 
      });
    }
    
    // Process webhook based on event type
    const eventType = webhookData.event_type;
    const eventData = webhookData.data;
    
    if (eventType === 'subscription.created') {
      // Extract necessary data
      const subscriptionId = eventData.id;
      const customerId = eventData.customer_id;
      const customerEmail = eventData.customer?.email;
      
      // Get price ID
      let priceId = null;
      if (eventData.items && eventData.items.length > 0) {
        priceId = eventData.items[0].price?.id;
      }
      
      // Generate license key
      const licenseKey = generateLicenseKey();
      
      // Get user ID from custom data
      const customData = eventData.custom_data || {};
      const userId = customData.userId;
      
      // Create subscription data
      const subscriptionData = {
        id: subscriptionId,
        status: 'active',
        active: true,
        plan: {
          id: priceId,
          name: eventData.items?.[0]?.price?.description || 'Unknown Plan'
        },
        customer_id: customerId,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        next_billing_date: eventData.next_billed_at,
        license_key: licenseKey
      };
      
      // Calculate credit allocation
      const creditAllocation = determineCreditAllocation(priceId);
      
      // Get Firestore
      const db = admin.firestore();
      
      if (userId) {
        // Associate with Firebase user ID from custom data
        try {
          // Update the user document with subscription data
          await db.collection('users').doc(userId).update({
            subscription: subscriptionData,
            creditUsage: {
              used: 0,
              total: creditAllocation
            },
            licenseKey: licenseKey
          });
          
          console.log(`Subscription ${subscriptionId} associated with Firebase user ${userId}`);
        } catch (error) {
          console.error(`Error updating user ${userId} with subscription data:`, error);
        }
      } else {
        // Fallback to email-based association if userId is not present
        try {
          // Find the user with this email in Firestore
          const usersRef = db.collection('users');
          const query = await usersRef.where('email', '==', customerEmail).limit(1).get();
          
          if (query.empty) {
            console.log(`No user found with email ${customerEmail}`);
          } else {
            const userDoc = query.docs[0];
            const foundUserId = userDoc.id;
            
            // Update the user with subscription data
            await db.collection('users').doc(foundUserId).update({
              subscription: subscriptionData,
              creditUsage: {
                used: 0,
                total: creditAllocation
              },
              licenseKey: licenseKey
            });
            
            console.log(`Subscription ${subscriptionId} associated with user ${foundUserId} by email ${customerEmail}`);
          }
        } catch (error) {
          console.error(`Error finding user by email ${customerEmail}:`, error);
        }
      }
      
      console.log(`Created license key ${licenseKey} for subscription ${subscriptionId}, customer ${customerEmail}`);
    } 
    else if (eventType === 'subscription.updated') {
      // Extract data
      const subscriptionId = eventData.id;
      const status = eventData.status;
      
      // Get custom data from the event for user identification
      const customData = eventData.custom_data || {};
      const userId = customData.userId;
      
      // Get customer email
      const customerEmail = eventData.customer?.email;
      
      // Get Firestore database
      const db = admin.firestore();
      
      // Determine if subscription is active
      const isActive = ['active', 'trialing', 'past_due'].includes(status.toLowerCase());
      
      if (userId) {
        // Update subscription status for user by ID
        try {
          await db.collection('users').doc(userId).update({
            'subscription.status': status,
            'subscription.active': isActive,  // Update active flag
            'updatedAt': admin.firestore.FieldValue.serverTimestamp()
          });
          console.log(`Updated subscription ${subscriptionId} status to ${status} for user ${userId}`);
        } catch (error) {
          console.error(`Error updating subscription status for user ${userId}:`, error);
        }
      } else {
        // Find user by email
        try {
          const usersRef = db.collection('users');
          const query = await usersRef.where('email', '==', customerEmail).limit(1).get();
          
          if (!query.empty) {
            const userDoc = query.docs[0];
            const foundUserId = userDoc.id;
            
            await db.collection('users').doc(foundUserId).update({
              'subscription.status': status,
              'subscription.active': isActive,  // Update active flag
              'updatedAt': admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`Updated subscription ${subscriptionId} status to ${status} for user ${foundUserId} by email`);
          }
        } catch (error) {
          console.error(`Error finding user by email ${customerEmail}:`, error);
        }
      }
      
      // Log the event
      console.log(`Subscription ${subscriptionId} updated with status ${status}`);
    }
    else if (eventType === 'subscription.cancelled') {
      // Extract data
      const subscriptionId = eventData.id;
      
      // Get custom data from the event for user identification
      const customData = eventData.custom_data || {};
      const userId = customData.userId;
      
      // Get customer email
      const customerEmail = eventData.customer?.email;
      
      // Get Firestore database
      const db = admin.firestore();
      
      if (userId) {
        // Update subscription status for user by ID
        try {
          await db.collection('users').doc(userId).update({
            'subscription.status': 'cancelled',
            'subscription.active': false,  // Set active flag to false
            'updatedAt': admin.firestore.FieldValue.serverTimestamp()
          });
          console.log(`Marked subscription ${subscriptionId} as cancelled for user ${userId}`);
        } catch (error) {
          console.error(`Error updating subscription status for user ${userId}:`, error);
        }
      } else {
        // Find user by email
        try {
          const usersRef = db.collection('users');
          const query = await usersRef.where('email', '==', customerEmail).limit(1).get();
          
          if (!query.empty) {
            const userDoc = query.docs[0];
            const foundUserId = userDoc.id;
            
            await db.collection('users').doc(foundUserId).update({
              'subscription.status': 'cancelled',
              'subscription.active': false,  // Set active flag to false
              'updatedAt': admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`Marked subscription ${subscriptionId} as cancelled for user ${foundUserId} by email`);
          }
        } catch (error) {
          console.error(`Error finding user by email ${customerEmail}:`, error);
        }
      }
      
      // Log the event
      console.log(`Subscription ${subscriptionId} cancelled`);
    }
    
    // Return success response
    return res.status(200).json({
      success: true,
      event_processed: eventType
    });
    
  } catch (error) {
    console.error("Webhook processing error:", error);
    
    // Still return 200 to acknowledge receipt (Paddle will retry otherwise)
    return res.status(200).json({
      success: false,
      error: error.message
    });
  }
};