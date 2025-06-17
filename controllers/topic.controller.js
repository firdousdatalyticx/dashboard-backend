const prisma = require('../config/database');
const { cleanInputData } = require('../utils/stringUtils');
const { elasticClient } = require('../config/elasticsearch');

const fs = require('fs');
const path = require('path');

const topicController = {
    // Get a specific topic by ID
    getTopicById: async (req, res) => {
        try {
            const { id } = req.params;
            const userId = req.user.id;

            // Validate topic ID
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid topic ID'
                });
            }

            // Get topic
            const topic = await prisma.customer_topics.findFirst({
                where: {
                    topic_id: parseInt(id),
                    topic_user_id: userId,
                    topic_is_deleted: {
                        not: 'Y'
                    }
                }
            });

            if (!topic) {
                return res.status(404).json({
                    success: false,
                    error: 'Topic not found'
                });
            }

            // Get category count
            const categoryCount = await prisma.topic_categories.count({
                where: {
                    customer_topic_id: parseInt(id)
                }
            });

            // Add category count to topic
            topic.categoryCount = categoryCount;

            return res.json({
                success: true,
                data: topic
            });
        } catch (error) {
            console.error('Error fetching topic:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch topic'
            });
        }
    },

    // Update a topic
    updateTopic: async (req, res) => {
        try {
            const { id } = req.params;
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
                dataLanguage,
                logo
            } = req.body;

            // Validate topic ID
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid topic ID'
                });
            }

            // Check if topic exists and belongs to user
            const existingTopic = await prisma.customer_topics.findFirst({
                where: {
                    topic_id: parseInt(id),
                    topic_user_id: userId,
                    topic_is_deleted: {
                        not: 'Y'
                    }
                }
            });

            if (!existingTopic) {
                return res.status(404).json({
                    success: false,
                    error: 'Topic not found'
                });
            }

            // Handle logo update
            let logo_url = existingTopic.topic_logo;
            if (req.file) {
                // Delete old logo file if it exists
                if (existingTopic.topic_logo && existingTopic.topic_logo !== 'NA' && !existingTopic.topic_logo.startsWith('/public/images/topic_logos/')) {
                    try {
                        const oldLogoPath = path.join(process.cwd(), 'public', 'images', 'topic_logos', existingTopic.topic_logo);
                        if (fs.existsSync(oldLogoPath)) {
                            fs.unlinkSync(oldLogoPath);
                        }
                    } catch (error) {
                        console.error('Error deleting old logo file:', error);
                    }
                }
                
                // Set new logo URL
                logo_url = `/public/images/topic_logos/${req.file.filename}`;
            }

            // Update topic
            const updatedTopic = await prisma.customer_topics.update({
                where: {
                    topic_id: parseInt(id)
                },
                data: {
                    topic_title: title || existingTopic.topic_title,
                    topic_keywords: keywords !== undefined ? keywords : existingTopic.topic_keywords,
                    topic_hash_tags: hashTags !== undefined ? hashTags : existingTopic.topic_hash_tags,
                    topic_urls: urls !== undefined ? urls : existingTopic.topic_urls,
                    topic_exclude_words: excludeWords !== undefined ? excludeWords : existingTopic.topic_exclude_words,
                    topic_exclude_accounts: excludeAccounts !== undefined ? excludeAccounts : existingTopic.topic_exclude_accounts,
                    topic_region: region || existingTopic.topic_region,
                    topic_data_source: dataSources !== undefined ? dataSources : existingTopic.topic_data_source,
                    topic_data_location: dataLocation !== undefined ? dataLocation : existingTopic.topic_data_location,
                    topic_data_lang: dataLanguage !== undefined ? dataLanguage : existingTopic.topic_data_lang,
                    topic_logo: req.file ? logo_url : (logo || existingTopic.topic_logo),
                    topic_updated_at: new Date()
                }
            });

            return res.json({
                success: true,
                data: updatedTopic
            });
        } catch (error) {
            console.error('Error updating topic:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to update topic'
            });
        }
    },

    // Delete a topic (soft delete)
    deleteTopic: async (req, res) => {
        try {
            const { id } = req.params;
            const userId = req.user.id;

            // Validate topic ID
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid topic ID'
                });
            }

            // Check if topic exists and belongs to user
            const existingTopic = await prisma.customer_topics.findFirst({
                where: {
                    topic_id: parseInt(id),
                    topic_user_id: userId,
                    topic_is_deleted: {
                        not: 'Y'
                    }
                }
            });

            if (!existingTopic) {
                return res.status(404).json({
                    success: false,
                    error: 'Topic not found'
                });
            }

            // Soft delete topic
            await prisma.customer_topics.update({
                where: {
                    topic_id: parseInt(id)
                },
                data: {
                    topic_is_deleted: 'Y',
                    topic_updated_at: new Date()
                }
            });

            return res.json({
                success: true,
                message: 'Topic deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting topic:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to delete topic'
            });
        }
    },

    // Update topic order
    updateTopicOrder: async (req, res) => {
        try {
            const userId = req.user.id;
            const { topicOrders } = req.body;

            // Validate input
            if (!topicOrders || !Array.isArray(topicOrders)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid topic orders'
                });
            }

            // Update each topic order
            const updatePromises = topicOrders.map(async (item) => {
                const { topicId, order } = item;
                
                // Check if topic belongs to user
                const existingTopic = await prisma.customer_topics.findFirst({
                    where: {
                        topic_id: parseInt(topicId),
                        topic_user_id: userId,
                        topic_is_deleted: {
                            not: 'Y'
                        }
                    }
                });

                if (existingTopic) {
                    return prisma.customer_topics.update({
                        where: {
                            topic_id: parseInt(topicId)
                        },
                        data: {
                            topic_order: order,
                            topic_updated_at: new Date()
                        }
                    });
                }
            });

            await Promise.all(updatePromises);

            return res.json({
                success: true,
                message: 'Topic orders updated successfully'
            });
        } catch (error) {
            console.error('Error updating topic orders:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to update topic orders'
            });
        }
    },

    // Get all topics for a user
    getAllTopics: async (req, res) => {
        try {
            const userId = req.user.id;
    
            const customerTopics = await prisma.customer_topics.findMany({
                where: {
                    customer_portal: 'D24',
                    topic_is_deleted: {
                        not: 'Y'
                    },
                    topic_user_id: Number(userId)
                },
                orderBy: {
                    topic_order: 'asc'
                }
            });
            
            // Get category counts for each topic
            const topicIds = customerTopics.map(topic => topic.topic_id);
            
            // Get category counts for all topics in a single query
            const categoryCounts = await prisma.topic_categories.groupBy({
                by: ['customer_topic_id'],
                _count: {
                    id: true
                },
                where: {
                    customer_topic_id: {
                        in: topicIds
                    }
                }
            });
            
            // Create a map of topic_id to count for easier lookup
            const countMap = {};
            categoryCounts.forEach(item => {
                countMap[item.customer_topic_id] = item._count.id;
            });
            
            // Add categoryCount to each topic
            const topicsWithCounts = customerTopics.map(topic => ({
                ...topic,
                categoryCount: countMap[topic.topic_id] || 0
            }));
    
            return res.json({
                success: true,
                data: topicsWithCounts
            });
        } catch (error) {
            console.error('Error fetching topics:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch topics'
            });
        }
    },
    

    // Create a new topic
    createTopic: async (req, res) => {
        try {
            const userId = req.user.id;
            const {
                title,
                keywords,
                hashTags,
                urls,
                excludeWords:excludeKeywords,
                excludeAccounts:accounts,
                googleAndTripAdviserUrl,
                dataLanguage:selectLanguage,
                dataLocation:selectLocation,
                selectMonitoring,
                dataSources:selectSource,
                selectIndustry,
                region
            } = req.body;


        
            

            // Check if topic with same title already exists
            const existingTopic = await prisma.customer_topics.findFirst({
                where: {
                    customer_portal: 'D24',
                    topic_title: title,
                    topic_user_id: userId,
                    topic_is_deleted: {
                        not: 'Y'
                    }
                }
            });

            if (existingTopic) {
                return res.status(400).json({
                    success: false,
                    message: 'You already have a topic with the same title. Choose another title.'
                });
            }

            // Process hashtags and keywords separately
            let hashtag_str = '';
            let keywords_str = '';
            
            // Process hashtags
            if (hashTags) {
                if (typeof hashTags === 'string') {
                    const hashtag_array = hashTags.split(',');
                    hashtag_array.forEach((tag) => {
                        if (tag.trim()) {
                            hashtag_str += tag.trim() + '|';
                        }
                    });
                    hashtag_str = hashtag_str.slice(0, -1); // Remove trailing '|'
                } else {
                    hashtag_str = hashTags;
                }
            }
            
            // Process keywords
            if (keywords) {
                if (typeof keywords === 'string') {
                    const keywords_array = keywords.split(',');
                    keywords_array.forEach((keyword) => {
                        if (keyword.trim()) {
                            keywords_str += keyword.trim() + ',';
                        }
                    });
                    keywords_str = keywords_str.slice(0, -1); // Remove trailing ','
                } else {
                    keywords_str = keywords;
                }
            }

            // Process URLs
            let urls_str = '';
            if (urls) {
                if (typeof urls === 'string') {
                    const url_str = urls.split(',');
                    url_str.forEach((url) => {
                        if (url.trim()) {
                            urls_str += url.trim() + '|';
                        }
                    });
                    urls_str = urls_str.slice(0, -1); // Remove trailing '|'
                } else {
                    urls_str = urls;
                }
            }

            // Process exclude keywords
            let exclude_words_str = '';
            if (excludeKeywords) {
                if (typeof excludeKeywords === 'string') {
                    const exclude_words = excludeKeywords.split(',');
                    exclude_words.forEach((word) => {
                        if (word.trim()) {
                            exclude_words_str += word.trim() + ',';
                        }
                    });
                    exclude_words_str = exclude_words_str.slice(0, -1); // Remove trailing ','
                } else {
                    exclude_words_str = excludeKeywords;
                }
            }

            // Process exclude accounts
            let exclude_accounts_str = '';
            if (accounts) {
                if (typeof accounts === 'string') {
                    const exclude_accounts_list = accounts.split(',');
                    exclude_accounts_list.forEach((account) => {
                        if (account.trim()) {
                            exclude_accounts_str += account.trim() + ',';
                        }
                    });
                    exclude_accounts_str = exclude_accounts_str.slice(0, -1); // Remove trailing ','
                } else {
                    exclude_accounts_str = accounts;
                }
            }

            // Process data sources
            let data_source_str = '';
            if (selectSource && Array.isArray(selectSource)) {
                selectSource.forEach((source) => {
                    data_source_str += source + ',';
                });
                data_source_str = data_source_str.slice(0, -1);
            }

            // Process locations
            let data_location_str = '';
            if (selectLocation && Array.isArray(selectLocation)) {
                selectLocation.forEach((location) => {
                    data_location_str += location + ',';
                });
                data_location_str = data_location_str.slice(0, -1);
            }

            // Process languages
            let data_lang_str = '';
            if (selectLanguage && Array.isArray(selectLanguage)) {
                selectLanguage.forEach((lang) => {
                    data_lang_str += lang + ',';
                });
                data_lang_str = data_lang_str.slice(0, -1);
            }

            // Handle the uploaded logo file
            let logo_filename = null;
            if (req.file) {
                // Store the file name
                logo_filename = req.file.filename;
                // Generate the URL to access the file
                const logoUrl = `/public/images/topic_logos/${logo_filename}`;
                // Store the URL in the database
                logo_filename = logoUrl;
            }

            // Create new topic
            const newTopic = await prisma.customer_topics.create({
                data: {
                    topic_title: title,
                    topic_hash_tags: hashtag_str,
                    topic_urls: urls_str,
                    topic_user_id: userId,
                    topic_keywords: keywords_str,
                    topic_created_at: new Date(),
                    topic_updated_at: new Date(),
                    topic_is_deleted: 'N',
                    topic_exclude_words: exclude_words_str,
                    topic_exclude_accounts: exclude_accounts_str,
                    topic_data_source: data_source_str,
                    topic_data_location: data_location_str,
                    topic_data_lang: data_lang_str,
                    topic_is_premium: 'Y',
                    customer_portal: 'D24',
                    customer_sub_account_id: userId,
                    topic_logo: logo_filename,
                    topic_industry: selectIndustry === '' ? 'Other' : selectIndustry,
                    topic_gmaps_url: googleAndTripAdviserUrl || '',
                    topic_region: region || ''
                }
            });

            // Get category count (will be 0 for new topic)
            newTopic.categoryCount = 0;

            return res.status(201).json({
                success: true,
                message: 'Topic created successfully',
                data: newTopic
            });
        } catch (error) {
            console.error('Error creating topic:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to create topic'
            });
        }
    },

    // Create a new subtopic
    createSubTopic: async (req, res) => {
        try {
            const userId = req.user.id;
            const {
                title,
                keywords,
                excludeKeywords,
                accounts,
                selectSource,
                selectMonitoring,
                topicId
            } = req.body;

            // Validate inputs
            if (!topicId || isNaN(parseInt(topicId))) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid topic ID'
                });
            }

            // Check if subtopic with same name already exists
            const existingSubTopic = await prisma.customer_experience.findFirst({
                where: {
                    exp_name: cleanInputData(title),
                    exp_uid: userId,
                    exp_topic_id: parseInt(topicId)
                }
            });

            if (existingSubTopic) {
                return res.status(400).json({
                    success: false,
                    message: 'You already have a subtopic with the same title. Choose another title.'
                });
            }

            // Process keywords
            let keywords_str = '';
            if (keywords) {
                const keywordsArray = keywords.split(',');
                keywordsArray.forEach((keyword) => {
                    if (keyword.trim()) {
                        keywords_str += keyword.trim() + ',';
                    }
                });
                keywords_str = keywords_str.slice(0, -1);
            }

            // Process exclude keywords
            let exclude_words_str = '';
            if (excludeKeywords) {
                const exclude_words = excludeKeywords.split(',');
                exclude_words.forEach((word) => {
                    if (word.trim()) {
                        exclude_words_str += word.trim() + ',';
                    }
                });
                exclude_words_str = exclude_words_str.slice(0, -1);
            }

            // Process exclude accounts
            let exclude_accounts_str = '';
            if (accounts) {
                const exclude_accounts_list = accounts.split(',');
                exclude_accounts_list.forEach((account) => {
                    if (account.trim()) {
                        exclude_accounts_str += account.trim() + ',';
                    }
                });
                exclude_accounts_str = exclude_accounts_str.slice(0, -1);
            }

            // Process data sources
            let data_source_str = '';
            if (selectSource && Array.isArray(selectSource)) {
                selectSource.forEach((source) => {
                    data_source_str += source + ',';
                });
                data_source_str = data_source_str.slice(0, -1);
            }

            // Get logo filename
            let logo_filename = 'NA';
            if (req.file) {
                logo_filename = req.file.filename;
            }

            // Create new subtopic
            const newSubTopic = await prisma.customer_experience.create({
                data: {
                    exp_name: cleanInputData(title),
                    exp_uid: userId,
                    exp_topic_id: parseInt(topicId),
                    exp_keywords: keywords_str,
                    exp_exclude_keywords: exclude_words_str,
                    exp_exclude_accounts: exclude_accounts_str,
                    exp_metrics: '',
                    exp_source: data_source_str,
                    exp_logo: logo_filename,
                    exp_detail: '',
                    exp_dms: '',
                    exp_type: selectMonitoring || ''
                }
            });

            return res.status(201).json({
                success: true,
                message: 'Subtopic created successfully',
                data: newSubTopic
            });
        } catch (error) {
            console.error('Error creating subtopic:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to create subtopic'
            });
        }
    },

    // Create a new touchpoint
    createTouchpoint: async (req, res) => {
        try {
            const userId = req.user.id;
            const {
                title,
                keywords,
                subTopic
            } = req.body;

            // Validate inputs
            if (!subTopic || isNaN(parseInt(subTopic))) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid subtopic ID'
                });
            }

            // Process keywords
            let keywords_str = '';
            if (keywords) {
                const keywordsArray = keywords.split(',');
                keywordsArray.forEach((keyword) => {
                    if (keyword.trim()) {
                        keywords_str += keyword.trim() + ',';
                    }
                });
                keywords_str = keywords_str.slice(0, -1);
            }

            // Create new touchpoint
            const newTouchPoint = await prisma.touch_points.create({
                data: {
                    tp_name: title,
                    tp_keywords: keywords_str,
                    tp_uid: userId,
                    tp_cx_id: parseInt(subTopic),
                    tp_date: new Date()
                }
            });

            // Link touchpoint to subtopic
            await prisma.cx_touch_points.create({
                data: {
                    cx_tp_cx_id: parseInt(subTopic),
                    cx_tp_tp_id: newTouchPoint.tp_id
                }
            });

            return res.status(201).json({
                success: true,
                message: 'Touchpoint created successfully',
                data: newTouchPoint
            });
        } catch (error) {
            console.error('Error creating touchpoint:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to create touchpoint'
            });
        }
    },

    // Update a subtopic
    updateSubTopic: async (req, res) => {
        try {
            const userId = req.user.id;
            const { subTopicId } = req.params;
            const {
                title,
                keywords,
                excludeKeywords,
                accounts,
                selectSource,
                selectMonitoring
            } = req.body;

            // Validate inputs
            if (!subTopicId || isNaN(parseInt(subTopicId))) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid subtopic ID'
                });
            }

            // Check if subtopic exists
            const existingSubTopic = await prisma.customer_experience.findFirst({
                where: {
                    exp_id: parseInt(subTopicId),
                    exp_uid: userId
                }
            });

            if (!existingSubTopic) {
                return res.status(404).json({
                    success: false,
                    error: 'Subtopic not found'
                });
            }

            // Check if another subtopic with the same name exists
            const duplicateSubTopic = await prisma.customer_experience.findFirst({
                where: {
                    exp_name: cleanInputData(title),
                    exp_uid: userId,
                    exp_topic_id: existingSubTopic.exp_topic_id,
                    exp_id: {
                        not: parseInt(subTopicId)
                    }
                }
            });

            if (duplicateSubTopic) {
                return res.status(400).json({
                    success: false,
                    message: 'You already have a subtopic with the same title. Choose another title.'
                });
            }

            // Process keywords
            let keywords_str = '';
            if (keywords) {
                const keywordsArray = keywords.split(',');
                keywordsArray.forEach((keyword) => {
                    if (keyword.trim()) {
                        keywords_str += keyword.trim() + ',';
                    }
                });
                keywords_str = keywords_str.slice(0, -1);
            }

            // Process exclude keywords
            let exclude_words_str = '';
            if (excludeKeywords) {
                const exclude_words = excludeKeywords.split(',');
                exclude_words.forEach((word) => {
                    if (word.trim()) {
                        exclude_words_str += word.trim() + ',';
                    }
                });
                exclude_words_str = exclude_words_str.slice(0, -1);
            }

            // Process exclude accounts
            let exclude_accounts_str = '';
            if (accounts) {
                const exclude_accounts_list = accounts.split(',');
                exclude_accounts_list.forEach((account) => {
                    if (account.trim()) {
                        exclude_accounts_str += account.trim() + ',';
                    }
                });
                exclude_accounts_str = exclude_accounts_str.slice(0, -1);
            }

            // Process data sources
            let data_source_str = '';
            if (selectSource && Array.isArray(selectSource)) {
                selectSource.forEach((source) => {
                    data_source_str += source + ',';
                });
                data_source_str = data_source_str.slice(0, -1);
            }

            // Get logo filename
            let logo_filename = existingSubTopic.exp_logo;
            if (req.file) {
                logo_filename = req.file.filename;
            }

            // Update subtopic
            const updatedSubTopic = await prisma.customer_experience.update({
                where: {
                    exp_id: parseInt(subTopicId)
                },
                data: {
                    exp_name: cleanInputData(title),
                    exp_keywords: keywords_str,
                    exp_exclude_keywords: exclude_words_str,
                    exp_exclude_accounts: exclude_accounts_str,
                    exp_source: data_source_str,
                    exp_logo: logo_filename,
                    exp_type: selectMonitoring || existingSubTopic.exp_type
                }
            });

            return res.json({
                success: true,
                message: 'Subtopic updated successfully',
                data: updatedSubTopic
            });
        } catch (error) {
            console.error('Error updating subtopic:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to update subtopic'
            });
        }
    },

    // Update a touchpoint
    updateTouchpoint: async (req, res) => {
        try {
            const userId = req.user.id;
            const { touchpointId } = req.params;
            const {
                title,
                keywords,
                subTopic
            } = req.body;

            // Validate inputs
            if (!touchpointId || isNaN(parseInt(touchpointId))) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid touchpoint ID'
                });
            }

            // Check if touchpoint exists
            const existingTouchpoint = await prisma.touch_points.findFirst({
                where: {
                    tp_id: parseInt(touchpointId),
                    tp_uid: userId
                }
            });

            if (!existingTouchpoint) {
                return res.status(404).json({
                    success: false,
                    error: 'Touchpoint not found'
                });
            }

            // Process keywords
            let keywords_str = '';
            if (keywords) {
                const keywordsArray = keywords.split(',');
                keywordsArray.forEach((keyword) => {
                    if (keyword.trim()) {
                        keywords_str += keyword.trim() + ',';
                    }
                });
                keywords_str = keywords_str.slice(0, -1);
            }

            // Update touchpoint
            const updatedTouchpoint = await prisma.touch_points.update({
                where: {
                    tp_id: parseInt(touchpointId)
                },
                data: {
                    tp_name: title,
                    tp_keywords: keywords_str,
                    tp_cx_id: subTopic ? parseInt(subTopic) : existingTouchpoint.tp_cx_id
                }
            });

            // If subtopic changed, update the link
            if (subTopic && parseInt(subTopic) !== existingTouchpoint.tp_cx_id) {
                // Delete old link
                await prisma.cx_touch_points.deleteMany({
                    where: {
                        cx_tp_tp_id: parseInt(touchpointId)
                    }
                });

                // Create new link
                await prisma.cx_touch_points.create({
                    data: {
                        cx_tp_cx_id: parseInt(subTopic),
                        cx_tp_tp_id: parseInt(touchpointId)
                    }
                });
            }

            return res.json({
                success: true,
                message: 'Touchpoint updated successfully',
                data: updatedTouchpoint
            });
        } catch (error) {
            console.error('Error updating touchpoint:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to update touchpoint'
            });
        }
    },

    // Country list
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

    // Get all topics count
    getTopicTotalCount: async (req, res) => {
        try {
            const userId = req.user.id;
            const { topicId } = req.query;
            
            // Validate inputs
            if (!userId) {
                return res.status(400).json({ 
                    success: false,
                    error: 'User ID is required' 
                });
            }
            
            const numericUserId = Number(userId);
            const numericTopicId = topicId && !isNaN(Number(topicId)) ? Number(topicId) : null;
            
            // Check if this is the special topicId
            const isSpecialTopic = numericTopicId === 2600;
            
            // Helper function for Elasticsearch count queries
            const countClient = async (query) => {
                try {
                    const response = await elasticClient.count({
                        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                        body: { query }
                    });
                    return response.count;
                } catch (error) {
                    console.error('Elasticsearch count error:', error);
                    throw error;
                }
            };
            
            // Get topics for the user
            const customerTopics = await prisma.customer_topics.findMany({
                where: {
                    topic_user_id: numericUserId,
                    topic_is_deleted: {
                        not: 'Y'
                    },
                    ...(numericTopicId && { topic_id: numericTopicId }), // Filter by topicId if provided
                },
                select: {
                    topic_id: true,
                    topic_hash_tags: true,
                    topic_urls: true,
                    topic_keywords: true,
                },
            });
            
            // Get topic IDs
            const topicIds = customerTopics.map((t) => t.topic_id);
            
            // Get categories for these topics
            const topicCategories = await prisma.topic_categories.findMany({
                where: {
                    customer_topic_id: { in: topicIds },
                },
                select: {
                    topic_hash_tags: true,
                    topic_urls: true,
                    topic_keywords: true,
                },
            });
            
            // Extract Google URLs
            const googleUrls = [
                ...new Set(
                    customerTopics
                        .filter(t => !numericTopicId || t.topic_id === numericTopicId)
                        .flatMap(t => t.topic_urls?.split('|') || [])
                        .filter(url => url !== null && url !== undefined && url.includes("google.com"))
                ),
            ].filter(Boolean);
            
            // Extract social media data
            const socialMediaData = [
                ...topicCategories.flatMap(t => [
                    ...(t.topic_hash_tags?.split(', ') || []),
                    ...(t.topic_urls?.split(', ') || []),
                    ...(t.topic_keywords?.split(', ') || []),
                ]),
            ].filter(Boolean);
            


                    const today = new Date();
                    const pastDate = new Date();
                    pastDate.setDate(today.getDate() - 90);

                    const formatDate = (date) => date.toISOString().split("T")[0];

                    // Determine date range based on special topic
                    let dateRange = isSpecialTopic
                        ? { gte: "2020-01-01", lte: "now" }
                        : { gte: formatDate(pastDate), lte: formatDate(today) };



   
            
            // Determine social media sources based on special topic
            const socialSources = isSpecialTopic ? 
                ["Facebook", "Twitter"] :
                ["Facebook", "Twitter", "Instagram", "Youtube", "Pinterest", "Reddit", "LinkedIn", "Web"];
            
            // Build query for social media
            const buildQuery = () => ({
                bool: {
                    must: [
                        {
                            terms: {
                                "source.keyword": socialSources
                            }
                        },
                        {
                            range: {
                                created_at: dateRange,
                            },
                        },
                        {
                        range: {
                                p_created_time: dateRange
                            }
                        }
                    ],
                    should: [
                        // Match all text fields with keywords/hashtags
                        {
                            bool: {
                                should: socialMediaData.map(keyword => ({
                                    multi_match: {
                                        query: keyword,
                                        fields: [
                                            'p_message_text',
                                            'p_message',
                                            'keywords',
                                            'title',
                                            'hashtags',
                                            'u_source',
                                        ],
                                        type: 'phrase',
                                    },
                                })),
                            },
                        },
                        // Match URLs in p_url
                        {
                            bool: {
                                should: socialMediaData.map(url => ({
                                    term: { p_url: url },
                                })),
                            },
                        },
                    ],
                    minimum_should_match: 1, // Ensures at least one condition is met
                },
            });
            
            // Build query for Google
            const buildGoogleQuery = () => ({
                bool: {
                    must: [
                        {
                            terms: {
                                "u_source.keyword": googleUrls
                            }
                        },
                        {
                            range: {
                                created_at: dateRange,
                            },
                        }
                    ]
                }
            });
            
            // Execute both queries in parallel and get valid POI count
            const [googleCount, nonGoogleCount, validPOIs] = await Promise.all([
                countClient(buildGoogleQuery()), // Query for Google
                countClient(buildQuery()), // Query for Social Media (non-Google)
                elasticClient.search({
                    index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                    body: {
                        size: 0,
                        query: buildGoogleQuery(),
                        aggs: {
                            unique_urls: {
                                terms: {
                                    field: 'u_source.keyword',
                                    size: 10000,
                                    min_doc_count: 1
                                },
                                aggs: {
                                    place_data: {
                                        top_hits: {
                                            size: 1,
                                            _source: ['lat', 'long']
                                        }
                                    }
                                }
                            }
                        }
                    }
                }).then((response) => {
                    // Count only POIs with valid coordinates and reviews
                    const validPOICount = (response.aggregations?.unique_urls?.buckets || [])
                        .filter((bucket) => {
                            const placeData = bucket.place_data?.hits?.hits[0]?._source;
                            return placeData?.lat != null && placeData?.long != null;
                        }).length;
                    return validPOICount;
                })
            ]);
            
            return res.json({
                success: true,
                query:buildQuery(),
                data: {
                    googleCount,
                    socialMediaCount: socialMediaData.length>0?nonGoogleCount:0,
                    googlePOIs: validPOIs,
                    googlePOIsCount: googleUrls.length,
                    socialMediaPOIs: topicCategories.length,
                }
            });
        } catch (error) {
            console.error('Error fetching total counts:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch total counts'
            });
        }
    }
};

module.exports = topicController; 