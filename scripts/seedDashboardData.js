const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedDashboardData() {
    try {
        console.log('Seeding dashboard data...');

        // Seed Available Graphs
        const availableGraphs = [
            // Overview Category
            {
                name: 'total_mentions',
                display_name: 'Total Mentions',
                description: 'Total number of mentions across all selected sources',
                sample_image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
                category: 'overview',
                graph_type: 'metric_card',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                sort_order: 1
            },
            {
                name: 'mentions_trend',
                display_name: 'Mentions Over Time',
                description: 'Timeline showing mentions trends over selected period',
                sample_image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
                category: 'overview',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                sort_order: 2
            },
            {
                name: 'source_distribution',
                display_name: 'Source Distribution',
                description: 'Distribution of mentions across different sources',
                sample_image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
                category: 'overview',
                graph_type: 'pie_chart',
                api_endpoint: '/api/social-media/socials-distributions',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                sort_order: 3
            },

            // Sentiment Category
            {
                name: 'sentiment_overview',
                display_name: 'Sentiment Overview',
                description: 'Overall sentiment distribution (Positive, Negative, Neutral)',
                sample_image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
                category: 'sentiment',
                graph_type: 'donut_chart',
                api_endpoint: '/api/social-media/sentiments-analysis',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                sort_order: 1
            },
            {
                name: 'sentiment_trend',
                display_name: 'Sentiment Trend',
                description: 'Sentiment changes over time',
                sample_image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
                category: 'sentiment',
                graph_type: 'stacked_area_chart',
                api_endpoint: '/api/social-media/sentiments-analysis',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                sort_order: 2
            },
            {
                name: 'emotion_analysis',
                display_name: 'Emotion Analysis',
                description: 'Detailed emotion breakdown (Joy, Anger, Fear, Sadness, etc.)',
                sample_image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
                category: 'sentiment',
                graph_type: 'horizontal_bar_chart',
                api_endpoint: '/api/social-media/emotions-analysis',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                sort_order: 3
            },

            // Engagement Category
            {
                name: 'engagement_metrics',
                display_name: 'Engagement Metrics',
                description: 'Likes, shares, comments, and other engagement metrics',
                sample_image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
                category: 'engagement',
                graph_type: 'metric_cards',
                api_endpoint: '/api/social-media/engagement',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok',
                sort_order: 1
            },
            {
                name: 'top_influencers',
                display_name: 'Top Influencers',
                description: 'Most influential users mentioning your brand',
                sample_image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
                category: 'engagement',
                graph_type: 'table',
                api_endpoint: '/api/social-media/influencers',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok',
                sort_order: 2
            },

            // Google Category
            {
                name: 'google_ratings',
                display_name: 'Google Ratings Distribution',
                description: 'Distribution of Google review ratings',
                sample_image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
                category: 'google',
                graph_type: 'bar_chart',
                api_endpoint: '/api/google/review-ratings',
                supported_sources: 'google_reviews,google_maps',
                sort_order: 1
            },
            {
                name: 'location_reviews',
                display_name: 'Reviews by Location',
                description: 'Review distribution across different locations',
                sample_image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
                category: 'google',
                graph_type: 'map',
                api_endpoint: '/api/google/location-reviews',
                supported_sources: 'google_reviews,google_maps',
                sort_order: 2
            },

            // Industry Specific Category
            {
                name: 'undp_keyword_analysis',
                display_name: 'UNDP Keyword Analysis',
                description: 'Analysis of UNDP-related keywords and themes',
                sample_image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
                category: 'industry_specific',
                graph_type: 'network_graph',
                api_endpoint: '/api/social-media/undp/keyword',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,news_web',
                sort_order: 1
            },
            {
                name: 'word_cloud',
                display_name: 'Word Cloud',
                description: 'Most frequently mentioned words and phrases',
                sample_image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
                category: 'trends',
                graph_type: 'word_cloud',
                api_endpoint: '/api/social-media/word-cloud',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                sort_order: 1
            }
        ];

        console.log('Creating available graphs...');
        let createdCount = 0;
        let skippedCount = 0;

        for (const graph of availableGraphs) {
            // Check if graph already exists
            const existingGraph = await prisma.available_graphs.findUnique({
                where: { name: graph.name }
            });

            if (existingGraph) {
                console.log(`⏭️  Skipping '${graph.display_name}' - already exists`);
                skippedCount++;
            } else {
                await prisma.available_graphs.create({
                    data: graph
                });
                console.log(`✅ Created '${graph.display_name}'`);
                createdCount++;
            }
        }

        console.log('Dashboard data seeding completed!');
        
        // Print summary
        const totalGraphsCount = await prisma.available_graphs.count();
        
        console.log(`\n📊 Summary:`);
        console.log(`   • Created: ${createdCount} new graphs`);
        console.log(`   • Skipped: ${skippedCount} existing graphs`);
        console.log(`   • Total graphs in database: ${totalGraphsCount}`);
        
    } catch (error) {
        console.error('Error seeding dashboard data:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run if called directly
if (require.main === module) {
    seedDashboardData()
        .then(() => {
            console.log('Seeding completed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Seeding failed:', error);
            process.exit(1);
        });
}

module.exports = { seedDashboardData }; 