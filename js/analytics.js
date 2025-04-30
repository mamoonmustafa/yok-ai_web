/**
 * Yok-AI Dashboard - Analytics Module
 * Handles usage analytics, data visualization, and reporting
 */

// Initialize Analytics module
const Analytics = (() => {
    // Private variables
    let usageData = null;
    let usageChart = null;
    
    /**
     * Initialize analytics functionality
     */
    function init() {
        // Load analytics data when dashboard is ready
        document.addEventListener('DOMContentLoaded', () => {
            loadAnalyticsData();
        });
        
        // Load analytics when switching to dashboard section
        EventBus.on('dashboard:section-changed', (sectionId) => {
            if (sectionId === 'dashboard-section') {
                loadAnalyticsData();
            }
        });
    }
    
    /**
     * Load analytics data from Firebase
     */
    function loadAnalyticsData() {
        const user = firebase.auth().currentUser;
        if (!user) return Promise.reject('User not authenticated');
        
        return new Promise((resolve, reject) => {
            // Get analytics data from Firestore
            const db = firebase.firestore();
            
            db.collection('users').doc(user.uid).collection('analytics')
                .orderBy('date', 'asc')
                .limit(30)
                .get()
                .then(snapshot => {
                    if (snapshot.empty) {
                        // No analytics data, generate sample data
                        usageData = generateSampleData();
                    } else {
                        // Process analytics data
                        usageData = [];
                        snapshot.forEach(doc => {
                            usageData.push(doc.data());
                        });
                    }
                    
                    // Render usage chart if we're on the dashboard section
                    if (document.getElementById('dashboard-section').classList.contains('active')) {
                        renderUsageChart('usage-chart');
                    }
                    
                    resolve(usageData);
                })
                .catch(error => {
                    console.error('Error loading analytics data:', error);
                    
                    // Generate sample data on error
                    usageData = generateSampleData();
                    
                    // Still render the chart
                    if (document.getElementById('dashboard-section').classList.contains('active')) {
                        renderUsageChart('usage-chart');
                    }
                    
                    reject(error);
                });
        });
    }
    
    /**
     * Generate sample analytics data for demonstration
     */
    function generateSampleData() {
        const data = [];
        const today = new Date();
        
        // Generate data for the last 30 days
        for (let i = 29; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            
            // Random usage values with a slight upward trend
            const factor = 1 + (30 - i) / 100;
            
            data.push({
                date: date.toISOString().slice(0, 10),
                creditUsed: Math.floor(Math.random() * 10 * factor) + 1,
                apiCalls: Math.floor(Math.random() * 50 * factor) + 5,
                featureUsage: {
                    feature1: Math.floor(Math.random() * 20 * factor),
                    feature2: Math.floor(Math.random() * 15 * factor),
                    feature3: Math.floor(Math.random() * 10 * factor)
                }
            });
        }
        
        return data;
    }
    
    /**
     * Render usage chart
     * @param {string} containerId - ID of the container element
     */
    function renderUsageChart(containerId) {
        const container = document.getElementById(containerId);
        if (!container || !usageData || !window.Chart) return;
        
        // Clear previous chart
        if (usageChart) {
            usageChart.destroy();
        }
        
        // Prepare chart data
        const labels = usageData.map(item => formatDateForChart(item.date));
        const creditData = usageData.map(item => item.creditUsed);
        const apiCallData = usageData.map(item => item.apiCalls);
        
        // Get canvas context
        let canvas = container.querySelector('canvas');
        
        // Create canvas if it doesn't exist
        if (!canvas) {
            canvas = document.createElement('canvas');
            container.innerHTML = '';
            container.appendChild(canvas);
        }
        
        const ctx = canvas.getContext('2d');
        
        // Create chart
        usageChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Credits Used',
                        data: creditData,
                        borderColor: '#0071e3',
                        backgroundColor: 'rgba(0, 113, 227, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true
                    },
                    {
                        label: 'API Calls',
                        data: apiCallData,
                        borderColor: '#34c759',
                        backgroundColor: 'rgba(52, 199, 89, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Credits Used'
                        }
                    },
                    y1: {
                        position: 'right',
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'API Calls'
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    }
                }
            }
        });
        
        return usageChart;
    }
    
    /**
     * Render feature usage chart
     * @param {string} containerId - ID of the container element
     */
    function renderFeatureUsageChart(containerId) {
        const container = document.getElementById(containerId);
        if (!container || !usageData || !window.Chart) return;
        
        // Aggregate feature usage
        const featureUsage = {
            feature1: 0,
            feature2: 0,
            feature3: 0
        };
        
        usageData.forEach(item => {
            if (item.featureUsage) {
                featureUsage.feature1 += item.featureUsage.feature1 || 0;
                featureUsage.feature2 += item.featureUsage.feature2 || 0;
                featureUsage.feature3 += item.featureUsage.feature3 || 0;
            }
        });
        
        // Clear container
        container.innerHTML = '';
        
        // Create canvas
        const canvas = document.createElement('canvas');
        container.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        
        // Create chart
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Feature 1', 'Feature 2', 'Feature 3'],
                datasets: [{
                    data: [
                        featureUsage.feature1,
                        featureUsage.feature2,
                        featureUsage.feature3
                    ],
                    backgroundColor: [
                        '#0071e3',
                        '#34c759',
                        '#ff9500'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right'
                    }
                },
                cutout: '70%'
            }
        });
    }
    
    /**
     * Format date for chart display
     */
    function formatDateForChart(dateString) {
        const date = new Date(dateString);
        const options = { month: 'short', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }
    
    /**
     * Get usage statistics
     */
    function getUsageStats() {
        if (!usageData || usageData.length === 0) {
            return {
                totalCreditsUsed: 0,
                totalApiCalls: 0,
                averageDailyUsage: 0
            };
        }
        
        // Calculate statistics
        const totalCreditsUsed = usageData.reduce((sum, item) => sum + (item.creditUsed || 0), 0);
        const totalApiCalls = usageData.reduce((sum, item) => sum + (item.apiCalls || 0), 0);
        const averageDailyUsage = totalCreditsUsed / usageData.length;
        
        return {
            totalCreditsUsed,
            totalApiCalls,
            averageDailyUsage
        };
    }
    
    /**
     * Calculate usage trend (percentage change)
     */
    function calculateUsageTrend() {
        if (!usageData || usageData.length < 2) {
            return {
                creditUsageTrend: 0,
                apiCallsTrend: 0
            };
        }
        
        // Split data into two periods
        const midpoint = Math.floor(usageData.length / 2);
        const firstPeriod = usageData.slice(0, midpoint);
        const secondPeriod = usageData.slice(midpoint);
        
        // Calculate averages for each period
        const firstPeriodCreditAvg = firstPeriod.reduce((sum, item) => sum + (item.creditUsed || 0), 0) / firstPeriod.length;
        const secondPeriodCreditAvg = secondPeriod.reduce((sum, item) => sum + (item.creditUsed || 0), 0) / secondPeriod.length;
        
        const firstPeriodApiAvg = firstPeriod.reduce((sum, item) => sum + (item.apiCalls || 0), 0) / firstPeriod.length;
        const secondPeriodApiAvg = secondPeriod.reduce((sum, item) => sum + (item.apiCalls || 0), 0) / secondPeriod.length;
        
        // Calculate percentage change
        const creditUsageTrend = firstPeriodCreditAvg === 0 ? 100 : ((secondPeriodCreditAvg - firstPeriodCreditAvg) / firstPeriodCreditAvg) * 100;
        const apiCallsTrend = firstPeriodApiAvg === 0 ? 100 : ((secondPeriodApiAvg - firstPeriodApiAvg) / firstPeriodApiAvg) * 100;
        
        return {
            creditUsageTrend,
            apiCallsTrend
        };
    }
    
    /**
     * Get predicted credit usage for next month
     */
    function predictNextMonthUsage() {
        if (!usageData || usageData.length < 7) {
            return {
                predictedCredits: 0,
                predictedApiCalls: 0
            };
        }
        
        // Use last 7 days for prediction
        const recentData = usageData.slice(-7);
        
        // Calculate daily averages
        const avgDailyCredits = recentData.reduce((sum, item) => sum + (item.creditUsed || 0), 0) / recentData.length;
        const avgDailyApiCalls = recentData.reduce((sum, item) => sum + (item.apiCalls || 0), 0) / recentData.length;
        
        // Predict for next 30 days
        const predictedCredits = Math.round(avgDailyCredits * 30);
        const predictedApiCalls = Math.round(avgDailyApiCalls * 30);
        
        return {
            predictedCredits,
            predictedApiCalls
        };
    }
    
    /**
     * Update credit usage data
     * @param {number} used - Credits used
     * @param {number} total - Total credits
     */
    function updateCreditUsage(used, total) {
        const user = firebase.auth().currentUser;
        if (!user) return Promise.reject('User not authenticated');
        
        // Get today's date
        const today = new Date().toISOString().slice(0, 10);
        
        // Update Firestore with new usage data
        const db = firebase.firestore();
        
        // Get today's analytics document
        return db.collection('users').doc(user.uid).collection('analytics')
            .where('date', '==', today)
            .limit(1)
            .get()
            .then(snapshot => {
                if (snapshot.empty) {
                    // Create new document for today
                    return db.collection('users').doc(user.uid).collection('analytics').add({
                        date: today,
                        creditUsed: used,
                        apiCalls: 0, // Initialize to 0
                        featureUsage: {
                            feature1: 0,
                            feature2: 0,
                            feature3: 0
                        },
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } else {
                    // Update existing document
                    const doc = snapshot.docs[0];
                    return doc.ref.update({
                        creditUsed: used,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            })
            .then(() => {
                // Reload analytics data
                return loadAnalyticsData();
            });
    }
    
    /**
     * Log API call
     * @param {string} featureName - Name of the feature used
     * @param {number} creditsCost - Credits cost for this API call
     */
    function logApiCall(featureName, creditsCost = 1) {
        const user = firebase.auth().currentUser;
        if (!user) return Promise.reject('User not authenticated');
        
        // Get today's date
        const today = new Date().toISOString().slice(0, 10);
        
        // Update Firestore with new usage data
        const db = firebase.firestore();
        
        // Get today's analytics document
        return db.collection('users').doc(user.uid).collection('analytics')
            .where('date', '==', today)
            .limit(1)
            .get()
            .then(snapshot => {
                if (snapshot.empty) {
                    // Create new document for today
                    return db.collection('users').doc(user.uid).collection('analytics').add({
                        date: today,
                        creditUsed: creditsCost,
                        apiCalls: 1,
                        featureUsage: {
                            [featureName]: 1
                        },
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } else {
                    // Update existing document
                    const doc = snapshot.docs[0];
                    const data = doc.data();
                    
                    // Increment API calls
                    const apiCalls = (data.apiCalls || 0) + 1;
                    
                    // Increment credit usage
                    const creditUsed = (data.creditUsed || 0) + creditsCost;
                    
                    // Update feature usage
                    const featureUsage = data.featureUsage || {};
                    featureUsage[featureName] = (featureUsage[featureName] || 0) + 1;
                    
                    return doc.ref.update({
                        apiCalls,
                        creditUsed,
                        featureUsage,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            })
            .then(() => {
                // Update user's credit usage
                return db.collection('users').doc(user.uid).get().then(doc => {
                    if (doc.exists) {
                        const userData = doc.data();
                        const creditUsage = userData.creditUsage || { used: 0, total: 0 };
                        
                        // Increment used credits
                        creditUsage.used += creditsCost;
                        
                        // Update user document
                        return db.collection('users').doc(user.uid).update({
                            'creditUsage.used': creditUsage.used,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }
                });
            })
            .then(() => {
                // Reload analytics data
                return loadAnalyticsData();
            });
    }
    
    // Public API
    return {
        init,
        loadAnalyticsData,
        renderUsageChart,
        renderFeatureUsageChart,
        getUsageStats,
        calculateUsageTrend,
        predictNextMonthUsage,
        updateCreditUsage,
        logApiCall
    };
})();

// Initialize Analytics module when document is ready
document.addEventListener('DOMContentLoaded', function() {
    Analytics.init();
});