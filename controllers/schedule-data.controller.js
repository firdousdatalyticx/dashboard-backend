const { elasticClient } = require('../config/elasticsearch');
const { format } = require('date-fns');
const prisma = require('../config/database');

/**
 * Process category data from database similar to categoryTransform middleware
 */
const processCategoryDataForTopic = async (topicId) => {
  try {
    const categoryData = await prisma.topic_categories.findMany({
      where: {
        customer_topic_id: Number(topicId)
      },
      orderBy: [
        { category_title: 'asc' },
        { id: 'asc' }
      ]
    });

    const normalizeArray = (str, delimiter = ', ') => {
      if (!str) return [];
      const items = str.split(/[,|]/)
        .map(item => item.trim())
        .filter(item => item.length > 0)
        .map(item => item.toLowerCase())
        .sort();
      return [...new Set(items)];
    };

    const mergeArrays = (...arrays) => {
      const merged = arrays.flat().filter(item => item);
      return [...new Set(merged)].sort();
    };

    const processedData = {};
    
    categoryData.forEach(category => {
      const categoryName = category.category_title.trim();
      const urls = normalizeArray(category.topic_urls);
      const keywords = normalizeArray(category.topic_keywords);
      const hashtags = normalizeArray(category.topic_hash_tags);
      
      if (processedData[categoryName]) {
        processedData[categoryName] = {
          urls: mergeArrays(processedData[categoryName].urls, urls),
          keywords: mergeArrays(processedData[categoryName].keywords, keywords),
          hashtags: mergeArrays(processedData[categoryName].hashtags, hashtags)
        };
      } else {
        processedData[categoryName] = {
          urls: urls,
          keywords: keywords,
          hashtags: hashtags
        };
      }
    });

    return processedData;
  } catch (error) {
    console.error('Error processing category data:', error);
    return {};
  }
};

/**
 * Add category filters to the query
 */
function addCategoryFilters(query, categoryData) {
  if (!categoryData || Object.keys(categoryData).length === 0) {
    return;
  }

  query.bool.must.push({
    bool: {
      should: [
        ...Object.values(categoryData).flatMap(data =>
          (data.keywords || []).flatMap(keyword => [
            { match_phrase: { p_message_text: keyword } },
            { match_phrase: { keywords: keyword } }
          ])
        ),
        ...Object.values(categoryData).flatMap(data =>
          (data.hashtags || []).flatMap(hashtag => [
            { match_phrase: { p_message_text: hashtag } },
            { match_phrase: { hashtags: hashtag } }
          ])
        ),
        ...Object.values(categoryData).flatMap(data =>
          (data.urls || []).flatMap(url => [
            { match_phrase: { u_source: url } },
            { match_phrase: { p_url: url } }
          ])
        )
      ],
      minimum_should_match: 1
    }
  });
}

/**
 * Build base query with date range and source filter
 */
function buildBaseQuery(dateRange, topicId) {
  const query = {
    bool: {
      must: [],
      must_not: [
        {
          term: {
            source: 'DM'
          }
        }
      ]
    }
  };

  // Only add date range filter if provided (otherwise fetch all time data)
  if (dateRange && dateRange.greaterThanTime && dateRange.lessThanTime) {
    query.bool.must.push({
      range: {
        p_created_time: {
          gte: dateRange.greaterThanTime,
          lte: dateRange.lessThanTime
        }
      }
    });
  }

  // Only include Twitter, LinkedIn, and Linkedin sources
  query.bool.must.push({
    bool: {
      should: [
        { match_phrase: { source: 'LinkedIn' } },
        { match_phrase: { source: 'Linkedin' } }
      ],
      minimum_should_match: 1
    }
  });

  return query;
}

