const { elasticClient } = require('../../config/elasticsearch');
const { processFilters } = require('./filter.utils');
const processCategoryItems = require('../../helpers/processedCategoryItems');

const findMatchingCategoryKey = (selectedCategory, categoryData = {}) => {
  if (!selectedCategory || selectedCategory === 'all' || selectedCategory === 'custom' || selectedCategory === '') {
    return selectedCategory;
  }



  const normalizedSelectedRaw = String(selectedCategory || '');
  const normalizedSelected = normalizedSelectedRaw.toLowerCase().replace(/\s+/g, '');
  const categoryKeys = Object.keys(categoryData || {});

  if (categoryKeys.length === 0) {
    return null;
  }

  let matchedKey = categoryKeys.find(
    key => key.toLowerCase() === normalizedSelectedRaw.toLowerCase()
  );

  if (!matchedKey) {
    matchedKey = categoryKeys.find(
      key => key.toLowerCase().replace(/\s+/g, '') === normalizedSelected
    );
  }

  if (!matchedKey) {
    matchedKey = categoryKeys.find(key => {
      const normalizedKey = key.toLowerCase().replace(/\s+/g, '');
      return normalizedKey.includes(normalizedSelected) || normalizedSelected.includes(normalizedKey);
    });
  }

  return matchedKey || null;
};

