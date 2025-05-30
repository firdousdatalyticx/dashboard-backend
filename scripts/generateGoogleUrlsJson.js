require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { elasticClient } = require('../config/elasticsearch');
const prisma = require('../config/database');

async function scrollSearch(googleUrls) {
    try {
        const query = {
            _source: [
                "p_id",
                "user_name",
                "name",
                "p_created_time",
                "created_at",
                "llm_emotion",
                "customer_industry",
                "p_message",
                "p_picture",
                "predicted_sentiment_value",
                "rating",
                "lat",
                "long",
                "source",
                "u_source"
            ],
            query: {
                bool: {
                    must: [
                        {
                            terms: {
                                "u_source.keyword": googleUrls
                            }
                        }
                    ]
                }
            }
        };

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

async function generateGoogleUrlsJson(topicId) {
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
        const outputDir = path.join(__dirname, '..', 'google_data');
        await fs.mkdir(outputDir, { recursive: true });

        // Fetch Google URLs for the topic
        const customerTopics = await prisma.customer_topics.findMany({
            where: {
                topic_id: Number(topicId),
                topic_is_deleted: 'N',
            },
            select: {
                topic_id: true,
                topic_urls: true,
                topic_gmaps_url: true
            }
        });

        if (!customerTopics || customerTopics.length === 0) {
            console.log(`No topic found with ID: ${topicId}`);
            return;
        }

        // Extract Google URLs
        const googleUrls = [
            ...new Set(
                customerTopics
                    .flatMap(t => {
                        const urlsFromPipe = t.topic_urls?.split('|') || [];
                        const gmapsUrl = t.topic_gmaps_url ? [t.topic_gmaps_url] : [];
                        return [...urlsFromPipe, ...gmapsUrl];
                    })
                    .filter(url => url !== null && url !== undefined && url.trim() !== '' && url.includes('google.com'))
            )
        ];

        if (googleUrls.length === 0) {
            console.log(`No Google URLs found for topic ID: ${topicId}`);
            return;
        }

        console.log(`Found ${googleUrls.length} Google URLs for topic ID: ${topicId}`);

        try {
            console.log(`Fetching data for topic ID: ${topicId}`);
            const { total, results: posts } = await scrollSearch(googleUrls);

            if (total === 0) {
                console.log(`No results found for topic ID: ${topicId}`);
                return;
            }

            console.log(`Found ${total} total results for topic ID: ${topicId}`);
            console.log(`Actually fetched ${posts.length} documents`);

            // Create the output file
            const fileName = `topic_${topicId}_google_data.json`;
            const filePath = path.join(outputDir, fileName);

            // Write the file header
            await fs.writeFile(filePath, '{\n');
            await fs.appendFile(filePath, `  "topicId": ${topicId},\n`);
            await fs.appendFile(filePath, `  "size": ${posts.length},\n`);
            await fs.appendFile(filePath, '  "results": [\n');

            // Write posts one by one
            for (let i = 0; i < posts.length; i++) {
                const postJson = JSON.stringify(posts[i], null, 2)
                    .split('\n')
                    .map(line => '    ' + line)
                    .join('\n');
                
                await fs.appendFile(
                    filePath,
                    postJson + (i < posts.length - 1 ? ',\n' : '\n')
                );
            }

            // Close the JSON structure
            await fs.appendFile(filePath, '  ]\n}');

            console.log(`Generated JSON file: ${filePath}`);
        } catch (error) {
            console.error(`Error processing topic ID ${topicId}:`, error);
            throw error;
        }

        console.log('Completed generating JSON file');
    } catch (error) {
        console.error('Error generating Google URLs JSON file:', error);
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
generateGoogleUrlsJson(topicId); 