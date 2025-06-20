const { elasticClient } = require("../../config/elasticsearch");
const { buildTopicQueryString } = require("../../utils/queryBuilder");

/**
 * Helper function to build Elasticsearch query params for word cloud data
 * @param {Object} options Query options
 * @returns {Object} Elasticsearch query params
 */
const buildWordCloudParams = (options) => {
  const {
    queryString,
    sentimentType,
    from = 0,
    size = 5000,
    sort = "p_created_time:desc",
    timeRange = { gte: "now-90d", lte: "now" },
    isSpecialTopic = false,
  } = options;

  const [sortField, sortOrder] = sort.split(":");

  // Build source filter based on special topic
  const sourceFilter = isSpecialTopic
    ? 'source:("Twitter" OR "Facebook")'
    : 'source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web" OR "TikTok")';

  // Base query structure
  const baseQuery = {
    bool: {
      must: [
        {
          query_string: {
            query: `(p_message:(${queryString}) OR p_url:(${queryString})) AND NOT source:("DM") AND NOT manual_entry_type:("review") AND ${sourceFilter}`,
          },
        },
        {
          range: {
            p_created_time: timeRange,
          },
        },
      ],
    },
  };

  // Add sentiment specific conditions
  if (sentimentType === "positive") {
    baseQuery.bool.must[0].query_string.query +=
      ' AND predicted_sentiment_value:"Positive"';
  } else if (sentimentType === "negative") {
    baseQuery.bool.must[0].query_string.query +=
      ' AND (predicted_sentiment_value:"Negative" OR llm_emotion:("Anger" OR "Frustration" OR "Criticism" OR "Confusion"))';
  }

  // Return params for aggregation (word cloud) or search (posts by phrase)
  return {
    from,
    size,
    query: baseQuery,
    sort: [
      {
        [sortField]: { order: sortOrder },
      },
    ],
    aggs: {
      daily_posts: {
        date_histogram: {
          field: "p_created_time",
          fixed_interval: "1d",
          min_doc_count: 0,
        },
      },
      top_terms: {
        terms: {
          field: "p_message.keyword",
          size: 100,
        },
      },
    },
  };
};

/**
 * Helper function to build Elasticsearch query params for posts by phrase
 * @param {Object} options Query options
 * @returns {Object} Elasticsearch query params
 */
const buildPostsByPhraseParams = (options) => {
  const {
    phrase,
    queryString,
    sentimentType,
    from = 0,
    size = 100,
    sort = "p_created_time:desc",
    timeRange = { gte: "now-90d", lte: "now" },
    isSpecialTopic = false,
  } = options;

  const [sortField, sortOrder] = sort.split(":");

  let phraseField =
    sentimentType === "positive"
      ? "llm_positive_points.keyword"
      : "llm_negative_points.keyword";

  // Build source filter based on special topic
  const sourceFilter = isSpecialTopic
    ? 'source:("Twitter" OR "Facebook")'
    : 'source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web" OR "TikTok")';

  // Base query structure
  const baseQuery = {
    bool: {
      must: [
        {
          query_string: {
            query: `(${phraseField}:"${phrase}") AND (p_message:(${queryString}) OR p_url:(${queryString})) AND NOT source:("DM") AND NOT manual_entry_type:("review") AND ${sourceFilter}`,
          },
        },
        {
          range: {
            p_created_time: timeRange,
          },
        },
      ],
    },
  };

  // Add sentiment specific conditions
  if (sentimentType === "positive") {
    baseQuery.bool.must[0].query_string.query +=
      ' AND predicted_sentiment_value:"Positive"';
  } else if (sentimentType === "negative") {
    baseQuery.bool.must[0].query_string.query +=
      ' AND (predicted_sentiment_value:"Negative" OR llm_emotion:("Anger" OR "Frustration" OR "Criticism" OR "Confusion"))';
  }

  return {
    from,
    size,
    query: baseQuery,
    sort: [
      {
        [sortField]: { order: sortOrder },
      },
    ],
  };
};

