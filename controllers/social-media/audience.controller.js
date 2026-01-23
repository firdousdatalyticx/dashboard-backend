const { elasticClient } = require("../../config/elasticsearch");
const { buildTopicQueryString } = require("../../utils/queryBuilder");
const { getCountryCode } = require("../../utils/countryHelper");
const { getSourceIcon } = require("../../utils/sourceHelper");
const { processFilters } = require("./filter.utils");
const processCategoryItems = require("../../helpers/processedCategoryItems");
const prisma = require("../../config/database");
const fs = require("fs").promises;
const path = require("path");

const normalizeSourceInput = (sourceParam) => {
  if (!sourceParam || sourceParam === "All") {
    return [];
  }

  if (Array.isArray(sourceParam)) {
    return sourceParam
      .filter(Boolean)
      .map((src) => src.trim())
      .filter((src) => src.length > 0 && src.toLowerCase() !== "all");
  }

  if (typeof sourceParam === "string") {
    return sourceParam
      .split(",")
      .map((src) => src.trim())
      .filter((src) => src.length > 0 && src.toLowerCase() !== "all");
  }

  return [];
};

const findMatchingCategoryKey = (selectedCategory, categoryData = {}) => {
  if (
    !selectedCategory ||
    selectedCategory === "all" ||
    selectedCategory === "custom" ||
    selectedCategory === ""
  ) {
    return selectedCategory;
  }

  const normalizedSelectedRaw = String(selectedCategory || "");
  const normalizedSelected = normalizedSelectedRaw
    .toLowerCase()
    .replace(/\s+/g, "");
  const categoryKeys = Object.keys(categoryData || {});

  if (categoryKeys.length === 0) {
    return null;
  }

  let matchedKey = categoryKeys.find(
    (key) => key.toLowerCase() === normalizedSelectedRaw.toLowerCase()
  );

  if (!matchedKey) {
    matchedKey = categoryKeys.find(
      (key) => key.toLowerCase().replace(/\s+/g, "") === normalizedSelected
    );
  }

  if (!matchedKey) {
    matchedKey = categoryKeys.find((key) => {
      const normalizedKey = key.toLowerCase().replace(/\s+/g, "");
      return (
        normalizedKey.includes(normalizedSelected) ||
        normalizedSelected.includes(normalizedKey)
      );
    });
  }

  return matchedKey || null;
};

createCountryWiseAggregations = (categoryData) => {
  // Group data by country
  const countryGroups = {};

  categoryData.forEach((category) => {
    const country = category.country;

    if (!countryGroups[country]) {
      countryGroups[country] = {
        hashtags: [],
        keywords: [],
        urls: [],
      };
    }

    // Process hashtags
    if (category.topic_hash_tags) {
      const hashtags = category.topic_hash_tags
        .split(/[,|]/)
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter((tag) => tag.length > 0);
      countryGroups[country].hashtags.push(...hashtags);
    }

    // Process keywords
    if (category.topic_keywords) {
      const keywords = category.topic_keywords
        .split(/[,|]/)
        .map((keyword) => keyword.trim())
        .filter((keyword) => keyword.length > 0);
      countryGroups[country].keywords.push(...keywords);
    }

    // Process URLs
    if (category.topic_urls) {
      const urls = category.topic_urls
        .split(/[,|]/)
        .map((url) => url.trim())
        .filter((url) => url.length > 0);
      countryGroups[country].urls.push(...urls);
    }
  });

  // Remove duplicates and create Elasticsearch aggregations
  const elasticAggs = {};

  Object.keys(countryGroups).forEach((country) => {
    const countryKey = country.toLowerCase().replace(/\s+/g, "_");
    const data = countryGroups[country];

    // Remove duplicates
    const uniqueHashtags = [...new Set(data.hashtags)];
    const uniqueKeywords = [...new Set(data.keywords)];
    const uniqueUrls = [...new Set(data.urls)];

    // Create combined search terms
    const allTerms = [
      ...uniqueHashtags.map((tag) => `#${tag}`),
      ...uniqueKeywords,
      ...uniqueUrls,
    ];

    if (allTerms.length > 0) {
      elasticAggs[`${countryKey}`] = {
        filter: {
          bool: {
            should: [
              // Search in hashtags
              ...uniqueHashtags.map((hashtag) => ({
                multi_match: {
                  query: hashtag,
                  fields: [
                    "p_message_text",
                    "p_message",
                    "hashtags",
                    "u_source",
                    "p_url",
                  ],
                  type: "phrase",
                },
              })),
              // Search in keywords
              ...uniqueKeywords.map((keyword) => ({
                multi_match: {
                  query: keyword,
                  fields: [
                    "p_message_text",
                    "p_message",
                    "hashtags",
                    "u_source",
                    "p_url",
                  ],
                  type: "phrase",
                },
              })),
              // Search in URLs
              ...uniqueUrls.map((url) => ({
                multi_match: {
                  query: url,
                  fields: [
                    "p_message_text",
                    "p_message",
                    "hashtags",
                    "u_source",
                    "p_url",
                  ],
                  type: "phrase",
                },
              })),
            ],
            minimum_should_match: 1,
          },
        },
        aggs: {
          top_posts: {
            top_hits: {
              size: 30, // Get top 30 posts for each country
              sort: [{ p_created_time: { order: "desc" } }], // Sort by most recent
              _source: {
                includes: [
                  "u_profile_photo",
                  "u_followers",
                  "u_following",
                  "u_posts",
                  "p_likes",
                  "llm_emotion",
                  "p_comments_text",
                  "p_url",
                  "p_comments",
                  "p_shares",
                  "p_engagement",
                  "p_content",
                  "p_picture_url",
                  "predicted_sentiment_value",
                  "predicted_category",
                  "source",
                  "rating",
                  "u_fullname",
                  "p_message_text",
                  "comment",
                  "business_response",
                  "u_source",
                  "name",
                  "p_created_time",
                  "created_at",
                  "p_comments_data",
                  "video_embed_url",
                  "p_id",
                  "p_picture",
                ],
              },
            },
          },
        },
      };
    }
  });

  return elasticAggs;
};

