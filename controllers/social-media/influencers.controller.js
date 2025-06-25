const { elasticClient } = require('../../config/elasticsearch');
const { buildTopicQueryString } = require('../../utils/queryBuilder');
const { getCountryCode } = require('../../utils/countryHelper');
const { processFilters } = require('./filter.utils');
const prisma = require('../../config/database');

const INFLUENCER_TYPES = [
    { type: 'Nano', from: 1000, to: 10000 },
    { type: 'Micro', from: 10000, to: 50000 },
    { type: 'Midtier', from: 50000, to: 500000 },
    { type: 'Macro', from: 500000, to: 1000000 },
    { type: 'Mega', from: 1000000, to: 5000000 },
    { type: 'Celebrity', from: 5000000, to: 500000000 }
];

// Define the queries for different influencer categories
const INFLUENCER_CATEGORY_QUERIES = [
    { u_followers: { gte: 5000000 } }, // Celebrity
    { u_followers: { gte: 1000000, lte: 5000000 } }, // Mega
    { u_followers: { gte: 500000, lte: 1000000 } }, // Macro
    { u_followers: { gte: 50000, lte: 500000 } }, // Mid-tier
    { u_followers: { gte: 10000, lte: 50000 } }, // Micro
    { u_followers: { gte: 1000, lte: 10000 } } // Nano
];

const CATEGORY_TYPES = ['celebrity', 'mega', 'macro', 'midtier', 'micro', 'nano'];

const getSourceIcon = (userSource) => {
    if (['khaleej_times', 'Omanobserver', 'Time of oman', 'Blogs'].includes(userSource)) {
        return 'Blog';
    } else if (userSource === 'Reddit') {
        return 'Reddit';
    } else if (['FakeNews', 'News'].includes(userSource)) {
        return 'News';
    } else if (userSource === 'Tumblr') {
        return 'Tumblr';
    } else if (userSource === 'Vimeo') {
        return 'Vimeo';
    } else if (['Web', 'DeepWeb'].includes(userSource)) {
        return 'Web';
    }
    return userSource;
};

// Helper function to create Elasticsearch query
const createElasticQuery = (queryString, greaterThanTime, lessThanTime, range) => ({
    index: process.env.ELASTICSEARCH_DEFAULTINDEX,
    body: {
        query: {
            bool: {
                must: [
                    { query_string: { query: queryString } },
                    {
                        range: {
                            p_created_time: { gte: greaterThanTime, lte: lessThanTime }
                        }
                    },
                    { range: range }
                ]
            }
        }
    }
});



// Helper function to create Elasticsearch query
const createElasticQueryPost = (queryString, greaterThanTime, lessThanTime, range) => ({
    index: process.env.ELASTICSEARCH_DEFAULTINDEX,
    body: {
        query: {
            bool: {
                must: [
                    { query_string: { query: queryString } },
                    {
                        range: {
                            p_created_time: { gte: greaterThanTime, lte: lessThanTime }
                        }
                    },
                    { range: range }
                ]
            }
        },
        size:30,
    }
});

