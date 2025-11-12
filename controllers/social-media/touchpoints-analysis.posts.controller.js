const { elasticClient } = require('../../config/elasticsearch');
const { format, parseISO, subDays } = require('date-fns');
const processCategoryItems = require('../../helpers/processedCategoryItems');

/**
 * Normalize source input to handle comma-separated strings, arrays, or single values
 * @param {string|Array} source - Source input
 * @returns {Array} Array of normalized sources
 */
function normalizeSourceInput(source) {
  if (!source || source === 'All') {
    return []; // No specific source filter
  }
  if (Array.isArray(source)) {
    return source.filter(s => s && s.trim() !== '');
  }
  if (typeof source === 'string') {
    return source.split(',').map(s => s.trim()).filter(s => s !== '');
  }
  return [];
}

const getTouchpointPosts = async (req, res) => {
  try {
    const {
      source = 'All',
      category = 'all',
      topicId,
      greaterThanTime,
      lessThanTime,
      sentiment,
      touchpoint, // required
      page = 1,
      limit = 20
    } = req.body;

    if (!touchpoint) {
      return res.status(400).json({ success: false, error: 'touchpoint is required' });
    }

    // Category data
    let categoryData = {};
    if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
      categoryData = processCategoryItems(req.body.categoryItems);
    } else {
      categoryData = req.processedCategories || {};
    }
    if (Object.keys(categoryData).length === 0) {
      return res.json({ success: true, posts: [], total: 0, page: Number(page), limit: Number(limit) });
    }

    // Date range
    const now = new Date();
    let start = greaterThanTime ? parseISO(greaterThanTime) : subDays(now, 90);
    let end = lessThanTime ? parseISO(lessThanTime) : now;
    const gte = format(start, 'yyyy-MM-dd');
    const lte = format(end, 'yyyy-MM-dd');

    // Build query
    const query = {
      bool: {
        must: [
          { exists: { field: 'touchpoints' } },
          { term: { 'touchpoints.keyword': touchpoint } },
          {
            range: {
              p_created_time: {
                gte: `${gte}T00:00:00.000Z`,
                lte: `${lte}T23:59:59.999Z`
              }
            }
          }
        ],
        must_not: [ { term: { 'touchpoints.keyword': '' } } ]
      }
    };

    // Add source filter
    const isSpecialTopic = topicId && parseInt(topicId) === 2600;
    const normalizedSources = normalizeSourceInput(source);
    
    if (normalizedSources.length > 0) {
      query.bool.must.push({
        bool: {
          should: normalizedSources.map(s => ({ match_phrase: { source: s } })),
          minimum_should_match: 1
        }
      });
    } else if (parseInt(topicId) === 2619 || parseInt(topicId) === 2639 || parseInt(topicId) === 2640) {
      query.bool.must.push({
        bool: {
          should: [
            { match_phrase: { source: "LinkedIn" } },
            { match_phrase: { source: "Linkedin" } }
          ],
          minimum_should_match: 1
        }
      });
    } else if (isSpecialTopic) {
      query.bool.must.push({
        bool: {
          should: [
            { match_phrase: { source: "Facebook" } },
            { match_phrase: { source: "Twitter" } }
          ],
          minimum_should_match: 1
        }
      });
    } else {
      // Default: all social media sources
      query.bool.must.push({
        bool: {
          should: [
            { match_phrase: { source: "Facebook" } },
            { match_phrase: { source: "Twitter" } },
            { match_phrase: { source: "Instagram" } },
            { match_phrase: { source: "Youtube" } },
            { match_phrase: { source: "LinkedIn" } },
            { match_phrase: { source: "Linkedin" } },
            { match_phrase: { source: "Pinterest" } },
            { match_phrase: { source: "Web" } },
            { match_phrase: { source: "Reddit" } },
            { match_phrase: { source: "TikTok" } }
          ],
          minimum_should_match: 1
        }
      });
    }

    // Sentiment filter
    if (sentiment && sentiment !== '' && sentiment !== 'All') {
      query.bool.must.push({ term: { 'predicted_sentiment_value.keyword': sentiment } });
    }

    // Category filters
    if (category === 'all') {
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
    } else if (categoryData[category]) {
      const data = categoryData[category];
      const hasKeywords = Array.isArray(data.keywords) && data.keywords.length > 0;
      const hasHashtags = Array.isArray(data.hashtags) && data.hashtags.length > 0;
      const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;
      if (hasKeywords || hasHashtags || hasUrls) {
        query.bool.must.push({
          bool: {
            should: [
              ...(data.keywords || []).map(keyword => ({
                multi_match: { query: keyword, fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'], type: 'phrase' }
              })),
              ...(data.hashtags || []).map(hashtag => ({
                multi_match: { query: hashtag, fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'], type: 'phrase' }
              })),
              ...(data.urls || []).map(url => ({
                multi_match: { query: url, fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'], type: 'phrase' }
              }))
            ],
            minimum_should_match: 1
          }
        });
      } else {
        query.bool.must.push({ bool: { must_not: { match_all: {} } } });
      }
    }

    const from = (Number(page) - 1) * Number(limit);
    const searchBody = {
      from,
      size: Number(limit),
      query,
      sort: [{ p_created_time: { order: 'desc' } }],
      _source: [
        'touchpoints',
        'created_at',
        'p_created_time',
        'source',
        'p_message',
        'p_message_text',
        'u_profile_photo',
        'u_fullname',
        'p_url',
        'p_id',
        'p_picture',
        'p_picture_url',
        'predicted_sentiment_value',
        'predicted_category',
        'llm_emotion',
        'u_followers',
        'u_following',
        'u_posts',
        'p_likes',
        'p_comments_text',
        'p_comments',
        'p_shares',
        'p_engagement',
        'p_content',
        'u_source',
        'name',
        'rating',
        'comment',
        'business_response',
        'u_country'
      ]
    };

    const resp = await elasticClient.search({
      index: process.env.ELASTICSEARCH_DEFAULTINDEX,
      body: searchBody,
      timeout: '10s',
      track_total_hits: true
    });

    const posts = (resp.hits?.hits || []).map(hit => formatPostData(hit));

    return res.json({
      success: true,
      posts,
      total: resp.hits?.total?.value || 0,
      page: Number(page),
      limit: Number(limit)
    });
  } catch (err) {
    console.error('Error fetching touchpoint posts:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Format post data for the frontend
 * @param {Object} hit - Elasticsearch document hit
 * @returns {Object} Formatted post data
 */
const formatPostData = (hit) => {
  const source = hit._source;

  // Use a default image if a profile picture is not provided
  const profilePic = source.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

  // Social metrics
  const followers = source.u_followers > 0 ? `${source.u_followers}` : '';
  const following = source.u_following > 0 ? `${source.u_following}` : '';
  const posts = source.u_posts > 0 ? `${source.u_posts}` : '';
  const likes = source.p_likes > 0 ? `${source.p_likes}` : '';

  // Emotion
  const llm_emotion = source.llm_emotion ||
    (source.source === 'GoogleMyBusiness' && source.rating
      ? (source.rating >= 4 ? 'Supportive'
        : source.rating <= 2 ? 'Frustrated'
          : 'Neutral')
      : '');

  // Clean up comments URL if available
  const commentsUrl = source.p_comments_text && source.p_comments_text.trim() !== ''
    ? source.p_url.trim().replace('https: // ', 'https://')
    : '';

  const comments = `${source.p_comments}`;
  const shares = source.p_shares > 0 ? `${source.p_shares}` : '';
  const engagements = source.p_engagement > 0 ? `${source.p_engagement}` : '';

  const content = source.p_content && source.p_content.trim() !== '' ? source.p_content : '';
  const imageUrl = source.p_picture_url && source.p_picture_url.trim() !== ''
    ? source.p_picture_url
    : `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

  // Determine sentiment
  let predicted_sentiment = '';
  let predicted_category = '';
  
  if (source.predicted_sentiment_value)
    predicted_sentiment = `${source.predicted_sentiment_value}`;
  else if (source.source === 'GoogleMyBusiness' && source.rating) {
    predicted_sentiment = source.rating >= 4 ? 'Positive'
      : source.rating <= 2 ? 'Negative'
        : 'Neutral';
  }

  if (source.predicted_category) predicted_category = source.predicted_category;

  // Handle YouTube-specific fields
  let youtubeVideoUrl = '';
  let profilePicture2 = '';
  if (source.source === 'Youtube') {
    if (source.video_embed_url) youtubeVideoUrl = source.video_embed_url;
    else if (source.p_id) youtubeVideoUrl = `https://www.youtube.com/embed/${source.p_id}`;
  } else {
    profilePicture2 = source.p_picture ? source.p_picture : '';
  }

  // Determine source icon based on source name
  let sourceIcon = '';
  const userSource = source.source;
  if (['khaleej_times', 'Omanobserver', 'Time of oman', 'Blogs'].includes(userSource))
    sourceIcon = 'Blog';
  else if (userSource === 'Reddit')
    sourceIcon = 'Reddit';
  else if (['FakeNews', 'News'].includes(userSource))
    sourceIcon = 'News';
  else if (userSource === 'Tumblr')
    sourceIcon = 'Tumblr';
  else if (userSource === 'Vimeo')
    sourceIcon = 'Vimeo';
  else if (['Web', 'DeepWeb'].includes(userSource))
    sourceIcon = 'Web';
  else
    sourceIcon = userSource;

  // Format message text – with special handling for GoogleMaps/Tripadvisor
  let message_text = '';
  if (['GoogleMaps', 'Tripadvisor'].includes(source.source)) {
    const parts = source.p_message_text.split('***|||###');
    message_text = parts[0].replace(/\n/g, '<br>');
  } else {
    message_text = source.p_message_text ? source.p_message_text.replace(/<\/?[^>]+(>|$)/g, '') : '';
  }

  return {
    profilePicture: profilePic,
    profilePicture2,
    userFullname: source.u_fullname,
    user_data_string: '',
    followers,
    following,
    posts,
    likes,
    llm_emotion,
    commentsUrl,
    comments,
    shares,
    engagements,
    content,
    image_url: imageUrl,
    predicted_sentiment,
    predicted_category,
    youtube_video_url: youtubeVideoUrl,
    source_icon: `${source.p_url},${sourceIcon}`,
    message_text,
    source: source.source,
    rating: source.rating,
    comment: source.comment,
    businessResponse: source.business_response,
    uSource: source.u_source,
    googleName: source.name,
    country: source.u_country,
    created_at: new Date(source.p_created_time || source.created_at).toLocaleString()
  };
};

module.exports = { getTouchpointPosts };

