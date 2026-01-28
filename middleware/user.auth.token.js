const prisma = require('../config/database');
const { verifyToken } = require('../utils/jwt.util');

// JWT Secret should be in environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-should-be-in-env-file';

const authenticateUserToken = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                error: 'No token provided, authorization denied'
            });
        }

        // Extract token
        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'No token provided, authorization denied'
            });
        }

        // Verify token
        const decoded = verifyToken(token);

        // Find user by id
        const user = await prisma.customers.findUnique({
            where: {
                customer_id: decoded.id
            },
            select: {
                customer_id: true,
                customer_name: true,
                customer_email: true,
                customer_company_name: true,
                customer_reg_scope: true,
                customer_account_type: true,
                customer_allowed_topics: true,
                customer_allowed_invitations: true,
                customer_layout_settings: true,
                customer_account_parent: true
            }
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found'
            });
        }

        // Attach user to request
        req.user = {
            id: decoded.parentId || user.customer_id,
            name: user.customer_name,
            email: user.customer_email,
            company: user.customer_company_name,
            scope: user.customer_reg_scope,
            accountType: user.customer_account_type,
            allowedTopics: user.customer_allowed_topics,
            allowedInvitations: user.customer_allowed_invitations,
            layoutSettings: user.customer_layout_settings
        };

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token expired'
            });
        }

        return res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
};

module.exports = { authenticateUserToken };