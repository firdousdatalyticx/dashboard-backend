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
        throw error;
    }
}

// Helper function to safely split and clean data
function safeSplit(str, delimiter = ',') {
    if (!str || str.trim() === '') return [];
    return str.split(delimiter)
        .map(item => item.trim())
        .filter(item => item.length > 0);
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


        // Transform the data with improved parsing logic
        const categoriesData = categoryData.map(category => {
            return {
                [category.category_title]: {
                    urls: safeSplit(category.topic_urls, ','),
                    keywords: safeSplit(category.topic_keywords, ','),
                    hashtags: safeSplit(category.topic_hash_tags, ',')
                }
            };
        });


        // Process each category
        for (const categoryObj of categoriesData) {
            const categoryName = Object.keys(categoryObj)[0];
            const categoryInfo = categoryObj[categoryName];



            if (!categoryInfo.urls.length && !categoryInfo.keywords.length && !categoryInfo.hashtags.length) {
                console.log(`No search terms found for category: ${categoryName}, skipping...`);
                continue;
            }

            // Create comprehensive search terms without duplication
            const searchTerms = new Set();
            
            // Add URLs as-is
            categoryInfo.urls.forEach(url => {
                if (url.trim()) searchTerms.add(url.trim());
            });
            
            // Add hashtags as-is
            categoryInfo.hashtags.forEach(hashtag => {
                if (hashtag.trim()) searchTerms.add(hashtag.trim());
            });
            
            // Process keywords more intelligently
            categoryInfo.keywords.forEach(keyword => {
                const cleanKeyword = keyword.trim();
                if (!cleanKeyword) return;
                
                // Add the original keyword
                searchTerms.add(cleanKeyword);
                
                // If keyword doesn't start with #, also add it with # prefix
                if (!cleanKeyword.startsWith('#')) {
                    searchTerms.add(`#${cleanKeyword}`);
                }
                
                // If keyword starts with #, also add it without # for general text matching
                if (cleanKeyword.startsWith('#')) {
                    const withoutHash = cleanKeyword.substring(1);
                    if (withoutHash.trim()) {
                        searchTerms.add(withoutHash.trim());
                    }
                }
            });

            const allSearchTerms = Array.from(searchTerms).filter(Boolean);
            

            if (allSearchTerms.length === 0) {
                console.log(`No valid search terms found for category: ${categoryName}, skipping...`);
                continue;
            }

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
                            },
                            {
                                range: {
                                    p_created_time: {
                                        gte: "2020-01-01T00:00:00.000Z",
                                        lte: "2025-01-01T23:59:59.999Z"
                                    }
                                }
                            }
                        ]
                    }
                }
            };

            try {
              
                
                const { total, results: posts } = await scrollSearch(query);

                console.log(`Found ${total} total results for category: ${categoryName}`);
                console.log(`Actually fetched ${posts.length} documents`);

                // Skip categories with 0 results
                if (total === 0 || posts.length === 0) {
                    console.log(`Skipping category ${categoryName} - no results found (totalSize: ${total})`);
                    continue;
                }

                // Create safe filename
                const fileName = `${categoryName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
                const filePath = path.join(outputDir, fileName);

                // Create the JSON structure
                const categoryJsonData = {
                    categoryName: categoryName,
                    totalSize: posts.length,
                    searchTermsUsed: allSearchTerms,
                    originalData: {
                        urls: categoryInfo.urls,
                        keywords: categoryInfo.keywords,
                        hashtags: categoryInfo.hashtags
                    },
                    posts: posts
                };

                // Write the complete JSON file
                await fsPromises.writeFile(filePath, JSON.stringify(categoryJsonData, null, 2));

                console.log(`Generated JSON file for ${categoryName}: ${filePath}`);
                console.log(`File size: ${(await fsPromises.stat(filePath)).size} bytes`);
                
            } catch (error) {
                console.error(`Error processing category ${categoryName}:`, error);
                // Log the error but continue with other categories
                continue;
            }
        }

        console.log('\n=== Completed generating JSON files for all categories ===');
        
    } catch (error) {
        console.error('Error generating category JSON files:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Main execution
async function main() {
    // Check if topicId is provided as command line argument
    const topicId = process.argv[2];
    if (!topicId) {
        console.error('Please provide a topic ID as a command line argument');
        console.error('Usage: node script.js <topicId>');
        process.exit(1);
    }

    if (isNaN(Number(topicId))) {
        console.error('Topic ID must be a valid number');
        process.exit(1);
    }

    console.log(`Starting category JSON generation for topic ID: ${topicId}`);
    
    try {
        await generateCategoryJson(topicId);
        console.log('Script completed successfully');
    } catch (error) {
        console.error('Script failed:', error);
        process.exit(1);
    }
}

// Run the script
main();