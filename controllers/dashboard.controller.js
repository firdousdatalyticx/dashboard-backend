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
    },



    // Get available graphs grouped by category
    getAvailableGraphs: async (req, res) => {
        try {
            const { topicId } = req.params;
            const userId = req.user.id;

            // Get customer details including allowed_sources
            const customer = await prisma.customers.findUnique({
                where: {
                    customer_id: Number(userId)
                },
                select: {
                    customer_allowed_sources: true
                }
            });

            // Verify topic ownership
            if (topicId) {
                const topic = await prisma.customer_topics.findFirst({
                    where: {
                        topic_id: parseInt(topicId),
                        topic_user_id: userId,
                        topic_is_deleted: { not: 'Y' }
                    }
                });

                if (!topic) {
                    return res.status(403).json({
                        success: false,
                        error: 'Topic not found or access denied'
                    });
                }
            }

            // Get all available graphs
            const graphs = await prisma.available_graphs.findMany({
                where: { is_active: true },
                orderBy: [
                    { category: 'asc' },
                    { sort_order: 'asc' }
                ]
            });

            // Get enabled graphs for this topic if topicId provided
            let enabledGraphs = [];
            if (topicId) {
                enabledGraphs = await prisma.topic_enabled_graphs.findMany({
                    where: { 
                        topic_id: parseInt(topicId),
                        is_enabled: true 
                    },
                    include: { graph: true }
                });
            }

            // Add enabled status to each graph and group by category
            const graphsWithStatus = graphs.map(graph => {
                // Find the enabled graph record for this graph
                const enabledGraph = enabledGraphs.find(eg => eg.graph_id === graph.id);
                const isEnabled = !!enabledGraph;

                return {
                    ...graph,
                    isEnabled,
                    customTitle: enabledGraph?.custom_title || null,
                    messagePrompt: graph.graph_message_prompt // Map database field to frontend-friendly name
                };
            });

            // Group graphs by category
            const categorizedGraphs = graphsWithStatus.reduce((acc, graph) => {
                const category = graph.category;
                if (!acc[category]) {
                    acc[category] = [];
                }
                acc[category].push(graph);
                return acc;
            }, {});

            // Ensure categories are in the desired order
            const orderedCategories = ['Overview', 'Sentiment', 'Emotion', 'WordCloud', 'Google'];
            const orderedCategorizedGraphs = {};
            
            orderedCategories.forEach(category => {
                if (categorizedGraphs[category]) {
                    orderedCategorizedGraphs[category] = categorizedGraphs[category];
                }
            });

            return res.json({
                success: true,
                data: {
                    categorizedGraphs: orderedCategorizedGraphs,
                    customerAllowedSources: customer?.customer_allowed_sources || null
                }
            });
        } catch (error) {
            console.error('Error fetching available graphs:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch available graphs'
            });
        }
    },

    // Update dashboard configuration for a topic
    updateDashboardConfig: async (req, res) => {
        try {
            const { topicId } = req.params;
            const userId = req.user.id;
            const {
                dashboard_enabled,
                dashboard_date_range,
                dashboard_start_date,
                dashboard_end_date,
                dashboard_archive_enabled,
                dashboard_layout,
                dashboard_theme,
                dashboard_auto_refresh
            } = req.body;

            // Verify topic ownership
            const topic = await prisma.customer_topics.findFirst({
                where: {
                    topic_id: parseInt(topicId),
                    topic_user_id: userId,
                    topic_is_deleted: { not: 'Y' }
                }
            });

            if (!topic) {
                return res.status(403).json({
                    success: false,
                    error: 'Topic not found or access denied'
                });
            }

            // Update dashboard configuration
            const updatedTopic = await prisma.customer_topics.update({
                where: { topic_id: parseInt(topicId) },
                data: {
                    dashboard_enabled: dashboard_enabled || topic.dashboard_enabled,
                    dashboard_date_range: dashboard_date_range || topic.dashboard_date_range,
                    dashboard_start_date: dashboard_start_date ? new Date(dashboard_start_date) : topic.dashboard_start_date,
                    dashboard_end_date: dashboard_end_date ? new Date(dashboard_end_date) : topic.dashboard_end_date,
                    dashboard_archive_enabled: dashboard_archive_enabled || topic.dashboard_archive_enabled,
                    dashboard_layout: dashboard_layout || topic.dashboard_layout,
                    dashboard_theme: dashboard_theme || topic.dashboard_theme,
                    dashboard_auto_refresh: dashboard_auto_refresh || topic.dashboard_auto_refresh,
                    topic_updated_at: new Date()
                }
            });

            return res.json({
                success: true,
                data: updatedTopic
            });
        } catch (error) {
            console.error('Error updating dashboard config:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to update dashboard configuration'
            });
        }
    },

    // Enable/disable graphs for a topic
    updateTopicGraphs: async (req, res) => {
        try {
            const { topicId } = req.params;
            const userId = req.user.id;
            const { enabledGraphs } = req.body; // Array of graph IDs

            // Verify topic ownership
            const topic = await prisma.customer_topics.findFirst({
                where: {
                    topic_id: parseInt(topicId),
                    topic_user_id: userId,
                    topic_is_deleted: { not: 'Y' }
                }
            });

            if (!topic) {
                return res.status(403).json({
                    success: false,
                    error: 'Topic not found or access denied'
                });
            }

            // Validate that all provided graph IDs exist
            if (enabledGraphs && enabledGraphs.length > 0) {
                const validGraphs = await prisma.available_graphs.findMany({
                    where: {
                        id: { in: enabledGraphs },
                        is_active: true
                    }
                });

                if (validGraphs.length !== enabledGraphs.length) {
                    return res.status(400).json({
                        success: false,
                        error: 'Some graph IDs are invalid'
                    });
                }
            }

            // Remove all existing enabled graphs for this topic
            await prisma.topic_enabled_graphs.deleteMany({
                where: { topic_id: parseInt(topicId) }
            });

            // Add new enabled graphs
            if (enabledGraphs && enabledGraphs.length > 0) {
                const graphsToCreate = enabledGraphs.map((graphId, index) => ({
                    topic_id: parseInt(topicId),
                    graph_id: graphId,
                    is_enabled: true,
                    position_order: index
                }));

                await prisma.topic_enabled_graphs.createMany({
                    data: graphsToCreate
                });
            }

            return res.json({
                success: true,
                message: 'Topic graphs updated successfully'
            });
        } catch (error) {
            console.error('Error updating topic graphs:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to update topic graphs'
            });
        }
    },

    // Get dashboard configuration for a topic
    getDashboardConfig: async (req, res) => {
        try {
            const { topicId } = req.params;
            const userId = req.user.id;

            // Verify topic ownership and get config
            const topic = await prisma.customer_topics.findFirst({
                where: {
                    topic_id: parseInt(topicId),
                    topic_user_id: userId,
                    topic_is_deleted: { not: 'Y' }
                },
                include: {
                    enabled_graphs: {
                        where: { is_enabled: true },
                        include: { graph: true },
                        orderBy: { position_order: 'asc' }
                    }
                }
            });

            if (!topic) {
                return res.status(403).json({
                    success: false,
                    error: 'Topic not found or access denied'
                });
            }

            // Extract dashboard configuration
            const dashboardConfig = {
                topic_id: topic.topic_id,
                topic_title: topic.topic_title,
                dashboard_enabled: topic.dashboard_enabled,
                dashboard_date_range: topic.dashboard_date_range,
                dashboard_start_date: topic.dashboard_start_date,
                dashboard_end_date: topic.dashboard_end_date,
                dashboard_archive_enabled: topic.dashboard_archive_enabled,
                dashboard_layout: topic.dashboard_layout,
                dashboard_theme: topic.dashboard_theme,
                dashboard_auto_refresh: topic.dashboard_auto_refresh,
                enabled_graphs: topic.enabled_graphs.map(eg => ({
                    id: eg.id,
                    graph_id: eg.graph_id,
                    position_order: eg.position_order,
                    custom_title: eg.custom_title,
                    graph: eg.graph
                }))
            };

            return res.json({
                success: true,
                data: dashboardConfig
            });
        } catch (error) {
            console.error('Error fetching dashboard config:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch dashboard configuration'
            });
        }
    },

    // Update graph message prompts for multiple graphs
    updateGraphMessagePrompts: async (req, res) => {
        try {
            const { graphPrompts } = req.body; // Array of { graphId: number, messagePrompt: string }

            // Validate input
            if (!Array.isArray(graphPrompts) || graphPrompts.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'graphPrompts must be a non-empty array'
                });
            }

            // Validate each graph prompt entry
            for (const prompt of graphPrompts) {
                if (!prompt.graphId || typeof prompt.graphId !== 'number') {
                    return res.status(400).json({
                        success: false,
                        error: 'Each graph prompt must have a valid graphId (number)'
                    });
                }
                if (prompt.messagePrompt !== undefined && typeof prompt.messagePrompt !== 'string') {
                    return res.status(400).json({
                        success: false,
                        error: 'messagePrompt must be a string or undefined'
                    });
                }
            }

            // Update each graph's message prompt
            const updatePromises = graphPrompts.map(async (prompt) => {
                const updateData = {
                    graph_message_prompt: prompt.messagePrompt || null
                };

                return prisma.available_graphs.update({
                    where: {
                        id: prompt.graphId
                    },
                    data: updateData
                });
            });

            // Execute all updates
            const results = await Promise.allSettled(updatePromises);

            // Check for any failures
            const failures = results.filter(result => result.status === 'rejected');
            const successes = results.filter(result => result.status === 'fulfilled');

            if (failures.length > 0) {
                console.error('Some graph prompt updates failed:', failures);
                return res.status(207).json({
                    success: false,
                    message: `Updated ${successes.length} graphs, ${failures.length} failed`,
                    updated: successes.length,
                    failed: failures.length,
                    failures: failures.map((f, index) => ({
                        graphId: graphPrompts[index].graphId,
                        error: f.reason?.message || 'Unknown error'
                    }))
                });
            }

            return res.json({
                success: true,
                message: `Successfully updated message prompts for ${successes.length} graphs`,
                updated: successes.length
            });

        } catch (error) {
            console.error('Error updating graph message prompts:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to update graph message prompts'
            });
        }
    }
};

module.exports = dashboardController; 