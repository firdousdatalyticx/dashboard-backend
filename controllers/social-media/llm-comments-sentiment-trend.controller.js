const { elasticClient } = require("../../config/elasticsearch");
const processCategoryItems = require("../../helpers/processedCategoryItems");
const { processTimeSlot } = require("./filter.utils");
const { format } = require("date-fns");

const normalizeSourceInput = (sourceParam) => {
  if (!sourceParam || sourceParam === "All") return [];

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
  if (categoryKeys.length === 0) return null;

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

function buildBaseQuery(dateRange, source, isSpecialTopic = false, topicId) {
  const query = {
    bool: {
      must: [],
      must_not: [
        {
          term: {
            source: "DM",
          },
        },
      ],
    },
  };

  if (
    dateRange &&
    dateRange.greaterThanTime &&
    dateRange.lessThanTime
  ) {
    query.bool.must.push({
      range: {
        p_created_time: {
          gte: dateRange.greaterThanTime,
          lte: dateRange.lessThanTime,
        },
      },
    });
  }

  const normalizedSources = normalizeSourceInput(source);

  if (
    topicId === 2619 ||
    topicId === 2639 ||
    topicId === 2640 ||
    topicId === 2647 ||
    topicId === 2648 ||
    topicId === 2649
  ) {
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "LinkedIn" } },
          { match_phrase: { source: "Linkedin" } },
        ],
        minimum_should_match: 1,
      },
    });
  } else if (normalizedSources.length > 0) {
    query.bool.must.push({
      bool: {
        should: normalizedSources.map((src) => ({
          match_phrase: { source: src },
        })),
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
  } else if (topicId === 2634) {
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "Facebook" } },
          { match_phrase: { source: "Twitter" } },
        ],
        minimum_should_match: 1,
      },
    });
  } else if (
    topicId === 2641 ||
    parseInt(topicId) === 2643 ||
    parseInt(topicId) === 2644 ||
    parseInt(topicId) === 2651 ||
    parseInt(topicId) === 2652 ||
    parseInt(topicId) === 2653 ||
    parseInt(topicId) === 2654 ||
    parseInt(topicId) === 2655 ||
    parseInt(topicId) === 2658 ||
    parseInt(topicId) === 2659 ||
    parseInt(topicId) === 2660 ||
    parseInt(topicId) === 2661 ||
    parseInt(topicId) === 2662 ||
    parseInt(topicId) === 2663 ||
    parseInt(topicId) === 2664
  ) {
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "Facebook" } },
          { match_phrase: { source: "Twitter" } },
          { match_phrase: { source: "Instagram" } },
        ],
        minimum_should_match: 1,
      },
    });
  } else if (parseInt(topicId) === 2656 || parseInt(topicId) === 2657) {
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "Facebook" } },
          { match_phrase: { source: "Twitter" } },
          { match_phrase: { source: "Instagram" } },
          { match_phrase: { source: "Youtube" } },
        ],
        minimum_should_match: 1,
      },
    });
  } else if (topicId === 2646 || topicId === 2650) {
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "LinkedIn" } },
          { match_phrase: { source: "Linkedin" } },
          { match_phrase: { source: "Twitter" } },
          { match_phrase: { source: "Web" } },
          { match_phrase: { source: "Facebook" } },
          { match_phrase: { source: "Instagram" } },
          { match_phrase: { source: "Youtube" } },
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
          { match_phrase: { source: "Linkedin" } },
          { match_phrase: { source: "LinkedIn" } },
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
    return;
  }

  if (categoryData[selectedCategory]) {
    const data = categoryData[selectedCategory];
    const hasKeywords =
      Array.isArray(data.keywords) && data.keywords.length > 0;
    const hasHashtags =
      Array.isArray(data.hashtags) && data.hashtags.length > 0;
    const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;

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
      return;
    }
  }
}

