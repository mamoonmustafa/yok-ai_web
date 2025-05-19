// Google Analytics setup - replace UA-XXXXXXXX-X with your actual tracking ID once you have it
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-ZDPR66VLKK');

// Event tracking function
function trackEvent(category, action, label) {
  if (typeof gtag !== 'undefined') {
    gtag('event', action, {
      'event_category': category,
      'event_label': label
    });
  }
}

// Page view tracking
document.addEventListener('DOMContentLoaded', function() {
  // Track CTA button clicks
  const ctaButtons = document.querySelectorAll('.btn-primary');
  ctaButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      trackEvent('CTA', 'click', this.textContent.trim());
    });
  });
});