const audienceController = {
  getAudience: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        records = 20,
        topicId,
        categoryItems,
        source = "All",
        category = "all",
        llm_mention_type,
      } = req.body;

      // Determine which category data to use
      let audienceCategoryData = {};

      if (
        categoryItems &&
        Array.isArray(categoryItems) &&
        categoryItems.length > 0
      ) {
        audienceCategoryData = processCategoryItems(categoryItems);
      } else {
        // Fall back to middleware data
        audienceCategoryData = req.processedCategories || {};
      }

      if (Object.keys(audienceCategoryData).length === 0) {
        return res.json({
          data_array: [],
        });
      }

      // Handle category parameter - validate if provided
      let selectedCategory = category;
      if (
        category &&
        category !== "all" &&
        category !== "" &&
        category !== "custom"
      ) {
        const matchedKey = findMatchingCategoryKey(
          category,
          audienceCategoryData
        );
        if (matchedKey) {
          selectedCategory = matchedKey;
        } else {
          selectedCategory = "all";
        }
      }

      const topicQueryString = buildTopicQueryString(audienceCategoryData);

      // Source filtering logic
      const normalizedSources = normalizeSourceInput(source);
      let sourcesQuery = "";

      if (normalizedSources.length > 0) {
        // Specific sources provided
        const sourcesStr = normalizedSources.map((s) => `"${s}"`).join(" OR ");
        sourcesQuery = ` AND source:(${sourcesStr})`;
      } else {
        // Default logic based on topic
        if (
          parseInt(topicId) === 2619 ||
          parseInt(topicId) === 2639 ||
          parseInt(topicId) === 2640
        ) {
          sourcesQuery = ` AND source:("LinkedIn" OR "Linkedin")`;
        } else if (parseInt(topicId) === 2641 || parseInt(topicId) === 2643 || parseInt(topicId) === 2644 || parseInt(topicId) === 2651 || parseInt(topicId) === 2652) {
          sourcesQuery = ` AND source:("Twitter" OR "Instagram" OR "Facebook")`;
        } else {
          sourcesQuery = ` AND source:("Twitter" OR "Instagram" OR "Facebook" OR "TikTok" OR "Youtube" OR "LinkedIn" OR "Linkedin" OR "Pinterest" OR "Web" OR "Reddit")`;
        }
      }

      // Process filters for time range
      const filters = processFilters({
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        queryString: topicQueryString,
      });

      // Special filter for topicId 2641, 2643, 2644, 2651, 2652 - only fetch posts where is_public_opinion is true
      let isPublicOpinionFilter = null;

      const params = {
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          from: 0,
          size: 0,
          query: {
            bool: {
              must: [
                {
                  query_string: {
                    query: `${topicQueryString} ${sourcesQuery}`,
                    analyze_wildcard: true,
                    default_operator: "AND",
                  },
                },
                { exists: { field: "u_profile_photo" } },
                { exists: { field: "u_followers" } },
                {
                  range: {
                    p_created_time: {
                      gte: filters.greaterThanTime,
                      lte: filters.lessThanTime,
                    },
                  },
                },
                ...(isPublicOpinionFilter ? [isPublicOpinionFilter] : []),
              ],
              must_not: [{ term: { "u_profile_photo.keyword": "" } }],
            },
          },
          aggs: {
            group_by_user: {
              terms: {
                field: "u_source.keyword",
                size: parseInt(records),
              },
              aggs: {
                grouped_results: {
                  top_hits: {
                    size: 1,
                    _source: {
                      includes: [
                        "u_fullname",
                        "u_profile_photo",
                        "u_date_joined",
                        "u_country",
                        "u_followers",
                        "source",
                        "u_source",
                      ],
                    },
                    sort: [{ p_created_time: { order: "desc" } }],
                  },
                },
              },
            },
          },
        },
      };

      if (selectedCategory != "all") {
        const categoryFilter = {
          bool: {
            should: [
              {
                multi_match: {
                  query: category,
                  fields: [
                    "p_message_text",
                    "p_message",
                    "hashtags",
                    "u_source",
                    "p_url",
                  ],
                  type: "phrase",
                },
              },
            ],
            minimum_should_match: 1,
          },
        };

        params.body.query.bool.must.push(categoryFilter);
      }

      // LLM Mention Type filtering logic
      let mentionTypesArray = [];

      if (llm_mention_type) {
        if (Array.isArray(llm_mention_type)) {
          mentionTypesArray = llm_mention_type;
        } else if (typeof llm_mention_type === "string") {
          mentionTypesArray = llm_mention_type.split(",").map((s) => s.trim());
        }
      }

      // CASE 1: If mentionTypesArray has valid values → apply should-match filter
      if (mentionTypesArray.length > 0) {
        params.body.query.bool.must.push({
          bool: {
            should: mentionTypesArray.map((type) => ({
              match: { llm_mention_type: type },
            })),
            minimum_should_match: 1,
          },
        });
      }

      const results = await elasticClient.search(params);

      if (!results?.aggregations?.group_by_user?.buckets) {
        console.log("no record found");
        return res.json({ data_array: [] });
      }

      const data_array = [];

      for (const bucket of results.aggregations.group_by_user.buckets) {
        if (!bucket.key) continue;

        const sourceData = bucket.grouped_results.hits.hits[0]._source;
        const flag_image = sourceData.u_country
          ? await getCountryCode(sourceData.u_country)
          : "&nbsp;";

        const sourceIcon = getSourceIcon(sourceData.source);

        data_array.push({
          profile_image: sourceData.u_profile_photo,
          fullname: sourceData.u_fullname,
          source: `${sourceData.u_source},${sourceIcon}`,
          country: flag_image,
          followers: sourceData.u_followers.toString(),
          posts: bucket.doc_count.toString(),
        });
      }

      return res.json({ data_array, params });
    } catch (error) {
      console.error("Error fetching audience data:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
  getCommenterEngagementBreakdown: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        records = 20,
        topicId,
        categoryItems,
        source = "All",
        category = "all",
        llm_mention_type,
      } = req.body;

      // Determine which category data to use
      let breakdownCategoryData = {};

      if (
        categoryItems &&
        Array.isArray(categoryItems) &&
        categoryItems.length > 0
      ) {
        breakdownCategoryData = processCategoryItems(categoryItems);
      } else {
        // Fall back to middleware data
        breakdownCategoryData = req.processedCategories || {};
      }

      if (Object.keys(breakdownCategoryData).length === 0) {
        return res.json({
          data_array: [],
          summary: {
            total_posts: 0,
            total_unique_commenters: 0,
            total_repeat_commenters: 0,
            average_unique_per_post: 0,
            average_repeat_per_post: 0,
            all_unique_commenters: [],
            all_repeat_commenters: [],
            commenter_breakdown: {
              repeat_commenters: { total_count: 0, list: [] },
              unique_commenters: { total_count: 0, list: [] },
            },
          },
        });
      }

      // Handle category parameter - validate if provided
      let selectedCategory = category;
      if (
        category &&
        category !== "all" &&
        category !== "" &&
        category !== "custom"
      ) {
        const matchedKey = findMatchingCategoryKey(
          category,
          breakdownCategoryData
        );
        if (!matchedKey) {
          return res.json({
            data_array: [],
            summary: {
              total_posts: 0,
              total_unique_commenters: 0,
              total_repeat_commenters: 0,
              average_unique_per_post: 0,
              average_repeat_per_post: 0,
              all_unique_commenters: [],
              all_repeat_commenters: [],
              commenter_breakdown: {
                repeat_commenters: { total_count: 0, list: [] },
                unique_commenters: { total_count: 0, list: [] },
              },
            },
            error: "Category not found",
          });
        }
        selectedCategory = matchedKey;
      }

      const topicQueryString = buildTopicQueryString(breakdownCategoryData);

      // Source filtering logic
      const normalizedSources = normalizeSourceInput(source);
      let sourcesQuery = "";

      if (normalizedSources.length > 0) {
        // Specific sources provided
        const sourcesStr = normalizedSources.map((s) => `"${s}"`).join(" OR ");
        sourcesQuery = ` AND source:(${sourcesStr})`;
      } else {
        // Default logic based on topic
        if (
          parseInt(topicId) === 2619 ||
          parseInt(topicId) === 2639 ||
          parseInt(topicId) === 2640 ||
          parseInt(topicId) === 2642
        ) {
          sourcesQuery = ` AND source:("LinkedIn" OR "Linkedin")`;
        } else if (parseInt(topicId) === 2646 || parseInt(topicId) === 2650) {
          sourcesQuery = ` AND source:("Twitter" OR "LinkedIn" OR "Linkedin" OR "Web" OR "Instagram" OR "Facebook")`;
        } else {
          sourcesQuery = ` AND source:("Twitter" OR "Instagram" OR "Facebook" OR "TikTok" OR "Youtube" OR "LinkedIn" OR "Linkedin" OR "Pinterest" OR "Web" OR "Reddit")`;
        }
      }

      // Process filters for time range
      const filters = processFilters({
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        queryString: topicQueryString,
      });

      // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
      let isPublicOpinionFilter = null;

      const params = {
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          from: 0,
          size: 10000,
          _source: {
            includes: [
              "u_profile_photo",
              "u_followers",
              "u_following",
              "u_posts",
              "p_likes",
              "llm_emotion",
              "p_comments_text",
              "p_url",
              "p_comments",
              "p_shares",
              "p_engagement",
              "p_content",
              "p_picture_url",
              "predicted_sentiment_value",
              "predicted_category",
              "source",
              "rating",
              "u_fullname",
              "p_message_text",
              "comment",
              "business_response",
              "u_source",
              "name",
              "p_created_time",
              "created_at",
              "p_comments_data",
              "video_embed_url",
              "p_id",
              "p_picture",
            ],
          },
          query: {
            bool: {
              must: [
                {
                  query_string: {
                    query: `${topicQueryString} ${sourcesQuery}`,
                    analyze_wildcard: true,
                    default_operator: "AND",
                  },
                },
                { exists: { field: "p_comments_data" } },
                {
                  range: {
                    p_created_time: {
                      gte: filters.greaterThanTime,
                      lte: filters.lessThanTime,
                    },
                  },
                },
                ...(isPublicOpinionFilter ? [isPublicOpinionFilter] : []),
              ],
              must_not: [
                { term: { "p_comments_data.keyword": "" } },
                { term: { "p_comments_data.keyword": "[]" } },
              ],
            },
          },
        },
      };

      // LLM Mention Type filtering logic
      let mentionTypesArray = [];

      if (llm_mention_type) {
        if (Array.isArray(llm_mention_type)) {
          mentionTypesArray = llm_mention_type;
        } else if (typeof llm_mention_type === "string") {
          mentionTypesArray = llm_mention_type.split(",").map((s) => s.trim());
        }
      }

      // CASE 1: If mentionTypesArray has valid values → apply should-match filter
      if (mentionTypesArray.length > 0) {
        params.body.query.bool.must.push({
          bool: {
            should: mentionTypesArray.map((type) => ({
              match: { llm_mention_type: type },
            })),
            minimum_should_match: 1,
          },
        });
      }

      if (
        sentimentType &&
        sentimentType !== "undefined" &&
        sentimentType !== "null" &&
        sentimentType != ""
      ) {
        if (sentimentType.includes(",")) {
          // Handle multiple sentiment types
          const sentimentArray = sentimentType.split(",");
          const sentimentFilter = {
            bool: {
              should: sentimentArray.map((sentiment) => ({
                match: { predicted_sentiment_value: sentiment.trim() },
              })),
              minimum_should_match: 1,
            },
          };
          params.body.query.bool.must.push(sentimentFilter);
        } else {
          // Handle single sentiment type
          params.body.query.bool.must.push({
            match: { predicted_sentiment_value: sentimentType.trim() },
          });
        }
      }
      const results = await elasticClient.search(params);
      const seenIds = new Map();
      const uniqueCommenters = new Map();
      const repeatCommenters = new Map();
      let totalComments = 0;

      results.hits.hits.forEach((post) => {
        if (!post._source.p_comments_data) return;

        post._source.p_comments_data =
          typeof post._source.p_comments_data === "string"
            ? JSON.parse(post._source.p_comments_data)
            : post._source.p_comments_data;

        post._source.p_comments_data.forEach((comment) => {
          const commentsSentments =
            comment?.llm_data?.predicted_sentiment_value?.toLowerCase();
          if (sentimentType && sentimentType.trim() !== commentsSentments) {
            return;
          }
          totalComments++;
          const id = comment.author.id;
          const commentDate = comment.createdAtString || comment.createdAt;
          const permalink = comment.permalink;

          if (seenIds.has(id)) {
            const existing = seenIds.get(id);
            existing.commentCount += 1;

            if (existing.commentCount === 2) {
              const firstComment = uniqueCommenters.get(id);
              repeatCommenters.set(id, {
                ...comment,
                commentCount: 2,
                commentTexts: [...firstComment.commentTexts, comment.text],
                commentDates: [...firstComment.commentDates, commentDate],
                permalinks: [...firstComment.permalinks, permalink],
              });
              uniqueCommenters.delete(id);
            } else if (existing.commentCount > 2) {
              const repeatCommenter = repeatCommenters.get(id);
              repeatCommenter.commentCount = existing.commentCount;
              repeatCommenter.commentTexts.push(comment.text);
              repeatCommenter.commentDates.push(commentDate);
              repeatCommenter.permalinks.push(permalink);
            }
          } else {
            seenIds.set(id, { commentCount: 1, author: comment });
            uniqueCommenters.set(id, {
              ...comment,
              commentTexts: [comment.text],
              commentDates: [commentDate],
              permalinks: [permalink],
            });
          }
        });
      });

      // Convert Maps to arrays
      const uniqueCommentersList = Array.from(uniqueCommenters.values());
      const repeatCommentersList = Array.from(repeatCommenters.values());

      return res.json({
        summary: {
          uniqueCommentersCount: uniqueCommentersList.length,
          repeatCommentersCount: repeatCommentersList.length,
          totalCommenterIds: seenIds.size,
          totalComments,
        },
        uniqueCommenters: uniqueCommentersList,
        repeatCommenters: repeatCommentersList,
      });
    } catch (error) {
      console.error("Error fetching commenter engagement breakdown:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getCommentAudienceTrend: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        records = 20,
        topicId,
        categoryItems,
        source = "All",
        category = "all",
        llm_mention_type,
      } = req.body;

      // Determine which category data to use
      let trendCategoryData = {};

      if (
        categoryItems &&
        Array.isArray(categoryItems) &&
        categoryItems.length > 0
      ) {
        trendCategoryData = processCategoryItems(categoryItems);
      } else {
        // Fall back to middleware data
        trendCategoryData = req.processedCategories || {};
      }

      if (Object.keys(trendCategoryData).length === 0) {
        return res.json({
          dates: [],
          maxTrendData: "0,0",
        });
      }

      // Handle category parameter - validate if provided
      let selectedCategory = category;
      if (
        category &&
        category !== "all" &&
        category !== "" &&
        category !== "custom"
      ) {
        const matchedKey = findMatchingCategoryKey(category, trendCategoryData);
        if (!matchedKey) {
          return res.json({
            dates: [],
            maxTrendData: "0,0",
            error: "Category not found",
          });
        }
        selectedCategory = matchedKey;
      }

      const topicQueryString = buildTopicQueryString(trendCategoryData);

      // Source filtering logic
      const normalizedSources = normalizeSourceInput(source);
      let sourcesQuery = "";

      if (normalizedSources.length > 0) {
        // Specific sources provided
        const sourcesStr = normalizedSources.map((s) => `"${s}"`).join(" OR ");
        sourcesQuery = ` AND source:(${sourcesStr})`;
      } else {
        // Default logic based on topic
        if (
          parseInt(topicId) === 2619 ||
          parseInt(topicId) === 2639 ||
          parseInt(topicId) === 2640 ||
          parseInt(topicId) === 2642
        ) {
          sourcesQuery = ` AND source:("LinkedIn" OR "Linkedin")`;
        } else {
          sourcesQuery = ` AND source:("Twitter" OR "Instagram" OR "Facebook" OR "TikTok" OR "Youtube" OR "LinkedIn" OR "Linkedin" OR "Pinterest" OR "Web" OR "Reddit")`;
        }
      }

      // Process filters for time range
      const filters = processFilters({
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        queryString: topicQueryString,
      });

      // Gather all filter terms
      let allFilterTerms = [];
      if (trendCategoryData) {
        Object.values(trendCategoryData).forEach((data) => {
          if (data.keywords && data.keywords.length > 0)
            allFilterTerms.push(...data.keywords);
          if (data.hashtags && data.hashtags.length > 0)
            allFilterTerms.push(...data.hashtags);
          if (data.urls && data.urls.length > 0)
            allFilterTerms.push(...data.urls);
        });
      }

      // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
      let isPublicOpinionFilter = null;

      // Optimized query to only get the fields we need
      const params = {
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          size: 10000, // Increased slightly to ensure we get all relevant posts
          _source: [
            "u_profile_photo",
            "u_followers",
            "u_following",
            "u_posts",
            "p_likes",
            "llm_emotion",
            "p_comments_text",
            "p_url",
            "p_comments",
            "p_shares",
            "p_engagement",
            "p_content",
            "p_picture_url",
            "predicted_sentiment_value",
            "predicted_category",
            "source",
            "rating",
            "u_fullname",
            "p_message_text",
            "comment",
            "business_response",
            "u_source",
            "name",
            "p_created_time",
            "created_at",
            "p_comments_data",
            "video_embed_url",
            "p_id",
            "p_picture",
          ],
          query: {
            bool: {
              must: [
                {
                  query_string: {
                    query: `${topicQueryString} ${sourcesQuery}`,
                    analyze_wildcard: true,
                    default_operator: "AND",
                  },
                },
                { exists: { field: "p_comments_data" } },
                {
                  range: {
                    p_created_time: {
                      gte: filters.greaterThanTime,
                      lte: filters.lessThanTime,
                    },
                  },
                },
                ...(isPublicOpinionFilter ? [isPublicOpinionFilter] : []),
              ],
              must_not: [
                { term: { "p_comments_data.keyword": "" } },
                { term: { "p_comments_data.keyword": "[]" } },
              ],
            },
          },
        },
      };

      // LLM Mention Type filtering logic
      let mentionTypesArray = [];

      if (llm_mention_type) {
        if (Array.isArray(llm_mention_type)) {
          mentionTypesArray = llm_mention_type;
        } else if (typeof llm_mention_type === "string") {
          mentionTypesArray = llm_mention_type.split(",").map((s) => s.trim());
        }
      }

      // CASE 1: If mentionTypesArray has valid values → apply should-match filter
      if (mentionTypesArray.length > 0) {
        params.body.query.bool.must.push({
          bool: {
            should: mentionTypesArray.map((type) => ({
              match: { llm_mention_type: type },
            })),
            minimum_should_match: 1,
          },
        });
      }

      if (
        sentimentType &&
        sentimentType !== "undefined" &&
        sentimentType !== "null" &&
        sentimentType != ""
      ) {
        if (sentimentType.includes(",")) {
          // Handle multiple sentiment types
          const sentimentArray = sentimentType.split(",");
          const sentimentFilter = {
            bool: {
              should: sentimentArray.map((sentiment) => ({
                match: { predicted_sentiment_value: sentiment.trim() },
              })),
              minimum_should_match: 1,
            },
          };
          params.body.query.bool.must.push(sentimentFilter);
        } else {
          // Handle single sentiment type
          params.body.query.bool.must.push({
            match: { predicted_sentiment_value: sentimentType.trim() },
          });
        }
      }
      const results = await elasticClient.search(params);
      const posts = results.hits.hits.map((hit) =>
        formatPostData(hit, allFilterTerms)
      );
      const datewiseCommentCount = {};
      const datewisePostCount = {};

      for (const post of results.hits.hits) {
        if (!post._source.p_comments_data) continue;

        let commentsData;
        try {
          commentsData =
            typeof post._source.p_comments_data === "string"
              ? JSON.parse(post._source.p_comments_data)
              : post._source.p_comments_data;
        } catch (e) {
          console.error("Error parsing comments data:", e);
          continue;
        }

        if (!Array.isArray(commentsData)) continue;

        // To avoid counting the same post multiple times for the same date
        const datesWithCommentsInThisPost = new Set();

        for (const comment of commentsData) {
          if (!comment.createdAtString) continue;

          const commentDate = comment.createdAtString.split(" ")[0];

          // Count total comments per date
          datewiseCommentCount[commentDate] =
            (datewiseCommentCount[commentDate] || 0) + 1;

          // Track if this post has comments on this date
          datesWithCommentsInThisPost.add(commentDate);
        }

        // Increment post count only once per date per post
        for (const date of datesWithCommentsInThisPost) {
          datewisePostCount[date] = (datewisePostCount[date] || 0) + 1;
        }
      }

      // Combine comment and post counts
      const datewiseCountArray = Object.entries(datewiseCommentCount)
        .map(([date, count]) => ({
          date,
          count, // total comments
          postCount: datewisePostCount[date] || 0, // total posts that had comments that day
        }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      // Find the date with maximum comments
      let maxDate = "";
      let maxCount = 0;
      for (const [date, count] of Object.entries(datewiseCommentCount)) {
        if (count > maxCount) {
          maxDate = date;
          maxCount = count;
        }
      }

      return res.json({
        dates: datewiseCountArray,
        maxTrendData: maxDate ? `${maxDate},${maxCount}` : "0,0",
        posts,
      });
    } catch (error) {
      console.error("Error fetching comment audience trend:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getCommentAudienceLeaderBoard: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        records = 20,
        topicId,
        categoryItems,
        source = "All",
        category = "all",
        llm_mention_type,
      } = req.body;

      // Determine which category data to use
      let trendCategoryData = {};

      if (
        categoryItems &&
        Array.isArray(categoryItems) &&
        categoryItems.length > 0
      ) {
        trendCategoryData = processCategoryItems(categoryItems);
      } else {
        // Fall back to middleware data
        trendCategoryData = req.processedCategories || {};
      }

      if (Object.keys(trendCategoryData).length === 0) {
        return res.json({
          dates: [],
          maxTrendData: "0,0",
        });
      }

      // Handle category parameter - validate if provided
      let selectedCategory = category;
      if (
        category &&
        category !== "all" &&
        category !== "" &&
        category !== "custom"
      ) {
        const matchedKey = findMatchingCategoryKey(category, trendCategoryData);
        if (!matchedKey) {
          return res.json({
            dates: [],
            maxTrendData: "0,0",
            error: "Category not found",
          });
        }
        selectedCategory = matchedKey;
      }

      const topicQueryString = buildTopicQueryString(trendCategoryData);

      // Source filtering logic
      const normalizedSources = normalizeSourceInput(source);
      let sourcesQuery = "";

      if (normalizedSources.length > 0) {
        // Specific sources provided
        const sourcesStr = normalizedSources.map((s) => `"${s}"`).join(" OR ");
        sourcesQuery = ` AND source:(${sourcesStr})`;
      } else {
        // Default logic based on topic
        if (
          parseInt(topicId) === 2619 ||
          parseInt(topicId) === 2639 ||
          parseInt(topicId) === 2640 ||
          parseInt(topicId) === 2642 ||
          parseInt(topicId) === 2649 ||
          parseInt(topicId) == 2647 ||
          parseInt(topicId) == 2648 ||
          parseInt(topicId) == 2650 ||
          parseInt(topicId) == 2646
        ) {
          sourcesQuery = ` AND source:("LinkedIn" OR "Linkedin" OR "Instagram" OR "Facebook" OR "Twitter" OR "Web",)`;
        } else {
          sourcesQuery = ` AND source:("Twitter" OR "Instagram" OR "Facebook" OR "TikTok" OR "Youtube" OR "LinkedIn" OR "Linkedin" OR "Pinterest" OR "Web" OR "Reddit")`;
        }
      }

      // Process filters for time range
      const filters = processFilters({
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        queryString: topicQueryString,
      });

      // Gather all filter terms
      let allFilterTerms = [];
      if (trendCategoryData) {
        Object.values(trendCategoryData).forEach((data) => {
          if (data.keywords && data.keywords.length > 0)
            allFilterTerms.push(...data.keywords);
          if (data.hashtags && data.hashtags.length > 0)
            allFilterTerms.push(...data.hashtags);
          if (data.urls && data.urls.length > 0)
            allFilterTerms.push(...data.urls);
        });
      }

      // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
      let isPublicOpinionFilter = null;

      let firstUrl = Object.values(trendCategoryData)[0].urls;
      let linkedInUrl = firstUrl.find((url) =>
        url.includes("linkedin.com/company")
      );

      console.log("linkedInUrl", linkedInUrl);
      // Optimized query to only get the fields we need
      const params = {
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          size: 10000, // Increased slightly to ensure we get all relevant posts
          _source: [
            "u_profile_photo",
            "u_followers",
            "u_following",
            "u_posts",
            "p_likes",
            "llm_emotion",
            "p_comments_text",
            "p_url",
            "p_comments",
            "p_shares",
            "p_engagement",
            "p_content",
            "p_picture_url",
            "predicted_sentiment_value",
            "predicted_category",
            "source",
            "rating",
            "u_fullname",
            "p_message_text",
            "comment",
            "business_response",
            "u_source",
            "name",
            "p_created_time",
            "created_at",
            "p_comments_data",
            "video_embed_url",
            "p_id",
            "p_picture",
          ],
          query: {
            bool: {
              must: [
                {
                  query_string: {
                    query: `${topicQueryString} ${sourcesQuery}`,
                    analyze_wildcard: true,
                    default_operator: "AND",
                  }, //OR \"https://www.linkedin.com/company/cpxholding/\". OR \"https://www.linkedin.com/company/cpxholding/\" OR \"https://www.linkedin.com/company/cpxholding/\"
                },
                { exists: { field: "p_comments_data" } },
                {
                  range: {
                    p_created_time: {
                      gte: filters.greaterThanTime,
                      lte: filters.lessThanTime,
                    },
                  },
                },
                ...(isPublicOpinionFilter ? [isPublicOpinionFilter] : []),
              ],
              must_not: [
                { term: { "p_comments_data.keyword": "" } },
                { term: { "p_comments_data.keyword": "[]" } },
              ],
            },
          },
        },
      };

      // LLM Mention Type filtering logic
      let mentionTypesArray = [];

      if (llm_mention_type) {
        if (Array.isArray(llm_mention_type)) {
          mentionTypesArray = llm_mention_type;
        } else if (typeof llm_mention_type === "string") {
          mentionTypesArray = llm_mention_type.split(",").map((s) => s.trim());
        }
      }

      // CASE 1: If mentionTypesArray has valid values → apply should-match filter
      if (mentionTypesArray.length > 0) {
        params.body.query.bool.must.push({
          bool: {
            should: mentionTypesArray.map((type) => ({
              match: { llm_mention_type: type },
            })),
            minimum_should_match: 1,
          },
        });
      }

      if (
        sentimentType &&
        sentimentType !== "undefined" &&
        sentimentType !== "null" &&
        sentimentType != ""
      ) {
        if (sentimentType.includes(",")) {
          // Handle multiple sentiment types
          const sentimentArray = sentimentType.split(",");
          const sentimentFilter = {
            bool: {
              should: sentimentArray.map((sentiment) => ({
                match: { predicted_sentiment_value: sentiment.trim() },
              })),
              minimum_should_match: 1,
            },
          };
          params.body.query.bool.must.push(sentimentFilter);
        } else {
          // Handle single sentiment type
          params.body.query.bool.must.push({
            match: { predicted_sentiment_value: sentimentType.trim() },
          });
        }
      }

      const results = await elasticClient.search(params);
      const posts = results.hits.hits.map((hit) =>
        formatPostData(hit, allFilterTerms)
      );

      const commentsList = [];
      for (const post of results.hits.hits) {
        if (!post._source.p_comments_data) continue;

        let commentsData;
        try {
          commentsData =
            typeof post._source.p_comments_data === "string"
              ? JSON.parse(post._source.p_comments_data)
              : post._source.p_comments_data;
        } catch (e) {
          console.error("Error parsing comments data:", e);
          continue;
        }

        if (!Array.isArray(commentsData)) continue;

        // To avoid counting the same post multiple times for the same date

        if (req.body.companyURL) {
          linkedInUrl = req.body.companyURL;
        }

        for (const comment of commentsData) {
          // commentsList.push(comment)
          if (
            comment.author?.fullPositions &&
            Array.isArray(comment.author?.fullPositions)
          ) {
            const isMatch = comment.author.fullPositions?.some(
              (pos) =>
                pos.companyURL === linkedInUrl &&
                pos.end.year == 0 &&
                pos.end.month == 0 &&
                pos.end.day == 0
            );
            if (isMatch) {
              const isMatchComment = comment.author.fullPositions?.filter(
                (pos) =>
                  pos.companyURL === linkedInUrl &&
                  pos.end.year == 0 &&
                  pos.end.month == 0 &&
                  pos.end.day == 0
              );
              if (req.body?.needCommentsData) {
                commentsList.push(comment);
              } else {
                commentsList.push({
                  name:
                    comment?.author?.name ||
                    comment?.author?.firstName +
                      " " +
                      comment?.author?.lastName,
                  text: comment.text,
                  profile_url: comment?.author?.profilePicture,
                  position: isMatchComment[0].title,
                  commentsCount: comment.totalSocialActivityCounts.numComments,
                  likeCount: comment.totalSocialActivityCounts.likeCount,
                  sharesCount: comment.totalSocialActivityCounts.numShares,
                  ReactionCount:
                    comment.totalSocialActivityCounts.totalReactionCount,
                });
              }
            }
          }
          // return res.status(200).json(isMatchComment);
          continue;
        }
      }

      // Generate CSV from commentsList
      if (commentsList.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No comments found",
        });
      }
      console.log(req.body?.isCSV);

      if (req.body.isCSV == false || req.body?.needCommentsData) {
        return res.status(200).json(commentsList);
      }

      // return res.status(200).json(commentsList);

      // Helper function to flatten nested objects
      const flattenObject = (obj, prefix = "") => {
        const flattened = {};

        for (const key in obj) {
          if (obj[key] === null || obj[key] === undefined) {
            flattened[prefix + key] = "";
            continue;
          }

          if (typeof obj[key] === "object" && !Array.isArray(obj[key])) {
            Object.assign(
              flattened,
              flattenObject(obj[key], `${prefix}${key}.`)
            );
          } else if (Array.isArray(obj[key])) {
            // Handle arrays by converting to JSON string or processing first element
            if (obj[key].length > 0 && typeof obj[key][0] === "object") {
              Object.assign(
                flattened,
                flattenObject(obj[key][0], `${prefix}${key}.`)
              );
            } else {
              flattened[prefix + key] = obj[key].join("; ");
            }
          } else {
            flattened[prefix + key] = obj[key];
          }
        }

        return flattened;
      };

      // Flatten all comments to get all possible keys
      const flattenedComments = commentsList.map((comment) =>
        flattenObject(comment)
      );

      // Get all unique headers from all comments
      const allHeaders = new Set();
      flattenedComments.forEach((comment) => {
        Object.keys(comment).forEach((key) => allHeaders.add(key));
      });

      const csvHeaders = Array.from(allHeaders);

      // Helper function to escape CSV values
      const escapeCsvValue = (value) => {
        if (value === null || value === undefined) return "";

        const stringValue = String(value);
        // Escape double quotes and wrap in quotes if contains comma, newline, or quote
        if (
          stringValue.includes(",") ||
          stringValue.includes("\n") ||
          stringValue.includes('"')
        ) {
          return `"${stringValue.replace(/"/g, '""').replace(/\n/g, " ")}"`;
        }
        return stringValue;
      };

      // Convert commentsList to CSV rows
      const csvRows = flattenedComments.map((comment) => {
        return csvHeaders
          .map((header) => escapeCsvValue(comment[header]))
          .join(",");
      });

      // Combine headers and rows
      const csvContent = [csvHeaders.join(","), ...csvRows].join("\n");

      // Store CSV file to disk
      const exportsDir = path.join(__dirname, "../../exports");
      const timestamp = new Date()
        .toISOString()
        .replace(/:/g, "-")
        .split(".")[0];
      const filename = `comments-export-${timestamp}.csv`;
      const filePath = path.join(exportsDir, filename);

      // Create exports directory if it doesn't exist
      await fs.mkdir(exportsDir, { recursive: true });

      // Write CSV file
      await fs.writeFile(filePath, csvContent, "utf8");

      return res.json({
        success: true,
        message: "CSV file stored successfully",
        filePath: filePath,
        filename: filename,
      });
    } catch (error) {
      console.error("Error fetching comment audience trend:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
  getCommentAudienceLeaderBoardEmployeeData: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        records = 20,
        topicId,
        categoryItems,
        source = "All",
        category = "all",
        llm_mention_type,
      } = req.body;

      // Determine which category data to use
      let trendCategoryData = {};

      if (
        categoryItems &&
        Array.isArray(categoryItems) &&
        categoryItems.length > 0
      ) {
        trendCategoryData = processCategoryItems(categoryItems);
      } else {
        // Fall back to middleware data
        trendCategoryData = req.processedCategories || {};
      }

      if (Object.keys(trendCategoryData).length === 0) {
        return res.json({
          dates: [],
          maxTrendData: "0,0",
        });
      }

      // Handle category parameter - validate if provided
      let selectedCategory = category;
      if (
        category &&
        category !== "all" &&
        category !== "" &&
        category !== "custom"
      ) {
        const matchedKey = findMatchingCategoryKey(category, trendCategoryData);
        if (!matchedKey) {
          return res.json({
            dates: [],
            maxTrendData: "0,0",
            error: "Category not found",
          });
        }
        selectedCategory = matchedKey;
      }

      const topicQueryString = buildTopicQueryString(trendCategoryData);

      // Source filtering logic
      const normalizedSources = normalizeSourceInput(source);
      let sourcesQuery = "";

      if (normalizedSources.length > 0) {
        // Specific sources provided
        const sourcesStr = normalizedSources.map((s) => `"${s}"`).join(" OR ");
        sourcesQuery = ` AND source:(${sourcesStr})`;
      } else {
        // Default logic based on topic
        if (
          parseInt(topicId) === 2619 ||
          parseInt(topicId) === 2639 ||
          parseInt(topicId) === 2640 ||
          parseInt(topicId) === 2642 ||
          parseInt(topicId) === 2649 ||
          parseInt(topicId) == 2647 ||
          parseInt(topicId) == 2648 ||
          parseInt(topicId) == 2650 ||
          parseInt(topicId) == 2646
        ) {
          sourcesQuery = ` AND source:("LinkedIn" OR "Linkedin" OR "Instagram" OR "Facebook" OR "Twitter" OR "Web",)`;
        } else {
          sourcesQuery = ` AND source:("Twitter" OR "Instagram" OR "Facebook" OR "TikTok" OR "Youtube" OR "LinkedIn" OR "Linkedin" OR "Pinterest" OR "Web" OR "Reddit")`;
        }
      }

      // Process filters for time range
      const filters = processFilters({
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        queryString: topicQueryString,
      });

      // Gather all filter terms
      let allFilterTerms = [];
      if (trendCategoryData) {
        Object.values(trendCategoryData).forEach((data) => {
          if (data.keywords && data.keywords.length > 0)
            allFilterTerms.push(...data.keywords);
          if (data.hashtags && data.hashtags.length > 0)
            allFilterTerms.push(...data.hashtags);
          if (data.urls && data.urls.length > 0)
            allFilterTerms.push(...data.urls);
        });
      }

      // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
      let isPublicOpinionFilter = null;

      let firstUrl = Object.values(trendCategoryData)[0].urls;
      let linkedInUrl = firstUrl.find((url) =>
        url.includes("linkedin.com/company")
      );

      console.log("linkedInUrl", linkedInUrl);
      // Optimized query to only get the fields we need
      let params = {
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          size: 10000, // Increased slightly to ensure we get all relevant posts
          _source: [
            "u_profile_photo",
            "u_followers",
            "u_following",
            "u_posts",
            "p_likes",
            "llm_emotion",
            "p_comments_text",
            "p_url",
            "p_comments",
            "p_shares",
            "p_engagement",
            "p_content",
            "p_picture_url",
            "predicted_sentiment_value",
            "predicted_category",
            "source",
            "rating",
            "u_fullname",
            "p_message_text",
            "comment",
            "business_response",
            "u_source",
            "name",
            "p_created_time",
            "created_at",
            "p_comments_data",
            "video_embed_url",
            "p_id",
            "p_picture",
          ],
          query: {
            bool: {
              must: [
                {
                  query_string: {
                    query: `${"(p_company_name:(\"CPX\")"} ${sourcesQuery}`,
                    analyze_wildcard: true,
                    default_operator: "AND",
                  }, //OR \"https://www.linkedin.com/company/cpxholding/\". OR \"https://www.linkedin.com/company/cpxholding/\" OR \"https://www.linkedin.com/company/cpxholding/\"
                },
                { exists: { field: "p_comments_data" } },
                {
                  range: {
                    p_created_time: {
                      gte: filters.greaterThanTime,
                      lte: filters.lessThanTime,
                    },
                  },
                },
                ...(isPublicOpinionFilter ? [isPublicOpinionFilter] : []),
              ],
              must_not: [
                { term: { "p_comments_data.keyword": "" } },
                { term: { "p_comments_data.keyword": "[]" } },
                {
                  term: {
                    u_source:
                      "https://www.linkedin.com/company/cpxholding/posts",
                  },
                },
                {
                  term: {
                    u_source:
                      "https://www.linkedin.com/company/cpxholding/",
                  },
                },
              ],
            },
          },
        },
      };

      // LLM Mention Type filtering logic
      let mentionTypesArray = [];

      if (llm_mention_type) {
        if (Array.isArray(llm_mention_type)) {
          mentionTypesArray = llm_mention_type;
        } else if (typeof llm_mention_type === "string") {
          mentionTypesArray = llm_mention_type.split(",").map((s) => s.trim());
        }
      }

      // CASE 1: If mentionTypesArray has valid values → apply should-match filter
      if (mentionTypesArray.length > 0) {
        params.body.query.bool.must.push({
          bool: {
            should: mentionTypesArray.map((type) => ({
              match: { llm_mention_type: type },
            })),
            minimum_should_match: 1,
          },
        });
      }

      if (
        sentimentType &&
        sentimentType !== "undefined" &&
        sentimentType !== "null" &&
        sentimentType != ""
      ) {
        if (sentimentType.includes(",")) {
          // Handle multiple sentiment types
          const sentimentArray = sentimentType.split(",");
          const sentimentFilter = {
            bool: {
              should: sentimentArray.map((sentiment) => ({
                match: { predicted_sentiment_value: sentiment.trim() },
              })),
              minimum_should_match: 1,
            },
          };
          params.body.query.bool.must.push(sentimentFilter);
        } else {
          // Handle single sentiment type
          params.body.query.bool.must.push({
            match: { predicted_sentiment_value: sentimentType.trim() },
          });
        }
      }