function safeParseJson(maybeJson) {
  if (maybeJson === null || maybeJson === undefined) return null;
  if (typeof maybeJson === "object") return maybeJson;
  if (typeof maybeJson !== "string") return null;

  const trimmed = maybeJson.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractCommentsFromPost(llmCommentsValue) {
  // Shape 1: already an array (each item may be object or JSON string)
  if (Array.isArray(llmCommentsValue)) return llmCommentsValue;

  // Shape 2: JSON stringified array of comments
  if (typeof llmCommentsValue === "string") {
    const parsed = safeParseJson(llmCommentsValue);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return [parsed];
    return [];
  }

  // Shape 3: single object
  if (llmCommentsValue && typeof llmCommentsValue === "object") {
    return [llmCommentsValue];
  }

  return [];
}

function normalizeCommentRecord(parsedComment, postContext = {}) {
  const source =
    postContext?.source ??
    parsedComment?.source ??
    parsedComment?.post_context?.source ??
    "Unknown";
  const p_created_time =
    parsedComment?.p_created_time ??
    parsedComment?.post_context?.p_created_time ??
    null;
  const p_id =
    parsedComment?.p_id ??
    parsedComment?.post_context?.p_id ??
    postContext?.p_id ??
    null;
  const p_url =
    parsedComment?.p_url ??
    parsedComment?.post_context?.p_url ??
    postContext?.p_url ??
    null;
  const predicted_sentiment_value =
    parsedComment?.predicted_sentiment_value ?? null;
  const llm_emotion = parsedComment?.llm_emotion ?? null;
  const mapped_sentiment =
    parsedComment?.mapped_sentiment ?? predicted_sentiment_value ?? null;

  return {
    source,
    p_created_time,
    p_id,
    p_url,
    predicted_sentiment_value,
    llm_emotion,
    mapped_sentiment,
  };
}

function normalizeSentimentLabel(sentimentValue) {
  const normalized = String(sentimentValue || "").trim().toLowerCase();
  if (normalized === "positive") return "Positive";
  if (normalized === "negative") return "Negative";
  if (normalized === "neutral") return "Neutral";
  return null;
}

function bucketKey(pCreatedTime, interval) {
  const dt = new Date(pCreatedTime);
  if (Number.isNaN(dt.getTime())) return null;

  if (interval === "weekly") {
    // week starts Monday (UTC-based)
    const year = dt.getUTCFullYear();
    const month = dt.getUTCMonth();
    const date = dt.getUTCDate();

    // getUTCDay: 0 (Sun) ... 6 (Sat)
    const day = dt.getUTCDay();
    const daysSinceMonday = (day + 6) % 7; // Monday => 0

    const startUtc = new Date(Date.UTC(year, month, date - daysSinceMonday));
    return startUtc.toISOString().slice(0, 10);
  }

  if (interval === "monthly") {
    const year = dt.getUTCFullYear();
    const month = String(dt.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  // default daily
  return dt.toISOString().slice(0, 10);
}

async function scrollSearch({ query, sourceFields, sort, scroll = "2m", pageSize = 2000, maxDocs = 50000 }) {
  const firstResponse = await elasticClient.search({
    index: process.env.ELASTICSEARCH_DEFAULTINDEX,
    scroll,
    size: pageSize,
    _source: sourceFields,
    body: {
      query,
      sort,
    },
  });

  let scrollId = firstResponse._scroll_id;
  const total = firstResponse.hits.total.value;
  let allResults = [];
  let currentBatch = firstResponse.hits.hits;
  allResults.push(...currentBatch.map((hit) => hit._source));

  let fetched = allResults.length;
  while (fetched < total && scrollId && allResults.length < maxDocs) {
    const scrollResponse = await elasticClient.scroll({
      scroll_id: scrollId,
      scroll,
    });

    if (!scrollResponse.hits.hits.length) break;

    currentBatch = scrollResponse.hits.hits;
    allResults.push(...currentBatch.map((hit) => hit._source));
    fetched = allResults.length;
  }

  if (scrollId) {
    try {
      await elasticClient.clearScroll({ scroll_id: scrollId });
    } catch (e) {
      // non-critical
    }
  }

  return {
    total,
    fetched: allResults.length,
    results: allResults,
  };
}

const llmCommentsSentimentTrendController = {
  getLlmCommentsSentimentTrend: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        topicId,
        llm_mention_type,
        interval = "daily",
      } = req.body;

      if (!topicId) {
        return res.status(400).json({ success: false, error: "topicId is required" });
      }

      const topicIdNum = parseInt(topicId);
      const isSpecialTopic = topicIdNum === 2600 || topicIdNum === 2627;

      // categoryData from middleware (or directly from request)
      let categoryData = {};
      if (
        req.body.categoryItems &&
        Array.isArray(req.body.categoryItems) &&
        req.body.categoryItems.length > 0
      ) {
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json({
          success: true,
          totalPosts: 0,
          totalParsedComments: 0,
          timeIntervals: [],
        });
      }

      let workingCategory = category;
      if (
        workingCategory !== "all" &&
        workingCategory !== "" &&
        workingCategory !== "custom"
      ) {
        const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);
        if (matchedKey) {
          categoryData = { [matchedKey]: categoryData[matchedKey] };
          workingCategory = matchedKey;
        } else {
          workingCategory = "all";
        }
      }

      // date range
      const now = new Date();
      const dateRange = processTimeSlot(timeSlot, fromDate, toDate);

      // Special topic default range is wider if no explicit dates are provided
      if (isSpecialTopic && !fromDate && !toDate) {
        dateRange.greaterThanTime = "2020-01-01";
        dateRange.lessThanTime = format(now, "yyyy-MM-dd");
      }

      // Build base query for posts based on topicId + filters
      const query = buildBaseQuery(dateRange, source, isSpecialTopic, topicIdNum);
      addCategoryFilters(query, workingCategory, categoryData);

      // predicted sentiment filter (post-level) if provided
      if (
        sentimentType &&
        sentimentType !== "undefined" &&
        sentimentType !== "null"
      ) {
        if (String(sentimentType).includes(",")) {
          const sentimentArray = String(sentimentType)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

          query.bool.must.push({
            bool: {
              should: sentimentArray.map((s) => ({
                match: { predicted_sentiment_value: s },
              })),
              minimum_should_match: 1,
            },
          });
        } else {
          query.bool.must.push({
            match: { predicted_sentiment_value: String(sentimentType).trim() },
          });
        }
      }

      // topic-level special filters (same as socials-distributions)
      if (topicIdNum === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" },
        });
      }

      if (topicIdNum === 2652 || topicIdNum === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" },
        });
      }

      // llm mention type filter
      let mentionTypesArray = [];
      if (llm_mention_type) {
        if (Array.isArray(llm_mention_type)) {
          mentionTypesArray = llm_mention_type;
        } else if (typeof llm_mention_type === "string") {
          mentionTypesArray = llm_mention_type
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
      }

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

      const sort = [{ p_created_time: { order: "asc" } }];
      const { total, fetched, results: posts } = await scrollSearch({
        query,
        sourceFields: [
          "p_id",
          "p_url",
          "source",
          "p_created_time",
          "predicted_sentiment_value",
          "llm_emotion",
          "llm_comments",
        ],
        sort,
        maxDocs: 40000,
      });

      const countsByBucket = new Map();
      const countsBySource = new Map();
      let totalParsedComments = 0;

      for (const post of posts) {
        const postContext = {
          p_id: post.p_id,
          p_url: post.p_url,
          source: post.source,
          p_created_time: post.p_created_time,
          predicted_sentiment_value: post.predicted_sentiment_value,
          llm_emotion: post.llm_emotion,
        };
        const comments = extractCommentsFromPost(post.llm_comments);

        for (const commentItem of comments) {
          const parsed = safeParseJson(commentItem);
          if (!parsed) continue;

          const normalized = normalizeCommentRecord(parsed, postContext);
          const bucket = bucketKey(normalized.p_created_time, interval);
          if (!bucket) continue;
          if (!countsByBucket.has(bucket)) {
            countsByBucket.set(bucket, {
              date: bucket,
              Positive: 0,
              Negative: 0,
              Neutral: 0,
            });
          }

          const bucketObj = countsByBucket.get(bucket);
          const sentiment = normalizeSentimentLabel(normalized.mapped_sentiment) || "Neutral";
          bucketObj[sentiment] = (bucketObj[sentiment] || 0) + 1;

          const sourceKey = normalized.source || "Unknown";
          countsBySource.set(sourceKey, (countsBySource.get(sourceKey) || 0) + 1);
          totalParsedComments++;
        }
      }

      const timeIntervals = Array.from(countsByBucket.values()).sort((a, b) => {
        if (interval === "monthly") return a.date.localeCompare(b.date);
        return a.date.localeCompare(b.date);
      });
      const sourceDistribution = Array.from(countsBySource.entries())
        .map(([sourceName, count]) => ({
          source: sourceName,
          count,
        }))
        .sort((a, b) => b.count - a.count);

      return res.json({
        success: true,
        totalPostsMatched: total,
        totalPostsFetched: fetched,
        totalParsedComments,
        sourceDistribution,
        timeIntervals,
      });
    } catch (error) {
      console.error("Error in llm-comments sentiment trend:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
  getLlmCommentsEmotionTrend: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        topicId,
        llm_mention_type,
        interval = "daily",
      } = req.body;

      if (!topicId) {
        return res.status(400).json({ success: false, error: "topicId is required" });
      }

      const topicIdNum = parseInt(topicId);
      const isSpecialTopic = topicIdNum === 2600 || topicIdNum === 2627;

      let categoryData = {};
      if (
        req.body.categoryItems &&
        Array.isArray(req.body.categoryItems) &&
        req.body.categoryItems.length > 0
      ) {
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json({
          success: true,
          totalPosts: 0,
          totalParsedComments: 0,
          timeIntervals: [],
        });
      }

      let workingCategory = category;
      if (
        workingCategory !== "all" &&
        workingCategory !== "" &&
        workingCategory !== "custom"
      ) {
        const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);
        if (matchedKey) {
          categoryData = { [matchedKey]: categoryData[matchedKey] };
          workingCategory = matchedKey;
        } else {
          workingCategory = "all";
        }
      }

      const now = new Date();
      const dateRange = processTimeSlot(timeSlot, fromDate, toDate);
      if (isSpecialTopic && !fromDate && !toDate) {
        dateRange.greaterThanTime = "2020-01-01";
        dateRange.lessThanTime = format(now, "yyyy-MM-dd");
      }

      const query = buildBaseQuery(dateRange, source, isSpecialTopic, topicIdNum);
      addCategoryFilters(query, workingCategory, categoryData);

      if (
        sentimentType &&
        sentimentType !== "undefined" &&
        sentimentType !== "null"
      ) {
        if (String(sentimentType).includes(",")) {
          const sentimentArray = String(sentimentType)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

          query.bool.must.push({
            bool: {
              should: sentimentArray.map((s) => ({
                match: { predicted_sentiment_value: s },
              })),
              minimum_should_match: 1,
            },
          });
        } else {
          query.bool.must.push({
            match: { predicted_sentiment_value: String(sentimentType).trim() },
          });
        }
      }

      if (topicIdNum === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" },
        });
      }

      if (topicIdNum === 2652 || topicIdNum === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" },
        });
      }

      let mentionTypesArray = [];
      if (llm_mention_type) {
        if (Array.isArray(llm_mention_type)) {
          mentionTypesArray = llm_mention_type;
        } else if (typeof llm_mention_type === "string") {
          mentionTypesArray = llm_mention_type
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
      }

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

      const sort = [{ p_created_time: { order: "asc" } }];
      const { total, fetched, results: posts } = await scrollSearch({
        query,
        sourceFields: [
          "p_id",
          "p_url",
          "source",
          "p_created_time",
          "predicted_sentiment_value",
          "llm_emotion",
          "llm_comments",
        ],
        sort,
        maxDocs: 40000,
      });

      const countsByBucket = new Map();
      let totalParsedComments = 0;

      for (const post of posts) {
        const postContext = {
          p_id: post.p_id,
          p_url: post.p_url,
          source: post.source,
          p_created_time: post.p_created_time,
          predicted_sentiment_value: post.predicted_sentiment_value,
          llm_emotion: post.llm_emotion,
        };

        const comments = extractCommentsFromPost(post.llm_comments);
        for (const commentItem of comments) {
          const parsed = safeParseJson(commentItem);
          if (!parsed) continue;

          const normalized = normalizeCommentRecord(parsed, postContext);
          const bucket = bucketKey(normalized.p_created_time, interval);
          if (!bucket) continue;
          if (!countsByBucket.has(bucket)) {
            countsByBucket.set(bucket, { date: bucket });
          }

          const bucketObj = countsByBucket.get(bucket);
          const emotionKey = normalized.llm_emotion || "Unknown";
          bucketObj[emotionKey] = (bucketObj[emotionKey] || 0) + 1;
          totalParsedComments++;
        }
      }

      const timeIntervals = Array.from(countsByBucket.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      return res.json({
        success: true,
        totalPostsMatched: total,
        totalPostsFetched: fetched,
        totalParsedComments,
        timeIntervals,
      });
    } catch (error) {
      console.error("Error in llm-comments emotion trend:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
  getLlmCommentsSentimentCounts: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        topicId,
        llm_mention_type,
      } = req.body;

      if (!topicId) {
        return res
          .status(400)
          .json({ success: false, error: "topicId is required" });
      }

      const topicIdNum = parseInt(topicId);
      const isSpecialTopic = topicIdNum === 2600 || topicIdNum === 2627;

      let categoryData = {};
      if (
        req.body.categoryItems &&
        Array.isArray(req.body.categoryItems) &&
        req.body.categoryItems.length > 0
      ) {
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json({ success: true, sentiments: [], totalCount: 0 });
      }

      let workingCategory = category;
      if (
        workingCategory !== "all" &&
        workingCategory !== "" &&
        workingCategory !== "custom"
      ) {
        const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);
        if (matchedKey) {
          categoryData = { [matchedKey]: categoryData[matchedKey] };
          workingCategory = matchedKey;
        } else {
          workingCategory = "all";
        }
      }

      const now = new Date();
      const dateRange = processTimeSlot(timeSlot, fromDate, toDate);
      if (isSpecialTopic && !fromDate && !toDate) {
        dateRange.greaterThanTime = "2020-01-01";
        dateRange.lessThanTime = format(now, "yyyy-MM-dd");
      }

      const query = buildBaseQuery(dateRange, source, isSpecialTopic, topicIdNum);
      addCategoryFilters(query, workingCategory, categoryData);

      // Post-level sentiment filter (optional)
      if (
        sentimentType &&
        sentimentType !== "undefined" &&
        sentimentType !== "null"
      ) {
        if (String(sentimentType).includes(",")) {
          const sentimentArray = String(sentimentType)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

          query.bool.must.push({
            bool: {
              should: sentimentArray.map((s) => ({
                match: { predicted_sentiment_value: s },
              })),
              minimum_should_match: 1,
            },
          });
        } else {
          query.bool.must.push({
            match: { predicted_sentiment_value: String(sentimentType).trim() },
          });
        }
      }

      if (topicIdNum === 2651) {
        query.bool.must.push({ term: { "p_tag_cat.keyword": "Healthcare" } });
      }
      if (topicIdNum === 2652 || topicIdNum === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" },
        });
      }

      let mentionTypesArray = [];
      if (llm_mention_type) {
        if (Array.isArray(llm_mention_type)) {
          mentionTypesArray = llm_mention_type;
        } else if (typeof llm_mention_type === "string") {
          mentionTypesArray = llm_mention_type
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
      }
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

      const { total, fetched, results: posts } = await scrollSearch({
        query,
        sourceFields: [
          "p_id",
          "p_url",
          "source",
          "p_created_time",
          "predicted_sentiment_value",
          "llm_emotion",
          "llm_comments",
        ],
        sort: [{ p_created_time: { order: "desc" } }],
        maxDocs: 40000,
      });

      const counts = new Map();
      let totalCount = 0;

      for (const post of posts) {
        const postContext = {
          p_id: post.p_id,
          p_url: post.p_url,
          source: post.source,
          p_created_time: post.p_created_time,
          predicted_sentiment_value: post.predicted_sentiment_value,
          llm_emotion: post.llm_emotion,
        };

        const comments = extractCommentsFromPost(post.llm_comments);
        for (const c of comments) {
          const parsed = safeParseJson(c);
          if (!parsed) continue;

          const normalized = normalizeCommentRecord(parsed, postContext);
          const key = normalizeSentimentLabel(normalized.mapped_sentiment) || "Unknown";
          counts.set(key, (counts.get(key) || 0) + 1);
          totalCount++;
        }
      }

      const sentiments = Array.from(counts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      return res.json({
        success: true,
        totalPostsMatched: total,
        totalPostsFetched: fetched,
        totalCount,
        sentiments,
      });
    } catch (error) {
      console.error("Error in llm-comments sentiment counts:", error);
      return res
        .status(500)
        .json({ success: false, error: "Internal server error" });
    }
  },

  getLlmCommentsEmotionCounts: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        topicId,
        llm_mention_type,
      } = req.body;

      if (!topicId) {
        return res
          .status(400)
          .json({ success: false, error: "topicId is required" });
      }

      const topicIdNum = parseInt(topicId);
      const isSpecialTopic = topicIdNum === 2600 || topicIdNum === 2627;

      let categoryData = {};
      if (
        req.body.categoryItems &&
        Array.isArray(req.body.categoryItems) &&
        req.body.categoryItems.length > 0
      ) {
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json({ success: true, emotions: [], totalCount: 0 });
      }

      let workingCategory = category;
      if (
        workingCategory !== "all" &&
        workingCategory !== "" &&
        workingCategory !== "custom"
      ) {
        const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);
        if (matchedKey) {
          categoryData = { [matchedKey]: categoryData[matchedKey] };
          workingCategory = matchedKey;
        } else {
          workingCategory = "all";
        }
      }

      const now = new Date();
      const dateRange = processTimeSlot(timeSlot, fromDate, toDate);
      if (isSpecialTopic && !fromDate && !toDate) {
        dateRange.greaterThanTime = "2020-01-01";
        dateRange.lessThanTime = format(now, "yyyy-MM-dd");
      }

      const query = buildBaseQuery(dateRange, source, isSpecialTopic, topicIdNum);
      addCategoryFilters(query, workingCategory, categoryData);

      // Post-level sentiment filter (optional)
      if (
        sentimentType &&
        sentimentType !== "undefined" &&
        sentimentType !== "null"
      ) {
        if (String(sentimentType).includes(",")) {
          const sentimentArray = String(sentimentType)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

          query.bool.must.push({
            bool: {
              should: sentimentArray.map((s) => ({
                match: { predicted_sentiment_value: s },
              })),
              minimum_should_match: 1,
            },
          });
        } else {
          query.bool.must.push({
            match: { predicted_sentiment_value: String(sentimentType).trim() },
          });
        }
      }

      if (topicIdNum === 2651) {
        query.bool.must.push({ term: { "p_tag_cat.keyword": "Healthcare" } });
      }
      if (topicIdNum === 2652 || topicIdNum === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" },
        });
      }

      let mentionTypesArray = [];
      if (llm_mention_type) {
        if (Array.isArray(llm_mention_type)) {
          mentionTypesArray = llm_mention_type;
        } else if (typeof llm_mention_type === "string") {
          mentionTypesArray = llm_mention_type
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
      }
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

      const { total, fetched, results: posts } = await scrollSearch({
        query,
        sourceFields: [
          "p_id",
          "p_url",
          "source",
          "p_created_time",
          "predicted_sentiment_value",
          "llm_emotion",
          "llm_comments",
        ],
        sort: [{ p_created_time: { order: "desc" } }],
        maxDocs: 40000,
      });

      const counts = new Map();
      let totalCount = 0;

      for (const post of posts) {
        const postContext = {
          p_id: post.p_id,
          p_url: post.p_url,
          source: post.source,
          p_created_time: post.p_created_time,
          predicted_sentiment_value: post.predicted_sentiment_value,
          llm_emotion: post.llm_emotion,
        };

        const comments = extractCommentsFromPost(post.llm_comments);
        for (const c of comments) {
          const parsed = safeParseJson(c);
          if (!parsed) continue;

          const normalized = normalizeCommentRecord(parsed, postContext);
          const key = normalized.llm_emotion || "Unknown";
          counts.set(key, (counts.get(key) || 0) + 1);
          totalCount++;
        }
      }

      const emotions = Array.from(counts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      return res.json({
        success: true,
        totalPostsMatched: total,
        totalPostsFetched: fetched,
        totalCount,
        emotions,
      });
    } catch (error) {
      console.error("Error in llm-comments emotion counts:", error);
      return res
        .status(500)
        .json({ success: false, error: "Internal server error" });
    }
  },
  getLlmCommentsOnClick: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        topicId,
        llm_mention_type,
        interval = "daily",
        date, // click date bucket (e.g. 2026-03-25 or 2026-03)
        sentiment, // click sentiment (Positive/Negative/Neutral)
        emotion, // optional click emotion
        sourceName, // optional click source
        limit = 2000,
      } = req.body;

      if (!topicId) {
        return res.status(400).json({ success: false, error: "topicId is required" });
      }

      const topicIdNum = parseInt(topicId);
      const isSpecialTopic = topicIdNum === 2600 || topicIdNum === 2627;

      let categoryData = {};
      if (
        req.body.categoryItems &&
        Array.isArray(req.body.categoryItems) &&
        req.body.categoryItems.length > 0
      ) {
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json({
          success: true,
          totalPostsMatched: 0,
          totalCommentsMatched: 0,
          comments: [],
        });
      }

      let workingCategory = category;
      if (
        workingCategory !== "all" &&
        workingCategory !== "" &&
        workingCategory !== "custom"
      ) {
        const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);
        if (matchedKey) {
          categoryData = { [matchedKey]: categoryData[matchedKey] };
          workingCategory = matchedKey;
        } else {
          workingCategory = "all";
        }
      }

      const now = new Date();
      const dateRange = processTimeSlot(timeSlot, fromDate, toDate);
      if (isSpecialTopic && !fromDate && !toDate) {
        dateRange.greaterThanTime = "2020-01-01";
        dateRange.lessThanTime = format(now, "yyyy-MM-dd");
      }

      const query = buildBaseQuery(dateRange, source, isSpecialTopic, topicIdNum);
      addCategoryFilters(query, workingCategory, categoryData);

      if (
        sentimentType &&
        sentimentType !== "undefined" &&
        sentimentType !== "null"
      ) {
        if (String(sentimentType).includes(",")) {
          const sentimentArray = String(sentimentType)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

          query.bool.must.push({
            bool: {
              should: sentimentArray.map((s) => ({
                match: { predicted_sentiment_value: s },
              })),
              minimum_should_match: 1,
            },
          });
        } else {
          query.bool.must.push({
            match: { predicted_sentiment_value: String(sentimentType).trim() },
          });
        }
      }

      if (sourceName && String(sourceName).trim() !== "") {
        if (String(sourceName).trim().toLowerCase() === "linkedin") {
          query.bool.must.push({
            bool: {
              should: [
                { match_phrase: { source: "LinkedIn" } },
                { match_phrase: { source: "Linkedin" } },
              ],
              minimum_should_match: 1,
            },
          });
        } else {
          query.bool.must.push({
            match_phrase: { source: String(sourceName).trim() },
          });
        }
      }

      if (topicIdNum === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" },
        });
      }

      if (topicIdNum === 2652 || topicIdNum === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" },
        });
      }

      let mentionTypesArray = [];
      if (llm_mention_type) {
        if (Array.isArray(llm_mention_type)) {
          mentionTypesArray = llm_mention_type;
        } else if (typeof llm_mention_type === "string") {
          mentionTypesArray = llm_mention_type
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
      }

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

      const { total, results: posts } = await scrollSearch({
        query,
        sourceFields: [
          "p_id",
          "p_url",
          "source",
          "p_created_time",
          "predicted_sentiment_value",
          "llm_emotion",
          "llm_comments",
        ],
        sort: [{ p_created_time: { order: "desc" } }],
        maxDocs: 40000,
      });

      const selectedDate = date ? String(date).trim() : null;
      const selectedSentiment = sentiment ? String(sentiment).trim().toLowerCase() : null;
      const selectedEmotion = emotion ? String(emotion).trim().toLowerCase() : null;

      const comments = [];

      for (const post of posts) {
        const postContext = {
          p_id: post.p_id,
          p_url: post.p_url,
          source: post.source,
          p_created_time: post.p_created_time,
          predicted_sentiment_value: post.predicted_sentiment_value,
          llm_emotion: post.llm_emotion,
        };

        const rawComments = extractCommentsFromPost(post.llm_comments);
        for (const rawComment of rawComments) {
          const parsed = safeParseJson(rawComment);
          if (!parsed) continue;

          const normalized = normalizeCommentRecord(parsed, postContext);

          if (selectedDate) {
            const commentBucket = bucketKey(normalized.p_created_time, interval);
            if (commentBucket !== selectedDate) continue;
          }

          if (
            selectedSentiment &&
            String(normalized.mapped_sentiment).toLowerCase() !== selectedSentiment
          ) {
            continue;
          }

          if (
            selectedEmotion &&
            selectedEmotion !== "undefined" &&
            selectedEmotion !== "null" &&
            String(normalized.llm_emotion || "").toLowerCase() !== selectedEmotion
          ) {
            continue;
          }

          comments.push({
            // Frontend-friendly fields for filtering/drilldown
            source: normalized.source,
            p_created_time: normalized.p_created_time,
            p_id: normalized.p_id,
            p_url: normalized.p_url,
            predicted_sentiment_value: normalized.predicted_sentiment_value,
            llm_emotion: normalized.llm_emotion,

            ...parsed, // full llm comment object fields
            mapped_sentiment: normalized.mapped_sentiment,
            post_context: {
              ...postContext,
            },
          });
        }
      }

      return res.json({
        success: true,
        totalPostsMatched: total,
        totalCommentsMatched: comments.length,
        comments,
      });
    } catch (error) {
      console.error("Error in llm-comments onclick:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  // Donut dataset: count llm_comments by their source
  getLlmCommentsSourceDonut: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        topicId,
        llm_mention_type,
        // optional drill-down filters
        date,
        sentiment, // mapped sentiment
        emotion, // post-level llm_emotion filter (if provided)
        sourceName, // optional post-level source filter
        interval = "daily",
      } = req.body;

      if (!topicId) {
        return res
          .status(400)
          .json({ success: false, error: "topicId is required" });
      }

      const topicIdNum = parseInt(topicId);
      const isSpecialTopic = topicIdNum === 2600 || topicIdNum === 2627;

      let categoryData = {};
      if (
        req.body.categoryItems &&
        Array.isArray(req.body.categoryItems) &&
        req.body.categoryItems.length > 0
      ) {
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json({
          success: true,
          totalPostsMatched: 0,
          totalCommentsMatched: 0,
          sourceCounts: [],
        });
      }

      let workingCategory = category;
      if (
        workingCategory !== "all" &&
        workingCategory !== "" &&
        workingCategory !== "custom"
      ) {
        const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);
        if (matchedKey) {
          categoryData = { [matchedKey]: categoryData[matchedKey] };
          workingCategory = matchedKey;
        } else {
          workingCategory = "all";
        }
      }

      const now = new Date();
      const dateRange = processTimeSlot(timeSlot, fromDate, toDate);

      if (isSpecialTopic && !fromDate && !toDate) {
        dateRange.greaterThanTime = "2020-01-01";
        dateRange.lessThanTime = format(now, "yyyy-MM-dd");
      }

      const query = buildBaseQuery(dateRange, source, isSpecialTopic, topicIdNum);
      addCategoryFilters(query, workingCategory, categoryData);

      // Post-level sentiment filter
      if (
        sentimentType &&
        sentimentType !== "undefined" &&
        sentimentType !== "null"
      ) {
        if (String(sentimentType).includes(",")) {
          const sentimentArray = String(sentimentType)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

          query.bool.must.push({
            bool: {
              should: sentimentArray.map((s) => ({
                match: { predicted_sentiment_value: s },
              })),
              minimum_should_match: 1,
            },
          });
        } else {
          query.bool.must.push({
            match: { predicted_sentiment_value: String(sentimentType).trim() },
          });
        }
      }

      if (topicIdNum === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" },
        });
      }

      if (topicIdNum === 2652 || topicIdNum === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" },
        });
      }

      // Post-level emotion filter
      if (emotion && emotion !== "undefined" && emotion !== "null" && String(emotion).trim() !== "") {
        query.bool.must.push({
          match: { llm_emotion: String(emotion).trim() },
        });
      }

      // Optional post-level source filter (useful when user clicks donut segment)
      if (sourceName && String(sourceName).trim() !== "") {
        query.bool.must.push({
          match_phrase: { source: String(sourceName).trim() },
        });
      }

      // llm mention type filter
      let mentionTypesArray = [];
      if (llm_mention_type) {
        if (Array.isArray(llm_mention_type)) {
          mentionTypesArray = llm_mention_type;
        } else if (typeof llm_mention_type === "string") {
          mentionTypesArray = llm_mention_type
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
      }

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

      const { total, fetched, results: posts } = await scrollSearch({
        query,
        sourceFields: [
          "p_id",
          "p_url",
          "source",
          "p_created_time",
          "predicted_sentiment_value",
          "llm_emotion",
          "llm_comments",
        ],
        sort: [{ p_created_time: { order: "desc" } }],
        maxDocs: 40000,
      });

      const selectedDate = date ? String(date).trim() : null;
      const selectedSentiment = sentiment ? String(sentiment).trim().toLowerCase() : null;

      const countsBySource = new Map();
      let totalParsedComments = 0;

      for (const post of posts) {
        const postContext = {
          p_id: post.p_id,
          p_url: post.p_url,
          source: post.source,
          p_created_time: post.p_created_time,
          predicted_sentiment_value: post.predicted_sentiment_value,
          llm_emotion: post.llm_emotion,
        };

        const rawComments = extractCommentsFromPost(post.llm_comments);
        for (const rawComment of rawComments) {
          const parsed = safeParseJson(rawComment);
          if (!parsed) continue;

          const normalized = normalizeCommentRecord(parsed, postContext);

          if (selectedDate) {
            const commentBucket = bucketKey(normalized.p_created_time, interval);
            if (commentBucket !== selectedDate) continue;
          }

          if (
            selectedSentiment &&
            String(normalized.mapped_sentiment).toLowerCase() !== selectedSentiment
          ) {
            continue;
          }

          const srcKey = normalized.source || "Unknown";
          const sentimentKey =
            normalizeSentimentLabel(normalized.mapped_sentiment) || "Neutral";

          if (!countsBySource.has(srcKey)) {
            countsBySource.set(srcKey, {
              source: srcKey,
              Positive: 0,
              Negative: 0,
              Neutral: 0,
              total: 0,
            });
          }

          const srcObj = countsBySource.get(srcKey);
          srcObj[sentimentKey] = (srcObj[sentimentKey] || 0) + 1;
          srcObj.total += 1;
          totalParsedComments++;
        }
      }

      const sourceCounts = Array.from(countsBySource.values()).sort(
        (a, b) => b.total - a.total
      );

      return res.json({
        success: true,
        totalPostsMatched: total,
        totalPostsFetched: fetched,
        totalCommentsMatched: totalParsedComments,
        sourceCounts,
      });
    } catch (error) {
      console.error("Error in llm-comments source donut:", error);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  },
};

module.exports = llmCommentsSentimentTrendController;