const scheduleDataController = {
  getScheduleData: async (req, res) => {
    try {
      const { fromDate, toDate, topicIds } = req.body;

      // Default topicIds if not provided
      const defaultTopicIds = [2647, 2648, 2649];
      const topicIdsArray = topicIds 
        ? (Array.isArray(topicIds) ? topicIds : [topicIds])
        : defaultTopicIds;

      // Format dates only if provided, otherwise fetch all time data
      let dateRange = null;
      if (fromDate && toDate) {
        const greaterThanTime = format(new Date(fromDate), 'yyyy-MM-dd');
        const lessThanTime = format(new Date(toDate), 'yyyy-MM-dd');
        dateRange = {
          greaterThanTime,
          lessThanTime
        };
      }

      // Handle special case for topicId 2473
      let queryTimeRange = dateRange;
      if (dateRange && topicIdsArray.some(id => Number(id) == 2473)) {
        queryTimeRange = {
          greaterThanTime: '2023-01-01',
          lessThanTime: '2023-04-30'
        };
      }

      // Fetch data for each topicId
      const results = {};

      for (const currentTopicId of topicIdsArray) {
        try {
          // Fetch category data for this topicId
          const categoryData = await processCategoryDataForTopic(currentTopicId);

          // If no category data, skip this topicId or return empty posts
          if (Object.keys(categoryData).length === 0) {
            results[currentTopicId] = { posts: [] };
            continue;
          }

          // Build query for this topicId
          const query = buildBaseQuery(queryTimeRange, currentTopicId);
          addCategoryFilters(query, categoryData);

          // Execute search for posts
          const searchResponse = await elasticClient.search({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: {
              query: query,
              size: 100,
              sort: [{ p_created_time: { order: 'desc' } }],
              _source: {
                excludes: ['u_profile_photo', 'p_picture', 'p_picture_url']
              }
            }
          });

          const posts = searchResponse.hits.hits.map(hit => formatPostData(hit));
          results[currentTopicId] = { posts };
        } catch (error) {
          console.error(`Error fetching data for topicId ${currentTopicId}:`, error);
          results[currentTopicId] = { posts: [], error: 'Failed to fetch data for this topicId' };
        }
      }

      return res.json(results);
    } catch (error) {
      console.error('Error fetching schedule data:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
};

const formatPostData = (hit) => {
  const s = hit._source;
  const followers = s.u_followers > 0 ? `${s.u_followers}` : '';
  const following = s.u_following > 0 ? `${s.u_following}` : '';
  const posts = s.u_posts > 0 ? `${s.u_posts}` : '';
  const likes = s.p_likes > 0 ? `${s.p_likes}` : '';
  const llm_emotion = s.llm_emotion || '';
  const commentsUrl = s.p_comments_text && s.p_comments_text.trim() ? s.p_url.trim().replace('https: // ', 'https://') : '';
  const comments = `${s.p_comments}`;
  const shares = s.p_shares > 0 ? `${s.p_shares}` : '';
  const engagements = s.p_engagement > 0 ? `${s.p_engagement}` : '';
  const content = s.p_content?.trim() || '';
  let predicted_sentiment = s.predicted_sentiment_value || '';
  const predicted_category = s.predicted_category || '';
  let youtubeVideoUrl = '';
  if (s.source === 'Youtube') {
    youtubeVideoUrl = s.video_embed_url ? s.video_embed_url : (s.p_id ? `https://www.youtube.com/embed/${s.p_id}` : '');
  }
  const message_text = (s.p_message_text || '').replace(/<\/?[^>]+(>|$)/g, '');
  return {
    userFullname: s.u_fullname,
    followers,
    following,
    posts,
    likes,
    llm_emotion,
    llm_language: s.llm_language,
    u_country: s.u_country,
    commentsUrl,
    comments,
    shares,
    engagements,
    content,
    predicted_sentiment,
    predicted_category,
    youtube_video_url: youtubeVideoUrl,
    message_text,
    source: s.source,
    rating: s.rating,
    comment: s.comment,
    businessResponse: s.business_response,
    uSource: s.u_source,
    googleName: s.name,
    created_at: new Date(s.p_created_time || s.created_at).toLocaleString(),
    p_comments_data: s.p_comments_data
  };
};

module.exports = scheduleDataController;
