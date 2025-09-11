const prisma = require('../config/database');
const { encrypt } = require('../utils/password.util');
const { generateToken } = require('../utils/jwt.util');

// JWT Secret should be in environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-should-be-in-env-file';
const JWT_EXPIRES_IN = '30d'; // 30 days

const authController = {
    // Login user
    login: async (req, res) => {
        try {
            const { email, password } = req.body;
            console.log(email, password);
            const encryptPassword = encrypt(String(password), process.env.ENC_KEY)

            // Find user by email
            const user = await prisma.customers.findFirst({
                where: {
                  customer_email: String(email),
                  customer_pass: String(encryptPassword)
                }
              })


            // Check if user exists
            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid credentials'
                });
            }


            // Handle sub-account logic
            let userData = user;
            
            if (user.customer_reg_scope === 'IS') {
                // Find parent account
                const parentAccount = await prisma.customers.findFirst({
                    where: {
                        customer_email: user.customer_account_parent
                    }
                });
                
                if (parentAccount) {
                    // Use parent ID for token but keep user details
                    userData = {
                        ...user,
                        parentId: parentAccount.customer_id
                    };
                }
            }

            // Generate JWT token
            const token = generateToken({ 
                id: userData.customer_id,
                email: userData.customer_email,
                name: userData.customer_name,
                scope: userData.customer_reg_scope,
                parentId: userData.parentId || null
            });

            // Return user data and token
            return res.status(200).json({
                success: true,
                token,
                user: {
                    id: userData.parentId || userData.customer_id,
                    name: userData.customer_name,
                    email: userData.customer_email,
                    company: userData.customer_company_name,
                    scope: userData.customer_reg_scope,
                    accountType: userData.customer_account_type,
                    allowedTopics: userData.customer_allowed_topics,
                    allowedInvitations: userData.customer_allowed_invitations,
                    layoutSettings: userData.customer_layout_settings
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    // Get current user
    getCurrentUser: async (req, res) => {
        try {
            // User is already attached to request by auth middleware
            const { user } = req;
            
            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: 'Unauthorized'
                });
            }

            return res.status(200).json({
                success: true,
                user
            });
        } catch (error) {
            console.error('Get current user error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    // Register user (if needed)
    register: async (req, res) => {
        try {
            const { name, email, password, companyName, phone, accountParent, allowedSources } = req.body;

            // Check if user already exists
            const existingUser = await prisma.customers.findFirst({
                where: {
                    customer_email: email
                }
            });

            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    error: 'User with this email already exists'
                });
            }

            // Encrypt password using the same method as login
            const encryptedPassword = encrypt(String(password), process.env.ENC_KEY);

            // Create new user
            const newUser = await prisma.customers.create({
                data: {
                    customer_name: name,
                    customer_email: email,
                    customer_pass: encryptedPassword,
                    customer_company_name: companyName || null,
                    customer_phone: phone || null,
                    customer_reg_scope: 'FR', // Free account by default
                    customer_account_type: false, // Default account type
                    customer_show_in_list: true,
                    customer_account_parent: accountParent || null,
                    customer_allowed_sources: allowedSources || null
                }
            });

            // Generate JWT token
            const token = generateToken({ 
                id: newUser.customer_id,
                email: newUser.customer_email,
                name: newUser.customer_name,
                scope: newUser.customer_reg_scope
            });

            // Return user data and token
            return res.status(201).json({
                success: true,
                token,
                user: {
                    id: newUser.customer_id,
                    name: newUser.customer_name,
                    email: newUser.customer_email,
                    company: newUser.customer_company_name,
                    scope: newUser.customer_reg_scope,
                    accountType: newUser.customer_account_type,
                    accountParent: newUser.customer_account_parent,
                    allowedSources: newUser.customer_allowed_sources
                }
            });
        } catch (error) {
            console.error('Registration error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
};

module.exports = authController; 