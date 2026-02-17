const { elasticClient } = require('../../config/elasticsearch');
const { processFilters } = require('./filter.utils');

function normalizeWordsInput(words) {
  if (!words) return [];
  if (Array.isArray(words)) {
    return [...new Set(words.map(w => String(w).trim()).filter(Boolean))];
  }
  if (typeof words === 'string') {
    return [...new Set(words.split(',').map(w => w.trim()).filter(Boolean))];
  }
  return [];
}

function buildLinkedInOnlyFilter() {
  return {
    bool: {
      should: [
        { match_phrase: { source: 'LinkedIn' } },
        { match_phrase: { source: 'Linkedin' } }
      ],
      minimum_should_match: 1
    }
  };
}

/**
 * Resolves date range filter for keyword queries.
 * By default: If no time range is requested from body, return null (no date filter = all time data).
 * Special cases:
 * - For topicId 2641, only consider fromDate/toDate (ignore timeSlot) for noDateProvided check.
 * - For topicId 2473, force a specific date range.
 */
function resolveDateRangeFilter({ timeSlot, fromDate, toDate, topicId }) {
  const topicIdNum = topicId !== undefined && topicId !== null ? parseInt(topicId, 10) : NaN;

  // Check if no date inputs are provided (default behavior = all time data)
  const noDateProvided =
    topicIdNum === 2641
      ? (!fromDate && !toDate)
      : (!timeSlot && !fromDate && !toDate);

  // If no date provided, return null to get all time data (no date filter)
  if (noDateProvided) return null;

  const filters = processFilters({
    sentimentType: null,
    timeSlot,
    fromDate,
    toDate,
    queryString: ''
  });

  let gte = filters.greaterThanTime;
  let lte = filters.lessThanTime;

  // Match existing special-case override
  if (Number(topicIdNum) === 2473) {
    gte = '2023-01-01';
    lte = '2023-04-30';
  }

  if (!gte || !lte) return null;

  return {
    range: {
      p_created_time: {
        gte,
        lte
      }
    }
  };
}

function buildKeywordQuery(keyword, { timeSlot, fromDate, toDate, sentimentType, topicId } = {}) {
  const must = [];

  // keyword match
  must.push({
    bool: {
      should: [
        {
          multi_match: {
            query: keyword,
            fields: [
              'p_message_text',
              'p_message',
              'keywords',
              'title',
              'hashtags',
              'u_source',
              'p_url'
            ],
            type: 'phrase'
          }
        }
      ],
      minimum_should_match: 1
    }
  });

  // LinkedIn-only source filter
  must.push(buildLinkedInOnlyFilter());

  // Optional date range filter (same behavior as socials-distributions.controller.js)
  const dateRangeClause = resolveDateRangeFilter({ timeSlot, fromDate, toDate, topicId });
  if (dateRangeClause) {
    must.push(dateRangeClause);
  }

  // Optional sentiment filter
  if (sentimentType && sentimentType !== 'undefined' && sentimentType !== 'null') {
    if (String(sentimentType).includes(',')) {
      const sentimentArray = String(sentimentType)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      if (sentimentArray.length > 0) {
        must.push({
          bool: {
            should: sentimentArray.map(s => ({ match: { predicted_sentiment_value: s } })),
            minimum_should_match: 1
          }
        });
      }
    } else {
      must.push({ match: { predicted_sentiment_value: String(sentimentType).trim() } });
    }
  }

  return {
    bool: {
      must,
      must_not: [{ term: { source: 'DM' } }]
    }
  };
}

/**
 * Format post data for the frontend (kept aligned with socials-distributions.posts.controller.js)
 */
function formatPostData(hit) {
  const s = hit._source || {};
  const profilePic = s.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

  const followers = s.u_followers > 0 ? `${s.u_followers}` : '';
  const following = s.u_following > 0 ? `${s.u_following}` : '';
  const posts = s.u_posts > 0 ? `${s.u_posts}` : '';
  const likes = s.p_likes > 0 ? `${s.p_likes}` : '';

  const llm_emotion = s.llm_emotion || '';

  const commentsUrl =
    s.p_comments_text && s.p_comments_text.trim()
      ? String(s.p_url || '').trim().replace('https: // ', 'https://')
      : '';

  const comments = `${s.p_comments}`;
  const shares = s.p_shares > 0 ? `${s.p_shares}` : '';
  const engagements = s.p_engagement > 0 ? `${s.p_engagement}` : '';
  const content = s.p_content?.trim() || '';
  const imageUrl = s.p_picture_url?.trim() || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

  const predicted_sentiment = s.predicted_sentiment_value || '';
  const predicted_category = s.predicted_category || '';

  let youtubeVideoUrl = '';
  let profilePicture2 = '';
  if (s.source === 'Youtube') {
    youtubeVideoUrl = s.video_embed_url
      ? s.video_embed_url
      : s.p_id
        ? `https://www.youtube.com/embed/${s.p_id}`
        : '';
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
    p_comments_data: s.p_comments_data,
    p_id: s.p_id
  };
}

const keywordLookupController = {
  /**
   * Body:
   *  - words: string[] | string (comma-separated)
   * Response:
   *  - { counts: [{ keyword, count }], totalKeywords }
   */
  getKeywordCounts: async (req, res) => {
    try {
      const words = normalizeWordsInput(req.body?.words);
      if (words.length === 0) {
        return res.status(400).json({ success: false, error: 'words is required' });
      }

      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        topicId
      } = req.body || {};

      const counts = [];
      for (const keyword of words) {
        const response = await elasticClient.search({
          index: process.env.ELASTICSEARCH_DEFAULTINDEX,
          body: {
            size: 0,
            query: buildKeywordQuery(keyword, {
              timeSlot,
              fromDate,
              toDate,
              sentimentType,
              topicId
            })
          }
        });
        const count = response?.hits?.total?.value ?? 0;
        // Only include keywords with count > 0
        if (count > 0) {
          counts.push({ keyword, count });
        }
      }

      return res.json({ counts, totalKeywords: counts.length });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error fetching keyword counts:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },

  /**
   * Body:
   *  - keyword: string
   *  - limit?: number (default 30, max 100)
   * Response:
   *  - { posts: [...] } (same format as socials-distributions.posts.controller.js)
   */
  getKeywordPosts: async (req, res) => {
    try {
      const keyword = String(req.body?.keyword || '').trim();
      if (!keyword) {
        return res.status(400).json({ success: false, error: 'keyword is required' });
      }

      const limit = Math.min(Number(req.body?.limit) || 30, 100);
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        topicId
      } = req.body || {};

      const postsResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          size: limit,
          query: buildKeywordQuery(keyword, {
            timeSlot,
            fromDate,
            toDate,
            sentimentType,
            topicId
          }),
          sort: [{ p_created_time: { order: 'desc' } }]
        }
      });

      const posts = (postsResponse?.hits?.hits || []).map(hit => formatPostData(hit));
      return res.json({ posts });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error fetching keyword posts:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
};

module.exports = keywordLookupController;

