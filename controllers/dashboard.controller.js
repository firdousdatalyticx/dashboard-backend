const prisma = require('../config/database');
const { decrypt } = require('../utils/encryption.util');

const dashboardController = {
    // Get all dashboards/topics for a user
    getDashboards: async (req, res) => {
        try {
            const userId = req.user.id;
            const { selectedRegion } = req.query;

            // Apply region filter
            let topicRegionFilter = {};
            if (selectedRegion === 'Abu Dhabi' || selectedRegion === null || !selectedRegion) {
                topicRegionFilter = { OR: [{ topic_region: null }, { topic_region: 'Abu Dhabi' }] };
            } else {
                topicRegionFilter = { topic_region: selectedRegion };
            }

            // Get topics/dashboards
            const topics = await prisma.customer_topics.findMany({
                where: {
                    customer_portal: 'D24',
                    topic_is_deleted: {
                        not: 'Y'
                    },
                    topic_user_id: userId,
                    ...topicRegionFilter
                },
                orderBy: {
                    topic_order: 'asc'
                }
            });

            // Get category count for each topic
            for (let i = 0; i < topics.length; i++) {
                const element = topics[i];
                const categoryCount = await prisma.topic_categories.count({
                    where: {
                        customer_topic_id: Number(element?.topic_id)
                    }
                });
                element.categoryCount = categoryCount;
            }

            return res.json({
                success: true,
                data: topics
            });
        } catch (error) {
            console.error('Error fetching dashboards:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch dashboards'
            });
        }
    },

    // Get user dashboard information
    getDashboardInfo: async (req, res) => {
        try {
            const userId = req.user.id;

            // Get user data
            const userData = await prisma.customers.findUnique({
                where: { customer_id: userId },
                select: { 
                    customer_email: true, 
                    customer_reg_scope: true, 
                    customer_account_parent: true,
                    customer_allowed_topics: true
                }
            });

            if (!userData) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            // Get topic count
            let topicCount;
            let allowedTopics;

            if (userData.customer_reg_scope === 'IS') {
                // For sub-accounts, get parent account info
                const parentAccount = await prisma.customers.findFirst({
                    where: { customer_email: userData.customer_account_parent },
                    select: { 
                        customer_id: true,
                        customer_allowed_topics: true
                    }
                });

                if (parentAccount) {
                    topicCount = await prisma.customer_topics.count({
                        where: { 
                            customer_portal: 'D24', 
                            topic_user_id: parentAccount.customer_id 
                        }
                    });

                    // Decrypt allowed topics
                    if (parentAccount.customer_allowed_topics) {
                        allowedTopics = decrypt(parentAccount.customer_allowed_topics, process.env.ENC_KEY);
                    }
                }
            } else {
                // For regular accounts
                topicCount = await prisma.customer_topics.count({
                    where: { 
                        customer_portal: 'D24', 
                        topic_user_id: userId 
                    }
                });

                // Decrypt allowed topics
                if (userData.customer_allowed_topics) {
                    allowedTopics = decrypt(userData.customer_allowed_topics, process.env.ENC_KEY);
                }
            }

            return res.json({
                success: true,
                data: {
                    topicCount,
                    allowedTopics,
                    userScope: userData.customer_reg_scope
                }
            });
        } catch (error) {
            console.error('Error fetching dashboard info:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch dashboard information'
            });
        }
    },

    // Get country list for dashboard
    getCountryList: async (req, res) => {
        try {
            const countryList = await prisma.countries_list.findMany({
                select: {
                    country_name: true
                },
                orderBy: {
                    country_name: 'asc'
                }
            });

            return res.json({
                success: true,
                data: countryList
            });
        } catch (error) {
            console.error('Error fetching country list:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch country list'
            });
        }
    },

    // Create a new dashboard/topic
    createDashboard: async (req, res) => {
        try {
            const userId = req.user.id;
            const { 
                title, 
                keywords, 
                hashTags, 
                urls, 
                excludeWords, 
                excludeAccounts,
                region,
                dataSources,
                dataLocation,
                dataLanguage
            } = req.body;

            // Validate required fields
            if (!title) {
                return res.status(400).json({
                    success: false,
                    error: 'Dashboard title is required'
                });
            }

            // Create new dashboard/topic
            const newDashboard = await prisma.customer_topics.create({
                data: {
                    topic_title: title,
                    topic_keywords: keywords || null,
                    topic_hash_tags: hashTags || null,
                    topic_urls: urls || null,
                    topic_exclude_words: excludeWords || null,
                    topic_exclude_accounts: excludeAccounts || null,
                    topic_user_id: userId,
                    topic_region: region || 'Abu Dhabi',
                    topic_data_source: dataSources || null,
                    topic_data_location: dataLocation || null,
                    topic_data_lang: dataLanguage || null,
                    customer_portal: 'D24',
                    topic_created_at: new Date(),
                    topic_updated_at: new Date()
                }
            });

            return res.status(201).json({
                success: true,
                data: newDashboard
            });
        } catch (error) {
            console.error('Error creating dashboard:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to create dashboard'
            });
        }
    }
};

module.exports = dashboardController; 