const getDistributionPosts = async (req, res) => {
  try {
    const {
      timeSlot,
      fromDate,
      toDate,
      sentimentType,
      category = 'all',
      source = 'All',
      topicId,
      llm_mention_type,
      sourceName,
      limit = 30
    } = req.body;

    if (!sourceName || sourceName === '') {
      return res.status(400).json({ success: false, error: 'source is required' });
    }

    const isSpecialTopic = topicId && parseInt(topicId) === 2600 || parseInt(topicId) === 2627;

    let categoryData = {};
    if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
      categoryData = processCategoryItems(req.body.categoryItems);
    } else {
      categoryData = req.processedCategories || {};
    }
    if (Object.keys(categoryData).length === 0) {
      return res.json({ posts: [] });
    }

    let workingCategory = category;
    if (workingCategory !== 'all' && workingCategory !== '' && workingCategory !== 'custom') {
      const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);
      if (matchedKey) {
      categoryData = { [matchedKey]: categoryData[matchedKey] };
      workingCategory = matchedKey;
    }else{
      workingCategory="all";
    }
    }

    // Build base query
    const baseQueryString = buildBaseQueryString(workingCategory, categoryData);
    const filters = processFilters({ sentimentType, timeSlot, fromDate, toDate, queryString: baseQueryString, isSpecialTopic });

    // For topicId 2641, only check fromDate and toDate (not timeSlot)
    const noDateProvided = parseInt(topicId) === 2641 ?
      ((fromDate === null || fromDate === undefined || fromDate === '') &&
       (toDate === null || toDate === undefined || toDate === '')) :
      ((timeSlot === null || timeSlot === undefined || timeSlot === '') &&
       (fromDate === null || fromDate === undefined || fromDate === '') &&
       (toDate === null || toDate === undefined || toDate === ''));
    let queryTimeRange = null;
    if (!noDateProvided) {
      queryTimeRange = { gte: filters.greaterThanTime, lte: filters.lessThanTime };
    }
    if (Number(topicId) == 2473) {
      queryTimeRange = { gte: '2023-01-01', lte: '2023-04-30' };
    }

    const query = buildBaseQuery(
      queryTimeRange ? { greaterThanTime: queryTimeRange.gte, lessThanTime: queryTimeRange.lte } : null,
      source,
      isSpecialTopic,
      parseInt(topicId)
    );

    addCategoryFilters(query, workingCategory, categoryData);

     if(workingCategory=="all" && category!=="all"){
                         const categoryFilter = {
                                    bool: {
                                        should:  [
                                            {
                                                "multi_match": {
                                                    "query": category,
                                                    "fields": [
                                                        "p_message_text",
                                                        "p_message",
                                                        "hashtags",
                                                        "u_source",
                                                        "p_url"
                                                    ],
                                                    "type": "phrase"
                                                }
                                            }
                                        ],
                                        minimum_should_match: 1
                                    }
                                };
                                query.bool.must.push(categoryFilter);
                        }
    if (sentimentType && sentimentType !== 'undefined' && sentimentType !== 'null') {
      if (sentimentType.includes(',')) {
        const sentimentArray = sentimentType.split(',');
        const sentimentFilter = { bool: { should: sentimentArray.map(s => ({ match: { predicted_sentiment_value: s.trim() } })), minimum_should_match: 1 } };
        query.bool.must.push(sentimentFilter);
      } else {
        query.bool.must.push({ match: { predicted_sentiment_value: sentimentType.trim() } });
      }
    }

        // Normalize input into array
        let mentionTypesArray = [];

        if (llm_mention_type) {
            if (Array.isArray(llm_mention_type)) {
                mentionTypesArray = llm_mention_type;
            } else if (typeof llm_mention_type === "string") {
                mentionTypesArray = llm_mention_type.split(",").map(s => s.trim());
            }
        }

        // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
        if (parseInt(topicId) === 2643 || parseInt(topicId) === 2644 ) {
          query.bool.must.push({
            term: { is_public_opinion: true }
          });
        }

        // CASE 1: If mentionTypesArray has valid values → apply should-match filter
        if (mentionTypesArray.length > 0) {
            query.bool.must.push({
                bool: {
                    should: mentionTypesArray.map(type => ({
                        match: { llm_mention_type: type }
                    })),
                    minimum_should_match: 1
                }
            });
        }
      


    // Source filter for the posts we want
    if (sourceName === 'LinkedIn') {
      query.bool.must.push({ bool: { should: [ { match_phrase: { source: 'LinkedIn' } }, { match_phrase: { source: 'Linkedin' } } ], minimum_should_match: 1 } });
    } else {
      query.bool.must.push({ match_phrase: { source: sourceName } });
    }

    const postsResponse = await elasticClient.search({
      index: process.env.ELASTICSEARCH_DEFAULTINDEX,
      body: {
        size: Math.min(Number(limit) || 30, 100),
        query,
        sort: [ { p_created_time: { order: 'desc' } } ]
      }
    });

    const posts = postsResponse.hits.hits.map(hit => formatPostData(hit));
    return res.json({ posts });
  } catch (error) {
    console.error('Error fetching distribution posts:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// Helpers reused from the counts controller by requiring them here
function buildBaseQueryString(selectedCategory, categoryData) {
  let queryString = '';
  const allTerms = [];
  if (selectedCategory === 'all') {
    Object.values(categoryData).forEach(data => {
      if (data.keywords && data.keywords.length > 0) allTerms.push(...data.keywords);
      if (data.hashtags && data.hashtags.length > 0) allTerms.push(...data.hashtags);
      if (data.urls && data.urls.length > 0) allTerms.push(...data.urls);
    });
  } else if (categoryData[selectedCategory]) {
    const data = categoryData[selectedCategory];
    if (data.keywords && data.keywords.length > 0) allTerms.push(...data.keywords);
    if (data.hashtags && data.hashtags.length > 0) allTerms.push(...data.hashtags);
    if (data.urls && data.urls.length > 0) allTerms.push(...data.urls);
  }
  if (allTerms.length > 0) {
    const terms = allTerms.map(term => `"${term}"`).join(' OR ');
    queryString = `(p_message_text:(${terms}) OR u_fullname:(${terms}))`;
  }
  return queryString;
}

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

function buildBaseQuery(dateRange, source, isSpecialTopic = false,topicId) {
  const query = { bool: { must: [], must_not: [ { term: { source: 'DM' } } ] } };
  if (dateRange && dateRange.greaterThanTime && dateRange.lessThanTime) {
    query.bool.must.push({ range: { p_created_time: { gte: dateRange.greaterThanTime, lte: dateRange.lessThanTime } } });
  }
  
  const normalizedSources = normalizeSourceInput(source);
  
  if (normalizedSources.length > 0) {
    // Multiple sources provided - create should clause
    query.bool.must.push({
      bool: {
        should: normalizedSources.map(s => ({ match_phrase: { source: s } })),
        minimum_should_match: 1
      }
    });
  } else if (topicId===2619 || topicId===2639 || topicId===2640) {
    query.bool.must.push({ bool: { should: [ { match_phrase: { source: 'LinkedIn' } }, { match_phrase: { source: 'Linkedin' } } ], minimum_should_match: 1 } });
  } 
 else if (topicId===2646 || topicId===2650) {
    query.bool.must.push({ bool: { should: [  { match_phrase: { source: "Twitter" } },{ match_phrase: { source: 'LinkedIn' } }, { match_phrase: { source: 'Linkedin' } }, { match_phrase: { source: 'Web' } } ], minimum_should_match: 1 } });
  } 
  else if (topicId === 2641 || parseInt(topicId) === 2643 || parseInt(topicId) === 2644) {
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "Facebook" } },
          { match_phrase: { source: "Twitter" } },
          { match_phrase: { source: "Instagram" } },
        ],
        minimum_should_match: 1
      }
    });
  } else if (isSpecialTopic) {
    query.bool.must.push({ bool: { should: [ { match_phrase: { source: 'Facebook' } }, { match_phrase: { source: 'Twitter' } } ], minimum_should_match: 1 } });
  } else {
    // Default: all social media sources
    query.bool.must.push({ bool: { should: [
      { match_phrase: { source: 'Facebook' } },
      { match_phrase: { source: 'Twitter' } },
      { match_phrase: { source: 'Instagram' } },
      { match_phrase: { source: 'Youtube' } },
      { match_phrase: { source: 'Linkedin' } },
      { match_phrase: { source: 'LinkedIn' } },
      { match_phrase: { source: 'Pinterest' } },
      { match_phrase: { source: 'Web' } },
      { match_phrase: { source: 'Reddit' } },
      { match_phrase: { source: 'TikTok' } }
    ], minimum_should_match: 1 } });
  }
  return query;
}

