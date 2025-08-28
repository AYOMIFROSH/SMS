// middleware/mobile.js
// Mobile detection + optimization middleware
// - Detects header X-Mobile-Client: 'true' (case-insensitive)
// - Sets request flags, increases timeouts, and applies mobile response headers


module.exports = function mobileOptimizationMiddleware(req, res, next) {
try {
const mobileHeader = (req.headers['x-mobile-client'] || '').toString().toLowerCase();
const isMobile = mobileHeader === 'true';


if (isMobile) {
// tag request for downstream handlers
req.isMobileClient = true;
req.mobilePlatform = req.headers['x-mobile-platform'] || null;


// Increase timeouts for mobile clients
// Note: Express wraps setTimeout to Node's `req.setTimeout` / `res.setTimeout`
if (typeof req.setTimeout === 'function') {
req.setTimeout(60 * 1000); // 60s
}
if (typeof res.setTimeout === 'function') {
res.setTimeout(60 * 1000);
}


// Mobile specific response headers for clients and intermediaries
res.setHeader('X-Mobile-Optimized', 'true');
res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
res.setHeader('Pragma', 'no-cache');
}


} catch (err) {
// Don't fail the whole request if middleware misbehaves
// Logging should be done by your logger when integrated
// console.warn('mobileOptimizationMiddleware error', err);
}


return next();
};