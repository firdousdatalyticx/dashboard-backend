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
                component_enum: 'MentionsTrend',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: false,
                sort_order: 1
            },
            {
                name: 'language_summary',
                display_name: 'Language Summary',
                description: 'Distribution of languages used in social media mentions.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751614469/Language_Summary_pj15vt.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'LanguageSummary',
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
                component_enum: 'SocialDistribution',
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
                component_enum: 'MentionsUrgency',
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
                component_enum: 'MentionsType',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: false,
                sort_order: 2
            },

            {
                name: 'audience_summary',
                display_name: 'Audience Summary',
                description: 'Composition of audience segments engaging with the content.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751614942/Audience_Summary_j3fkd5.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'AudienceSummary',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: false,
                sort_order: 2
            },

            {
                name: 'mentions_recurrence',
                display_name: 'Mentions Recurrence',
                description: ' Frequency patterns of mentions over time.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751615092/Mention_Recurrence_plqajn.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'MentionsRecurrence',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: false,
                sort_order: 2
            },

            {
                name: 'top_influencers',
                display_name: 'Top Influencers',
                description: 'Most impactful social media figures by follower size.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751615185/Top_Influencers_umgjyf.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'TopInfluencers',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: false,
                sort_order: 2
            },

            {
                name: 'influence_category',
                display_name: 'Influence Category',
                description: 'Spread of influencer reach across different popularity levels.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751615262/Influence_Category_rnqqwa.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'InfluenceCategory',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: false,
                sort_order: 2
            },

            {
                name: 'active_audience',
                display_name: 'Active Audience',
                description: 'Most engaged social media accounts discussing the topics.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751615327/Active_Audience_cbe1xd.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'ActiveAudience',
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
                component_enum: 'DashboardKeywords',
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
                component_enum: 'AudienceIntentMatrix',
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
                component_enum: 'ActionRequired',
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
                component_enum: 'TopEntities',
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
                component_enum: 'KeywordsAnalysis',
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
                component_enum: 'SentimentAnalysis',
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
                component_enum: 'SentimentDistribution',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: false,
                sort_order: 2
            },

            {
                name: 'leaderboard',
                display_name: 'Leaderboard',
                description: 'Ranking of Categories by sentiment polarity and engagement.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751616117/Leaderboard_qng5nz.png',
                category: 'Sentiment',
                graph_type: 'line_chart',
                component_enum: 'Leaderboard',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: false,
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
                component_enum: 'EmotionAnalysis',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: false,
                sort_order: 2
            },

            {
                name: 'emotion_polarity',
                display_name: 'Emotion Polarity',
                description: 'Strength and direction of emotional reactions in mentions.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751616290/Emotion_Polarity_c9eptb.png',
                category: 'Emotion',
                graph_type: 'line_chart',
                component_enum: 'EmotionPolarity',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            // Google Category
            
            {
                name: 'google_map',
                display_name: 'Google Map',
                description: 'Geographic visualization of key locations and data points.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751627101/Google_Map_xvofsk.png',
                category: 'Google',
                graph_type: 'line_chart',
                component_enum: 'GoogleMap',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'kepler_map',
                display_name: 'Kepler Map',
                description: 'Geographic visualization of key locations and data points.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751627178/Kepler_Map_sb6ln9.png',
                category: 'Google',
                graph_type: 'line_chart',
                component_enum: 'KeplerMap',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'review_trends_by_rating',
                display_name: 'Review Trends by Rating',
                description: 'Customer rating patterns over time.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751627297/Review_Trends_by_Rating_cevk6w.png',
                category: 'Google',
                graph_type: 'line_chart',
                component_enum: 'ReviewTrendsByRating',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'google_reviews_trend',
                display_name: 'Google Reviews Trend',
                description: 'Volume of Google reviews over time.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751627462/Google_Reviews_Trend_lkkz7d.png',
                category: 'Google',
                graph_type: 'line_chart',
                component_enum: 'GoogleReviewsTrend',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'google_reviews_rating',
                display_name: 'Google Reviews Rating',
                description: 'Distribution of star ratings from customer reviews.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751627540/Google_Review_Rating_ssekzw.png',
                category: 'Google',
                graph_type: 'line_chart',
                component_enum: 'GoogleReviewsRating',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'google_reviews_keywords',
                display_name: 'Google Reviews Keywords',
                description: 'Most frequent phrases and themes in customer feedback.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751627635/Google_Review_Keywords_xon4ky.png',
                category: 'Google',
                graph_type: 'line_chart',
                component_enum: 'GoogleReviewsKeywords',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

   // Arabic Category


    {
                name: 'trust_dimensions_analysis',
                display_name: 'Trust Dimensions Analysis',
                description: 'Visualization of trust-related terms grouped by sentiment type (supportive, distrustful, neutral, mixed)',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751882078/Trust_Dimensions_Analysis_x7arcf.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'TrustDimensionsAnalysis',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'post_created_over_time',
                display_name: 'Post Created Over Time',
                description: 'Quarterly posting frequency trends highlighting activity patterns.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751882196/Posts_Created_Over_Time_Quarterly_l7vfyu.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'PostsOverTime',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'distrustful_tone_by_trust_dimension_country',
                display_name: 'Distrustful Tone by Trust-Dimension & Country',
                description: 'Distrust levels across institutions and countries measured by mention volume.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751882302/Distrustful_tone_by_trust-dimension_country_cwgeaf.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'DistrustfulToneByCountry',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'themes_by_sentiment',
                display_name: 'Themes by Sentiment',
                description: 'Categorization of discussion topics by Sentiment(positive/negative/neutral).',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751882408/Themes_by_Sentiment_v64hbs.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'ThemesBySentiment',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'distrustful_trust_dimensions_over_time',
                display_name: 'Distrustful Trust Dimensions Over Time',
                description: 'Evolution of distrust toward specific institutions in Arab countries.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751882501/Distrustful_Trust_Dimensions_Over_Time_gbqzjc.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'DistrustfulTrustOverTime',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'touchpoints_by_sentiment',
                display_name: 'Touchpoints by Sentiment',
                description: 'Sentiment analysis of key interaction points (positive/negative/neutral).',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751882581/Touchpoints_by_Sentiment_gxjbgt.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'TouchpointsBySentiment',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'themes_over_time',
                display_name: 'Themes Over Time',
                description: 'Temporal trends of major discussion topics with monthly tracking.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751882693/Themes_Over_Time_hp0zas.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'ThemesOverTime',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'sentiment_distribution_by_sector',
                display_name: 'Sentiment Distribution by Sector',
                description: 'Comparison of trust/distrust mentions across different societal sectors.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751882786/Sentiment_Distribution_by_Sector_psgdtl.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'SentimentDistributionBySector',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'migration_topic_distribution_by_sentiment',
                display_name: 'Migration Topic Distribution By Sentiment',
                description: 'Sentiment analysis of migration-related discussions across various subtopics.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751882858/Migration_Topic_Distribution_By_Sentiment_w3y7ga.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'MigrationTopicDistribution',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'mentions_distribution_by_sector',
                display_name: 'Mentions Distribution by Sector',
                description: 'Volume and percentage breakdown of sector-specific social media mentions.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751883116/Mentions_Distribution_by_Sector_rrsnw2.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'MentionsDistributionBySector',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'trust_dimensions_by_tone',
                display_name: 'Trust Dimensions by Tone',
                description: 'Sentiment classification (supportive/distrustful/neutral/mixed) across different trust factors.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751883195/Trust_Dimensions_by_Tone_ug6fgv.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'TrustDimensionsByTone',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            // LEAP GRAPHS


            {
                name: 'motivation_phase_sentiments',
                display_name: 'Motivation Phase Sentiments',
                description: 'Sentiment trends across pre-event, during event, and post-event phases.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751960031/Motivation_joopr8.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'MotivationPhaseSentiments',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'event_phases_word_cloud',
                display_name: 'Event Phases Word Cloud',
                description: 'Most frequent phrases visualized as word clouds for each event phase (pre-event, event days, post-event).',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751960118/Event-Phases-Word_ouyeni.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'EventPhasesWordCloud',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'event_type_popularity',
                display_name: 'Event Type Popularity',
                description: 'Percentage distribution of different event formats (announcement, keynote, expo, workshop).',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751960199/Event-Type-Popularity_ofiaee.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'EventTypePopularity',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },


            // UAE Inflation

            {
                name: 'inflation_categories_analysis',
                display_name: 'Inflation Categories Analysis',
                description: 'Ranking of inflation-related discussion topics by mention frequency.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751960338/Inflation-Category_Analysis_y1c5t9.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'InflationCategoriesAnalysis',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },


            {
                name: 'inflation_by_sector',
                display_name: 'Inflation by Sector',
                description: 'Industry-specific inflation mentions with trend direction indicators.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751960431/Inflation-By-Sector_fbgb55.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'InflationBySector',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'inflation_type_distribution',
                display_name: 'Inflation Type Distribution',
                description: 'Prevalence of different inflation types in social discussions.',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751960516/Inflation-Type-Distribution_hci6ci.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'InflationTypeDistribution',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            {
                name: 'inflation_phrases_analysis',
                display_name: 'Inflation Phrases Analysis',
                description: 'Key terms grouped by inflation trend direction (rising/falling/stabilizing/volatile).',
                sample_image_url: 'https://res.cloudinary.com/dwllrmrpo/image/upload/v1751960623/Inflation-Phases-Analysis_j6ntcm.png',
                category: 'Overview',
                graph_type: 'line_chart',
                component_enum: 'InflationPhrasesAnalysis',
                api_endpoint: '/api/social-media/mentions-trend',
                supported_sources: 'facebook,twitter,instagram,youtube,linkedin,tiktok,reddit,pinterest,news_web',
                is_default: true,
                sort_order: 2
            },

            


            
      
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