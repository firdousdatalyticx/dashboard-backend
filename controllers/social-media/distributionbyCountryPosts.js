const prisma = require("../../config/database");
const { elasticClient } = require("../../config/elasticsearch");
const { buildTopicQueryString } = require("../../utils/queryBuilder");
const { processFilters } = require("./filter.utils");


const distributionbyCountryPostsController = {
    /**
     * Get posts based on filtering criteria.
     */
    getDistributionbyCountryPosts: async (req, res) => {
      try {
        const {
          topicId,
          isScadUser,
          selectedTab,
          postTypeSource,
          postType,
          postTypeData,
          sentiment:sentimentType,
          emotion,
          keyword,
          country,
          greaterThanTime:fromDate,
          lessThanTime:toDate,
          touchId,
          timeSlot,
          parentAccountId,
          limit,
          rating,
          category="all",
          source="All"
        } = req.query;
        

                          const categoryData = req.processedCategories || {};

                          if (Object.keys(categoryData).length === 0) {
                              return res.json({ 
                                  responseArray: []
                              });
                          }

                        // Build base query for filters processing
                        const baseQueryString = buildBaseQueryString("all", categoryData);

                        // Process filters (time slot, date range, sentiment)
                        const filters = processFilters({
                            sentimentType,
                            timeSlot,
                            fromDate,
                            toDate,
                            queryString: baseQueryString
                        });
            
                        // Handle special case for unTopic
                        let queryTimeRange = {
                            gte: filters.greaterThanTime,
                            lte: filters.lessThanTime
                        };
            
                      if (Number(topicId)==2473) {
                            queryTimeRange = {
                                gte: '2023-01-01',
                                lte: '2023-04-30'
                            };
                        }
            
                        // Build base query
                        const query = buildBaseQuery({
                            greaterThanTime: queryTimeRange.gte,
                            lessThanTime: queryTimeRange.lte
                        }, source);
            
                        // Add category filters
                        addCategoryFilters(query, "all", categoryData);
                        
                        // Apply sentiment filter if provided
                        if (sentimentType && sentimentType !== 'undefined' && sentimentType !== 'null' && sentimentType !== '' ) {
                            if (sentimentType.includes(',')) {
                                // Handle multiple sentiment types
                                const sentimentArray = sentimentType.split(',');
                                const sentimentFilter = {
                                    bool: {
                                        should: sentimentArray.map(sentiment => ({
                                            match: { predicted_sentiment_value: sentiment.trim() }
                                        })),
                                        minimum_should_match: 1
                                    }
                                };
                                query.bool.must.push(sentimentFilter);
                            } else {
                                // Handle single sentiment type
                                query.bool.must.push({
                                    match: { predicted_sentiment_value: sentimentType.trim() }
                                });
                            }
                        }
            

                      query.bool.must.push({ exists: { field: 'u_country' } });      
            
                      query.bool.must.push({
                        term: {
                            "u_country.keyword": country
                        }
                    });

              const params = {
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: {
                    query: query,
                    size: 30,
                    sort: [{ p_created_time: { order: 'desc' } }]
                }
            };


        
        // Execute the Elasticsearch query.
        const results = await elasticClient.search(params);
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
        });
      } catch (error) {
        console.error('Error fetching posts:', error);
        return res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    }
  };
  


/**
 * Build a base query string from category data for filters processing
 * @param {string} selectedCategory - Category to filter by
 * @param {Object} categoryData - Category data
 * @returns {string} Query string
 */
function buildBaseQueryString(selectedCategory, categoryData) {
  let queryString = '';
  const allTerms = [];
  
  if (selectedCategory === 'all') {
      // Combine all keywords, hashtags, and urls from all categories
      Object.values(categoryData).forEach(data => {
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
  
  // Create a query string with all terms as ORs
  if (allTerms.length > 0) {
      const terms = allTerms.map(term => `"${term}"`).join(' OR ');
      queryString = `(p_message_text:(${terms}) OR u_fullname:(${terms}))`;
  }
  
  return queryString;
}

/**
* Build base query with date range and source filter
* @param {Object} dateRange - Date range with greaterThanTime and lessThanTime
* @param {string} source - Source to filter by
* @returns {Object} Elasticsearch query object
*/
function buildBaseQuery(dateRange, source) {
  const query = {
      bool: {
          must: [
         
              {
                  range: {
                      p_created_time: {
                          gte: dateRange.greaterThanTime,
                          lte: dateRange.lessThanTime
                      }
                  }
              }
          ],
          must_not: [
              {
                  term: {
                      source: 'DM'
                  }
              }
          ]
      }
  };

  // Add source filter if a specific source is selected
  if (source !== 'All') {
      query.bool.must.push({
          match_phrase: { source: source }
      });
  } else {
      query.bool.must.push({
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
      });
  }

  return query;
}

/**
* Add category filters to the query
* @param {Object} query - Elasticsearch query object
* @param {string} selectedCategory - Category to filter by
* @param {Object} categoryData - Category data with filters
*/
function addCategoryFilters(query, selectedCategory, categoryData) {
  if (selectedCategory === 'all') {
      query.bool.must.push({
          bool: {
              should: [
                  ...Object.values(categoryData).flatMap(data =>
                      (data.keywords || []).map(keyword => ({
                          multi_match: {
                              query: keyword,
                              fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                              type: 'phrase'
                          }
                      }))
                  ),
                  ...Object.values(categoryData).flatMap(data =>
                      (data.hashtags || []).map(hashtag => ({
                          multi_match: {
                              query: hashtag,
                              fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                              type: 'phrase'
                          }
                      }))
                  ),
                  ...Object.values(categoryData).flatMap(data =>
                      (data.urls || []).map(url => ({
                          multi_match: {
                              query: url,
                              fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                              type: 'phrase'
                          }
                      }))
                  )
              ],
              minimum_should_match: 1
          }
      });
  } else if (categoryData[selectedCategory]) {
      const data = categoryData[selectedCategory];

      // Check if the category has any filtering criteria
      const hasKeywords = Array.isArray(data.keywords) && data.keywords.length > 0;
      const hasHashtags = Array.isArray(data.hashtags) && data.hashtags.length > 0;
      const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;

      // Only add the filter if there's at least one criteria
      if (hasKeywords || hasHashtags || hasUrls) {
          query.bool.must.push({
              bool: {
                  should: [
                      ...(data.keywords || []).map(keyword => ({
                          multi_match: {
                              query: keyword,
                              fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                              type: 'phrase'
                          }
                      })),
                      ...(data.hashtags || []).map(hashtag => ({
                          multi_match: {
                              query: hashtag,
                              fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                              type: 'phrase'
                          }
                      })),
                      ...(data.urls || []).map(url => ({
                          multi_match: {
                              query: url,
                              fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                              type: 'phrase'
                          }
                      }))
                  ],
                  minimum_should_match: 1
              }
          });
      } else {
          // If the category has no filtering criteria, add a condition that will match nothing
          query.bool.must.push({
              bool: {
                  must_not: {
                      match_all: {}
                  }
              }
          });
      }
  }
}


  module.exports = distributionbyCountryPostsController;