// Initial search with scroll
params = {
    index: process.env.ELASTICSEARCH_DEFAULTINDEX,
    scroll: '2m',
    body: {
        _source: [
            "p_comments_text",
            "p_message_text",
            "comment",
            "u_source",
            "name",
            "p_created_time",
            "p_comments_data",
            "p_id"
        ],
        size: 1000,
        query: {
            bool: {
                must: [
                    {
                        match: {
                            "p_company_name": "CPX"
                        }
                    }
                ],
                must_not: [
                    {
                        wildcard: {
                            "u_source.keyword": "https://www.linkedin.com/company/cpxholding*"
                        }
                    }
                ]
            }
        }
    }
};

// Get all results
let allResults = [];
let response = await elasticClient.search(params);
let scrollId = response._scroll_id;

allResults.push(...response.hits.hits);
console.log(`Total records retrieved: ${allResults.length}`);

while (response.hits.hits.length > 0) {
    response = await elasticClient.scroll({
        scroll_id: scrollId,
        scroll: '2m'
    });
    
    scrollId = response._scroll_id;
    allResults.push(...response.hits.hits);
    console.log(`Total records retrieved: ${allResults.length}`);

    if (response.hits.hits.length === 0) {
        break;
    }
}

await elasticClient.clearScroll({
    scroll_id: scrollId
});