const wordCloudController = {
  /**
   * Get word phrases for word cloud visualization
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Object} JSON response
   */
  getWordPhrases: async (req, res) => {
    try {
      const {
        sentimentType = "positive",
        topicId,
        fromDate,
        toDate,
        source,
        llm_mention_type,
      } = req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      const categoryData = req.processedCategories || {};

      if (Object.keys(categoryData).length === 0) {
        return res.json({
          success: true,
          phrases: [],
          dailyStats: [],
          wordcloud: [],
          total: 0,
          message: "No category data provided",
        });
      }

      // Create search terms array from the category data
      const searchTerms = [];

      Object.values(categoryData).forEach((category) => {
        if (category.keywords) searchTerms.push(...category.keywords);
        if (category.hashtags) searchTerms.push(...category.hashtags);
        if (category.urls) searchTerms.push(...category.urls);
      });

      if (searchTerms.length === 0) {
        return res.json({
          success: true,
          phrases: [],
          dailyStats: [],
          wordcloud: [],
          total: 0,
          message: "No search terms provided",
        });
      }

      // Create query string from search terms
      const queryString = searchTerms.map((term) => `"${term}"`).join(" OR ");

      // Set time range based on special topic
      const timeRange = isSpecialTopic
        ? { gte: "2020-01-01", lte: "now" }
        : { gte: "now-90d", lte: "now" };

      if (fromDate && toDate) {
        timeRange.gte = fromDate;
        timeRange.lte = toDate;
      }

      // Build and execute Elasticsearch query
      const params = buildWordCloudParams({
        queryString,
        sentimentType,
        timeRange,
        isSpecialTopic,
      });

      const response = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: params,
      });

      const posts = response.hits?.hits || [];
      const dailyStats = response.aggregations?.daily_posts?.buckets || [];
      const topTerms = response.aggregations?.top_terms?.buckets || [];

      // Extract phrases from posts
      const phrasesField =
        sentimentType === "positive"
          ? "llm_positive_points"
          : "llm_negative_points";
      const phrasesArray = posts.map((hit) => hit._source[phrasesField] || []);
      const allPhrases = phrasesArray.flat();

      return res.json({
        success: true,
        phrases: allPhrases,
        dailyStats: dailyStats.map((stat) => ({
          date: stat.key_as_string,
          count: stat.doc_count,
        })),
        wordcloud: topTerms.map((term) => ({
          text: term.key,
          value: term.doc_count,
        })),
        total: posts.length,
        params,
      });
    } catch (error) {
      console.error("Error fetching word cloud data:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  /**
   * Get posts by specific phrase
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Object} JSON response
   */
  getPostsByPhrase: async (req, res) => {
    try {
      const {
        phrase,
        sentimentType = "positive",
        page = 1,
        size = 100,
        sort = "p_created_time:desc",
        topicId,
        fromDate,
        toDate,
      } = req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      const categoryData = req.processedCategories || {};

      if (!phrase) {
        return res.status(400).json({
          success: false,
          error: "Missing phrase parameter",
        });
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json({
          success: true,
          posts: [],
          total: 0,
          page,
          size,
        });
      }

      // Create search terms array from the category data
      const searchTerms = [];

      Object.values(categoryData).forEach((category) => {
        if (category.keywords) searchTerms.push(...category.keywords);
        if (category.hashtags) searchTerms.push(...category.hashtags);
        if (category.urls) searchTerms.push(...category.urls);
      });

      if (searchTerms.length === 0) {
        return res.json({
          success: true,
          posts: [],
          total: 0,
          page,
          size,
        });
      }

      // Create query string from search terms
      const queryString = searchTerms.map((term) => `"${term}"`).join(" OR ");

      // Calculate from based on page and size
      const from = (parseInt(page) - 1) * parseInt(size);

      // Set time range based on special topic
      const timeRange = isSpecialTopic
        ? { gte: "2020-01-01", lte: "now" }
        : { gte: "now-90d", lte: "now" };

      if (fromDate && toDate) {
        timeRange.gte = fromDate;
        timeRange.lte = toDate;
      }
      // Build and execute Elasticsearch query
      const params = buildPostsByPhraseParams({
        phrase,
        queryString,
        sentimentType,
        from,
        size: parseInt(size),
        sort,
        timeRange,
        isSpecialTopic,
      });

      const response = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: params,
      });

      if (!response.hits || response.hits.total.value === 0) {
        return res.json({
          success: true,
          posts: [],
          total: 0,
          page,
          size,
        });
      }

      const posts = response.hits.hits.map((hit) => ({
        ...hit._source,
        id: hit._id,
      }));

      return res.json({
        success: true,
        posts,
        total: response.hits.total.value,
        page,
        size,
      });
    } catch (error) {
      console.error("Error fetching posts by phrase:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
};

module.exports = wordCloudController;
