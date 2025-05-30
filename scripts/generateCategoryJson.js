
require('dotenv').config();
const fsPromises = require('fs').promises;
const fs = require('fs');
const path = require('path');
const { elasticClient } = require('../config/elasticsearch');
const prisma = require('../config/database');

async function scrollSearch(query) {
    try {
        // Initialize scroll
        const firstResponse = await elasticClient.search({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            scroll: '1m',
            size: 10000,
            body: query
        });

        let scrollId = firstResponse._scroll_id;
        const total = firstResponse.hits.total.value;
        let allResults = [];
        let currentBatch = firstResponse.hits.hits;
        let fetched = currentBatch.length;

        // Add first batch to results
        allResults.push(...currentBatch.map(hit => hit._source));

        console.log(`Total documents to fetch: ${total}`);
        console.log(`Fetched first batch: ${fetched}`);

        // Continue scrolling if there are more results
        while (fetched < total && scrollId) {
            const scrollResponse = await elasticClient.scroll({
                scroll_id: scrollId,
                scroll: '1m'
            });

            if (!scrollResponse.hits.hits.length) break;

            currentBatch = scrollResponse.hits.hits;
            allResults.push(...currentBatch.map(hit => hit._source));
            
            scrollId = scrollResponse._scroll_id;
            fetched += currentBatch.length;
            console.log(`Fetched so far: ${fetched}`);
        }

        // Clear scroll
        if (scrollId) {
            try {
                await elasticClient.clearScroll({ scroll_id: scrollId });
            } catch (e) {
                console.log('Error clearing scroll (non-critical):', e.message);
            }
        }

        console.log(`Total results fetched: ${allResults.length}`);
        return { total: allResults.length, results: allResults };
    } catch (error) {
        console.error('Error in scroll search:', error);
        throw error;  // Propagate the error up
    }
}

async function generateCategoryJson(topicId) {
    try {
        // Validate environment variables
        if (!process.env.ELASTICSEARCH_HOST) {
            throw new Error('ELASTICSEARCH_HOST environment variable is not set');
        }
        if (!process.env.ELASTICSEARCH_USER) {
            throw new Error('ELASTICSEARCH_USER environment variable is not set');
        }
        if (!process.env.ELASTICSEARCH_PASS) {
            throw new Error('ELASTICSEARCH_PASS environment variable is not set');
        }
        if (!process.env.ELASTICSEARCH_DEFAULTINDEX) {
            throw new Error('ELASTICSEARCH_DEFAULTINDEX environment variable is not set');
        }

        // Create output directory if it doesn't exist
        const outputDir = path.join(__dirname, '..', 'category_data');
        await fsPromises.mkdir(outputDir, { recursive: true });

        // Fetch categories for the topic
        const categoryData = await prisma.topic_categories.findMany({
            where: {
                customer_topic_id: Number(topicId)
            }
        });

        if (!categoryData || categoryData.length === 0) {
            console.log(`No categories found for topic ID: ${topicId}`);
            return;
        }

        console.log(`Found ${categoryData.length} categories for topic ID: ${topicId}`);

        // Transform the data
        const categoriesData = categoryData.map(category => ({
            [category.category_title]: {
                urls: category.topic_urls ? category.topic_urls.split(', ') : [],
                keywords: category.topic_keywords ? category.topic_keywords.split(', ') : [],
                hashtags: category.topic_hash_tags ? category.topic_hash_tags.split(', ') : []
            }
        }));

        // Process each category
        for (const categoryObj of categoriesData) {
            const categoryName = Object.keys(categoryObj)[0];
            const categoryInfo = categoryObj[categoryName];

            console.log(`Processing category: ${categoryName}`);

            if (!categoryInfo.urls.length && !categoryInfo.keywords.length && !categoryInfo.hashtags.length) {
                console.log(`No search terms found for category: ${categoryName}, skipping...`);
                continue;
            }

            // Combine all search terms
            const allSearchTerms = [
                ...categoryInfo.urls,
                ...categoryInfo.keywords,
                ...categoryInfo.hashtags,
                // Add variations for keywords
                ...categoryInfo.keywords.map(k => `@${k}`),
                ...categoryInfo.keywords.map(k => `#${k}`)
            ].filter(Boolean); // Remove empty values

            const query = {
            
                query: {
                    bool: {
                        must: [
                            {
                                bool: {
                                    should: [
                                        { match_phrase: { source: "Facebook" } },
                                        { match_phrase: { source: "Twitter" } },
                                        { match_phrase: { source: "Instagram" } },
                                        { match_phrase: { source: "Youtube" } },
                                        { match_phrase: { source: "LinkedIn" } },
                                        { match_phrase: { source: "Pinterest" } },
                                        { match_phrase: { source: "Web" } },
                                        { match_phrase: { source: "Reddit" } }
                                    ],
                                    minimum_should_match: 1
                                }
                            },
                            {
                                bool: {
                                    should: allSearchTerms.map(term => ({
                                        multi_match: {
                                            query: term,
                                            fields: [
                                                "p_message_text",
                                                "p_message",
                                                "keywords",
                                                "title",
                                                "hashtags",
                                                "u_source",
                                                "p_url"
                                            ],
                                            type: "phrase"
                                        }
                                    })),
                                    minimum_should_match: 1
                                }
                            }
                        ]
                    }
                }
            };

            try {
                console.log(`Fetching data for category: ${categoryName}`);
                const { total, results: posts } = await scrollSearch(query);

                if (total === 0) {
                    console.log(`No results found for category: ${categoryName}`);
                    continue;
                }

                console.log(`Found ${total} total results for category: ${categoryName}`);
                console.log(`Actually fetched ${posts.length} documents`);

                const fileName = `${categoryName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
                const filePath = path.join(outputDir, fileName);

                // Write the file header
                await fsPromises.writeFile(filePath, '{\n');
                await fsPromises.appendFile(filePath, `  "categoryName": ${JSON.stringify(categoryName)},\n`);
                await fsPromises.appendFile(filePath, `  "totalSize": ${posts.length},\n`);
                await fsPromises.appendFile(filePath, '  "posts": [\n');

                // Write posts one by one
                for (let i = 0; i < posts.length; i++) {
                    const postJson = JSON.stringify(posts[i], null, 2)
                        .split('\n')
                        .map(line => '    ' + line)
                        .join('\n');
                    
                    await fsPromises.appendFile(
                        filePath,
                        postJson + (i < posts.length - 1 ? ',\n' : '\n')
                    );
                }

                // Close the JSON structure
                await fsPromises.appendFile(filePath, '  ]\n}');

                console.log(`Generated JSON file for ${categoryName}: ${filePath}`);
            } catch (error) {
                console.error(`Error processing category ${categoryName}:`, error);
                throw error;  // Propagate the error up
            }
        }

        console.log('Completed generating JSON files for all categories');
    } catch (error) {
        console.error('Error generating category JSON files:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Check if topicId is provided as command line argument
const topicId = process.argv[2];
if (!topicId) {
    console.error('Please provide a topic ID as a command line argument');
    process.exit(1);
}

// Run the script
generateCategoryJson(topicId); 