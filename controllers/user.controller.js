const prisma = require('../config/database');

const userController = {
    // Get all users
    getAllUsers: async (req, res) => {
        try {
            const users = await prisma.customers.findMany();
            res.json({
                success: true,
                data: users
            });
        } catch (error) {
            res.status(500).json({ 
                success: false,
                error: error.message 
            });
        }
    },

    // Get user by ID
    getUserById: async (req, res) => {
        try {
            const user = await prisma.customers.findUnique({
                where: {
                    id: parseInt(req.params.id)
                }
            });
            if (!user) {
                return res.status(404).json({ 
                    success: false,
                    error: 'User not found' 
                });
            }
            res.json({
                success: true,
                data: user
            });
        } catch (error) {
            res.status(500).json({ 
                success: false,
                error: error.message 
            });
        }
    }
};

module.exports = userController; 