// Add category filters to the query (same structure as counts controller)
function addCategoryFilters(query, selectedCategory, categoryData) {


  if (selectedCategory === 'all') {
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
  } else if (categoryData[selectedCategory]) {
    const data = categoryData[selectedCategory];
    const hasKeywords = Array.isArray(data.keywords) && data.keywords.length > 0;
    const hasHashtags = Array.isArray(data.hashtags) && data.hashtags.length > 0;
    const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;

    if (hasKeywords || hasHashtags || hasUrls) {
      query.bool.must.push({
        bool: {
          should: [
            ...(data.keywords || []).flatMap(keyword => [
              { match_phrase: { p_message_text: keyword } },
              { match_phrase: { keywords: keyword } }
            ]),
            ...(data.hashtags || []).flatMap(hashtag => [
              { match_phrase: { p_message_text: hashtag } },
              { match_phrase: { hashtags: hashtag } }
            ]),
            ...(data.urls || []).flatMap(url => [
              { match_phrase: { u_source: url } },
              { match_phrase: { p_url: url } }
            ])
          ],
          minimum_should_match: 1
        }
      });
    } else {
      // Category has no filter criteria; add a match-none condition
      query.bool.must.push({ bool: { must_not: { match_all: {} } } });
    }
  }
}

const formatPostData = (hit) => {
  const s = hit._source;
  const profilePic = s.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;
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
  const imageUrl = s.p_picture_url?.trim() || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;
  let predicted_sentiment = s.predicted_sentiment_value || '';
  const predicted_category = s.predicted_category || '';
  let youtubeVideoUrl = '';
  let profilePicture2 = '';
  if (s.source === 'Youtube') {
    youtubeVideoUrl = s.video_embed_url ? s.video_embed_url : (s.p_id ? `https://www.youtube.com/embed/${s.p_id}` : '');
  } else {
    profilePicture2 = s.p_picture || '';
  }
  const sourceIcon = ['Web', 'DeepWeb'].includes(s.source) ? 'Web' : s.source;
  const message_text = (s.p_message_text || '').replace(/<\/?[^>]+(>|$)/g, '');
  return {
    profilePicture: profilePic,
    profilePicture2,
    userFullname: s.u_fullname,
    user_data_string: '',
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
    image_url: imageUrl,
    predicted_sentiment,
    predicted_category,
    youtube_video_url: youtubeVideoUrl,
    source_icon: `${s.p_url},${sourceIcon}`,
    message_text,
    source: s.source,
    rating: s.rating,
    comment: s.comment,
    businessResponse: s.business_response,
    uSource: s.u_source,
    googleName: s.name,
    created_at: new Date(s.p_created_time || s.created_at).toLocaleString(),
  };
};

module.exports = { getDistributionPosts };

