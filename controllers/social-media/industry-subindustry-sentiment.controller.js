const { elasticClient } = require("../../config/elasticsearch");
const { processFilters } = require("./filter.utils");

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
  const normalizedSelected = normalizedSelectedRaw.toLowerCase().replace(/\s+/g, "");
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

function addCategoryFilters(query, selectedCategory, categoryData) {
  if (selectedCategory === "all" || selectedCategory === "") {
    query.bool.must.push({
      bool: {
        should: [
          ...Object.values(categoryData).flatMap((data) =>
            (data.keywords || []).map((keyword) => ({
              multi_match: {
                query: keyword,
                fields: [
                  "p_message_text",
                  "p_message",
                  "keywords",
                  "title",
                  "hashtags",
                  "u_source",
                  "p_url",
                ],
                type: "phrase",
              },
            }))
          ),
          ...Object.values(categoryData).flatMap((data) =>
            (data.hashtags || []).map((hashtag) => ({
              multi_match: {
                query: hashtag,
                fields: [
                  "p_message_text",
                  "p_message",
                  "keywords",
                  "title",
                  "hashtags",
                  "u_source",
                  "p_url",
                ],
                type: "phrase",
              },
            }))
          ),
          ...Object.values(categoryData).flatMap((data) =>
            (data.urls || []).map((url) => ({
              multi_match: {
                query: url,
                fields: [
                  "p_message_text",
                  "p_message",
                  "keywords",
                  "title",
                  "hashtags",
                  "u_source",
                  "p_url",
                ],
                type: "phrase",
              },
            }))
          ),
        ],
        minimum_should_match: 1,
      },
    });
    return;
  }

  const normalizedSelected = selectedCategory.toLowerCase().replace(/\s+/g, "");

  let matchedKey = Object.keys(categoryData).find(
    (key) => key.toLowerCase() === selectedCategory.toLowerCase()
  );

  if (!matchedKey) {
    matchedKey = Object.keys(categoryData).find(
      (key) => key.toLowerCase().replace(/\s+/g, "") === normalizedSelected
    );
  }

  if (!matchedKey) {
    matchedKey = Object.keys(categoryData).find(
      (key) =>
        key.toLowerCase().includes(selectedCategory.toLowerCase()) ||
        selectedCategory.toLowerCase().includes(key.toLowerCase())
    );
  }

  if (!matchedKey || !categoryData[matchedKey]) return;

  const data = categoryData[matchedKey];
  const hasKeywords = Array.isArray(data.keywords) && data.keywords.length > 0;
  const hasHashtags = Array.isArray(data.hashtags) && data.hashtags.length > 0;
  const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;

  if (!hasKeywords && !hasHashtags && !hasUrls) {
    query.bool.must.push({
      bool: {
        must_not: { match_all: {} },
      },
    });
    return;
  }

  query.bool.must.push({
    bool: {
      should: [
        ...(data.keywords || []).map((keyword) => ({
          multi_match: {
            query: keyword,
            fields: [
              "p_message_text",
              "p_message",
              "keywords",
              "title",
              "hashtags",
              "u_source",
              "p_url",
            ],
            type: "phrase",
          },
        })),
        ...(data.hashtags || []).map((hashtag) => ({
          multi_match: {
            query: hashtag,
            fields: [
              "p_message_text",
              "p_message",
              "keywords",
              "title",
              "hashtags",
              "u_source",
              "p_url",
            ],
            type: "phrase",
          },
        })),
        ...(data.urls || []).map((url) => ({
          multi_match: {
            query: url,
            fields: [
              "p_message_text",
              "p_message",
              "keywords",
              "title",
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
  });
}

function buildAnalysisQuery(params) {
  const {
    categoryData,
    category,
    timeSlot,
    fromDate,
    toDate,
    sources,
    llm_mention_type,
    countries,
    keywords,
    organizations,
    cities,
    dataSource,
    topicId,
  } = params;

  const noDateProvided =
    (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
    (fromDate === null || fromDate === undefined || fromDate === "") &&
    (toDate === null || toDate === undefined || toDate === "");

  const query = {
    bool: {
      must: [],
      must_not: [{ term: { source: "DM" } }],
      should: [],
    },
  };

  if (!noDateProvided) {
    const filters = processFilters({
      timeSlot,
      fromDate,
      toDate,
      queryString: "",
    });

    query.bool.must.push({
      range: {
        p_created_time: {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        },
      },
    });
  }

  addCategoryFilters(query, category, categoryData);

  const normalizedSources = normalizeSourceInput(sources);
  const topicIdNum = parseInt(topicId, 10);

  if (
    topicIdNum === 2619 ||
    topicIdNum === 2639 ||
    topicIdNum === 2640 ||
    topicIdNum === 2647 ||
    topicIdNum === 2648 ||
    topicIdNum === 2649
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
        should: normalizedSources.map((src) => ({ match_phrase: { source: src } })),
        minimum_should_match: 1,
      },
    });
  } else if (topicIdNum === 2634) {
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
    topicIdNum === 2641 ||
    topicIdNum === 2658 ||
    topicIdNum === 2659 ||
    topicIdNum === 2660 ||
    topicIdNum === 2661 ||
    topicIdNum === 2662 ||
    topicIdNum === 2643 ||
    topicIdNum === 2644 ||
    topicIdNum === 2651 ||
    topicIdNum === 2652 ||
    topicIdNum === 2663 ||
    topicIdNum === 2653 ||
    topicIdNum === 2654 ||
    topicIdNum === 2655 ||
    topicIdNum === 2664
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
  } else if (topicIdNum === 2656 || topicIdNum === 2657) {
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
  } else if (topicIdNum === 2646 || topicIdNum === 2650) {
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

  let mentionTypesArray = [];
  if (llm_mention_type) {
    if (Array.isArray(llm_mention_type)) {
      mentionTypesArray = llm_mention_type;
    } else if (typeof llm_mention_type === "string") {
      mentionTypesArray = llm_mention_type.split(",").map((s) => s.trim());
    }
  }

  if (mentionTypesArray.length > 0) {
    query.bool.must.push({
      bool: {
        should: mentionTypesArray.map((type) => ({ match: { llm_mention_type: type } })),
        minimum_should_match: 1,
      },
    });
  }

  if (countries && Array.isArray(countries) && countries.length > 0) {
    query.bool.must.push({ terms: { "u_country.keyword": countries } });
  }

  if (keywords && Array.isArray(keywords) && keywords.length > 0) {
    query.bool.must.push({
      bool: {
        should: keywords.map((keyword) => ({
          multi_match: {
            query: keyword,
            fields: ["p_message_text", "p_message", "keywords", "title"],
            type: "phrase",
          },
        })),
        minimum_should_match: 1,
      },
    });
  }

  if (cities && Array.isArray(cities) && cities.length > 0) {
    query.bool.must.push({
      bool: {
        should: cities.map((city) => ({ match_phrase: { llm_specific_locations: city } })),
        minimum_should_match: 1,
      },
    });
  }

  if (organizations && Array.isArray(organizations) && organizations.length > 0) {
    query.bool.must.push({
      bool: {
        should: organizations.map((org) => ({ term: { "llm_business_name.keyword": org } })),
        minimum_should_match: 1,
      },
    });
  }

  if (dataSource !== "All") {
    const entityNames = [];
    Object.values(categoryData).forEach((cat) => {
      entityNames.push(...(cat.hashtags || []), ...(cat.keywords || []), ...(cat.urls || []));
    });

    const shouldClauses = entityNames.map((name) => {
      if (
        typeof name === "string" &&
        (name.includes("http://") || name.includes("https://"))
      ) {
        const escapedUrl = name.replace(/([+\-=&|><!(){}[\]^"~*?:\\/.])/g, "\\$1");
        return {
          query_string: {
            query: `"${escapedUrl}"`,
            fields: ["u_source"],
            analyze_wildcard: false,
          },
        };
      }
      return {
        query_string: {
          query: `${name}`,
          fields: ["u_fullname", "u_username", "u_source"],
          analyze_wildcard: false,
        },
      };
    });

    if (dataSource === "Entity") {
      query.bool.must.push({
        bool: { should: shouldClauses, minimum_should_match: 1 },
      });
    } else if (dataSource === "Public") {
      query.bool.must_not.push({
        bool: { should: shouldClauses, minimum_should_match: 1 },
      });
    }
  }

  return query;
}

const aggregateFieldSentiment = (buckets = [], keyName) =>
  buckets
    .filter((bucket) => bucket.key && String(bucket.key).trim() !== "")
    .map((bucket) => {
      const sentiments = {
        positive: 0,
        negative: 0,
        neutral: 0,
      };

      (bucket.sentiments?.buckets || []).forEach((sentBucket) => {
        const key = String(sentBucket.key || "").toLowerCase();
        if (Object.prototype.hasOwnProperty.call(sentiments, key)) {
          sentiments[key] = sentBucket.doc_count;
        }
      });

      return {
        name: bucket.key,
        [keyName]: bucket.key,
        ...sentiments,
        total: bucket.doc_count,
      };
    })
    .sort((a, b) => b.total - a.total);

const aggregateFieldEmotion = (buckets = [], keyName) =>
  buckets
    .filter((bucket) => bucket.key && String(bucket.key).trim() !== "")
    .map((bucket) => ({
      name: bucket.key,
      [keyName]: bucket.key,
      emotions: (bucket.emotions?.buckets || [])
        .map((emotionBucket) => ({
          emotion: emotionBucket.key,
          count: emotionBucket.doc_count,
        }))
        .sort((a, b) => b.count - a.count),
      total: bucket.doc_count,
    }))
    .sort((a, b) => b.total - a.total);

const aggregateEntitySentiment = (buckets = []) =>
  buckets
    .filter((bucket) => bucket.key && String(bucket.key).trim() !== "")
    .map((bucket) => {
      const sentiments = { positive: 0, negative: 0, neutral: 0 };
      (bucket.sentiments?.buckets || []).forEach((sentBucket) => {
        const key = String(sentBucket.key || "").toLowerCase();
        if (Object.prototype.hasOwnProperty.call(sentiments, key)) {
          sentiments[key] = sentBucket.doc_count;
        }
      });
      return {
        name: bucket.key,
        llm_entity: bucket.key,
        ...sentiments,
        total: bucket.doc_count,
      };
    })
    .sort((a, b) => b.total - a.total);

const aggregateEntityEmotion = (buckets = []) =>
  buckets
    .filter((bucket) => bucket.key && String(bucket.key).trim() !== "")
    .map((bucket) => ({
      name: bucket.key,
      llm_entity: bucket.key,
      emotions: (bucket.emotions?.buckets || [])
        .map((emotionBucket) => ({
          emotion: emotionBucket.key,
          count: emotionBucket.doc_count,
        }))
        .sort((a, b) => b.count - a.count),
      total: bucket.doc_count,
    }))
    .sort((a, b) => b.total - a.total);

const normalizeSentimentLabel = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "positive") return "positive";
  if (normalized === "negative") return "negative";
  if (normalized === "neutral") return "neutral";
  return null;
};

const isValidLocation = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "unknown") return false;
  if (normalized === "not specified") return false;
  return true;
};

const applyCountryLocationFilter = (query, country) => {
  const countryValue = String(country || "").trim();
  if (!countryValue) return;
  query.bool.must.push({ term: { "llm_location.keyword": countryValue } });
};

const safeParseJson = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

const extractCommentsFromPost = (llmCommentsValue) => {
  if (Array.isArray(llmCommentsValue)) return llmCommentsValue;
  if (typeof llmCommentsValue === "string") {
    const parsed = safeParseJson(llmCommentsValue);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return [parsed];
    return [];
  }
  if (llmCommentsValue && typeof llmCommentsValue === "object") return [llmCommentsValue];
  return [];
};

const scrollSearch = async ({
  query,
  sourceFields,
  sort,
  scroll = "2m",
  pageSize = 2000,
  maxDocs = 40000,
}) => {
  const firstResponse = await elasticClient.search({
    index: process.env.ELASTICSEARCH_DEFAULTINDEX,
    scroll,
    size: pageSize,
    _source: sourceFields,
    body: { query, sort },
  });

  let scrollId = firstResponse._scroll_id;
  const total = firstResponse.hits.total.value;
  let allResults = firstResponse.hits.hits.map((hit) => hit._source);

  while (scrollId && allResults.length < total && allResults.length < maxDocs) {
    const scrollResponse = await elasticClient.scroll({ scroll_id: scrollId, scroll });
    if (!scrollResponse.hits.hits.length) break;
    allResults.push(...scrollResponse.hits.hits.map((hit) => hit._source));
  }

  if (scrollId) {
    try {
      await elasticClient.clearScroll({ scroll_id: scrollId });
    } catch (error) {
      // non-critical
    }
  }

  return { total, fetched: allResults.length, results: allResults };
};

const applyCommonOptionalFilters = (query, { sentimentType, emotion, category, selectedCategory }) => {
  if (sentimentType && sentimentType !== "undefined" && sentimentType !== "null") {
    if (sentimentType.includes(",")) {
      const sentimentArray = sentimentType.split(",");
      query.bool.must.push({
        bool: {
          should: sentimentArray.map((sentiment) => ({
            match: { predicted_sentiment_value: sentiment.trim() },
          })),
          minimum_should_match: 1,
        },
      });
    } else {
      query.bool.must.push({
        match: { predicted_sentiment_value: sentimentType.trim() },
      });
    }
  }

  if (emotion && emotion !== "undefined" && emotion !== "null") {
    query.bool.must.push({
      bool: {
        should: [
          {
            multi_match: {
              query: emotion,
              fields: ["llm_emotion"],
              type: "phrase",
            },
          },
        ],
        minimum_should_match: 1,
      },
    });
  }

  if (selectedCategory === "all" && category !== "all") {
    query.bool.must.push({
      bool: {
        should: [
          {
            multi_match: {
              query: category,
              fields: ["p_message_text", "p_message", "hashtags", "u_source", "p_url"],
              type: "phrase",
            },
          },
        ],
        minimum_should_match: 1,
      },
    });
  }
};

const formatPostData = (hit) => {
  const s = hit._source || {};
  const profilePic = s.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;
  const followers = s.u_followers > 0 ? `${s.u_followers}` : "";
  const following = s.u_following > 0 ? `${s.u_following}` : "";
  const posts = s.u_posts > 0 ? `${s.u_posts}` : "";
  const likes = s.p_likes > 0 ? `${s.p_likes}` : "";
  const llm_emotion = s.llm_emotion || "";
  const llm_emotion_arabic = s.llm_emotion_arabic || "";
  const commentsUrl =
    s.p_comments_text && s.p_comments_text.trim()
      ? s.p_url.trim().replace("https: // ", "https://")
      : "";
  const comments = `${s.p_comments}`;
  const shares = s.p_shares > 0 ? `${s.p_shares}` : "";
  const engagements = s.p_engagement > 0 ? `${s.p_engagement}` : "";
  const content = s.p_content?.trim() || "";
  const imageUrl = s.p_picture_url?.trim() || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;
  const predicted_sentiment = s.predicted_sentiment_value || "";
  const predicted_category = s.predicted_category || "";
  let youtubeVideoUrl = "";
  let profilePicture2 = "";
  if (s.source === "Youtube") {
    youtubeVideoUrl = s.video_embed_url
      ? s.video_embed_url
      : s.p_id
      ? `https://www.youtube.com/embed/${s.p_id}`
      : "";
  } else {
    profilePicture2 = s.p_picture || "";
  }
  const sourceIcon = ["Web", "DeepWeb"].includes(s.source) ? "Web" : s.source;
  const message_text = (s.p_message_text || "").replace(/<\/?[^>]+(>|$)/g, "");

  return {
    profilePicture: profilePic,
    profilePicture2,
    userFullname: s.u_fullname,
    user_data_string: "",
    followers,
    following,
    posts,
    likes,
    llm_emotion,
    llm_emotion_arabic,
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
    llm_comments: s.llm_comments,
    llm_category_confidence: s.llm_category_confidence,
    llm_entity: s.llm_entity,
    u_verified: s.u_verified,
    p_id: s.p_id,
  };
};

async function runHandlerAndCaptureJson(handler, req) {
  let statusCode = 200;
  let payload;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      payload = data;
      return data;
    },
  };
  await handler(req, res);
  return { statusCode, payload };
}

const industrySubindustrySentimentController = {
  getIndustrySubIndustrySentimentDistribution: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        category = "all",
        sources = "All",
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource = "All",
        sentimentType,
        emotion,
        country,
        topicId,
      } = req.body;

      let categoryData = {};
      if (
        req.body.categoryItems &&
        Array.isArray(req.body.categoryItems) &&
        req.body.categoryItems.length > 0
      ) {
        const processCategoryItems = require("../../helpers/processedCategoryItems");
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json({ industry: [], subIndustry: [] });
      }

      let selectedCategory = category;
      if (category && category !== "all" && category !== "" && category !== "custom") {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        selectedCategory = matchedKey || "all";
      }

      const query = buildAnalysisQuery({
        categoryData,
        category: selectedCategory,
        timeSlot,
        fromDate,
        toDate,
        sources,
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        topicId,
      });
      applyCountryLocationFilter(query, country);

      applyCommonOptionalFilters(query, { sentimentType, emotion, category, selectedCategory });

      const response = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          query,
          size: 0,
          aggs: {
            industries: {
              terms: {
                field: "industry.keyword",
                size: 10,
                exclude: "null",
              },
              aggs: {
                sentiments: {
                  terms: {
                    field: "predicted_sentiment_value.keyword",
                    size: 10,
                  },
                },
              },
            },
            sub_industries: {
              terms: {
                field: "sub_industry.keyword",
                size: 10,
                exclude: "null",
              },
              aggs: {
                sentiments: {
                  terms: {
                    field: "predicted_sentiment_value.keyword",
                    size: 10,
                  },
                },
              },
            },
          },
        },
      });

      const industryBuckets = response.aggregations?.industries?.buckets || [];
      const subIndustryBuckets = response.aggregations?.sub_industries?.buckets || [];

      return res.json({
        industry: aggregateFieldSentiment(industryBuckets, "industry"),
        subIndustry: aggregateFieldSentiment(subIndustryBuckets, "sub_industry"),
      });
    } catch (error) {
      console.error("Error fetching industry/sub_industry sentiment distribution:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  getIndustrySubIndustryEmotionDistribution: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        category = "all",
        sources = "All",
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource = "All",
        sentimentType,
        emotion,
        country,
        topicId,
      } = req.body;

      let categoryData = {};
      if (
        req.body.categoryItems &&
        Array.isArray(req.body.categoryItems) &&
        req.body.categoryItems.length > 0
      ) {
        const processCategoryItems = require("../../helpers/processedCategoryItems");
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json({ industry: [], subIndustry: [] });
      }

      let selectedCategory = category;
      if (category && category !== "all" && category !== "" && category !== "custom") {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        selectedCategory = matchedKey || "all";
      }

      const query = buildAnalysisQuery({
        categoryData,
        category: selectedCategory,
        timeSlot,
        fromDate,
        toDate,
        sources,
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        topicId,
      });
      applyCountryLocationFilter(query, country);

      applyCommonOptionalFilters(query, { sentimentType, emotion, category, selectedCategory });

      const response = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          query,
          size: 0,
          aggs: {
            industries: {
              terms: {
                field: "industry.keyword",
                size: 10,
                exclude: "null",
              },
              aggs: {
                emotions: {
                  terms: {
                    field: "llm_emotion.keyword",
                    size: 10,
                  },
                },
              },
            },
            sub_industries: {
              terms: {
                field: "sub_industry.keyword",
                size: 10,
                exclude: "null",
              },
              aggs: {
                emotions: {
                  terms: {
                    field: "llm_emotion.keyword",
                    size: 10,
                  },
                },
              },
            },
          },
        },
      });

      const industryBuckets = response.aggregations?.industries?.buckets || [];
      const subIndustryBuckets = response.aggregations?.sub_industries?.buckets || [];

      return res.json({
        industry: aggregateFieldEmotion(industryBuckets, "industry"),
        subIndustry: aggregateFieldEmotion(subIndustryBuckets, "sub_industry"),
      });
    } catch (error) {
      console.error("Error fetching industry/sub_industry emotion distribution:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  
  getIndustrySubIndustryPosts: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        category = "all",
        sources = "All",
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource = "All",
        sentimentType,
        emotion,
        country,
        topicId,
        industry,
        sub_industry,
        entity,
        llm_entity,
        location,
        llm_location,
        field,
        value,
        limit = 30,
      } = req.body;

      let categoryData = {};
      if (
        req.body.categoryItems &&
        Array.isArray(req.body.categoryItems) &&
        req.body.categoryItems.length > 0
      ) {
        const processCategoryItems = require("../../helpers/processedCategoryItems");
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json({ posts: [] });
      }

      let selectedCategory = category;
      if (category && category !== "all" && category !== "" && category !== "custom") {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        selectedCategory = matchedKey || "all";
      }

      const query = buildAnalysisQuery({
        categoryData,
        category: selectedCategory,
        timeSlot,
        fromDate,
        toDate,
        sources,
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        topicId,
      });
      applyCountryLocationFilter(query, country);

      applyCommonOptionalFilters(query, { sentimentType, emotion, category, selectedCategory });

      const clickedField = (field || "").toLowerCase();
      if (clickedField === "industry" && value) {
        query.bool.must.push({ term: { "industry.keyword": value } });
      } else if (
        (clickedField === "sub_industry" || clickedField === "subindustry") &&
        value
      ) {
        query.bool.must.push({ term: { "sub_industry.keyword": value } });
      } else if (clickedField === "location" && value) {
        query.bool.must.push({ term: { "llm_location.keyword": value } });
      } else if (clickedField === "entity" && value) {
        // Filter posts by selected LLM category instead of entity
        query.bool.must.push({ term: { "llm_categories.keyword": value } });
      } else {
        if (industry && industry !== "All") {
          query.bool.must.push({ term: { "industry.keyword": industry } });
        }
        if (sub_industry && sub_industry !== "All") {
          query.bool.must.push({ term: { "sub_industry.keyword": sub_industry } });
        }
        const selectedLocation = llm_location || location;
        if (selectedLocation && selectedLocation !== "All") {
          query.bool.must.push({ term: { "llm_location.keyword": selectedLocation } });
        }
        const selectedEntity = llm_entity || entity;
        if (selectedEntity && selectedEntity !== "All") {
          // Default entity filter now targets LLM categories
          query.bool.must.push({ term: { "llm_categories.keyword": selectedEntity } });
        }
      }

      const postsResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          size: Math.min(Number(limit) || 30, 100),
          query,
          sort: [{ p_created_time: { order: "desc" } }],
        },
      });

      const posts = (postsResponse.hits?.hits || []).map((hit) => formatPostData(hit));
      return res.json({ posts });
    } catch (error) {
      console.error("Error fetching industry/sub_industry posts:", error);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  },
  getPostEntitySentimentDistribution: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        category = "all",
        sources = "All",
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource = "All",
        sentimentType,
        emotion,
        country,
        topicId,
      } = req.body;

      let categoryData = {};
      if (
        req.body.categoryItems &&
        Array.isArray(req.body.categoryItems) &&
        req.body.categoryItems.length > 0
      ) {
        const processCategoryItems = require("../../helpers/processedCategoryItems");
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json([]);
      }

      let selectedCategory = category;
      if (category && category !== "all" && category !== "" && category !== "custom") {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        selectedCategory = matchedKey || "all";
      }

      const query = buildAnalysisQuery({
        categoryData,
        category: selectedCategory,
        timeSlot,
        fromDate,
        toDate,
        sources,
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        topicId,
      });
      applyCountryLocationFilter(query, country);

      applyCommonOptionalFilters(query, { sentimentType, emotion, category, selectedCategory });

      const response = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          query,
          size: 0,
          aggs: {
            entities: {
              terms: {
                // Aggregate over LLM categories instead of single entity field
                field: "llm_categories.keyword",
                size: 10,
                exclude: "null",
              },
              aggs: {
                sentiments: {
                  terms: {
                    field: "predicted_sentiment_value.keyword",
                    size: 10,
                  },
                },
              },
            },
          },
        },
      });

      const entityBuckets = response.aggregations?.entities?.buckets || [];
      return res.json(aggregateEntitySentiment(entityBuckets));
    } catch (error) {
      console.error("Error fetching post entity sentiment distribution:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  getPostEntityEmotionDistribution: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        category = "all",
        sources = "All",
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource = "All",
        sentimentType,
        emotion,
        country,
        topicId,
      } = req.body;

      let categoryData = {};
      if (
        req.body.categoryItems &&
        Array.isArray(req.body.categoryItems) &&
        req.body.categoryItems.length > 0
      ) {
        const processCategoryItems = require("../../helpers/processedCategoryItems");
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json([]);
      }

      let selectedCategory = category;
      if (category && category !== "all" && category !== "" && category !== "custom") {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        selectedCategory = matchedKey || "all";
      }

      const query = buildAnalysisQuery({
        categoryData,
        category: selectedCategory,
        timeSlot,
        fromDate,
        toDate,
        sources,
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        topicId,
      });
      applyCountryLocationFilter(query, country);

      applyCommonOptionalFilters(query, { sentimentType, emotion, category, selectedCategory });

      const response = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          query,
          size: 0,
          aggs: {
            entities: {
              terms: {
                // Aggregate over LLM categories instead of single entity field
                field: "llm_categories.keyword",
                size: 10,
                exclude: "null",
              },
              aggs: {
                emotions: {
                  terms: {
                    field: "llm_emotion.keyword",
                    size: 10,
                  },
                },
              },
            },
          },
        },
      });

      const entityBuckets = response.aggregations?.entities?.buckets || [];
      return res.json(aggregateEntityEmotion(entityBuckets));
    } catch (error) {
      console.error("Error fetching post entity emotion distribution:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  getLocationSentimentDistribution: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        category = "all",
        sources = "All",
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource = "All",
        sentimentType,
        emotion,
        country,
        topicId,
      } = req.body;

      let categoryData = {};
      if (
        req.body.categoryItems &&
        Array.isArray(req.body.categoryItems) &&
        req.body.categoryItems.length > 0
      ) {
        const processCategoryItems = require("../../helpers/processedCategoryItems");
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json({ post: [], comment: [] });
      }

      let selectedCategory = category;
      if (category && category !== "all" && category !== "" && category !== "custom") {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        selectedCategory = matchedKey || "all";
      }

      const query = buildAnalysisQuery({
        categoryData,
        category: selectedCategory,
        timeSlot,
        fromDate,
        toDate,
        sources,
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        topicId,
      });
      applyCountryLocationFilter(query, country);

      applyCommonOptionalFilters(query, { sentimentType, emotion, category, selectedCategory });

      const postResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          query,
          size: 0,
          aggs: {
            locations: {
              terms: {
                field: "llm_location.keyword",
                size: 10,
                missing: "Unknown",
              },
              aggs: {
                sentiments: {
                  terms: {
                    field: "predicted_sentiment_value.keyword",
                    size: 10,
                  },
                },
              },
            },
          },
        },
      });

      const post = (postResponse.aggregations?.locations?.buckets || []).map((bucket) => {
        const sentiments = { positive: 0, negative: 0, neutral: 0 };
        (bucket.sentiments?.buckets || []).forEach((b) => {
          const key = normalizeSentimentLabel(b.key);
          if (key) sentiments[key] = b.doc_count;
        });
        const locationKey = bucket.key || "";
        if (!isValidLocation(locationKey)) return null;
        return {
          name: locationKey,
          location: locationKey,
          ...sentiments,
          total: bucket.doc_count,
        };
      }).filter(Boolean);

      const { results: posts } = await scrollSearch({
        query,
        sourceFields: [
          "llm_location",
          "predicted_sentiment_value",
          "llm_comments",
          "p_created_time",
        ],
        sort: [{ p_created_time: { order: "desc" } }],
        maxDocs: 40000,
      });

      const commentLocationMap = new Map();
      for (const p of posts) {
        const fallbackLocation = String(p.llm_location || "").trim();
        const comments = extractCommentsFromPost(p.llm_comments);
        for (const comment of comments) {
          const parsed = safeParseJson(comment);
          if (!parsed) continue;
          const location = String(parsed.llm_location || fallbackLocation || "").trim();
          if (!isValidLocation(location)) continue;
          const sentiment = normalizeSentimentLabel(
            parsed.predicted_sentiment_value || p.predicted_sentiment_value
          );
          if (!sentiment) continue;

          if (!commentLocationMap.has(location)) {
            commentLocationMap.set(location, {
              name: location,
              location,
              positive: 0,
              negative: 0,
              neutral: 0,
              total: 0,
            });
          }
          const row = commentLocationMap.get(location);
          row[sentiment] += 1;
          row.total += 1;
        }
      }

      const comment = Array.from(commentLocationMap.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      return res.json({ post, comment });
    } catch (error) {
      console.error("Error fetching llm_location sentiment distribution:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  getLocationEmotionDistribution: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        category = "all",
        sources = "All",
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource = "All",
        sentimentType,
        emotion,
        country,
        topicId,
      } = req.body;

      let categoryData = {};
      if (
        req.body.categoryItems &&
        Array.isArray(req.body.categoryItems) &&
        req.body.categoryItems.length > 0
      ) {
        const processCategoryItems = require("../../helpers/processedCategoryItems");
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json({ post: [], comment: [] });
      }

      let selectedCategory = category;
      if (category && category !== "all" && category !== "" && category !== "custom") {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        selectedCategory = matchedKey || "all";
      }

      const query = buildAnalysisQuery({
        categoryData,
        category: selectedCategory,
        timeSlot,
        fromDate,
        toDate,
        sources,
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        topicId,
      });
      applyCountryLocationFilter(query, country);

      applyCommonOptionalFilters(query, { sentimentType, emotion, category, selectedCategory });

      const postResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          query,
          size: 0,
          aggs: {
            locations: {
              terms: {
                field: "llm_location.keyword",
                size: 10,
                missing: "Unknown",
              },
              aggs: {
                emotions: {
                  terms: {
                    field: "llm_emotion.keyword",
                    size: 10,
                  },
                },
              },
            },
          },
        },
      });

      const post = (postResponse.aggregations?.locations?.buckets || []).map((bucket) => ({
        name: bucket.key || "",
        location: bucket.key || "",
        emotions: (bucket.emotions?.buckets || [])
          .map((e) => ({ name: e.key, count: e.doc_count }))
          .sort((a, b) => b.count - a.count),
        total: bucket.doc_count,
      })).filter((row) => isValidLocation(row.location));

      const { results: posts } = await scrollSearch({
        query,
        sourceFields: ["llm_location", "llm_emotion", "llm_comments", "p_created_time"],
        sort: [{ p_created_time: { order: "desc" } }],
        maxDocs: 40000,
      });

      const countryFilter = String(country || "").trim();
      const commentLocationMap = new Map();
      for (const p of posts) {
        const fallbackLocation = String(p.llm_location || "").trim();
        const comments = extractCommentsFromPost(p.llm_comments);
        for (const comment of comments) {
          const parsed = safeParseJson(comment);
          if (!parsed) continue;
          const location = String(parsed.llm_location || fallbackLocation || "").trim();
          if (!isValidLocation(location)) continue;

          // If a country filter is active, only include comments matching that location
          if (countryFilter && location !== countryFilter) continue;

          const emotionKey = String(parsed.llm_emotion || p.llm_emotion || "Unknown").trim() || "Unknown";

          if (!commentLocationMap.has(location)) {
            commentLocationMap.set(location, {
              name: location,
              location,
              total: 0,
              emotionMap: new Map(),
            });
          }
          const row = commentLocationMap.get(location);
          row.total += 1;
          row.emotionMap.set(emotionKey, (row.emotionMap.get(emotionKey) || 0) + 1);
        }
      }

      const comment = Array.from(commentLocationMap.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)
        .map((row) => ({
          name: row.name,
          location: row.location,
          total: row.total,
          emotions: Array.from(row.emotionMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10),
        }));

      return res.json({ post, comment });
    } catch (error) {
      console.error("Error fetching llm_location emotion distribution:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  getPostLocationSentimentDistribution: async (req, res) => {
    const { statusCode, payload } = await runHandlerAndCaptureJson(
      industrySubindustrySentimentController.getLocationSentimentDistribution,
      req
    );
    return res.status(statusCode).json(payload?.post || []);
  },
  getCommentLocationSentimentDistribution: async (req, res) => {
    const { statusCode, payload } = await runHandlerAndCaptureJson(
      industrySubindustrySentimentController.getLocationSentimentDistribution,
      req
    );
    const countryValue = String(req?.body?.country || "").trim().toLowerCase();
    const comments = payload?.comment || [];
    if (!countryValue) {
      return res.status(statusCode).json(comments);
    }
    const filteredComments = comments.filter(
      (row) => String(row?.location || "").trim().toLowerCase() === countryValue
    );
    return res.status(statusCode).json(filteredComments);
  },
  getPostLocationEmotionDistribution: async (req, res) => {
    const { statusCode, payload } = await runHandlerAndCaptureJson(
      industrySubindustrySentimentController.getLocationEmotionDistribution,
      req
    );
    return res.status(statusCode).json(payload?.post || []);
  },
  getCommentLocationEmotionDistribution: async (req, res) => {
    const { statusCode, payload } = await runHandlerAndCaptureJson(
      industrySubindustrySentimentController.getLocationEmotionDistribution,
      req
    );
    return res.status(statusCode).json(payload?.comment || []);
  },
};

module.exports = industrySubindustrySentimentController;
