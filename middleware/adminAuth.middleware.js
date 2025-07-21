const prisma = require('../config/database');

const adminAuthMiddleware = async (req, res, next) => {
    try {
        // Check if user exists in request (from auth middleware)
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        const { email } = req.user;

        // Check if user is admin by looking in admin tables
        const adminUser = await prisma.$queryRaw`
            SELECT 'd24_admin' as admin_type, admin_id as id, admin_name as name, admin_email as email
            FROM d24_admins 
            WHERE admin_email = ${email}
            UNION ALL
            SELECT 'omran_admin' as admin_type, admin_id as id, admin_name as name, admin_email as email
            FROM omran_admins 
            WHERE admin_email = ${email}
            UNION ALL
            SELECT 'printmedia_admin' as admin_type, admin_id as id, admin_name as name, admin_email as email
            FROM printmedia_admins 
            WHERE admin_email = ${email}
            LIMIT 1
        `;

        if (!adminUser || adminUser.length === 0) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin privileges required.'
            });
        }

        // Attach admin info to request
        req.admin = {
            ...adminUser[0],
            customerId: req.user.id // Keep the customer ID for reference
        };

        next();
    } catch (error) {
        console.error('Admin auth middleware error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

module.exports = adminAuthMiddleware; 