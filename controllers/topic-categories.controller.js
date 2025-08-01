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

            const today = new Date();
            const pastDate = new Date();
            pastDate.setDate(today.getDate() - 90);

            const formatDate = (date) => date.toISOString().split("T")[0];

            // Determine date range based on special topic
            let dateRange = isSpecialTopic
                ? { gte: "2020-01-01", lte: "now" }
                : { gte: formatDate(pastDate), lte: formatDate(today) };


            // Determine social media sources based on special topic
            const socialSources = numericTopicId === 2619 ? ["LinkedIn", "Linkedin"] : isSpecialTopic
                ? ["Facebook", "Twitter"]
                : [
                    "Facebook",
                    "Twitter",
                    "Instagram",
                    "Youtube",
                    "Pinterest",
                    "Reddit",
                    "LinkedIn",
                    "Linkedin",
                    "TikTok",
                    "Web",
                ];

            if (numericTopicId === 2473) {
                dateRange.gte = "2023-01-01";
                dateRange.lte = "2023-04-30";
            }

            const must = [

            ]
            const googleMust =
                [
                    {
                        terms: {
                            "u_source.keyword": googleUrls,
                        },
                    },

                ]


            if (numericTopicId === 2473 || isSpecialTopic) {
                must.push({
                    range: {
                        created_at: dateRange,
                    }
                },
                    // {
                    //     range: {
                    //         p_created_time: dateRange
                    //     }
                    // }
                )

                googleMust.push({
                    range: {
                        created_at: dateRange,
                    },
                },)
            }
            // Query builder for social media data
            const buildSocialMediaQuery = () => ({
                bool: {
                    must: must,
                    filter: [
                        {
                            terms: {
                                "source.keyword": socialSources,
                            },
                        },
                        {
                            bool: {
                                must_not: [
                                    {
                                        term: {
                                            source: "DM",
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                    should: [
                        // Match all text fields with keywords/hashtags
                        {
                            bool: {
                                should: socialMediaTerms.map((term) => ({
                                    multi_match: {
                                        query: term,
                                        fields: [
                                            "p_message_text",
                                            "p_message",
                                            "keywords",
                                            "title",
                                            "hashtags",
                                            "u_source",
                                        ],
                                        type: "phrase",
                                    },
                                })),
                                minimum_should_match: 1,
                            },
                        },
                        // Match URLs in p_url
                        {
                            bool: {
                                should: socialMediaTerms.map((term) => ({
                                    term: { p_url: term },
                                })),
                                minimum_should_match: 1,
                            },
                        },
                    ],
                    minimum_should_match: 1, // Ensures at least one condition is met
                },
            });

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