const influencersController = {
    getInfluencers: async (req, res) => {
        try {
            const { 
                timeSlot,
                fromDate,
                toDate,
                sentimentType,
                isScadUser = 'false',
                topicId
            } = req.body;
            
            // Check if this is the special topicId
            const isSpecialTopic = topicId && parseInt(topicId) === 2600;
            
            const categoryData = req.processedCategories || {};

            if (Object.keys(categoryData).length === 0) {
                return res.json({ 
                    finalDataArray: [] 
                });
            }

            const topicQueryString = buildTopicQueryString(categoryData);
            
            // Process filters for time range and sentiment
            const filters = processFilters({
                timeSlot,
                fromDate,
                toDate,
                sentimentType,
                queryString: topicQueryString,
                isSpecialTopic // Pass special topic flag
            });
            
            const finalDataArray = [];
            
            for (const followerType of INFLUENCER_TYPES) {
                const { type, from, to } = followerType;

                // Build source filter based on special topic
                let sourceFilterBool;
                if (isSpecialTopic) {
                    sourceFilterBool = {
                        bool: {
                            should: [
                                { match_phrase: { source: "Facebook" } },
                                { match_phrase: { source: "Twitter" } }
                            ],
                            minimum_should_match: 1
                        }
                    };
                } else {
                    sourceFilterBool = {
                        bool: {
                            should: [
                                { match_phrase: { source: "Facebook" } },
                                { match_phrase: { source: "Twitter" } },
                                { match_phrase: { source: "Instagram" } },
                                { match_phrase: { source: "Youtube" } },
                                { match_phrase: { source: "Pinterest" } },
                                { match_phrase: { source: "Reddit" } },
                                { match_phrase: { source: "LinkedIn" } },
                                { match_phrase: { source: "Linkedin" } },
                                { match_phrase: { source: "Web" } },
                                { match_phrase: { source: "TikTok" } }
                            ],
                            minimum_should_match: 1
                        }
                    };
                }

                const params = {
                    index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                    body: {
                        query: {
                            bool: {
                                must: [
                                    { query_string: { query: filters.queryString } },
                                    { exists: { field: 'u_profile_photo' } },
                                    { range: { p_created_time: { gte: filters.greaterThanTime, lte: filters.lessThanTime } } },
                                    { range: { u_followers: { gte: from, lte: to } } },
                                    sourceFilterBool
                                ],
                                must_not: [{ term: { 'u_profile_photo.keyword': '' } }]
                            }
                        },
                        aggs: {
                            group_by_user: {
                                terms: {
                                    field: 'u_source.keyword',
                                    size: 10,
                                    order: { 'followers_count.value': 'desc' }
                                },
                                aggs: {
                                    grouped_results: {
                                        top_hits: {
                                            size: 1,
                                            _source: {
                                                includes: ['u_fullname', 'u_profile_photo', 'u_country', 'u_followers', 'source', 'u_source']
                                            },
                                            sort: [{ p_created_time: { order: 'desc' } }]
                                        }
                                    },
                                    followers_count: { max: { field: 'u_followers' } }
                                }
                            }
                        }
                    }
                };

                const results = await elasticClient.search(params);

                if (!results?.aggregations?.group_by_user?.buckets) {
                    console.log('no record found for', type);
                    continue;
                }

                const data_array = [];
            

                for (const bucket of results.aggregations.group_by_user.buckets) {
                    if (!bucket.key) continue;

                    const userSource = bucket.grouped_results.hits.hits[0]._source.source;
                    const validSources = ['Twitter', 'Instagram', 'Facebook', 'GoogleMyBusiness', 'Youtube', 'Pinterest', 'Reddit', 'LinkedIn',"Linkedin", 'Web', 'TikTok'];
                    
                    if (isScadUser === 'true' && !validSources.includes(userSource)) {
                        continue;
                    }

                    const sourceData = bucket.grouped_results.hits.hits[0]._source;
                    const flag_image = sourceData.u_country 
                        ? await getCountryCode(sourceData.u_country)
                        : '&nbsp;';

                    const sourceIcon = getSourceIcon(userSource);

                    data_array.push({
                        profile_image: sourceData.u_profile_photo,
                        fullname: sourceData.u_fullname,
                        source: `${sourceData.u_source},${sourceIcon}`,
                        country: flag_image,
                        followers: sourceData.u_followers.toString(),
                        posts: bucket.doc_count.toString()
                    });
                }

                finalDataArray.push({ type, data: data_array });
            }

            return res.json({ finalDataArray });
        } catch (error) {
            console.error('Error fetching influencers data:', error);
            return res.status(500).json({ 
                success: false,
                error: 'Internal server error' 
            });
        }
    },

    getInfluencerCategories: async (req, res) => {
        try {
            const { 
                timeSlot,
                fromDate,
                toDate,
                sentimentType,
                isScadUser = 'false', 
                selectedTab = '',
                topicId
            } = req.body;
            
            // Check if this is the special topicId
            const isSpecialTopic = topicId && parseInt(topicId) === 2600;
            
            const categoryData = req.processedCategories || {};

            if (Object.keys(categoryData).length === 0) {
                return res.json({ 
                    success: true,
                    infArray: {} 
                });
            }

            // Build initial topic query string
            let topicQueryString = buildTopicQueryString(categoryData);
            
            // Process filters for time range and sentiment
            const filters = processFilters({
                timeSlot,
                fromDate,
                toDate,
                sentimentType,
                queryString: topicQueryString,
                isSpecialTopic // Pass special topic flag
            });

            // Handle source filtering based on user type and selected tab
            let finalQueryString = filters.queryString;
            if (isSpecialTopic) {
                // For special topic, only use Facebook and Twitter
                finalQueryString = `${finalQueryString} AND source:('"Facebook" OR "Twitter"')`;
            } else if (isScadUser === 'true') {
                if (selectedTab === 'GOOGLE') {
                    finalQueryString = finalQueryString ? 
                        `${finalQueryString} AND source:('"GoogleMyBusiness"')` :
                        `source:('"GoogleMyBusiness"')`;
                } else {
                    finalQueryString = `${finalQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Linkedin" OR "Web" OR "TikTok")`;
                }
            }

            // Execute Elasticsearch queries concurrently for each category
            const results = await Promise.all(
                INFLUENCER_CATEGORY_QUERIES.map(range => 
                    elasticClient.count(createElasticQuery(finalQueryString, filters.greaterThanTime, filters.lessThanTime, range))
                )
            );

            // Transform results into the expected format
            const infArray = results.reduce((acc, result, index) => {
                acc[CATEGORY_TYPES[index]] = result.count || 0;
                return acc;
            }, {});

            return res.json({ 
                success: true,
                infArray 
            });

        } catch (error) {
            console.error('Error fetching influencer categories:', error);
            return res.status(500).json({ 
                success: false,
                error: 'Internal server error' 
            });
        }
    },

    getInfluencerPost: async (req, res) => {
        try {
            const { 
                timeSlot,
                greaterThanTime,
                lessThanTime,
                sentiment,
                isScadUser = 'false', 
                selectedTab = '',
                type,
                topicId
            } = req.query;
            
            // Check if this is the special topicId
            const isSpecialTopic = topicId && parseInt(topicId) === 2600;
            
            console.log(req.query)
            
            const categoryData = req.processedCategories || {};

            if (Object.keys(categoryData).length === 0) {
                return res.json({ 
                    success: true,
                    infArray: {} 
                });
            }

            // Build initial topic query string
            let topicQueryString = buildTopicQueryString(categoryData);
            
            // Process filters for time range and sentiment
            const filters = processFilters({
                timeSlot,
                fromDate:greaterThanTime,
                toDate:lessThanTime,
                sentimentType:sentiment,
                queryString: topicQueryString,
                isSpecialTopic // Pass special topic flag
            });

            // Handle source filtering based on user type and selected tab
            let finalQueryString = filters.queryString;
            if (isSpecialTopic) {
                // For special topic, only use Facebook and Twitter
                finalQueryString = `${finalQueryString} AND source:('"Facebook" OR "Twitter"')`;
            } else if (isScadUser === 'true') {
                if (selectedTab === 'GOOGLE') {
                    finalQueryString = finalQueryString ? 
                        `${finalQueryString} AND source:('"GoogleMyBusiness"')` :
                        `source:('"GoogleMyBusiness"')`;
                } else {
                    finalQueryString = `${finalQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Linkedin" OR "Web" OR "TikTok")`;
                }
            }


               const index = CATEGORY_TYPES.indexOf(type);
            const results = await 
               
                    elasticClient.search(createElasticQueryPost(finalQueryString, filters.greaterThanTime, filters.lessThanTime, INFLUENCER_CATEGORY_QUERIES[index]))
                
            

             const responseArray =[];
        for (let l = 0; l < results?.hits?.hits?.length; l++) {
            let esData = results?.hits?.hits[l]
            let user_data_string = ''
            let profilePic = esData._source.u_profile_photo
              ? esData._source.u_profile_photo
              : `${process?.env?.PUBLIC_IMAGES_PATH}grey.png`
            let followers = esData._source.u_followers > 0 ? `${esData._source.u_followers}` : ''
            let following = esData._source.u_following > 0 ? `${esData._source.u_following}` : ''
            let posts = esData._source.u_posts > 0 ? `${esData._source.u_posts}` : ''
            let likes = esData._source.p_likes > 0 ? `${esData._source.p_likes}` : ''
            let llm_emotion = esData._source.llm_emotion || ''
            let commentsUrl =
              esData._source.p_comments_text && esData._source.p_comments_text.trim() !== ''
                ? `${esData._source.p_url.trim().replace('https: // ', 'https://')}`
                : ''
            let comments = `${esData._source.p_comments}`
            let shares = esData._source.p_shares > 0 ? `${esData._source.p_shares}` : ''
            let engagements = esData._source.p_engagement > 0 ? `${esData._source.p_engagement}` : ''
            let content =
              esData._source.p_content && esData._source.p_content.trim() !== '' ? `${esData._source.p_content}` : ''
            let imageUrl =
              esData._source.p_picture_url && esData._source.p_picture_url.trim() !== ''
                ? `${esData._source.p_picture_url}`
                : `${process?.env?.PUBLIC_IMAGES_PATH}grey.png`
            let predicted_sentiment = ''
            let predicted_category = ''
    
            // Check if the record was manually updated, if yes, use it
            const chk_senti = await prisma.customers_label_data.findMany({
              where: {
                p_id: esData._id
              },
              orderBy: {
                label_id: 'desc'
              },
              take: 1
            })
    
            if (chk_senti.length > 0) {
              if (chk_senti[0]?.predicted_sentiment_value_requested)
                predicted_sentiment = `${chk_senti[0]?.predicted_sentiment_value_requested}`
            } else if (esData._source.predicted_sentiment_value && esData._source.predicted_sentiment_value !== '') {
              predicted_sentiment = `${esData._source.predicted_sentiment_value}`
            }
    
            // Category prediction
            if (esData._source.predicted_category) {
              predicted_category = esData._source.predicted_category
            }
            let youtubeVideoUrl = ''
            let profilePicture2 = ''
            //const token = await getCsrfToken()
            if (esData._source.source === 'Youtube') {
              if (esData._source.video_embed_url && esData._source.video_embed_url !== '')
                youtubeVideoUrl = `${esData._source.video_embed_url}`
              else if (esData._source.p_id && esData._source.p_id !== '')
                youtubeVideoUrl = `https://www.youtube.com/embed/${esData._source.p_id}`
            } else {
              if (esData._source.p_picture) {
                profilePicture2 = `${esData._source.p_picture}`
              } else {
                profilePicture2 = ''
              }
            }
            // Handle other sources if needed
    
            let sourceIcon = ''
    
            const userSource = esData._source.source
            if (
              userSource == 'khaleej_times' ||
              userSource == 'Omanobserver' ||
              userSource == 'Time of oman' ||
              userSource == 'Blogs'
            ) {
              sourceIcon = 'Blog'
            } else if (userSource == 'Reddit') {
              sourceIcon = 'Reddit'
            } else if (userSource == 'FakeNews' || userSource == 'News') {
              sourceIcon = 'News'
            } else if (userSource == 'Tumblr') {
              sourceIcon = 'Tumblr'
            } else if (userSource == 'Vimeo') {
              sourceIcon = 'Vimeo'
            } else if (userSource == 'Web' || userSource == 'DeepWeb') {
              sourceIcon = 'Web'
            } else {
              sourceIcon = userSource
            }
    
            let message_text = ''
    
            if (esData._source.source === 'GoogleMaps' || esData._source.source === 'Tripadvisor') {
              let m_text = esData._source.p_message_text.split('***|||###')
              message_text = m_text[0].replace(/\n/g, '<br>')
            } else {
              message_text = esData._source.p_message_text
                ? esData._source.p_message_text.replace(/<\/?[^>]+(>|$)/g, '')
                : ''
            }
    
            let cardData = {
              profilePicture: profilePic,
              profilePicture2: profilePicture2,
              userFullname: esData._source.u_fullname,
              user_data_string: user_data_string,
              followers: followers,
              following: following,
              posts: posts,
              likes: likes,
              llm_emotion: llm_emotion,
              commentsUrl: commentsUrl,
              comments: comments,
              shares: shares,
              engagements: engagements,
              content: content,
              image_url: imageUrl,
              predicted_sentiment: predicted_sentiment,
              predicted_category: predicted_category,
              youtube_video_url: youtubeVideoUrl,
              source_icon: `${esData._source.p_url},${sourceIcon}`,
              message_text: message_text,
              source: esData._source.source,
              rating: esData._source.rating,
              comment: esData._source.comment,
              businessResponse: esData._source.business_response,
              uSource: esData._source.u_source,
              googleName: esData._source.name,
              created_at: new Date(esData._source.p_created_time).toLocaleString()
            }
    
            responseArray.push(cardData)
          }
  
        return res.status(200).json({
          success: true,
          responseArray,
          total: responseArray.length || 0,  
          results
        });

               return res.json({ 
                success: true,
                 
            });
            // Transform results into the expected format
            const infArray = results.reduce((acc, result, index) => {
                acc[CATEGORY_TYPES[index]] = result.count || 0;
                return acc;
            }, {});

            return res.json({ 
                success: true,
                infArray 
            });

        } catch (error) {
            console.error('Error fetching influencer categories:', error);
            return res.status(500).json({ 
                success: false,
                error: 'Internal server error' 
            });
        }
    },
};

module.exports = influencersController; 