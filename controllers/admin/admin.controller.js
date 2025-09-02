const prisma = require('../../config/database');
const { encrypt } = require('../../utils/password.util');

const adminController = {
    // Get all customers with their topics
    getAllCustomers: async (req, res) => {
        try {
            const { page = 1, limit = 10, search = '', status = '' } = req.query;
            const offset = (page - 1) * limit;

            // Build where clause for search
            let whereClause = {
                customer_show_in_list: true
            };

            if (search) {
                whereClause.OR = [
                    { customer_name: { contains: search } },
                    { customer_email: { contains: search } },
                    { customer_company_name: { contains: search } }
                ];
            }

            if (status) {
                whereClause.customer_reg_scope = status;
            }

            // Get customers
            const customers = await prisma.customers.findMany({
                where: whereClause,
                select: {
                    customer_id: true,
                    customer_name: true,
                    customer_email: true,
                    customer_company_name: true,
                    customer_reg_time: true,
                    customer_reg_scope: true,
                    customer_account_type: true,
                    customer_allowed_topics: true,
                    customer_phone: true,
                    customer_country: true,
                    customer_industry: true,
                    customer_acc_expiry: true,
                    customer_dashboard_expiry: true,
                    customer_show_in_list: true,
                    customer_account_parent: true
                },
                orderBy: {
                    customer_reg_time: 'desc'
                },
                skip: parseInt(offset),
                take: parseInt(limit)
            });

            // Get topics count for each customer
            const customersWithTopicCounts = await Promise.all(
                customers.map(async (customer) => {
                    const topicCount = await prisma.customer_topics.count({
                        where: {
                            topic_user_id: customer.customer_id,
                            topic_is_deleted: { not: 'y' }
                        }
                    });
                    
                    return {
                        ...customer,
                        topicCount
                    };
                })
            );

            // Get total count for pagination
            const totalCustomers = await prisma.customers.count({
                where: whereClause
            });

            return res.status(200).json({
                success: true,
                data: customersWithTopicCounts,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalCustomers / limit),
                    totalItems: totalCustomers,
                    itemsPerPage: parseInt(limit)
                }
            });
        } catch (error) {
            console.error('Get all customers error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    // Get customer details with all topics
    getCustomerDetails: async (req, res) => {
        try {
            const { customerId } = req.params;

            if (!customerId || isNaN(parseInt(customerId))) {
                return res.status(400).json({
                    success: false,
                    error: 'Valid customer ID is required'
                });
            }

            const customer = await prisma.customers.findUnique({
                where: {
                    customer_id: parseInt(customerId)
                },
                include: {
                    customer_topics: {
                        where: {
                            topic_is_deleted: { not: 'y' }
                        },
                        orderBy: {
                            topic_created_at: 'desc'
                        },
                        include: {
                            enabled_graphs: {
                                include: {
                                    graph: true
                                }
                            }
                        }
                    }
                }
            });

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    error: 'Customer not found'
                });
            }

            return res.status(200).json({
                success: true,
                data: customer
            });
        } catch (error) {
            console.error('Get customer details error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    // Update customer details
    updateCustomer: async (req, res) => {
        try {
            const { customerId } = req.params;
            const updateData = req.body;

            // Remove sensitive fields that shouldn't be updated via admin
            delete updateData.customer_pass;
            delete updateData.customer_id;

            const updatedCustomer = await prisma.customers.update({
                where: {
                    customer_id: parseInt(customerId)
                },
                data: updateData,
                select: {
                    customer_id: true,
                    customer_name: true,
                    customer_email: true,
                    customer_company_name: true,
                    customer_reg_scope: true,
                    customer_account_type: true,
                    customer_allowed_topics: true,
                    customer_phone: true,
                    customer_country: true,
                    customer_industry: true,
                    customer_acc_expiry: true,
                    customer_dashboard_expiry: true
                }
            });

            return res.status(200).json({
                success: true,
                data: updatedCustomer,
                message: 'Customer updated successfully'
            });
        } catch (error) {
            console.error('Update customer error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    // Get all topics with customer information
    getAllTopics: async (req, res) => {
        try {
            const { page = 1, limit = 10, search = '', status = '', premium = '' } = req.query;
            const offset = (page - 1) * limit;

            // Build where clause
            let whereClause = {
                topic_is_deleted: { not: 'y' }
            };

            if (search) {
                whereClause.OR = [
                    { topic_title: { contains: search } },
                    { topic_keywords: { contains: search } }
                ];
            }

            if (status) {
                whereClause.dashboard_enabled = status;
            }

            if (premium !== '') {
                whereClause.topic_is_premium = premium;
            }

            const topics = await prisma.customer_topics.findMany({
                where: whereClause,
                include: {
                    customers: {
                        select: {
                            customer_id: true,
                            customer_name: true,
                            customer_email: true,
                            customer_company_name: true
                        }
                    }
                },
                orderBy: {
                    topic_created_at: 'desc'
                },
                skip: parseInt(offset),
                take: parseInt(limit)
            });

            const totalTopics = await prisma.customer_topics.count({
                where: whereClause
            });

            return res.status(200).json({
                success: true,
                data: topics,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalTopics / limit),
                    totalItems: totalTopics,
                    itemsPerPage: parseInt(limit)
                }
            });
        } catch (error) {
            console.error('Get all topics error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    // Get all topics for a specific customer
    getCustomerTopics: async (req, res) => {
        try {
            const { customerId } = req.params;
            const { page = 1, limit = 10, search = '', status = '', premium = '' } = req.query;
            const offset = (page - 1) * limit;

            // Verify customer exists
            const customer = await prisma.customers.findUnique({
                where: {
                    customer_id: parseInt(customerId)
                },
                select: {
                    customer_id: true,
                    customer_name: true,
                    customer_email: true,
                    customer_company_name: true
                }
            });

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    error: 'Customer not found'
                });
            }

            // Build where clause for topics
            let whereClause = {
                topic_user_id: parseInt(customerId),
                topic_is_deleted: { not: 'y' }
            };

            if (search) {
                whereClause.OR = [
                    { topic_title: { contains: search } },
                    { topic_keywords: { contains: search } }
                ];
            }

            if (status) {
                whereClause.dashboard_enabled = status;
            }

            if (premium !== '') {
                whereClause.topic_is_premium = premium;
            }

            const topics = await prisma.customer_topics.findMany({
                where: whereClause,
                include: {
                    enabled_graphs: {
                        include: {
                            graph: true
                        }
                    }
                },
                orderBy: {
                    topic_created_at: 'desc'
                },
                skip: parseInt(offset),
                take: parseInt(limit)
            });

            const totalTopics = await prisma.customer_topics.count({
                where: whereClause
            });

            return res.status(200).json({
                success: true,
                data: {
                    customer,
                    topics,
                    pagination: {
                        currentPage: parseInt(page),
                        totalPages: Math.ceil(totalTopics / limit),
                        totalItems: totalTopics,
                        itemsPerPage: parseInt(limit)
                    }
                }
            });
        } catch (error) {
            console.error('Get customer topics error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    // Get topic details
    getTopicDetails: async (req, res) => {
        try {
            const { topicId } = req.params;

            const topic = await prisma.customer_topics.findUnique({
                where: {
                    topic_id: parseInt(topicId)
                },
                include: {
                    customers: {
                        select: {
                            customer_id: true,
                            customer_name: true,
                            customer_email: true,
                            customer_company_name: true,
                            customer_reg_scope: true
                        }
                    },
                    enabled_graphs: {
                        include: {
                            graph: true
                        }
                    }
                }
            });

            if (!topic) {
                return res.status(404).json({
                    success: false,
                    error: 'Topic not found'
                });
            }

            return res.status(200).json({
                success: true,
                data: topic
            });
        } catch (error) {
            console.error('Get topic details error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    // Update topic settings
    updateTopic: async (req, res) => {
        try {
            const { topicId } = req.params;
            const updateData = req.body;

            // Remove fields that shouldn't be updated via admin
            delete updateData.topic_id;
            delete updateData.topic_user_id;
            delete updateData.topic_created_at;

            // enable_archive_data is already a boolean, no conversion needed
            
            // allowed_sources should be an array, validate and convert if needed
            // if (updateData.allowed_sources !== undefined) {
            //     if (typeof updateData.allowed_sources === 'string') {
            //         try {
            //             updateData.allowed_sources = JSON.parse(updateData.allowed_sources);
            //         } catch (error) {
            //             return res.status(400).json({
            //                 success: false,
            //                 error: 'Invalid allowed_sources format. Must be a valid JSON array.'
            //             });
            //         }
            //     }
                
            //     if (!Array.isArray(updateData.allowed_sources)) {
            //         return res.status(400).json({
            //             success: false,
            //             error: 'allowed_sources must be an array of strings.'
            //         });
            //     }
            // }


            const updatedTopic = await prisma.customer_topics.update({
                where: {
                    topic_id: parseInt(topicId)
                },
                data: {
                    ...updateData,
                    topic_updated_at: new Date()
                }
            });

            // Get customer information separately
            const customer = await prisma.customers.findUnique({
                where: {
                    customer_id: updatedTopic.topic_user_id
                },
                select: {
                    customer_id: true,
                    customer_name: true,
                    customer_email: true,
                    customer_company_name: true
                }
            });

            // Combine topic and customer data
            const result = {
                ...updatedTopic,
                customers: customer
            };

            return res.status(200).json({
                success: true,
                data: result,
                message: 'Topic updated successfully'
            });
        } catch (error) {
            console.error('Update topic error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    // Toggle dashboard enabled/disabled for a topic
    toggleDashboardStatus: async (req, res) => {
        try {
            const { topicId } = req.params;
            let { dashboard_enabled } = req.body;

            const topic = await prisma.customer_topics.findUnique({
                where: {
                    topic_id: parseInt(topicId)
                }
            });

            if (!topic) {
                return res.status(404).json({
                    success: false,
                    error: 'Topic not found'
                });
            }

            // Convert boolean to string if needed
            if (typeof dashboard_enabled === 'boolean') {
                dashboard_enabled = dashboard_enabled ? 'yes' : 'no';
            }

            const updatedTopic = await prisma.customer_topics.update({
                where: {
                    topic_id: parseInt(topicId)
                },
                data: {
                    dashboard_enabled: dashboard_enabled,
                    topic_updated_at: new Date()
                }
            });

            // Get customer information separately
            const customer = await prisma.customers.findUnique({
                where: {
                    customer_id: updatedTopic.topic_user_id
                },
                select: {
                    customer_id: true,
                    customer_name: true,
                    customer_email: true,
                    customer_company_name: true
                }
            });

            // Combine topic and customer data
            const result = {
                ...updatedTopic,
                customers: customer
            };

            return res.status(200).json({
                success: true,
                data: result,
                message: `Dashboard ${dashboard_enabled === 'yes' ? 'enabled' : 'disabled'} successfully`
            });
        } catch (error) {
            console.error('Toggle dashboard status error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    // Toggle premium status for a topic
    togglePremiumStatus: async (req, res) => {
        try {
            const { topicId } = req.params;
            let { topic_is_premium } = req.body;


            const topic = await prisma.customer_topics.findUnique({
                where: {
                    topic_id: parseInt(topicId)
                }
            });

            if (!topic) {
                return res.status(404).json({
                    success: false,
                    error: 'Topic not found'
                });
            }

            // Convert boolean to string if needed
            if (typeof topic_is_premium === 'boolean') {
                topic_is_premium = topic_is_premium ? 'y' : 'n';
            }

            const updatedTopic = await prisma.customer_topics.update({
                where: {
                    topic_id: parseInt(topicId)
                },
                data: {
                    topic_is_premium: topic_is_premium,
                    topic_updated_at: new Date()
                }
            });

            // Get customer information separately
            const customer = await prisma.customers.findUnique({
                where: {
                    customer_id: updatedTopic.topic_user_id
                },
                select: {
                    customer_id: true,
                    customer_name: true,
                    customer_email: true,
                    customer_company_name: true
                }
            });

            // Combine topic and customer data
            const result = {
                ...updatedTopic,
                customers: customer
            };

            return res.status(200).json({
                success: true,
                data: result,
                message: `Premium status ${topic_is_premium === 'y' ? 'enabled' : 'disabled'} successfully`
            });
        } catch (error) {
            console.error('Toggle premium status error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    // Toggle archive data enabled/disabled for a topic
    toggleArchiveDataStatus: async (req, res) => {
        try {
            const { topicId } = req.params;
            let { enable_archive_data } = req.body;

            const topic = await prisma.customer_topics.findUnique({
                where: {
                    topic_id: parseInt(topicId)
                }
            });

            if (!topic) {
                return res.status(404).json({
                    success: false,
                    error: 'Topic not found'
                });
            }

            // Convert string to boolean if needed
            if (typeof enable_archive_data === 'string') {
                enable_archive_data = enable_archive_data.toLowerCase() === 'true';
            }

            const updatedTopic = await prisma.customer_topics.update({
                where: {
                    topic_id: parseInt(topicId)
                },
                data: {
                    enable_archive_data: enable_archive_data,
                    topic_updated_at: new Date()
                }
            });

            // Get customer information separately
            const customer = await prisma.customers.findUnique({
                where: {
                    customer_id: updatedTopic.topic_user_id
                },
                select: {
                    customer_id: true,
                    customer_name: true,
                    customer_email: true,
                    customer_company_name: true
                }
            });

            // Combine topic and customer data
            const result = {
                ...updatedTopic,
                customers: customer
            };

            return res.status(200).json({
                success: true,
                data: result,
                message: `Archive data ${enable_archive_data ? 'enabled' : 'disabled'} successfully`
            });
        } catch (error) {
            console.error('Toggle archive data status error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    // Update allowed sources for a topic
    updateAllowedSources: async (req, res) => {
        try {
            const { topicId } = req.params;
            let { allowed_sources } = req.body;

            const topic = await prisma.customer_topics.findUnique({
                where: {
                    topic_id: parseInt(topicId)
                }
            });

            if (!topic) {
                return res.status(404).json({
                    success: false,
                    error: 'Topic not found'
                });
            }

            // Validate and convert allowed_sources
            if (typeof allowed_sources === 'string') {
                try {
                    allowed_sources = JSON.parse(allowed_sources);
                } catch (error) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid allowed_sources format. Must be a valid JSON array.'
                    });
                }
            }

            if (!Array.isArray(allowed_sources)) {
                return res.status(400).json({
                    success: false,
                    error: 'allowed_sources must be an array of strings.'
                });
            }

            // Validate that all items are strings
            if (!allowed_sources.every(item => typeof item === 'string')) {
                return res.status(400).json({
                    success: false,
                    error: 'All items in allowed_sources must be strings.'
                });
            }

            const updatedTopic = await prisma.customer_topics.update({
                where: {
                    topic_id: parseInt(topicId)
                },
                data: {
                    allowed_sources: allowed_sources,
                    topic_updated_at: new Date()
                }
            });

            // Get customer information separately
            const customer = await prisma.customers.findUnique({
                where: {
                    customer_id: updatedTopic.topic_user_id
                },
                select: {
                    customer_id: true,
                    customer_name: true,
                    customer_email: true,
                    customer_company_name: true
                }
            });

            // Combine topic and customer data
            const result = {
                ...updatedTopic,
                customers: customer
            };

            return res.status(200).json({
                success: true,
                data: result,
                message: `Allowed sources updated successfully. Sources: ${allowed_sources.join(', ')}`
            });
        } catch (error) {
            console.error('Update allowed sources error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    // Bulk update topics
    bulkUpdateTopics: async (req, res) => {
        try {
            const { topicIds, updates } = req.body;

            if (!topicIds || !Array.isArray(topicIds) || topicIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Topic IDs are required'
                });
            }

            // Remove fields that shouldn't be updated via admin
            delete updates.topic_id;
            delete updates.topic_user_id;
            delete updates.topic_created_at;

            // Convert boolean values to string format for database
            const processedUpdates = { ...updates };
            if (processedUpdates.topic_is_premium !== undefined) {
                processedUpdates.topic_is_premium = processedUpdates.topic_is_premium ? 'y' : 'n';
            }

            if (processedUpdates.dashboard_enabled !== undefined) {
                processedUpdates.dashboard_enabled = processedUpdates.dashboard_enabled ? 'yes' : 'no';
            }

            const updatePromises = topicIds.map(topicId =>
                prisma.customer_topics.update({
                    where: {
                        topic_id: parseInt(topicId)
                    },
                    data: {
                        ...processedUpdates,
                        topic_updated_at: new Date()
                    }
                })
            );

            const updatedTopics = await Promise.all(updatePromises);

            return res.status(200).json({
                success: true,
                data: updatedTopics,
                message: `${updatedTopics.length} topics updated successfully`
            });
        } catch (error) {
            console.error('Bulk update topics error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    // Get admin dashboard statistics
    getDashboardStats: async (req, res) => {
        try {
            const [
                totalCustomers,
                totalTopics,
                activeTopics,
                premiumTopics,
                recentCustomers,
                recentTopics
            ] = await Promise.all([
                // Total customers
                prisma.customers.count({
                    where: {
                        customer_show_in_list: true
                    }
                }),
                // Total topics
                prisma.customer_topics.count({
                    where: {
                        topic_is_deleted: { not: 'y' }
                    }
                }),
                // Active topics (dashboard enabled)
                prisma.customer_topics.count({
                    where: {
                        topic_is_deleted: { not: 'y' },
                        dashboard_enabled: 'yes'
                    }
                }),
                // Premium topics
                prisma.customer_topics.count({
                    where: {
                        topic_is_deleted: { not: 'y' },
                        topic_is_premium: 'y'
                    }
                }),
                // Recent customers (last 30 days)
                prisma.customers.count({
                    where: {
                        customer_show_in_list: true,
                        customer_reg_time: {
                            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                        }
                    }
                }),
                // Recent topics (last 30 days)
                prisma.customer_topics.count({
                    where: {
                        topic_is_deleted: { not: 'y' },
                        topic_created_at: {
                            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                        }
                    }
                })
            ]);

            return res.status(200).json({
                success: true,
                data: {
                    totalCustomers,
                    totalTopics,
                    activeTopics,
                    premiumTopics,
                    recentCustomers,
                    recentTopics,
                    inactiveTopics: totalTopics - activeTopics,
                    nonPremiumTopics: totalTopics - premiumTopics
                }
            });
        } catch (error) {
            console.error('Get dashboard stats error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    // Get all unique parent account emails for segregation
    getParentAccounts: async (req, res) => {
        try {
            // First get all unique parent emails
            const parentEmails = await prisma.$queryRaw`
                SELECT DISTINCT customer_account_parent
                FROM customers
                WHERE customer_show_in_list = true
                AND customer_account_parent IS NOT NULL
                AND customer_account_parent != ''
                ORDER BY customer_account_parent
            `;

            if (!parentEmails || parentEmails.length === 0) {
                return res.status(200).json({
                    success: true,
                    data: [],
                    count: 0
                });
            }

            // For each parent email, get one customer record to show details
            const uniqueParents = [];
            for (const parent of parentEmails) {
                const customer = await prisma.customers.findFirst({
                    where: {
                        customer_show_in_list: true,
                        customer_account_parent: parent.customer_account_parent
                    },
                    select: {
                        customer_account_parent: true,
                        customer_name: true,
                        customer_email: true,
                        customer_company_name: true
                    },
                    orderBy: {
                        customer_reg_time: 'desc'
                    }
                });

                if (customer && customer.customer_account_parent) {
                    uniqueParents.push({
                        email: customer.customer_account_parent,
                        name: customer.customer_name || 'Unknown',
                        customer_email: customer.customer_email,
                        company_name: customer.customer_company_name
                    });
                }
            }

            return res.status(200).json({
                success: true,
                data: uniqueParents,
                count: uniqueParents.length
            });
        } catch (error) {
            console.error('Get parent accounts error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                details: error.message
            });
        }
    },

    // Get all customers under a specific parent account
    getCustomersByParent: async (req, res) => {
        try {
            const { parentEmail } = req.params;
            const { page = 1, limit = 10, search = '', status = '' } = req.query;
            const offset = (page - 1) * limit;

            if (!parentEmail) {
                return res.status(400).json({
                    success: false,
                    error: 'Parent email is required'
                });
            }

            // Build where clause
            let whereClause = {
                customer_show_in_list: true,
                customer_account_parent: parentEmail
            };

            if (search) {
                whereClause.OR = [
                    { customer_name: { contains: search } },
                    { customer_email: { contains: search } },
                    { customer_company_name: { contains: search } }
                ];
            }

            if (status) {
                whereClause.customer_reg_scope = status;
            }

            // Get customers under this parent
            const customers = await prisma.customers.findMany({
                where: whereClause,
                select: {
                    customer_id: true,
                    customer_name: true,
                    customer_email: true,
                    customer_company_name: true,
                    customer_reg_time: true,
                    customer_reg_scope: true,
                    customer_account_type: true,
                    customer_allowed_topics: true,
                    customer_phone: true,
                    customer_country: true,
                    customer_industry: true,
                    customer_acc_expiry: true,
                    customer_dashboard_expiry: true,
                    customer_show_in_list: true,
                    customer_account_parent: true
                },
                orderBy: {
                    customer_reg_time: 'desc'
                },
                skip: parseInt(offset),
                take: parseInt(limit)
            });

            // Get topics count for each customer
            const customersWithTopicCounts = await Promise.all(
                customers.map(async (customer) => {
                    const topicCount = await prisma.customer_topics.count({
                        where: {
                            topic_user_id: customer.customer_id,
                            topic_is_deleted: { not: 'y' }
                        }
                    });

                    return {
                        ...customer,
                        topicCount
                    };
                })
            );

            // Get total count for pagination
            const totalCustomers = await prisma.customers.count({
                where: whereClause
            });

            // Get parent account information
            const parentAccount = await prisma.customers.findFirst({
                where: {
                    customer_email: parentEmail,
                    customer_show_in_list: true
                },
                select: {
                    customer_id: true,
                    customer_name: true,
                    customer_email: true,
                    customer_company_name: true
                }
            });

            return res.status(200).json({
                success: true,
                data: {
                    parentAccount,
                    customers: customersWithTopicCounts,
                    summary: {
                        totalCustomers,
                        activeCustomers: customersWithTopicCounts.filter(c => c.customer_reg_scope === 'active').length,
                        inactiveCustomers: customersWithTopicCounts.filter(c => c.customer_reg_scope === 'inactive').length
                    },
                    pagination: {
                        currentPage: parseInt(page),
                        totalPages: Math.ceil(totalCustomers / limit),
                        totalItems: totalCustomers,
                        itemsPerPage: parseInt(limit)
                    }
                }
            });
        } catch (error) {
            console.error('Get customers by parent error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    // Search customers and topics
    search: async (req, res) => {
        try {
            const { query, type = 'all' } = req.query;

            if (!query || query.length < 2) {
                return res.status(400).json({
                    success: false,
                    error: 'Search query must be at least 2 characters long'
                });
            }

            let results = {};

            if (type === 'all' || type === 'customers') {
                const customers = await prisma.customers.findMany({
                    where: {
                        customer_show_in_list: true,
                        OR: [
                            { customer_name: { contains: query } },
                            { customer_email: { contains: query } },
                            { customer_company_name: { contains: query } }
                        ]
                    },
                    select: {
                        customer_id: true,
                        customer_name: true,
                        customer_email: true,
                        customer_company_name: true,
                        customer_reg_scope: true
                    },
                    take: 10
                });
                results.customers = customers;
            }

            if (type === 'all' || type === 'topics') {
                const topics = await prisma.customer_topics.findMany({
                    where: {
                        topic_is_deleted: { not: 'y' },
                        OR: [
                            { topic_title: { contains: query } },
                            { topic_keywords: { contains: query } }
                        ]
                    },
                    include: {
                        customers: {
                            select: {
                                customer_id: true,
                                customer_name: true,
                                customer_email: true,
                                customer_company_name: true
                            }
                        }
                    },
                    take: 10
                });
                results.topics = topics;
            }

            return res.status(200).json({
                success: true,
                data: results
            });
        } catch (error) {
            console.error('Search error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
};

module.exports = adminController; 