// Configuration
// Replace with values from your sandbox account
const CONFIG = {
    clientToken: "test_164332024f472fd8e2fe8c44d48", // Replace with your actual client token
    prices: {
      starter: {
        month: "pri_01jsw881b64y680g737k4dx7fm" // Replace with your price ID
      },
      pro: {
        month: "pri_01jsw8ab6sd8bw2h7epy8tcp14" // Replace with your price ID
      },
      enterprise: {
        month: "pri_01jsw8dtn4araas7xez8e24mdh", // Replace with your price ID
        year: "your_enterprise_yearly_price_id" // Replace with your price ID
      }
    }
  };
  
 
  
  // State
  let currentBillingCycle = "month";
  let paddleInitialized = false;
  
  // Initialize Paddle
  function initializePaddle() {
    try {
      Paddle.Environment.set("sandbox");
      Paddle.Initialize({
        token: CONFIG.clientToken,
        eventCallback: function (event) {
          console.log("Paddle event:", event);
        }
      });
      paddleInitialized = true;
      updatePrices();
    } catch (error) {
      console.error("Initialization error:", error);
    }
  }
  
  // Open checkout
  function openCheckout(plan) {
    if (!paddleInitialized) {
      console.log("Paddle not initialized yet");
      return;
    }
  
    try {
      // For Starter and Pro, always use monthly pricing
      // For Enterprise, use the currently selected billing cycle
      const priceId = plan === "enterprise" 
        ? CONFIG.prices[plan][currentBillingCycle]
        : CONFIG.prices[plan].month;
      
      Paddle.Checkout.open({
        items: [
          {
            priceId: priceId,
            quantity: 1
          }
        ],
        settings: {
          theme: "light",
          displayMode: "overlay",
          variant: "one-page"
        }
      });
    } catch (error) {
      console.error(`Checkout error: ${error.message}`);
    }
  }
  
  
  // Initialize on page load
  document.addEventListener("DOMContentLoaded", initializePaddle);