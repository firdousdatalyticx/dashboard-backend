const prisma = require("../config/database");
const { elasticClient } = require("../config/elasticsearch");

const topicCategoriesController = {
    // Create topic categories
    createCategories: async (req, res) => {
        try {
            const { categories, topicId } = req.body;
            const userId = req.user.id;

            // Validate required fields
            if (!categories || !Array.isArray(categories) || !topicId) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Invalid request body. Categories array and topicId are required.",
                });
            }

            // Verify that the topic belongs to the user
            const topic = await prisma.customer_topics.findFirst({
                where: {
                    topic_id: parseInt(topicId),
                    topic_user_id: userId,
                    topic_is_deleted: {
                        not: "Y",
                    },
                },
            });

            if (!topic) {
                return res.status(403).json({
                    success: false,
                    error: "You do not have access to this topic",
                });
            }

            // Process each category
            const createdCategories = await Promise.all(
                categories.map(async (categoryData) => {
                    const categoryTitle = Object.keys(categoryData)[0];
                    const { urls, keywords, hashtags } = categoryData[categoryTitle];

                    // Convert arrays into comma-separated strings
                    const topicUrls = urls.join(", ");
                    const topicKeywords = keywords.join(", ");
                    const topicHashTags = hashtags.join(", ");

                    // Insert data into the database
                    return prisma.topic_categories.create({
                        data: {
                            customer_topic_id: topicId,
                            category_title: categoryTitle,
                            topic_hash_tags: topicHashTags,
                            topic_urls: topicUrls,
                            topic_keywords: topicKeywords,
                        },
                    });
                })
            );

            res.status(201).json({
                success: true,
                data: createdCategories,
            });
        } catch (error) {
            console.error("Error inserting categories:", error);
            res.status(500).json({
                success: false,
                error: "Failed to insert categories",
            });
        }
    },

    // Get topic categories by topic ID
    getCategoriesByTopicId: async (req, res) => {
        try {
            const userId = req.user.id;
            const { topicId } = req.params;

            const categoryData = await prisma.topic_categories.findMany({
                where: {
                    customer_topic_id: Number(topicId),
                },
            })

            return res.json(categoryData)


        } catch (error) {
            console.error('Error fetching categories:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch categories'
            });
        }
    },

    // Get categories and sub-categories by topic ID
    getSubCategoriesByTopicId: async (req, res) => {
        try {
            const userId = req.user.id;
            const { topicId } = req.params;

        
            const subCategoryData = await prisma.topic_sub_categories.findMany({
                where: {
                    customer_topic_id: Number(topicId),
                },
            })

            return res.json({  subCategoryData })


        } catch (error) {
            console.error('Error fetching categories:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch categories'
            });
        }
    },

    // Update a topic category
    updateCategory: async (req, res) => {
        try {
            const { id } = req.params;
            const userId = req.user.id;
            const { category_title, topic_hash_tags, topic_urls, topic_keywords } =
                req.body;

            // Get the category
            const category = await prisma.topic_categories.findUnique({
                where: {
                    id: parseInt(id),
                },
            });

            if (!category) {
                return res.status(404).json({
                    success: false,
                    error: "Category not found",
                });
            }

            // Get the topic to verify ownership
            const topic = await prisma.customer_topics.findUnique({
                where: {
                    topic_id: category.customer_topic_id,
                },
            });

            // Verify that the topic belongs to the user
            if (!topic || topic.topic_user_id !== userId) {
                return res.status(403).json({
                    success: false,
                    error: "You do not have access to this category",
                });
            }

            const updatedCategory = await prisma.topic_categories.update({
                where: {
                    id: parseInt(id),
                },
                data: {
                    category_title,
                    topic_hash_tags,
                    topic_urls,
                    topic_keywords,
                    updated_at: new Date(),
                },
            });

            res.json({
                success: true,
                data: updatedCategory,
            });
        } catch (error) {
            console.error("Error updating category:", error);
            res.status(500).json({
                success: false,
                error: "Failed to update category",
            });
        }
    },

    // Delete a topic category
    deleteCategory: async (req, res) => {
        try {
            const { id } = req.params;
            const userId = req.user.id;

            // Get the category to verify ownership
            const category = await prisma.topic_categories.findUnique({
                where: {
                    id: parseInt(id),
                },
            });

            if (!category) {
                return res.status(404).json({
                    success: false,
                    error: "Category not found",
                });
            }

            await prisma.topic_categories.delete({
                where: {
                    id: parseInt(id),
                },
            });

            res.json({
                success: true,
                message: "Category deleted successfully",
            });
        } catch (error) {
            console.error("Error deleting category:", error);
            res.status(500).json({
                success: false,
                error: "Failed to delete category",
            });
        }
    },

    // Check if category exists for a topic
    checkCategoryExists: async (req, res) => {
        try {
            const { topicId } = req.body;
            const userId = req.user.id;

            // Validate topicId
            if (!topicId) {
                return res.status(400).json({
                    success: false,
                    error: "Topic ID is required",
                });
            }

            // Verify that the topic belongs to the user
            const topic = await prisma.customer_topics.findFirst({
                where: {
                    topic_id: parseInt(topicId),
                    topic_user_id: userId,
                    topic_is_deleted: {
                        not: "Y",
                    },
                },
            });

            if (!topic) {
                return res.status(403).json({
                    success: false,
                    error: "You do not have access to this topic",
                });
            }

            // Check if category exists
            const categoryExists = await prisma.topic_categories.findFirst({
                where: {
                    customer_topic_id: Number(topicId),
                },
            });

            if (categoryExists) {
                return res.json({
                    success: true,
                    exists: true,
                    category: categoryExists,
                });
            } else {
                return res.json({
                    success: true,
                    exists: false,
                });
            }
        } catch (error) {
            console.error("Error checking category existence:", error);
            res.status(500).json({
                success: false,
                error: "Internal server error",
            });
        }
    },

    /**
     * Get topic statistics with counts for Google and social media
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} Response with Google and social media counts
     */
    getTopicStats: async (req, res) => {
        try {
            const userId = req.query.userId;
            const topicId = req.query.topicId;

            if (!userId || isNaN(Number(userId))) {
                return res.status(400).json({
                    error: "User ID is required and must be a number",
                });
            }

            const numericUserId = Number(userId);
            const numericTopicId =
                topicId && !isNaN(Number(topicId)) ? Number(topicId) : null;

      // Check if this is the special topicId
      const isSpecialTopic = numericTopicId === 2600 || numericTopicId === 2627;

            // Fetch customer topics
            const customerTopics = await prisma.customer_topics.findMany({
                where: {
                    topic_user_id: numericUserId,
                    topic_is_deleted: "N",
                    ...(numericTopicId && { topic_id: numericTopicId }),
                },
                select: {
                    topic_id: true,
                    topic_hash_tags: true,
                    topic_urls: true,
                    topic_keywords: true,
                },
            });

            const topicIds = customerTopics.map((t) => t.topic_id);

            // Extract Google URLs from customer topics
            const googleUrls = [
                ...new Set(
                    customerTopics
                        .flatMap((t) => t.topic_urls?.split("|") || [])
                        .filter((url) => url.includes("google.com"))
                ),
            ].filter(Boolean);

            // Get category data from middleware
            const categoryData = req.processedCategories || {};

            // Return empty data if no categories found
            if (Object.keys(categoryData).length === 0) {
                return res.json({
                    data: {
                        googleCount: 0,
                        socialMediaCount: 0,
                        googlePOIs: 0,
                        socialMediaPOIs: 0,
                        termCount: 0,
                        id: topicIds,
                    },
                });
            }

            // Extract terms from all categories for the query
            const socialMediaTerms = extractTermsFromCategoryData(
                "all",
                categoryData
            );

       


            // Determine social media sources based on topicId (same as socials-distributions.controller.js)
            let socialSources = [];
            if (numericTopicId === 2619 || numericTopicId === 2639 || numericTopicId === 2640 || numericTopicId === 2647 || numericTopicId === 2648 || numericTopicId === 2649) {
                socialSources = ["LinkedIn", "Linkedin"];
            } else if (numericTopicId === 2646 || numericTopicId === 2650) {
                socialSources = ["LinkedIn", "Linkedin", "Twitter", "Web","Instagram","Facebook","Youtube"];
            } 
            else if (numericTopicId === 2641 || numericTopicId === 2643 || numericTopicId === 2644 || numericTopicId === 2651 || numericTopicId === 2652 || numericTopicId === 2653 || numericTopicId === 2654 || numericTopicId === 2655 || numericTopicId === 2658 || numericTopicId === 2659 || numericTopicId === 2660 || numericTopicId === 2661 || numericTopicId === 2662) {
                socialSources = ["Twitter", "Facebook", "Instagram"];
            } 
            else if (numericTopicId === 2656 || numericTopicId === 2657) {
                socialSources = ["Facebook", "Twitter", "Instagram", "Youtube"];
            }
            
            else if (numericTopicId === 2643 || numericTopicId === 2644) {
                socialSources = ["Facebook", "Twitter", "Instagram"];
            } else if (numericTopicId === 2634) {
                socialSources = ["Facebook", "Twitter"];
            } else if (isSpecialTopic) {
                socialSources = ["Facebook", "Twitter"];
            } else {
                socialSources = [
                    "Facebook",
                    "Twitter",
                    "Instagram",
                    "Youtube",
                    "Pinterest",
                    "Reddit",
                    "LinkedIn",
                    "Linkedin",
                    "Web",
                    "TikTok"
                ];
            }


            const must = []

           
            const googleMust =
                [
                    {
                        terms: {
                            "u_source.keyword": googleUrls,
                        },
                    },

                ]


          
            // Build category filters using the same logic as addCategoryFilters()
            const categoryFilters = [];

            // Process each category to build individual filters
            Object.values(categoryData).forEach(data => {
                // Add keywords matching
                if (data.keywords && data.keywords.length > 0) {
                    data.keywords.forEach(keyword => {
                        categoryFilters.push(
                            { match_phrase: { p_message_text: keyword } },
                            { match_phrase: { keywords: keyword } }
                        );
                    });
                }

                // Add hashtags matching
                if (data.hashtags && data.hashtags.length > 0) {
                    data.hashtags.forEach(hashtag => {
                        categoryFilters.push(
                            { match_phrase: { p_message_text: hashtag } },
                            { match_phrase: { hashtags: hashtag } }
                        );
                    });
                }

                // Add URLs matching
                if (data.urls && data.urls.length > 0) {
                    data.urls.forEach(url => {
                        categoryFilters.push(
                            { match_phrase: { u_source: url } },
                            { match_phrase: { p_url: url } }
                        );
                    });
                }
            });

            // Query builder for social media data
            const buildSocialMediaQuery = () => {
                const query = {
                    bool: {
                        must: [
                            {
                                bool: {
                                    should: categoryFilters,
                                    minimum_should_match: 1
                                }
                            },
                            {
                                bool: {
                                    should: socialSources.map(src => ({
                                        match_phrase: { source: src }
                                    })),
                                    minimum_should_match: 1
                                }
                            }
                        ],
                        must_not: [
                            {
                                term: {
                                    source: "DM",
                                },
                            },
                        ]
                    },
                };

                // Special filter for topicId 2651 - only fetch Healthcare results
                if (parseInt(numericTopicId) === 2651) {
                    query.bool.must.push({
                        term: { "p_tag_cat.keyword": "Healthcare" }
                    });
                }

                // Special filter for topicId 2652 - only fetch Food and Beverages results
                if (parseInt(numericTopicId) === 2652) {
                    query.bool.must.push({
                        term: { "p_tag_cat.keyword": "Food and Beverages" }
                    });
                }

                return query;
            };

            // Query builder for Google data
            const buildGoogleQuery = () => ({
                bool: {
                    must: googleMust,
                },
            });

            // Count function
            const countClient = async (query) => {
                try {
                    const response = await elasticClient.count({
                        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                        body: { query },
                    });
                    return response.count;
                } catch (error) {
                    console.error("Elasticsearch count error:", error);
                    throw error;
                }
            };

            // Execute both queries in parallel
            const [googleCount, socialMediaCount] = await Promise.all([
                countClient(buildGoogleQuery()),
                countClient(buildSocialMediaQuery()),
            ]);

            return res.json({
                data: {
                    googleCount,
                    socialMediaCount,
                    googlePOIs: googleUrls.length,
                    socialMediaPOIs: req.rawCategories ? req.rawCategories.length : 0,
                    termCount: socialMediaTerms.length,
                    id: topicIds,
                    query: buildSocialMediaQuery(),
                },
            });
        } catch (error) {
            console.error("Error fetching topic statistics:", error);
            return res.status(500).json({
                error: "Internal server error",
            });
        }
    },

    bulkCreateCategories: async (req, res) => {
        try {
            const { categories, topicId } = req.body;
    
            if (!categories || !Array.isArray(categories) || !topicId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid request body. Categories array and topicId are required.'
                });
            }
    
            // Delete all previous categories for this topicId
            await prisma.topic_categories.deleteMany({
                where: { customer_topic_id: topicId }
            });
    
            // Process each country object in the categories array
            for (const countryObject of categories) {
                // Get the country name (first key in the object)
                const countryName = Object.keys(countryObject)[0];
                const countryCategories = countryObject[countryName];
    
                // Process each category within the country
                for (const [categoryTitle, categoryData] of Object.entries(countryCategories)) {
                    const { urls, keywords, hashtags } = categoryData;
    
                    // Convert arrays into comma-separated strings
                    const topicUrls = urls.join(', ');
                    const topicKeywords = keywords.join(', ');
                    const topicHashTags = hashtags.join(', ');
    
                    // Insert data into the database
                    await prisma.topic_categories.create({
                        data: {
                            customer_topic_id: topicId,
                            country: countryName,
                            category_title: categoryTitle,
                            topic_hash_tags: topicHashTags,
                            topic_urls: topicUrls,
                            topic_keywords: topicKeywords,
                        }
                    });
                }
            }
    
            return res.json({ success: true });
        } catch (error) {
            console.error('Error inserting categories:', error);
            return res.status(500).json({ error: 'Failed to insert categories' });
        }
    }
};

/**
 * Extract terms from category data
 * @param {string} selectedCategory - Category to filter by
 * @param {Object} categoryData - Category data
 * @returns {Array} Array of terms
 */
function extractTermsFromCategoryData(selectedCategory, categoryData) {
    const allTerms = [];

    if (selectedCategory === "all") {
        // Combine all keywords, hashtags, and urls from all categories
        Object.values(categoryData).forEach((data) => {
            if (data.keywords && data.keywords.length > 0) {
                allTerms.push(...data.keywords);
            }
            if (data.hashtags && data.hashtags.length > 0) {
                allTerms.push(...data.hashtags);
            }
            if (data.urls && data.urls.length > 0) {
                allTerms.push(...data.urls);
            }
        });
    } else if (categoryData[selectedCategory]) {
        const data = categoryData[selectedCategory];
        if (data.keywords && data.keywords.length > 0) {
            allTerms.push(...data.keywords);
        }
        if (data.hashtags && data.hashtags.length > 0) {
            allTerms.push(...data.hashtags);
        }
        if (data.urls && data.urls.length > 0) {
            allTerms.push(...data.urls);
        }
    }

    // Remove duplicates and falsy values
    return [...new Set(allTerms)].filter(Boolean);
}

module.exports = topicCategoriesController; 