console.log(`Total records retrieved: ${allResults.length}`);

// Split into batches of 1000 and process
// const batchSize = 1000;
// for (let i = 0; i < allResults.length; i += batchSize) {
//     const batch = allResults.slice(i, i + batchSize);
//     console.log(`Processing batch ${Math.floor(i / batchSize) + 1}: ${batch.length} records`);
    
//     // Process your batch here
//     // await processData(batch);
// }


    //  return res.send(params)
      // const results = await elasticClient.search(params);
      // const posts = results.hits.hits.map((hit) =>
      //   formatPostData(hit, allFilterTerms)
      // );

      const commentsList = [];
      for (const post of allResults) {
        if (!post._source.p_comments_data) continue;

        let commentsData;
        try {
          commentsData =
            typeof post._source.p_comments_data === "string"
              ? JSON.parse(post._source.p_comments_data)
              : post._source.p_comments_data;
        } catch (e) {
          console.error("Error parsing comments data:", e);
          continue;
        }

        if (!Array.isArray(commentsData)) continue;

                  // commentsList.push(commentsData)

        // To avoid counting the same post multiple times for the same date

        if (req.body.companyURL) {
          linkedInUrl = req.body.companyURL;
        }

        for (const comment of commentsData) {
          // commentsList.push(comment)
          if (
            comment.author?.fullPositions &&
            Array.isArray(comment.author?.fullPositions)
          ) {
            const isMatch = comment.author.fullPositions?.some(
              (pos) =>
                pos.companyURL === linkedInUrl 
              &&
                pos.end.year == 0 &&
                pos.end.month == 0 &&
                pos.end.day == 0
            );
            if (isMatch) {
              const isMatchComment = comment.author.fullPositions?.filter(
                (pos) =>
                  pos.companyURL === linkedInUrl 
                &&
                  pos.end.year == 0 &&
                  pos.end.month == 0 &&
                  pos.end.day == 0
              );
              if (req.body?.needCommentsData) {
                commentsList.push(comment);
              } else {
                commentsList.push({
                  name:
                    comment?.author?.name ||
                    comment?.author?.firstName +
                      " " +
                      comment?.author?.lastName,
                  text: comment.text,
                  profile_url: comment?.author?.profilePicture,
                  position: isMatchComment[0].title,
                  commentsCount: comment.totalSocialActivityCounts.numComments,
                  likeCount: comment.totalSocialActivityCounts.likeCount,
                  sharesCount: comment.totalSocialActivityCounts.numShares,
                  ReactionCount:
                    comment.totalSocialActivityCounts.totalReactionCount,
                });
              }
            }
          }
          // return res.status(200).json(isMatchComment);
          continue;
        }
      }

      // Generate CSV from commentsList
      if (commentsList.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No comments found",
        });
      }
      // console.log(req.body?.isCSV);
  // return res.status(200).json(commentsList);
      if (req.body.isCSV == false || req.body?.needCommentsData) {
        return res.status(200).json(commentsList);
      }

      // return res.status(200).json(commentsList);

      // Helper function to flatten nested objects
      const flattenObject = (obj, prefix = "") => {
        const flattened = {};

        for (const key in obj) {
          if (obj[key] === null || obj[key] === undefined) {
            flattened[prefix + key] = "";
            continue;
          }

          if (typeof obj[key] === "object" && !Array.isArray(obj[key])) {
            Object.assign(
              flattened,
              flattenObject(obj[key], `${prefix}${key}.`)
            );
          } else if (Array.isArray(obj[key])) {
            // Handle arrays by converting to JSON string or processing first element
            if (obj[key].length > 0 && typeof obj[key][0] === "object") {
              Object.assign(
                flattened,
                flattenObject(obj[key][0], `${prefix}${key}.`)
              );
            } else {
              flattened[prefix + key] = obj[key].join("; ");
            }
          } else {
            flattened[prefix + key] = obj[key];
          }
        }

        return flattened;
      };

      // Flatten all comments to get all possible keys
      const flattenedComments = commentsList.map((comment) =>
        flattenObject(comment)
      );

      // Get all unique headers from all comments
      const allHeaders = new Set();
      flattenedComments.forEach((comment) => {
        Object.keys(comment).forEach((key) => allHeaders.add(key));
      });

      const csvHeaders = Array.from(allHeaders);

      // Helper function to escape CSV values
      const escapeCsvValue = (value) => {
        if (value === null || value === undefined) return "";

        const stringValue = String(value);
        // Escape double quotes and wrap in quotes if contains comma, newline, or quote
        if (
          stringValue.includes(",") ||
          stringValue.includes("\n") ||
          stringValue.includes('"')
        ) {
          return `"${stringValue.replace(/"/g, '""').replace(/\n/g, " ")}"`;
        }
        return stringValue;
      };

      // Convert commentsList to CSV rows
      const csvRows = flattenedComments.map((comment) => {
        return csvHeaders
          .map((header) => escapeCsvValue(comment[header]))
          .join(",");
      });

      // Combine headers and rows
      const csvContent = [csvHeaders.join(","), ...csvRows].join("\n");

      // Store CSV file to disk
      const exportsDir = path.join(__dirname, "../../exports");
      const timestamp = new Date()
        .toISOString()
        .replace(/:/g, "-")
        .split(".")[0];
      const filename = `comments-export-${timestamp}.csv`;
      const filePath = path.join(exportsDir, filename);

      // Create exports directory if it doesn't exist
      await fs.mkdir(exportsDir, { recursive: true });

      // Write CSV file
      await fs.writeFile(filePath, csvContent, "utf8");

      return res.json({
        success: true,
        message: "CSV file stored successfully",
        filePath: filePath,
        filename: filename,
      });
    } catch (error) {
      console.error("Error fetching comment audience trend:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getCommenterEngagementBySeniority: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        records = 20,
        topicId,
        categoryItems,
        source = "All",
        category = "all",
        llm_mention_type,
      } = req.body;

      // Determine which category data to use
      let seniorityCategoryData = {};

      if (
        categoryItems &&
        Array.isArray(categoryItems) &&
        categoryItems.length > 0
      ) {
        seniorityCategoryData = processCategoryItems(categoryItems);
      } else {
        // Fall back to middleware data
        seniorityCategoryData = req.processedCategories || {};
      }
      if (Object.keys(seniorityCategoryData).length === 0) {
        return res.json({
          data_array: [],
          summary: {
            seniority_breakdown: {},
            top_commenters_by_seniority: {},
            insights: {
              most_active_seniority: "",
              highest_engagement_seniority: "",
            },
          },
        });
      }

      // Handle category parameter - validate if provided
      let selectedCategory = category;
      if (
        category &&
        category !== "all" &&
        category !== "" &&
        category !== "custom"
      ) {
        const matchedKey = findMatchingCategoryKey(
          category,
          seniorityCategoryData
        );
        if (!matchedKey) {
          return res.json({
            data_array: [],
            summary: {
              seniority_breakdown: {},
              top_commenters_by_seniority: {},
              insights: {
                most_active_seniority: "",
                highest_engagement_seniority: "",
              },
            },
            error: "Category not found",
          });
        }
        selectedCategory = matchedKey;
      }

      const topicQueryString = buildTopicQueryString(seniorityCategoryData);

      // Source filtering logic
      const normalizedSources = normalizeSourceInput(source);
      let sourcesQuery = "";

      if (normalizedSources.length > 0) {
        // Specific sources provided
        const sourcesStr = normalizedSources.map((s) => `"${s}"`).join(" OR ");
        sourcesQuery = ` AND source:(${sourcesStr})`;
      } else {
        // Default logic based on topic
        if (
          parseInt(topicId) === 2619 ||
          parseInt(topicId) === 2639 ||
          parseInt(topicId) === 2640 ||
          parseInt(topicId) === 2642
        ) {
          sourcesQuery = ` AND source:("LinkedIn" OR "Linkedin")`;
        } else {
          sourcesQuery = ` AND source:("Twitter" OR "Instagram" OR "Facebook" OR "TikTok" OR "Youtube" OR "LinkedIn" OR "Linkedin" OR "Pinterest" OR "Web" OR "Reddit")`;
        }
      }

      const filters = processFilters({
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        queryString: topicQueryString,
      });

      // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
      let isPublicOpinionFilter = null;

      const params = {
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          from: 0,
          size: 0,
          query: {
            bool: {
              must: [
                {
                  query_string: {
                    query: `${topicQueryString} ${sourcesQuery}`,
                    analyze_wildcard: true,
                    default_operator: "AND",
                  },
                },
                { exists: { field: "p_comments_data" } },
                {
                  range: {
                    p_created_time: {
                      gte: filters.greaterThanTime,
                      lte: filters.lessThanTime,
                    },
                  },
                },
                ...(isPublicOpinionFilter ? [isPublicOpinionFilter] : []),
              ],
              must_not: [
                { term: { "p_comments_data.keyword": "" } },
                { term: { "p_comments_data.keyword": "[]" } },
              ],
            },
          },
          aggs: {
            posts_with_comments: {
              terms: {
                field: "p_id.keyword",
                size: parseInt(records),
              },
              aggs: {
                post_details: {
                  top_hits: {
                    size: 1,
                    _source: {
                      includes: [
                        "p_comments_text",
                        "p_url",
                        "p_content",
                        "source",
                        "u_fullname",
                        "p_created_time",
                        "p_comments_data",
                        "p_id",
                      ],
                    },
                    sort: [{ p_created_time: { order: "desc" } }],
                  },
                },
              },
            },
          },
        },
      };

      // LLM Mention Type filtering logic
      let mentionTypesArray = [];

      if (llm_mention_type) {
        if (Array.isArray(llm_mention_type)) {
          mentionTypesArray = llm_mention_type;
        } else if (typeof llm_mention_type === "string") {
          mentionTypesArray = llm_mention_type.split(",").map((s) => s.trim());
        }
      }

      // CASE 1: If mentionTypesArray has valid values → apply should-match filter
      if (mentionTypesArray.length > 0) {
        params.body.query.bool.must.push({
          bool: {
            should: mentionTypesArray.map((type) => ({
              match: { llm_mention_type: type },
            })),
            minimum_should_match: 1,
          },
        });
      }
      // CASE 2: If no LLM Mention Type given → apply must_not filter
      else if (Number(topicId) == 2641 || Number(topicId) == 2643 || Number(topicId) == 2644 || Number(topicId) == 2651 || Number(topicId) == 2652) {
        params.body.query.bool.must.push({
          bool: {
            must_not: [
              { match: { llm_mention_type: "Promotion" } },
              { match: { llm_mention_type: "Booking" } },
              { match: { llm_mention_type: "Others" } },
            ],
          },
        });
      }

      if (
        sentimentType &&
        sentimentType !== "undefined" &&
        sentimentType !== "null" &&
        sentimentType != ""
      ) {
        if (sentimentType.includes(",")) {
          // Handle multiple sentiment types
          const sentimentArray = sentimentType.split(",");
          const sentimentFilter = {
            bool: {
              should: sentimentArray.map((sentiment) => ({
                match: { predicted_sentiment_value: sentiment.trim() },
              })),
              minimum_should_match: 1,
            },
          };
          params.body.query.bool.must.push(sentimentFilter);
        } else {
          // Handle single sentiment type
          params.body.query.bool.must.push({
            match: { predicted_sentiment_value: sentimentType.trim() },
          });
        }
      }

      const results = await elasticClient.search(params);

      if (!results?.aggregations?.posts_with_comments?.buckets) {
        return res.json({
          data_array: [],
          summary: {
            seniority_breakdown: {},
            top_commenters_by_seniority: {},
            insights: {
              most_active_seniority: "",
              highest_engagement_seniority: "",
            },
          },
        });
      }

      const categorizeSeniority = (position, summary) => {
        // Handle case where position is an array of job objects
        let positionText = "";
        if (Array.isArray(position)) {
          // Extract titles from job objects and combine them
          positionText = position
            .map((job) => job.title || "")
            .filter((title) => title.trim() !== "")
            .join(" ");
        } else {
          positionText = String(position || "");
        }

        const positionLower = positionText.toLowerCase();
        const summaryLower = String(summary || "").toLowerCase();

        const combinedText = `${positionLower} ${summaryLower}`;

        // Helper function for better keyword matching
        const containsKeyword = (text, keyword) => {
          // Handle special cases for abbreviations and dots
          if (keyword.includes(".")) {
            return (
              text.includes(keyword) || text.includes(keyword.replace(".", ""))
            );
          }
          // Use word boundary for most cases, but handle edge cases
          const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const regex = new RegExp(`\\b${escapedKeyword}\\b`, "i");
          return regex.test(text);
        };

        // Expanded and prioritized keyword lists
        const executiveKeywords = [
          "ceo",
          "chief",
          "cto",
          "cfo",
          "coo",
          "cmo",
          "cio",
          "cpo",
          "founder",
          "co-founder",
          "owner",
          "partner",
          "president",
          "chairman",
          "board member",
          "vice president",
          "vp",
          "area vice president",
          "regional vice president",
          "country manager",
          "general manager",
          "global head",
          "executive director",
          "managing director",
          "group director",
          "regional director",
          "country head",
          "global manager",
        ];

        const seniorKeywords = [
          "senior",
          "sr.",
          "sr ",
          "lead",
          "principal",
          "director",
          "head of",
          "manager",
          "managing",
          "supervisor",
          "team lead",
          "architect",
          "strategist",
          "expert",
          "specialist",
          "department head",
          "division head",
          "senior manager",
          "senior director",
          "senior consultant",
          "senior engineer",
          "senior analyst",
          "senior developer",
          "senior architect",
          "senior advisor",
          "customer success advisor lead",
          "key account manager",
          "solution engineering",
          "sales manager",
          "account director",
          "practice lead",
          "delivery manager",
          "program manager",
          "technical lead",
          "staff engineer",
          "staff developer",
          "staff architect",
          "enterprise sales",
          "enterprise",
          "business development manager",
          "regional manager",
          "area manager",
          "territory manager",
          "channel manager",
          "partnership manager",
          "strategic",
          "solutions architect",
          "systems architect",
          "it specialist",
          "technology specialist",
          "renewal specialist",
          "license specialist",
          "managed services",
          "cloud specialist",
          "aws specialist",
          "azure specialist",
          "devops engineer",
          "security specialist",
          "infrastructure manager",
        ];

        const midKeywords = [
          "analyst",
          "coordinator",
          "associate",
          "executive",
          "developer",
          "engineer",
          "designer",
          "marketing",
          "sales rep",
          "officer",
          "representative",
          "consultant",
          "advisor",
          "assistant manager",
          "professional",
          "technician",
          "planner",
          "administrator",
          "operations",
          "hr",
          "human resources",
          "account manager",
          "project manager",
          "product manager",
          "brand manager",
          "community manager",
          "social media manager",
          "business analyst",
          "data analyst",
          "software engineer",
          "web developer",
          "qa engineer",
          "support engineer",
          "network administrator",
          "system administrator",
        ];

        const juniorKeywords = [
          "junior",
          "jr.",
          "entry",
          "trainee",
          "intern",
          "internship",
          "graduate",
          "assistant",
          "fresher",
          "new grad",
          "recent graduate",
          "apprentice",
          "volunteer",
          "student",
          "entry-level",
          "beginner",
          "learner",
          "temporary",
          "contract",
          "freelance",
          "part-time",
          "support",
          "aide",
          "helper",
          "staff",
          "crew",
          "associate developer",
          "junior developer",
          "junior engineer",
          "junior analyst",
          "entry level",
        ];

        // First check for experience patterns
        const experienceMatch = summaryLower.match(
          /(\d+)\+?\s*years?\s*(of\s*)?(experience|exp|industry|field|work)/i
        );
        if (experienceMatch) {
          const years = parseInt(experienceMatch[1]);
          if (years >= 10) return "Executive Level (10+ years)";
          if (years >= 5) return "Senior Level (5+ years)";
          if (years >= 3) return "Mid Level (3-4 years)";
          if (years > 0) return "Entry Level (1-2 years)";
          return "Entry Level (Intern/Fresh Graduate)";
        }

        // Check for education level indicators
        const educationMatch = summaryLower.match(
          /(master|mba|phd|doctorate|postgraduate)/i
        );
        if (educationMatch) {
          return "Senior Level (Advanced Degree)";
        }

        // PRIORITY CHECK 1: Executive level first with exact matches
        for (let keyword of executiveKeywords) {
          if (containsKeyword(combinedText, keyword)) {
            return "Executive Level";
          }
        }

        // PRIORITY CHECK 2: Area Vice President should be Executive (specific case)
        if (/area\s+vice\s+president/i.test(combinedText)) {
          return "Executive Level";
        }

        // PRIORITY CHECK 3: Senior patterns - must come before mid-level checks
        for (let keyword of seniorKeywords) {
          if (containsKeyword(combinedText, keyword)) {
            return "Senior Level";
          }
        }

        // PRIORITY CHECK 4: Manager positions (but not assistant manager)
        if (
          containsKeyword(combinedText, "manager") &&
          !containsKeyword(combinedText, "assistant manager")
        ) {
          return "Senior Level";
        }

        // PRIORITY CHECK 5: Director positions
        if (
          containsKeyword(combinedText, "director") &&
          !containsKeyword(combinedText, "assistant director")
        ) {
          return "Senior Level";
        }

        // PRIORITY CHECK 6: Lead positions
        if (
          containsKeyword(combinedText, "lead") &&
          !containsKeyword(combinedText, "assistant lead")
        ) {
          return "Senior Level";
        }

        // PRIORITY CHECK 7: Sr. or Senior prefix (specific patterns)
        if (/\b(sr\.?|senior)\s+/i.test(combinedText)) {
          return "Senior Level";
        }

        // PRIORITY CHECK 8: Check for junior level explicitly
        for (let keyword of juniorKeywords) {
          if (containsKeyword(combinedText, keyword)) {
            return "Entry Level";
          }
        }

        // PRIORITY CHECK 9: Check for mid level
        for (let keyword of midKeywords) {
          if (containsKeyword(combinedText, keyword)) {
            return "Mid Level";
          }
        }

        // Additional fallback checks
        if (/\b(head|supervisor|team\s+lead)\b/i.test(combinedText)) {
          return "Senior Level";
        }

        if (/\b(assistant|associate|coordinator)\b/i.test(combinedText)) {
          return "Mid Level";
        }

        if (/\b(intern|trainee|student)\b/i.test(combinedText)) {
          return "Entry Level";
        }

        // Enhanced fallback based on title complexity and keywords
        if (
          positionLower.split(/\s+/).length > 3 &&
          !/(assistant|associate|junior|jr\.?|intern)/i.test(positionLower)
        ) {
          return "Senior Level";
        }

        // Additional check for enterprise/business roles
        if (
          /\b(enterprise|business|strategic|solutions|technology)\b/i.test(
            combinedText
          )
        ) {
          return "Senior Level";
        }

        return "Other";
      };

      const categorizeSentiment = (sentimentValue) => {
        if (typeof sentimentValue !== "number") return "neutral";
        if (sentimentValue > 0.3) return "positive";
        if (sentimentValue < -0.3) return "negative";
        return "neutral";
      };

      const data_array = [];
      const seniorityStats = {};
      const allCommenters = new Map();
      const commenterToPostsMap = new Map();

      for (const bucket of results.aggregations.posts_with_comments.buckets) {
        if (!bucket.key) continue;

        const postData = bucket.post_details.hits.hits[0]._source;
        let commentsData = [];

        try {
          commentsData =
            typeof postData.p_comments_data === "string"
              ? JSON.parse(postData.p_comments_data)
              : postData.p_comments_data || [];
        } catch (error) {
          continue;
        }

        if (!Array.isArray(commentsData) || commentsData.length === 0) {
          continue;
        }

        const postSeniorityBreakdown = {};
        const commentersByPost = new Map();

        commentsData.forEach((comment) => {
          if (comment.author?.id) {
            const commenterId = comment.author.id;
            const commenterName = comment.author.name || "Unknown";
            const position = comment.author.position || "";
            const summary = comment.author.summary || "";
            const seniorityLevel = categorizeSeniority(position, summary);
            const sentimentValue = comment.predicted_sentiment_value || 0;
            const sentiment = categorizeSentiment(sentimentValue);

            if (!commentersByPost.has(commenterId)) {
              commentersByPost.set(commenterId, {
                name: commenterName,
                position,
                seniority: seniorityLevel,
                comments: 0,
                sentiment_values: [],
                sentiment_counts: { positive: 0, neutral: 0, negative: 0 },
              });
            }

            const commenterData = commentersByPost.get(commenterId);
            commenterData.comments += 1;
            commenterData.sentiment_values.push(sentimentValue);
            commenterData.sentiment_counts[sentiment] += 1;
            commentersByPost.set(commenterId, commenterData);

            if (!commenterToPostsMap.has(commenterId)) {
              commenterToPostsMap.set(commenterId, {
                name: commenterName,
                position,
                seniority: seniorityLevel,
                posts: [],
                total_comments: 0,
              });
            }

            const commenterPosts = commenterToPostsMap.get(commenterId);
            commenterPosts.posts.push({
              post_id: postData.p_id,
              post_url: postData.p_url || "",
              comment: comment,
              sentiment_value: sentimentValue,
            });
            commenterPosts.total_comments += 1;
            commenterToPostsMap.set(commenterId, commenterPosts);

            if (!allCommenters.has(commenterId)) {
              allCommenters.set(commenterId, {
                name: commenterName,
                position,
                seniority: seniorityLevel,
                total_comments: 0,
                posts_engaged: 0,
                sentiment_values: [],
                sentiment_counts: { positive: 0, neutral: 0, negative: 0 },
              });
            }

            const globalCommenter = allCommenters.get(commenterId);
            globalCommenter.total_comments += 1;
            globalCommenter.sentiment_values.push(sentimentValue);
            globalCommenter.sentiment_counts[sentiment] += 1;
            allCommenters.set(commenterId, globalCommenter);
          }
        });

        commentersByPost.forEach((commenterData) => {
          const seniorityLevel = commenterData.seniority;

          if (!postSeniorityBreakdown[seniorityLevel]) {
            postSeniorityBreakdown[seniorityLevel] = {
              unique_commenters: 0,
              total_comments: 0,
              sentiment_values: [],
              sentiment_counts: { positive: 0, neutral: 0, negative: 0 },
              commenters: [],
            };
          }

          postSeniorityBreakdown[seniorityLevel].unique_commenters += 1;
          postSeniorityBreakdown[seniorityLevel].total_comments +=
            commenterData.comments;
          postSeniorityBreakdown[seniorityLevel].sentiment_values.push(
            ...commenterData.sentiment_values
          );
          postSeniorityBreakdown[seniorityLevel].sentiment_counts.positive +=
            commenterData.sentiment_counts.positive;
          postSeniorityBreakdown[seniorityLevel].sentiment_counts.neutral +=
            commenterData.sentiment_counts.neutral;
          postSeniorityBreakdown[seniorityLevel].sentiment_counts.negative +=
            commenterData.sentiment_counts.negative;
          postSeniorityBreakdown[seniorityLevel].commenters.push({
            name: commenterData.name,
            position: commenterData.position,
            comments: commenterData.comments,
            sentiment_counts: commenterData.sentiment_counts,
          });

          if (!seniorityStats[seniorityLevel]) {
            seniorityStats[seniorityLevel] = {
              unique_commenters: new Set(),
              total_comments: 0,
              posts_with_engagement: new Set(),
              sentiment_values: [],
              sentiment_counts: { positive: 0, neutral: 0, negative: 0 },
            };
          }

          seniorityStats[seniorityLevel].unique_commenters.add(
            commenterData.name
          );
          seniorityStats[seniorityLevel].total_comments +=
            commenterData.comments;
          seniorityStats[seniorityLevel].posts_with_engagement.add(
            postData.p_id
          );
          seniorityStats[seniorityLevel].sentiment_values.push(
            ...commenterData.sentiment_values
          );
          seniorityStats[seniorityLevel].sentiment_counts.positive +=
            commenterData.sentiment_counts.positive;
          seniorityStats[seniorityLevel].sentiment_counts.neutral +=
            commenterData.sentiment_counts.neutral;
          seniorityStats[seniorityLevel].sentiment_counts.negative +=
            commenterData.sentiment_counts.negative;
        });

        allCommenters.forEach((commenterData, commenterId) => {
          commenterData.posts_engaged =
            commenterToPostsMap.get(commenterId)?.posts.length || 0;
        });

        data_array.push({
          post_id: postData.p_id,
          post_preview:
            postData.p_content?.substring(0, 100) + "..." || "No content",
          post_author: postData.u_fullname || "Unknown",
          post_date: new Date(postData.p_created_time).toLocaleDateString(),
          post_url: postData.p_url || "",
          source: postData.source || "Unknown",
          total_comments: commentsData.length,
          total_unique_commenters: commentersByPost.size,
          seniority_breakdown: postSeniorityBreakdown,
        });
      }

      const finalSeniorityStats = {};
      Object.keys(seniorityStats).forEach((level) => {
        const stats = seniorityStats[level];
        const sentimentValues = stats.sentiment_values || [];
        const totalComments = stats.total_comments;

        // Calculate accurate sentiment counts from stored values
        let positive = 0,
          neutral = 0,
          negative = 0;
        sentimentValues.forEach((value) => {
          const sentiment = categorizeSentiment(value);
          if (sentiment === "positive") positive++;
          else if (sentiment === "negative") negative++;
          else neutral++;
        });

        // Calculate average sentiment
        const avgSentiment =
          sentimentValues.length > 0
            ? sentimentValues.reduce((sum, val) => sum + val, 0) /
              sentimentValues.length
            : 0;

        finalSeniorityStats[level] = {
          unique_commenters: stats.unique_commenters.size,
          total_comments: totalComments,
          posts_engaged: stats.posts_with_engagement.size,
          sentiment_counts: {
            positive,
            neutral,
            negative,
          },
          avg_sentiment: avgSentiment.toFixed(2),
          sentiment_distribution: {
            positive:
              totalComments > 0
                ? ((positive / totalComments) * 100).toFixed(1) + "%"
                : "0%",
            neutral:
              totalComments > 0
                ? ((neutral / totalComments) * 100).toFixed(1) + "%"
                : "0%",
            negative:
              totalComments > 0
                ? ((negative / totalComments) * 100).toFixed(1) + "%"
                : "0%",
          },
        };
      });

      const topCommentersBySeniority = {};
      allCommenters.forEach((commenterData, commenterId) => {
        const level = commenterData.seniority;
        if (!topCommentersBySeniority[level]) {
          topCommentersBySeniority[level] = [];
        }

        const commenterPosts = commenterToPostsMap.get(commenterId) || {
          posts: [],
        };
        const completeComments = commenterPosts.posts.map((post) => ({
          post_id: post.post_id,
          post_url: post.post_url,
          original_comment: post.comment,
          sentiment_value: post.sentiment_value,
        }));

        // Calculate accurate sentiment for this commenter
        const sentimentValues = commenterData.sentiment_values || [];
        let positive = 0,
          neutral = 0,
          negative = 0;
        sentimentValues.forEach((value) => {
          const sentiment = categorizeSentiment(value);
          if (sentiment === "positive") positive++;
          else if (sentiment === "negative") negative++;
          else neutral++;
        });

        const avgSentiment =
          sentimentValues.length > 0
            ? (
                sentimentValues.reduce((sum, val) => sum + val, 0) /
                sentimentValues.length
              ).toFixed(2)
            : "0.00";

        topCommentersBySeniority[level].push({
          name: commenterData.name,
          position: commenterData.position,
          comments: completeComments,
          total_comments: commenterData.total_comments,
          posts_engaged: commenterData.posts_engaged,
          sentiment_counts: {
            positive,
            neutral,
            negative,
          },
          avg_sentiment: avgSentiment,
        });
      });

      // Sort and limit top commenters
      Object.keys(topCommentersBySeniority).forEach((level) => {
        topCommentersBySeniority[level] = topCommentersBySeniority[level].sort(
          (a, b) => b.total_comments - a.total_comments
        );
      });

      function calculateSentimentStats(commentersData) {
        const sentimentCounts = {
          positive: 0,
          neutral: 0,
          negative: 0,
        };

        let totalSentiment = 0;
        let totalComments = 0;
        let postIds = new Set(); // For posts_engaged
        let commenterIds = new Set(); // For unique_commenters

        commentersData.forEach((commenter) => {
          commenterIds.add(
            commenter.author_id || commenter.id || commenter.username
          ); // adjust based on actual structure

          commenter.comments.forEach((comment) => {
            const sentiment =
              comment?.original_comment?.llm_data?.predicted_sentiment_value?.toLowerCase() ||
              "neutral";

            if (sentimentCounts[sentiment] !== undefined) {
              sentimentCounts[sentiment]++;
            } else {
              sentimentCounts["neutral"]++;
            }

            totalSentiment += comment?.sentiment_value || 0;
            totalComments++;

            // Track engaged post IDs (adjust based on actual structure)
            if (comment.post_id) {
              postIds.add(comment.post_id);
            }
          });
        });

        const avgSentiment =
          totalComments > 0 ? totalSentiment / totalComments : 0;

        const sentimentDistribution = {
          positive: `${(
            (sentimentCounts.positive / totalComments) *
            100
          ).toFixed(1)}%`,
          neutral: `${((sentimentCounts.neutral / totalComments) * 100).toFixed(
            1
          )}%`,
          negative: `${(
            (sentimentCounts.negative / totalComments) *
            100
          ).toFixed(1)}%`,
        };

        return {
          avg_sentiment: avgSentiment.toFixed(2),
          posts_engaged: postIds.size,
          sentiment_counts: sentimentCounts,
          sentiment_distribution: sentimentDistribution,
          total_comments: totalComments,
          unique_commenters: commenterIds.size,
        };
      }

      // 🚀 Generate stats for each seniority level
      const seniorityBreakdown = {};

      Object.keys(topCommentersBySeniority).forEach((level) => {
        seniorityBreakdown[level] = calculateSentimentStats(
          topCommentersBySeniority[level]
        );
      });

      const summary = {
        seniority_breakdown: seniorityBreakdown,
        top_commenters_by_seniority: topCommentersBySeniority,
        insights: {
          most_active_seniority: Object.keys(finalSeniorityStats).reduce(
            (prev, current) =>
              finalSeniorityStats[current].total_comments >
              finalSeniorityStats[prev]?.total_comments
                ? current
                : prev,
            Object.keys(finalSeniorityStats)[0] || ""
          ),
          highest_engagement_seniority: Object.keys(finalSeniorityStats).reduce(
            (prev, current) =>
              finalSeniorityStats[current].unique_commenters >
              finalSeniorityStats[prev]?.unique_commenters
                ? current
                : prev,
            Object.keys(finalSeniorityStats)[0] || ""
          ),
          most_positive_seniority: Object.keys(finalSeniorityStats).reduce(
            (prev, current) =>
              parseFloat(finalSeniorityStats[current].avg_sentiment) >
              parseFloat(finalSeniorityStats[prev]?.avg_sentiment || 0)
                ? current
                : prev,
            Object.keys(finalSeniorityStats)[0] || ""
          ),
          most_negative_seniority: Object.keys(finalSeniorityStats).reduce(
            (prev, current) =>
              parseFloat(finalSeniorityStats[current].avg_sentiment) <
              parseFloat(finalSeniorityStats[prev]?.avg_sentiment || 0)
                ? current
                : prev,
            Object.keys(finalSeniorityStats)[0] || ""
          ),
        },
      };

      return res.json({
        // data_array: data_array.sort((a, b) => b.total_comments - a.total_comments),
        summary,
      });
    } catch (error) {
      console.error("Error fetching commenter engagement by seniority:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
  getAudienceDistributionByCountry: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category: inputCategory = "all",
        source = "All",
        topicId,
        categoryItems,
        llm_mention_type,
      } = req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      // Determine which category data to use
      let countryCategoryData = {};

      if (
        categoryItems &&
        Array.isArray(categoryItems) &&
        categoryItems.length > 0
      ) {
        countryCategoryData = processCategoryItems(categoryItems);
      } else {
        // Fall back to middleware data
        countryCategoryData = req.processedCategories || {};
      }
      if (Object.keys(countryCategoryData).length === 0) {
        return res.json({
          responseArray: [],
        });
      }

      // Handle category parameter - validate if provided
      let category = inputCategory;
      if (
        category &&
        category !== "all" &&
        category !== "" &&
        category !== "custom"
      ) {
        const matchedKey = findMatchingCategoryKey(
          category,
          countryCategoryData
        );
        if (!matchedKey) {
          return res.json({
            responseArray: [],
            error: "Category not found",
          });
        }
        category = matchedKey;
      }

      // Build base query for filters processing
      const baseQueryString = buildBaseQueryString(
        category,
        countryCategoryData
      );

      // Process filters (time slot, date range, sentiment)
      const filters = processFilters({
        sentimentType,
        timeSlot,
        fromDate,
        toDate,
        queryString: baseQueryString,
      });

      // Handle special case for unTopic
      let queryTimeRange = {
        greaterThanTime: filters.greaterThanTime,
        lessThanTime: filters.lessThanTime,
      };

      // For special topic, modify date range behavior
      if (isSpecialTopic && !timeSlot && !fromDate && !toDate) {
        queryTimeRange = {
          greaterThanTime: "1970-01-01",
          lessThanTime: "now",
        };
      }

      if (parseInt(topicId) == 2473) {
        queryTimeRange = {
          greaterThanTime: "2023-01-01",
          lessThanTime: "2023-04-30",
        };
      }

      // Build base query with special source handling
      const query = buildBaseQuery(
        queryTimeRange,
        source,
        isSpecialTopic,
        parseInt(topicId)
      );

      // Add category filters
      addCategoryFilters(query, category, categoryData);

      // Apply sentiment filter if provided
      if (
        sentimentType &&
        sentimentType !== "undefined" &&
        sentimentType !== "null" &&
        sentimentType != ""
      ) {
        if (sentimentType.includes(",")) {
          // Handle multiple sentiment types
          const sentimentArray = sentimentType.split(",");
          const sentimentFilter = {
            bool: {
              should: sentimentArray.map((sentiment) => ({
                match: { predicted_sentiment_value: sentiment.trim() },
              })),
              minimum_should_match: 1,
            },
          };
          query.bool.must.push(sentimentFilter);
        } else {
          // Handle single sentiment type
          query.bool.must.push({
            match: { predicted_sentiment_value: sentimentType.trim() },
          });
        }
      }

      query.bool.must.push({ exists: { field: "u_country" } });

      // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true

      const params = {
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          query: query,
          aggs: {
            group_by_country: {
              terms: { field: "u_country.keyword", size: 15 },
              ...(isSpecialTopic && {
                aggs: {
                  sentiments: {
                    terms: { field: "predicted_sentiment_value.keyword" },
                  },
                },
              }),
            },
          },
        },
      };

      // LLM Mention Type filtering logic
      let mentionTypesArray = [];

      if (llm_mention_type) {
        if (Array.isArray(llm_mention_type)) {
          mentionTypesArray = llm_mention_type;
        } else if (typeof llm_mention_type === "string") {
          mentionTypesArray = llm_mention_type.split(",").map((s) => s.trim());
        }
      }

      // CASE 1: If mentionTypesArray has valid values → apply should-match filter
      if (mentionTypesArray.length > 0) {
        query.bool.must.push({
          bool: {
            should: mentionTypesArray.map((type) => ({
              match: { llm_mention_type: type },
            })),
            minimum_should_match: 1,
          },
        });
      }

      return res.send(params);
      const results = await elasticClient.search(params);

      let responseArray = [];

      if (isSpecialTopic) {
        // Include sentiment breakdown for special topic
        responseArray =
          results?.aggregations?.group_by_country?.buckets?.map((bucket) => {
            const sentimentMap = {};
            let sentimentCountTotal = 0;

            bucket.sentiments?.buckets?.forEach((sentimentBucket) => {
              sentimentMap[sentimentBucket.key] = sentimentBucket.doc_count;
              sentimentCountTotal += sentimentBucket.doc_count;
            });

            return {
              country_name: bucket.key || "Unknown",
              key_count: sentimentCountTotal, // ✅ use only sentiment-based doc count
              sentiments: sentimentMap,
            };
          }) || [];
      } else {
        // Default handling for non-special topics
        let newCountryArray = {};

        results?.aggregations?.group_by_country?.buckets?.forEach((bucket) => {
          if (bucket.key) {
            newCountryArray[bucket.key] = bucket.doc_count;
          }
        });

        // Sort countries by count in descending order
        newCountryArray = Object.entries(newCountryArray)
          .sort(([, a], [, b]) => b - a)
          .reduce((obj, [key, value]) => {
            obj[key] = value;
            return obj;
          }, {});

        responseArray = Object.keys(newCountryArray).map((countryName) => ({
          key_count: newCountryArray[countryName],
          country_name: countryName,
        }));
      }

      return res.json({ query, results, responseArray });

      // return res.json({ results,responseArray });
    } catch (error) {
      console.error("Error fetching audience distribution data:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getAudienceDistributionByCountryInUNDP: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        topicId,
        categoryItems,
        llm_mention_type,
      } = req.body;

      // Determine which category data to use
      let undpCategoryData = {};

      if (
        categoryItems &&
        Array.isArray(categoryItems) &&
        categoryItems.length > 0
      ) {
        undpCategoryData = processCategoryItems(categoryItems);
      } else {
        // Fall back to middleware data
        undpCategoryData = req.processedCategories || {};
      }

      // Handle category parameter - validate if provided
      let selectedCategory = category;
      if (
        category &&
        category !== "all" &&
        category !== "" &&
        category !== "custom"
      ) {
        const matchedKey = findMatchingCategoryKey(category, undpCategoryData);
        if (!matchedKey) {
          return res.json([]);
        }
        selectedCategory = matchedKey;
      }

      const filters = processFilters({
        sentimentType,
        timeSlot,
        fromDate,
        toDate,
        queryString: "",
      });

      // Handle special case for unTopic
      let queryTimeRange = {
        greaterThanTime: filters.greaterThanTime,
        lessThanTime: filters.lessThanTime,
      };

      // Your existing code...
      const categoryData = await prisma.topic_categories.findMany({
        where: {
          customer_topic_id: Number(topicId),
        },
        orderBy: [{ category_title: "asc" }, { id: "asc" }],
      });

      // Create country-wise aggregations
      const countryAggs = createCountryWiseAggregations(categoryData);

      // Source filtering logic
      const normalizedSources = normalizeSourceInput(source);
      let sourceFilter = {};

      if (normalizedSources.length > 0) {
        // Specific sources provided
        sourceFilter = {
          bool: {
            should: normalizedSources.map((src) => ({
              match_phrase: { source: src },
            })),
            minimum_should_match: 1,
          },
        };
      } else {
        // Default to Facebook and Twitter
        sourceFilter = {
          bool: {
            should: [
              { match_phrase: { source: "Facebook" } },
              { match_phrase: { source: "Twitter" } },
            ],
            minimum_should_match: 1,
          },
        };
      }

      // Your Elasticsearch query
      const elasticQuery = {
        query: {
          bool: {
            must: [
              sourceFilter,
              {
                range: {
                  p_created_time: {
                    gte: queryTimeRange.greaterThanTime,
                    lte: queryTimeRange.lessThanTime,
                  },
                },
              },
            ],
          },
        },
        size: 0, // Only get aggregation results
        aggs: {
          ...countryAggs, // Spread the country-wise aggregations
        },
      };

      if (
        sentimentType &&
        sentimentType !== "undefined" &&
        sentimentType !== "null" &&
        sentimentType != ""
      ) {
        if (sentimentType.includes(",")) {
          // Handle multiple sentiment types
          const sentimentArray = sentimentType.split(",");
          const sentimentFilter = {
            bool: {
              should: sentimentArray.map((sentiment) => ({
                match: { predicted_sentiment_value: sentiment.trim() },
              })),
              minimum_should_match: 1,
            },
          };
          elasticQuery.query.bool.must.push(sentimentFilter);
        } else {
          // Handle single sentiment type
          elasticQuery.query.bool.must.push({
            match: { predicted_sentiment_value: sentimentType.trim() },
          });
        }
      }

      // LLM Mention Type filtering logic
      let mentionTypesArray = [];

      if (llm_mention_type) {
        if (Array.isArray(llm_mention_type)) {
          mentionTypesArray = llm_mention_type;
        } else if (typeof llm_mention_type === "string") {
          mentionTypesArray = llm_mention_type.split(",").map((s) => s.trim());
        }
      }

      // CASE 1: If mentionTypesArray has valid values → apply should-match filter
      if (mentionTypesArray.length > 0) {
        elasticQuery.query.bool.must.push({
          bool: {
            should: mentionTypesArray.map((type) => ({
              match: { llm_mention_type: type },
            })),
            minimum_should_match: 1,
          },
        });
      }

      // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true

      const params = {
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: elasticQuery,
      };

      const results = await elasticClient.search(params);

      const responseArray = Object.entries(results.aggregations)
        .map(([key, value]) => {
          const originalCountry = key
            .replace(/_/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase());
          const posts = value.top_posts.hits.hits.map((hit) =>
            formatPostData(hit)
          );

          // Extract posts from top_hits aggregation
          // const posts = value.top_posts.hits.hits.map(hit => ({
          //   id: hit._id,
          //   ...hit._source
          // }));

          return {
            country_name: originalCountry || "Unknown",
            key_count: value.doc_count,
            posts: posts, // Include the posts in the response
            sentiments: {
              Positive: 0,
              Negative: 0,
              Neutral: 0,
            },
          };
        })
        .sort((a, b) => b.key_count - a.key_count);

      return res.status(200).json({ responseArray });
    } catch (error) {
      console.error("Error:", error);
      // return next(error);
    }
  },
};

