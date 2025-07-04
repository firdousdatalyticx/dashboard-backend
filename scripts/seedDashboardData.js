const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedDashboardData() {
    try {
        console.log('Seeding dashboard data...');

        // Delete existing graphs first
        console.log('Deleting existing graphs...');
        const deletedGraphs = await prisma.available_graphs.deleteMany({});
        console.log(`🗑️  Deleted ${deletedGraphs.count} existing graphs`);

        // Also delete existing topic_enabled_graphs
        const deletedEnabledGraphs = await prisma.topic_enabled_graphs.deleteMany({});
        console.log(`🗑️  Deleted ${deletedEnabledGraphs.count} existing topic enabled graphs`);

        // Seed Available Graphs with proper categorization
        const availableGraphs = [
            // Overview Category
            {
                name: 'mentions_trends',
                display_name: 'Mentions Trends',
                description: 'Timeline showing fluctuations in mention volume over time.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751614311/Mentions_Trends_eshwxd.png',
                category: 'Overview',
                graph_type: 'metric_card',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 1
            },
            {
                name: 'language_summary',
                display_name: 'Language Summary',
                description: 'Distribution of languages used in social media mentions.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751614469/Language_Summary_pj15vt.png',
                category: 'Overview',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'social_media_socials_distribution',
                display_name: 'Social Media Sources Distribution',
                description: 'Breakdown of mentions across different social media platforms.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751614597/socials-distributions_edgbwc.png',
                category: 'Overview',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'mentions_urgency',
                display_name: 'Mentions Urgency',
                description: 'Classification of mentions by urgency level (low, medium, high)',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751614732/Mentions_Urgency_seiued.png',
                category: 'Overview',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'type_of_mentions',
                display_name: 'Type of Mentions',
                description: 'Categorization of mentions by type and platform',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751614825/Type_of_Mentions_qkykko.png',
                category: 'Overview',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'audience_summary',
                display_name: 'Audience Summary',
                description: 'Composition of audience segments engaging with the content.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751614942/Audience_Summary_j3fkd5.png',
                category: 'Overview',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'mentions_recurrence',
                display_name: 'Mentions Recurrence',
                description: ' Frequency patterns of mentions over time.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751615092/Mention_Recurrence_plqajn.png',
                category: 'Overview',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'top_influencers',
                display_name: 'Top Influencers',
                description: 'Most impactful social media figures by follower size.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751615185/Top_Influencers_umgjyf.png',
                category: 'Overview',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'influence_category',
                display_name: 'Influence Category',
                description: 'Spread of influencer reach across different popularity levels.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751615262/Influence_Category_rnqqwa.png',
                category: 'Overview',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'active_audience',
                display_name: 'Active Audience',
                description: 'Most engaged social media accounts discussing the topics.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751615327/Active_Audience_cbe1xd.png',
                category: 'Overview',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },
            {
                name: 'dashboard_keywords',
                display_name: 'Dashboard Keywords',
                description: 'Key terms driving content monitoring and analysis.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751615416/Dashboard_Keywords_y5ou0h.png',
                category: 'Overview',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'audience_intent_matrix',
                display_name: 'Audience Intent Matrix',
                description: 'Analysis of audience types and their interaction patterns with different content categories.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751615491/Audience_Intent_Matrix_thvhbt.png',
                category: 'Overview',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

    

            {
                name: 'action_required',
                display_name: 'Action Required',
                description: 'Classification of required actions and their distribution across social media platforms.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751613960/Action_Required_vv0jbr.png',
                category: 'Overview',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'top_10_entities',
                display_name: 'Top 10 Entities',
                description: 'Most frequently mentioned entities in social media posts.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751615706/Top_10_Entities_qklyyx.png',
                category: 'Overview',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            // WordCloud Category

            {
                name: 'keywords_analysis',
                display_name: 'Keywords Analysis',
                description: 'Most frequent phrases and themes in customer feedback.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751615804/Keyword_Analysis_ukdbqa.png',
                category: 'WordCloud',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            // Sentiment Category

            {
                name: 'sentiment_analysis',
                display_name: 'Sentiment Analysis',
                description: 'Overall sentiment trends across social media mentions.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751615948/Sentiment_Analysis_qwhqad.png',
                category: 'Sentiment',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'sentiment_distribution_by_poi',
                display_name: 'Sentiment Distribution by POI',
                description: 'Sentiment breakdown across different categories.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751616039/Sentiment_Distribution_by_POI_cbz0qk.png',
                category: 'Sentiment',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'leaderboard',
                display_name: 'Leaderboard',
                description: 'Ranking of Categories by sentiment polarity and engagement.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751616117/Leaderboard_qng5nz.png',
                category: 'Sentiment',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            // Emotion Category


            {
                name: 'emotion_analysis',
                display_name: 'Emotion Analysis',
                description: 'Emotional tone detected in social media discussions.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751616222/Emotion_Analysis_mtgxlp.png',
                category: 'Emotion',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'emotion_polarity',
                display_name: 'Emotion Polarity',
                description: 'Strength and direction of emotional reactions in mentions.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751616290/Emotion_Polarity_c9eptb.png',
                category: 'Emotion',
                graph_type: 'line_chart',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },



            // {
            //     name: 'source_distribution',
            //     display_name: 'Source Distribution',
            //     description: 'Distribution of mentions across different sources',
            //     sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751613960/Action_Required_vv0jbr.png',
            //     category: 'Overview',
            //     graph_type: 'pie_chart',
            //     api_endpoint: '/api/social-media/socials-distributions',
            //     supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
            //     is_default: true,
            //     sort_order: 3
            // },
            // {
            //     name: 'engagement_metrics',
            //     display_name: 'Engagement Metrics',
            //     description: 'Likes, shares, comments, and other engagement metrics',
            //     sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751613960/Action_Required_vv0jbr.png',
            //     category: 'Overview',
            //     graph_type: 'metric_cards',
            //     api_endpoint: '/api/social-media/engagement',
            //     supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok',
            //     is_default: false,
            //     sort_order: 4
            // },
            // {
            //     name: 'top_influencers',
            //     display_name: 'Top Influencers',
            //     description: 'Most influential users mentioning your brand',
            //     sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751613960/Action_Required_vv0jbr.png',
            //     category: 'Overview',
            //     graph_type: 'table',
            //     api_endpoint: '/api/social-media/influencers',
            //     supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok',
            //     is_default: false,
            //     sort_order: 5
            // },

            // // Sentiment Category
            // {
            //     name: 'sentiment_overview',
            //     display_name: 'Sentiment Overview',
            //     description: 'Overall sentiment distribution (Positive, Negative, Neutral)',
            //     sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751613960/Action_Required_vv0jbr.png',
            //     category: 'Sentiment',
            //     graph_type: 'donut_chart',
            //     api_endpoint: '/api/social-media/sentiments-analysis',
            //     supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
            //     is_default: true,
            //     sort_order: 1
            // },
            // {
            //     name: 'sentiment_trend',
            //     display_name: 'Sentiment Trend',
            //     description: 'Sentiment changes over time',
            //     sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751613960/Action_Required_vv0jbr.png',
            //     category: 'Sentiment',
            //     graph_type: 'stacked_area_chart',
            //     api_endpoint: '/api/social-media/sentiments-analysis',
            //     supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
            //     is_default: false,
            //     sort_order: 2
            // },

            // // Emotion Category
            // {
            //     name: 'emotion_analysis',
            //     display_name: 'Emotion Analysis',
            //     description: 'Detailed emotion breakdown (Joy, Anger, Fear, Sadness, etc.)',
            //     sample_image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
            //     category: 'Emotion',
            //     graph_type: 'horizontal_bar_chart',
            //     api_endpoint: '/api/social-media/emotions-analysis',
            //     supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
            //     is_default: true,
            //     sort_order: 1
            // },
            // {
            //     name: 'emotion_polarity',
            //     display_name: 'Emotion Polarity',
            //     description: 'Emotional polarity analysis across mentions',
            //     sample_image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
            //     category: 'Emotion',
            //     graph_type: 'polar_chart',
            //     api_endpoint: '/api/social-media/emotion-polarity',
            //     supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
            //     is_default: false,
            //     sort_order: 2
            // },

            // // WordCloud Category
            // {
            //     name: 'word_cloud',
            //     display_name: 'Word Cloud',
            //     description: 'Most frequently mentioned words and phrases',
            //     sample_image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
            //     category: 'WordCloud',
            //     graph_type: 'word_cloud',
            //     api_endpoint: '/api/social-media/word-cloud',
            //     supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
            //     is_default: true,
            //     sort_order: 1
            // },
            // {
            //     name: 'undp_keyword_analysis',
            //     display_name: 'UNDP Keyword Analysis',
            //     description: 'Analysis of UNDP-related keywords and themes',
            //     sample_image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
            //     category: 'WordCloud',
            //     graph_type: 'network_graph',
            //     api_endpoint: '/api/social-media/undp/keyword',
            //     supported_sources: 'facebook,twitter,instagram,youtube,linkedin,news_web',
            //     is_default: false,
            //     sort_order: 2
            // },

            // // Google Category
            // {
            //     name: 'google_ratings',
            //     display_name: 'Google Ratings Distribution',
            //     description: 'Distribution of Google review ratings',
            //     sample_image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
            //     category: 'Google',
            //     graph_type: 'bar_chart',
            //     api_endpoint: '/api/google/review-ratings',
            //     supported_sources: 'google_reviews,google_maps',
            //     is_default: true,
            //     sort_order: 1
            // },
            // {
            //     name: 'location_reviews',
            //     display_name: 'Reviews by Location',
            //     description: 'Review distribution across different locations',
            //     sample_image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
            //     category: 'Google',
            //     graph_type: 'map',
            //     api_endpoint: '/api/google/location-reviews',
            //     supported_sources: 'google_reviews,google_maps',
            //     is_default: false,
            //     sort_order: 2
            // },
            // {
            //     name: 'google_word_cloud',
            //     display_name: 'Google Reviews Word Cloud',
            //     description: 'Word cloud from Google reviews content',
            //     sample_image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
            //     category: 'Google',
            //     graph_type: 'word_cloud',
            //     api_endpoint: '/api/google/word-cloud',
            //     supported_sources: 'google_reviews,google_maps',
            //     is_default: false,
            //     sort_order: 3
            // }
        ];

        console.log('Creating available graphs...');
        let createdCount = 0;

        for (const graph of availableGraphs) {
            await prisma.available_graphs.create({
                data: graph
            });
            console.log(`✅ Created '${graph.display_name}' (${graph.category}) - Default: ${graph.is_default}`);
            createdCount++;
        }

        console.log('Dashboard data seeding completed!');
        
        // Print summary
        const totalGraphsCount = await prisma.available_graphs.count();
        const defaultGraphsCount = await prisma.available_graphs.count({
            where: {
                is_default: true
            }
        });
        
        console.log(`\n📊 Summary:`);
        console.log(`   • Created: ${createdCount} new graphs`);
        console.log(`   • Total graphs in database: ${totalGraphsCount}`);
        console.log(`   • Default graphs: ${defaultGraphsCount}`);
        
        // Show graphs by category
        const graphsByCategory = await prisma.available_graphs.groupBy({
            by: ['category'],
            _count: {
                category: true
            }
        });
        
        console.log(`\n📊 Graphs by Category:`);
        graphsByCategory.forEach(group => {
            console.log(`   • ${group.category}: ${group._count.category} graphs`);
        });
        
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