/**
 * Format post data for the frontend
 * @param {Object} hit - Elasticsearch document hit
 * @returns {Object} Formatted post data
 */
const formatPostData = (hit, allFilterTerms = []) => {
  const source = hit._source;

  // Use a default image if a profile picture is not provided
  const profilePic =
    source.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

  // Social metrics
  const followers = source.u_followers > 0 ? `${source.u_followers}` : "";
  const following = source.u_following > 0 ? `${source.u_following}` : "";
  const posts = source.u_posts > 0 ? `${source.u_posts}` : "";
  const likes = source.p_likes > 0 ? `${source.p_likes}` : "";

  // Emotion
  const llm_emotion =
    source.llm_emotion ||
    (source.source === "GoogleMyBusiness" && source.rating
      ? source.rating >= 4
        ? "Supportive"
        : source.rating <= 2
        ? "Frustrated"
        : "Neutral"
      : "");

  // Clean up comments URL if available
  const commentsUrl =
    source.p_comments_text && source.p_comments_text.trim() !== ""
      ? source.p_url.trim().replace("https: // ", "https://")
      : "";

  const comments = `${source.p_comments}`;
  const shares = source.p_shares > 0 ? `${source.p_shares}` : "";
  const engagements = source.p_engagement > 0 ? `${source.p_engagement}` : "";

  const content =
    source.p_content && source.p_content.trim() !== "" ? source.p_content : "";
  const imageUrl =
    source.p_picture_url && source.p_picture_url.trim() !== ""
      ? source.p_picture_url
      : `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

  // Determine sentiment
  let predicted_sentiment = "";
  let predicted_category = "";

  if (source.predicted_sentiment_value)
    predicted_sentiment = `${source.predicted_sentiment_value}`;
  else if (source.source === "GoogleMyBusiness" && source.rating) {
    predicted_sentiment =
      source.rating >= 4
        ? "Positive"
        : source.rating <= 2
        ? "Negative"
        : "Neutral";
  }

  if (source.predicted_category) predicted_category = source.predicted_category;

  // Handle YouTube-specific fields
  let youtubeVideoUrl = "";
  let profilePicture2 = "";
  if (source.source === "Youtube") {
    if (source.video_embed_url) youtubeVideoUrl = source.video_embed_url;
    else if (source.p_id)
      youtubeVideoUrl = `https://www.youtube.com/embed/${source.p_id}`;
  } else {
    profilePicture2 = source.p_picture ? source.p_picture : "";
  }

  // Determine source icon based on source name
  let sourceIcon = "";
  const userSource = source.source;
  if (
    ["khaleej_times", "Omanobserver", "Time of oman", "Blogs"].includes(
      userSource
    )
  )
    sourceIcon = "Blog";
  else if (userSource === "Reddit") sourceIcon = "Reddit";
  else if (["FakeNews", "News"].includes(userSource)) sourceIcon = "News";
  else if (userSource === "Tumblr") sourceIcon = "Tumblr";
  else if (userSource === "Vimeo") sourceIcon = "Vimeo";
  else if (["Web", "DeepWeb"].includes(userSource)) sourceIcon = "Web";
  else sourceIcon = userSource;

  // Format message text – with special handling for GoogleMaps/Tripadvisor
  let message_text = "";
  if (["GoogleMaps", "Tripadvisor"].includes(source.source)) {
    const parts = source.p_message_text.split("***|||###");
    message_text = parts[0].replace(/\n/g, "<br>");
  } else {
    message_text = source.p_message_text
      ? source.p_message_text.replace(/<\/?[^>]+(>|$)/g, "")
      : "";
  }

  // Find matched terms
  const textFields = [
    source.p_message_text,
    source.p_message,
    source.keywords,
    source.title,
    source.hashtags,
    source.u_source,
    source.p_url,
    source.u_fullname,
  ];
  const matched_terms = allFilterTerms.filter((term) =>
    textFields.some((field) => {
      if (!field) return false;
      if (Array.isArray(field)) {
        return field.some(
          (f) =>
            typeof f === "string" &&
            f.toLowerCase().includes(term.toLowerCase())
        );
      }
      return (
        typeof field === "string" &&
        field.toLowerCase().includes(term.toLowerCase())
      );
    })
  );

  return {
    profilePicture: profilePic,
    profilePicture2,
    userFullname: source.u_fullname,
    user_data_string: "",
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
    created_at: new Date(
      source.p_created_time || source.created_at
    ).toLocaleString(),
    p_comments_data: source.p_comments_data,
    matched_terms,
  };
};

/**
 * Build a base query string from category data for filters processing
 * @param {string} selectedCategory - Category to filter by
 * @param {Object} categoryData - Category data
 * @returns {string} Query string
 */
function buildBaseQueryString(selectedCategory, categoryData) {
  let queryString = "";
  const allTerms = [];

  if (selectedCategory === "all") {
    // Combine all keywords, hashtags, and urls from all categories
    Object.values(categoryData).forEach((data) => {
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
    const terms = allTerms.map((term) => `"${term}"`).join(" OR ");
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
function buildBaseQuery(dateRange, source, isSpecialTopic = false, topicId) {
  const query = {
    bool: {
      must: [
        {
          range: {
            p_created_time: {
              gte: dateRange.greaterThanTime,
              lte: dateRange.lessThanTime,
            },
          },
        },
        {
          range: {
            created_at: {
              gte: dateRange.greaterThanTime,
              lte: dateRange.lessThanTime,
            },
          },
        },
      ],
      must_not: [
        {
          term: {
            source: "DM",
          },
        },
      ],
    },
  };

  const normalizedSources = normalizeSourceInput(source);

  if (normalizedSources.length > 0) {
    query.bool.must.push({
      bool: {
        should: normalizedSources.map((s) => ({ match_phrase: { source: s } })),
        minimum_should_match: 1,
      },
    });
  } else if (topicId === 2619 || topicId === 2639 || topicId === 2640) {
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "LinkedIn" } },
          { match_phrase: { source: "Linkedin" } },
        ],
        minimum_should_match: 1,
      },
    });
  } else if (isSpecialTopic) {
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "Facebook" } },
          { match_phrase: { source: "Twitter" } },
        ],
        minimum_should_match: 1,
      },
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
          { match_phrase: { source: "Linkedin" } },
          { match_phrase: { source: "Pinterest" } },
          { match_phrase: { source: "Web" } },
          { match_phrase: { source: "Reddit" } },
          { match_phrase: { source: "TikTok" } },
        ],
        minimum_should_match: 1,
      },
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
  if (selectedCategory === "all") {
    query.bool.must.push({
      bool: {
        should: [
          ...Object.values(categoryData).flatMap((data) =>
            (data.keywords || []).flatMap((keyword) => [
              { match_phrase: { p_message_text: keyword } },
              { match_phrase: { keywords: keyword } },
            ])
          ),
          ...Object.values(categoryData).flatMap((data) =>
            (data.hashtags || []).flatMap((hashtag) => [
              { match_phrase: { p_message_text: hashtag } },
              { match_phrase: { hashtags: hashtag } },
            ])
          ),
          ...Object.values(categoryData).flatMap((data) =>
            (data.urls || []).flatMap((url) => [
              { match_phrase: { u_source: url } },
              { match_phrase: { p_url: url } },
            ])
          ),
        ],
        minimum_should_match: 1,
      },
    });
  } else if (categoryData[selectedCategory]) {
    const data = categoryData[selectedCategory];

    // Check if the category has any filtering criteria
    const hasKeywords =
      Array.isArray(data.keywords) && data.keywords.length > 0;
    const hasHashtags =
      Array.isArray(data.hashtags) && data.hashtags.length > 0;
    const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;

    // Only add the filter if there's at least one criteria
    if (hasKeywords || hasHashtags || hasUrls) {
      query.bool.must.push({
        bool: {
          should: [
            ...(data.keywords || []).flatMap((keyword) => [
              { match_phrase: { p_message_text: keyword } },
              { match_phrase: { keywords: keyword } },
            ]),
            ...(data.hashtags || []).flatMap((hashtag) => [
              { match_phrase: { p_message_text: hashtag } },
              { match_phrase: { hashtags: hashtag } },
            ]),
            ...(data.urls || []).flatMap((url) => [
              { match_phrase: { u_source: url } },
              { match_phrase: { p_url: url } },
            ]),
          ],
          minimum_should_match: 1,
        },
      });
    } else {
      // If the category has no filtering criteria, add a condition that will match nothing
      query.bool.must.push({
        bool: {
          must_not: {
            match_all: {},
          },
        },
      });
    }
  }
}

module.exports = audienceController;
