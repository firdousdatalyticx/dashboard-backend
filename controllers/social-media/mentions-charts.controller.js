const { elasticClient } = require("../../config/elasticsearch");
const express = require("express");
const router = express.Router();
const prisma = require("../../config/database");
const processCategoryItems = require('../../helpers/processedCategoryItems');

const normalizeSourceInput = (sourceParam) => {
    if (!sourceParam || sourceParam === 'All') {
        return [];
    }

    if (Array.isArray(sourceParam)) {
        return sourceParam
            .filter(Boolean)
            .map(src => src.trim())
            .filter(src => src.length > 0 && src.toLowerCase() !== 'all');
    }

    if (typeof sourceParam === 'string') {
        return sourceParam
            .split(',')
            .map(src => src.trim())
            .filter(src => src.length > 0 && src.toLowerCase() !== 'all');
    }

    return [];
};

const buildSourceQueryString = (req, sources = [], isSpecialTopic = false) => {
  // If sources array is provided and not empty, use it
  if (sources && Array.isArray(sources) && sources.length > 0) {
    const sourceStr = sources.map(src => `"${src}"`).join(' OR ');
    return ` AND source:(${sourceStr})`;
  }

  // Get available data sources from middleware
  let availableDataSources = [];
  
  try {
    // Check if req.processedDataSources exists and is an array
    if (req && req.processedDataSources && Array.isArray(req.processedDataSources) && req.processedDataSources.length > 0) {
      availableDataSources = req.processedDataSources;
    } else {
      // Fallback to default sources
      availableDataSources = [
        "Twitter",
        "Facebook",
        "Instagram",
        "Youtube",
        "Pinterest",
        "LinkedIn",
        "Web",
        "Reddit",
        "TikTok"
      ];
    }
  } catch (error) {
    console.error('Error accessing processedDataSources:', error);
    // Fallback to default sources
    availableDataSources = [
      "Twitter",
      "Facebook",
      "Instagram",
      "Youtube",
      "Pinterest",
      "LinkedIn",
      "Web",
      "Reddit",
      "TikTok"
    ];
  }

  // Build the source query string
  const sourceStr = availableDataSources.map(source => `"${source}"`).join(" OR ");
  return ` AND source:(${sourceStr})`;
};


const buildQueryString = async (topicId, isScadUser, selectedTab, req, sources = 'All') => {
  const topicData = await prisma.customer_topics.findUnique({
    where: { topic_id: Number(topicId) },
  });

  if (!topicData) return "";

  let inVal = "";
  let tpkUrls = "";
  let searchStr = "";

  // Process hashtags
  const htags = topicData?.topic_hash_tags
    ?.split("|")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
  htags?.forEach((tag) => {
    inVal += `'${tag}',`;
  });

  // Process keywords
  const keywords = topicData?.topic_keywords
    ?.split(",")
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword !== "");
  keywords?.forEach((keyword) => {
    inVal += `'${keyword}',`;
  });

  // Process URLs
  if (topicData.topic_urls) {
    const tUrls = topicData.topic_urls
      .split("|")
      .map((url) => url.trim())
      .filter((url) => url !== "");
    tUrls.forEach((url) => {
      if (selectedTab == "GOOGLE") {
        if (url.includes("google")) {
          inVal += `'${url}',`;
          tpkUrls += `"${url}" OR `;
        }
      } else {
        if (!url.includes("google")) {
          inVal += `'${url}',`;
          tpkUrls += `"${url}" OR `;
        }
      }
    });
  }

  searchStr = inVal.slice(0, -1).replace(/'/g, "");
  let strArray = searchStr.split(",");
  if (isScadUser == "true") {
    if (selectedTab === "GOOGLE") {
      strArray = strArray.filter((tag) => tag.toLowerCase().includes("google"));
    } else {
      strArray = strArray.filter(
        (tag) => !tag.toLowerCase().includes("google")
      );
    }
  }
  let strToSearch = "";
  strArray.forEach((str) => {
    strToSearch += `"${str}" OR `;
  });

  if (tpkUrls !== "") {
    strToSearch = `(p_message_text:(${strToSearch.slice(
      0,
      -4
    )}) OR u_fullname:(${strToSearch.slice(
      0,
      -4
    )}) OR u_source:(${tpkUrls.slice(0, -4)}) OR p_url:(${tpkUrls.slice(
      0,
      -4
    )}))`;
  } else {
    if (topicData.topic_gmaps_url && topicData.topic_gmaps_url !== null) {
      strToSearch = `(p_message_text:(${strToSearch.slice(
        0,
        -4
      )}) OR place_url:("${topicData.topic_gmaps_url}"))`;
    } else {
      strToSearch = `p_message_text:(${strToSearch.slice(0, -4)})`;
    }
  }

  // Handle exclusion filters
  if (topicData.topic_exclude_words) {
    const tempStr = topicData.topic_exclude_words
      .split(",")
      .map((word) => word.trim())
      .filter((word) => word !== "");
    let tempExcludeStr = "";
    tempStr.forEach((word) => {
      tempExcludeStr += `"${word}" OR `;
    });
    strToSearch += ` AND NOT p_message_text:(${tempExcludeStr.slice(0, -4)})`;
  }

  if (topicData.topic_exclude_accounts) {
    const tempStr = topicData.topic_exclude_accounts
      .split(",")
      .map((account) => account.trim())
      .filter((account) => account !== "");
    let tempExcludeStr = "";
    tempStr.forEach((account) => {
      tempExcludeStr += `"${account}" OR `;
    });
    strToSearch += ` AND NOT u_username:(${tempExcludeStr.slice(
      0,
      -4
    )}) AND NOT u_source:(${tempExcludeStr.slice(0, -4)})`;
  }

  if (topicData.topic_data_source) {
    const tempStr = topicData.topic_data_source
      .split(",")
      .map((source) => source.trim())
      .filter((source) => source !== "");
    let tempSourceStr = "";
    tempStr.forEach((source) => {
      tempSourceStr += `"${source}" OR `;
    });
    strToSearch += ` AND source:(${tempSourceStr.slice(0, -4)})`;
  }

  if (topicData.topic_data_location) {
    const tempStr = topicData.topic_data_location
      .split(",")
      .map((location) => location.trim())
      .filter((location) => location !== "");
    let tempLocationStr = "";
    tempStr.forEach((location) => {
      tempLocationStr += `"${location}" OR `;
    });
    strToSearch += ` AND u_location:(${tempLocationStr.slice(0, -4)})`;
  }

  if (topicData.topic_data_lang) {
    const tempStr = topicData.topic_data_lang
      .split(",")
      .map((lang) => lang.trim())
      .filter((lang) => lang !== "");
    let tempLangStr = "";
    tempStr.forEach((lang) => {
      tempLangStr += `"${lang}" OR `;
    });
    strToSearch += ` AND lange_detect:(${tempLangStr.slice(0, -4)})`;
  }

  // Additional filters
  strToSearch += ` AND NOT source:("DM") AND NOT manual_entry_type:("review")`;


  return strToSearch;
};

const elasticSearchCount = async (params) => {
  try {
    // Elasticsearch `_count` API call
    const response = await elasticClient.count({
      index: process.env.ELASTICSEARCH_DEFAULTINDEX, // Specify the default index here
      body: params.body, // Query body
    });
    return response;
  } catch (error) {
    console.error("Elasticsearch count error:", error);
    throw error;
  }
};

const elasticMentionQueryTemplate = (topicQueryString, gte, lte) => ({
  query: {
    bool: {
      must: [
        { query_string: { query: topicQueryString } },
        {
          range: {
            p_created_time: { gte: gte, lte: lte },
          },
        },
      ],
    },
  },

 
});

const getActionRequired = async (
  fromDate,
  toDate,
  topicQueryString,
  sentimentType,
  categoryData
) => {
  const query = {
    size: 0,
    query: {
      bool: {
        must: [
          { query_string: { query: topicQueryString } },
          {
            range: {
              p_created_time: {
                gte: fromDate || "now-90d",
                lte: toDate || "now",
              },
            },
          },
        ],
        must_not: [{ term: { "llm_mention_action.keyword": "" } }],
      },
    },
    aggs: {
      top_actions: {
        terms: { field: "llm_mention_action.keyword", size: 7 },
        aggs: {
          sources: {
            terms: { field: "source.keyword", size: 15 },
          },
        },
      },
    },
  };

  if (sentimentType && sentimentType != "") {
    query.query.bool.must.push({
      match: {
        predicted_sentiment_value: sentimentType.trim(),
      },
    });
  }

  // Add category filters to the query
  if (Object.keys(categoryData).length > 0) {
    const categoryFilters = [];
    
    Object.values(categoryData).forEach(data => {
      if (data.keywords && data.keywords.length > 0) {
        data.keywords.forEach(keyword => {
          categoryFilters.push({
            multi_match: {
              query: keyword,
              fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
              type: 'phrase'
            }
          });
        });
      }
      if (data.hashtags && data.hashtags.length > 0) {
        data.hashtags.forEach(hashtag => {
          categoryFilters.push({
            multi_match: {
              query: hashtag,
              fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
              type: 'phrase'
            }
          });
        });
      }
      if (data.urls && data.urls.length > 0) {
        data.urls.forEach(url => {
          categoryFilters.push({
            multi_match: {
              query: url,
              fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
              type: 'phrase'
            }
          });
        });
      }
    });

    if (categoryFilters.length > 0) {
      query.query.bool.must.push({
        bool: {
          should: categoryFilters,
          minimum_should_match: 1
        }
      });
    }
  }

  const result = await elasticClient.search({
    index: process.env.ELASTICSEARCH_DEFAULTINDEX,
    body: query,
  });

  // List of all sources to ensure they appear in output
  const allSources = [
    "twitterContent",
    "facebookContent",
    "instagramContent",
    "youtubeContent",
    "pinterestContent",
    "redditContent",
    "linkedInContent",
    "webContent",
  ];

  let responseOutput = {};
  result.aggregations.top_actions.buckets.forEach((action) => {
    let actionData = {};

    // ✅ Set default values for all sources (0)
    allSources.forEach((source) => {
      actionData[source] = 0;
    });

    action.sources.buckets.forEach((source) => {
      let keyName = `${source.key.toLowerCase()}Content`;

      // ✅ If source is "FakeNews", "News", "Blogs", or "Web", map it to "webContent"
      if (
        ["fakenews", "news", "blogs", "web"].includes(source.key.toLowerCase())
      ) {
        keyName = "webContent";
      }

      if (["Linkedin", "LinkedIn"].includes(source.key.toLowerCase())) {
        keyName = "linkedInContent";
      }

      // ✅ Assign actual count from Elasticsearch, if available
      actionData[keyName] = source.doc_count;
    });

    responseOutput[action.key] = actionData;
  });

  return { query,responseOutput };
};

const getPosts = async (
  fromDate,
  toDate,
  topicQueryString,
  sentimentType,
  field,
  type,
  value,
  interval,
  res,
  source,
  llm_mention_type,
  req
) => {


  const query = {
    size: 30,
    query: {
      bool: {
        must: [
          { query_string: { query: topicQueryString } },
          {
            range: {
              p_created_time: {
                gte: fromDate || "now-90d",
                lte: toDate || "now",
              },
            },
          },
        ],
      },
    },
    sort: [{ p_created_time: { order: "desc" } }],
  };

  if (field == "llm_mention_action") {
    query.query.bool.must.push({
      term: { "llm_mention_action.keyword": type },
    });
  } else if (field == "llm_mention_type") {
    query.query.bool.must.push({ term: { "llm_mention_type.keyword": type } });
  } else if (field == "llm_mention_recurrence") {
    query.query.bool.must.push({
      term: { "llm_mention_recurrence.keyword": type },
    });
  } else if (field == "llm_mention_urgency") {
    query.query.bool.must.push({
      term: { "llm_mention_urgency.keyword": type },
    });
  } else if (field === "product_ref_ind") {
    query.query.bool.must.push(
      { term: { "product_ref_ind.keyword": type } },
      { term: { "llm_mention_type.keyword": "Complaint" } }
    );
  } else if (field === "llm_mention_audience && llm_mention_type") {
    query.query.bool.must.push(
      { term: { "llm_mention_audience.keyword": value } },
      { term: { "llm_mention_type.keyword": type } }
    );
  } else if (field == "llm_highest_risk_type && customer_journey") {
    query.query.bool.must.push(
      { term: { "llm_highest_risk_type.keyword": value } },
      { term: { "customer_journey.keyword": type } }
    );
  } else if (
    field === "customer_journey && llm_mention_audience && llm_mention_type"
  ) {
    query.query.bool.must.push({ term: { "customer_journey.keyword": value } });
    query.query.bool.must.push({
      term: { "llm_mention_audience.keyword": type },
    });
    query.query.bool.must.push({
      terms: {
        "llm_mention_type.keyword": [
          "Complaint",
          "Customer Complaint",
          "Criticism",
        ],
      },
    });
  } else if (field === "migration_topics") {
    query.query.bool.must.push({
      match_phrase: {
        migration_topics: `${type}`,
      },
    });
    // sentimentType = null;
  } else if (field === "trust_dimensions") {
  query.query.bool.must.push({
  term: {
    "trust_dimensions.keyword": `{"${type}": "${value}"}`,
  },
});
    // sentimentType = null;
  } else if (field === "llm_core_insights.event_type") {
    query.query.bool.must.push({
      match_phrase: {
        "llm_core_insights.event_type": `${type}`,
      },
    });
  } else if (field === "llm_motivation.word_cloud_phrases") {
    const phaseCondition =
      type === "exhibition_days"
        ? {
            terms: {
              "llm_motivation.phase.keyword": [
                "day1",
                "day2",
                "day3",
                "day4",
                "day5",
              ],
            },
          }
        : {
            term: {
              "llm_motivation.phase.keyword": `${type}`,
            },
          };

    query.query.bool.must.push(
      {
        term: {
          "llm_motivation.word_cloud_phrases.keyword": `${value}`,
        },
      },
      phaseCondition
    );
  } else if (field === "llm_motivation.phase") {
    query.query.bool.must.push({
      term: {
        "llm_motivation.phase": `${type}`,
      },
    });
  } else {
    query.query.bool.must.push({
      term: { [`${field}.keyword`]: type },
    });
  }

  if (sentimentType && sentimentType != "" && sentimentType != "undefined") {
    query.query.bool.must.push({
      match: {
        predicted_sentiment_value: sentimentType.trim(),
      },
    });
  }

  // Apply LLM Mention Type filter if provided
  if (
    llm_mention_type != "" &&
    llm_mention_type &&
    Array.isArray(llm_mention_type) &&
    llm_mention_type.length > 0
  ) {
    const mentionTypeFilter = {
      bool: {
        should: llm_mention_type.map((type) => ({
          match: { llm_mention_type: type },
        })),
        minimum_should_match: 1,
      },
    };
    query.query.bool.must.push(mentionTypeFilter);
  }

  // Normalize the input
  const mentionTypesArray =
    typeof llm_mention_type === "string"
      ? llm_mention_type.split(",").map((s) => s.trim())
      : llm_mention_type;

  // Apply LLM Mention Type filter if provided
  if (
    llm_mention_type != "" &&
    mentionTypesArray &&
    Array.isArray(mentionTypesArray) &&
    mentionTypesArray.length > 0
  ) {
    const mentionTypeFilter = {
      bool: {
        should: mentionTypesArray.map((type) => ({
          match: { llm_mention_type: type },
          // If it's keyword type:
          // term: { "llm_mention_type.keyword": type }
        })),
        minimum_should_match: 1,
      },
    };

    query.query.bool.must.push(mentionTypeFilter);
  }

  const results = await elasticClient.search({
    index: process.env.ELASTICSEARCH_DEFAULTINDEX,
    body: query,
  });

  let responseArray = [];
  for (let l = 0; l < results?.hits?.hits?.length; l++) {
    let esData = results?.hits?.hits[l];
    let user_data_string = "";
    let profilePic = esData._source.u_profile_photo
      ? esData._source.u_profile_photo
      : `${process?.env?.PUBLIC_IMAGES_PATH}grey.png`;
    let followers =
      esData._source.u_followers > 0 ? `${esData._source.u_followers}` : "";
    let following =
      esData._source.u_following > 0 ? `${esData._source.u_following}` : "";
    let posts = esData._source.u_posts > 0 ? `${esData._source.u_posts}` : "";
    let likes = esData._source.p_likes > 0 ? `${esData._source.p_likes}` : "";
    let llm_emotion = esData._source.llm_emotion || "";
    let commentsUrl =
      esData._source.p_comments_text &&
        esData._source.p_comments_text.trim() !== ""
        ? `${esData._source.p_url.trim().replace("https: // ", "https://")}`
        : "";
    let comments = `${esData._source.p_comments}`;
    let shares =
      esData._source.p_shares > 0 ? `${esData._source.p_shares}` : "";
    let engagements =
      esData._source.p_engagement > 0 ? `${esData._source.p_engagement}` : "";
    let content =
      esData._source.p_content && esData._source.p_content.trim() !== ""
        ? `${esData._source.p_content}`
        : "";
    let imageUrl =
      esData._source.p_picture_url && esData._source.p_picture_url.trim() !== ""
        ? `${esData._source.p_picture_url}`
        : `${process?.env?.PUBLIC_IMAGES_PATH}grey.png`;
    let predicted_sentiment = "";
    let predicted_category = "";

    // Check if the record was manually updated, if yes, use it
    const chk_senti = await prisma.customers_label_data.findMany({
      where: {
        p_id: esData._id,
      },
      orderBy: {
        label_id: "desc",
      },
      take: 1,
    });

    if (chk_senti.length > 0) {
      if (chk_senti[0]?.predicted_sentiment_value_requested)
        predicted_sentiment = `${chk_senti[0]?.predicted_sentiment_value_requested}`;
    } else if (
      esData._source.predicted_sentiment_value &&
      esData._source.predicted_sentiment_value !== ""
    ) {
      predicted_sentiment = `${esData._source.predicted_sentiment_value}`;
    }

    // Category prediction
    if (esData._source.predicted_category) {
      predicted_category = esData._source.predicted_category;
    }
    let youtubeVideoUrl = "";
    let profilePicture2 = "";
    //const token = await getCsrfToken()
    if (esData._source.source === "Youtube") {
      if (
        esData._source.video_embed_url &&
        esData._source.video_embed_url !== ""
      )
        youtubeVideoUrl = `${esData._source.video_embed_url}`;
      else if (esData._source.p_id && esData._source.p_id !== "")
        youtubeVideoUrl = `https://www.youtube.com/embed/${esData._source.p_id}`;
    } else {
      if (esData._source.p_picture) {
        profilePicture2 = `${esData._source.p_picture}`;
      } else {
        profilePicture2 = "";
      }
    }
    // Handle other sources if needed

    let sourceIcon = "";

    const userSource = esData._source.source;
    if (
      userSource == "khaleej_times" ||
      userSource == "Omanobserver" ||
      userSource == "Time of oman" ||
      userSource == "Blogs"
    ) {
      sourceIcon = "Blog";
    } else if (userSource == "Reddit") {
      sourceIcon = "Reddit";
    } else if (userSource == "FakeNews" || userSource == "News") {
      sourceIcon = "News";
    } else if (userSource == "Tumblr") {
      sourceIcon = "Tumblr";
    } else if (userSource == "Vimeo") {
      sourceIcon = "Vimeo";
    } else if (userSource == "Web" || userSource == "DeepWeb") {
      sourceIcon = "Web";
    } else {
      sourceIcon = userSource;
    }

    let message_text = "";

    if (
      esData._source.source === "GoogleMaps" ||
      esData._source.source === "Tripadvisor"
    ) {
      let m_text = esData._source.p_message_text.split("***|||###");
      message_text = m_text[0].replace(/\n/g, "<br>");
    } else {
      message_text = esData._source.p_message_text
        ? esData._source.p_message_text.replace(/<\/?[^>]+(>|$)/g, "")
        : "";
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
      created_at: new Date(esData._source.p_created_time).toLocaleString(), 
      p_comments_data:esData._source.p_comments_data,
    };

    responseArray.push(cardData);
  }

  // Determine which category data to use
  let categoryData = {};
  
  if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
    categoryData = processCategoryItems(req.body.categoryItems);
  } else {
    // Fall back to middleware data
    categoryData = req.processedCategories || {};
  }

  // Gather all filter terms from category data
  let allFilterTerms = [];
  if (categoryData && Object.keys(categoryData).length > 0) {
    Object.values(categoryData).forEach((data) => {
      if (data.keywords && data.keywords.length > 0) allFilterTerms.push(...data.keywords);
      if (data.hashtags && data.hashtags.length > 0) allFilterTerms.push(...data.hashtags);
      if (data.urls && data.urls.length > 0) allFilterTerms.push(...data.urls);
    });
  }
  // For each post in responseArray, add matched_terms
  if (responseArray && Array.isArray(responseArray)) {
    responseArray.forEach((post, idx) => {
      const textFields = [
        post.message_text,
        post.content,
        post.keywords,
        post.title,
        post.hashtags,
        post.uSource,
        post.source,
        post.p_url,
        post.userFullname
      ];
      responseArray[idx] = {
        ...post,
        matched_terms: allFilterTerms.filter(term =>
          textFields.some(field => {
            if (!field) return false;
            if (Array.isArray(field)) {
              return field.some(f => typeof f === 'string' && f.toLowerCase().includes(term.toLowerCase()));
            }
            return typeof field === 'string' && field.toLowerCase().includes(term.toLowerCase());
          })
        )
      };
    });
  }

  if (value && value > 0 && results?.hits?.hits?.length > parseInt(value)) {
    responseArray = responseArray.slice(0, parseInt(value));
  }
  return res.status(200).json({
    success: true,
    responseArray,
    total: responseArray.length || 0,
    results,
    query,
  });
};

function getFrequency(fromDate, toDate) {
  if (!fromDate || !toDate) return "monthly";

  const start = new Date(fromDate);
  const end = new Date(toDate);

  const diffInDays = (end - start) / (1000 * 60 * 60 * 24);
  const diffInMonths =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());

  if (diffInDays <= 7) {
    return "daily";
  } else if (diffInMonths >= 12) {
    return "yearly";
  } else {
    return "monthly";
  }
}

/**
 * Format post data for language mentions
 * @param {Object} hit - Elasticsearch document hit
 * @returns {Object} Formatted post data
 */
const formatPostDataForLanguage = (hit, req) => {


  // Determine which category data to use
  let categoryData = {};
  
  if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
    categoryData = processCategoryItems(req.body.categoryItems);
  } else {
    // Fall back to middleware data
    categoryData = req.processedCategories || {};
  }

  let allFilterTerms = [];
  if (categoryData && Object.keys(categoryData).length > 0) {
    Object.values(categoryData).forEach((data) => {
      if (data.keywords && data.keywords.length > 0) allFilterTerms.push(...data.keywords);
      if (data.hashtags && data.hashtags.length > 0) allFilterTerms.push(...data.hashtags);
      if (data.urls && data.urls.length > 0) allFilterTerms.push(...data.urls);
    });
  } else {
    allFilterTerms = [];
  } 

  const source = hit._source;

  // Use a default image if a profile picture is not provided
  const profilePic =
    source.u_profile_photo || `${process?.env?.PUBLIC_IMAGES_PATH}grey.png`;

  // Social metrics
  const followers = source.u_followers > 0 ? `${source.u_followers}` : "";
  const following = source.u_following > 0 ? `${source.u_following}` : "";
  const posts = source.u_posts > 0 ? `${source.u_posts}` : "";
  const likes = source.p_likes > 0 ? `${source.p_likes}` : "";

  // Emotion
  const llm_emotion = source.llm_emotion || "";

  // Clean up comments URL if available
  const commentsUrl =
    source.p_comments_text && source.p_comments_text.trim() !== ""
      ? source.p_url.trim().replace("https: // ", "https://")
      : "";

  const comments = `${source.p_comments || 0}`;
  const shares = source.p_shares > 0 ? `${source.p_shares}` : "";
  const engagements = source.p_engagement > 0 ? `${source.p_engagement}` : "";

  const content =
    source.p_content && source.p_content.trim() !== "" ? source.p_content : "";
  const imageUrl =
    source.p_picture_url && source.p_picture_url.trim() !== ""
      ? source.p_picture_url
      : `${process?.env?.PUBLIC_IMAGES_PATH}grey.png`;

  // Determine sentiment
  let predicted_sentiment = "";
  let predicted_category = "";

  if (source.predicted_sentiment_value)
    predicted_sentiment = `${source.predicted_sentiment_value}`;

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
    language: source.llm_language, // Include the detected language
  };
};

const mentionsChartController = {
  actionRequiredMentions: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType, categoryItems, sources } = req.body;

      // Determine which category data to use
      let categoryData = {};
      if (categoryItems && Array.isArray(categoryItems) && categoryItems.length > 0) {
        categoryData = processCategoryItems(categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      const isScadUser = false;
      const selectedTab = "Social";

      // Validate and filter sources against available data sources
      const availableDataSources = req.processedDataSources || [];
      const validatedSources = sources ? normalizeSourceInput(sources).filter(src =>
        availableDataSources.includes(src) || availableDataSources.length === 0
      ) : [];

      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      if (topicQueryString == "") {
        return res.status(200).json({ responseOutput: {} });
      }

      topicQueryString = `${topicQueryString}${buildSourceQueryString(req, validatedSources)}`;


 
      // Fetch mention actions in **one** query
      const response = await getActionRequired(
        fromDate,
        toDate,
        topicQueryString,
        sentimentType,
        categoryData,
      );

      return res.status(200).json(response);
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  typeofMentions: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType, categoryItems, sources } = req.body;

      // Determine which category data to use
      let categoryData = {};
      if (categoryItems && Array.isArray(categoryItems) && categoryItems.length > 0) {
        categoryData = processCategoryItems(categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      const isScadUser = false;
      const selectedTab = "Social";

      // Validate and filter sources against available data sources
      const availableDataSources = req.processedDataSources || [];
      const validatedSources = sources ? normalizeSourceInput(sources).filter(src =>
        availableDataSources.includes(src) || availableDataSources.length === 0
      ) : [];

      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      if (topicQueryString == "") {
        return res.status(200).json({ responseOutput: {} });
      }
      if (topicId && parseInt(topicId) === 2619) {
        topicQueryString = `${topicQueryString} AND source:("LinkedIn" OR "Linkedin")`;
      }
      // Apply special topic source filtering
      else if (isSpecialTopic) {
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook")`;
      } else {
        topicQueryString = `${topicQueryString}${buildSourceQueryString(req, validatedSources)}`;
      }



      // **Single Aggregation Query**
      const query = {
        size: 0,
        query: {
          bool: {
            must: [
              { query_string: { query: topicQueryString } },
              {
                range: {
                  p_created_time: {
                    gte: fromDate || "now-90d",
                    lte: toDate || "now",
                  },
                },
              },
            ],

            must_not: [{ term: { "llm_mention_type.keyword": "" } }],
          },
        },
        aggs: {
          mention_types: {
            terms: { field: "llm_mention_type.keyword", size: 7 },
            aggs: {
              sources: {
                terms: { field: "source.keyword", size: 15 },
              },
            },
          },
        },
      };

      if (sentimentType && sentimentType != "") {
        query.query.bool.must.push({
          match: {
            predicted_sentiment_value: sentimentType.trim(),
          },
        });
      }

      // Add category filters to the query
      if (Object.keys(categoryData).length > 0) {
        const categoryFilters = [];
        Object.values(categoryData).forEach(data => {
          if (data.keywords && data.keywords.length > 0) {
            data.keywords.forEach(keyword => {
              categoryFilters.push({
                multi_match: {
                  query: keyword,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
          if (data.hashtags && data.hashtags.length > 0) {
            data.hashtags.forEach(hashtag => {
              categoryFilters.push({
                multi_match: {
                  query: hashtag,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
          if (data.urls && data.urls.length > 0) {
            data.urls.forEach(url => {
              categoryFilters.push({
                multi_match: {
                  query: url,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
        });
        if (categoryFilters.length > 0) {
          query.query.bool.must.push({
            bool: {
              should: categoryFilters,
              minimum_should_match: 1
            }
          });
        }
      }

      // Execute query
      const result = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: query,
      });

      // Define all possible sources (ensures consistency)
      const allSources = [
        "twitterContent",
        "facebookContent",
        "instagramContent",
        "youtubeContent",
        "pinterestContent",
        "redditContent",
        "linkedinContent",
        "webContent",
      ];

      let responseOutput = {};
      result.aggregations.mention_types.buckets.forEach((mention) => {
        let mentionData = {};

        // ✅ Set all sources to `0` initially to ensure all are present
        allSources.forEach((source) => {
          mentionData[source] = 0;
        });

        mention.sources.buckets.forEach((source) => {
          let keyName = `${source.key.toLowerCase()}Content`;

          // ✅ If source is "FakeNews", "News", "Blogs", "Web", map it to "webContent"
          if (
            ["fakenews", "news", "blogs", "web"].includes(
              source.key.toLowerCase()
            )
          ) {
            keyName = "webContent";
          }

          if (["Linkedin", "LinkedIn"].includes(source.key.toLowerCase())) {
            keyName = "linkedinContent";
          }

          // ✅ Assign actual count from Elasticsearch
          mentionData[keyName] = source.doc_count;
        });

        responseOutput[mention.key] = mentionData;
      });

      return res.status(200).json({ responseOutput, result });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  entities: async (req, res) => {
    try {
      const {
        fromDate,
        toDate,
        subtopicId,
        topicId,
        sentimentType,
        sources,
        categoryItems
      } = req.body;

      // Determine which category data to use
      let categoryData = {};
      if (categoryItems && Array.isArray(categoryItems) && categoryItems.length > 0) {
        categoryData = processCategoryItems(categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      const isScadUser = false;
      const selectedTab = "Social";

      // Validate and filter sources against available data sources
      const availableDataSources = req.processedDataSources || [];
      const validatedSources = sources ? normalizeSourceInput(sources).filter(src =>
        availableDataSources.includes(src) || availableDataSources.length === 0
      ) : [];

      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );
      if (parseInt(topicId) === 2619) {
        topicQueryString = `${topicQueryString} AND source:("LinkedIn" OR "Linkedin")`;
        // Apply special topic source filtering
      }
      // Apply special topic source filtering
      else if (validatedSources && validatedSources.length > 0) {
        topicQueryString = `${topicQueryString}${buildSourceQueryString(req, validatedSources)}`;
      } else {
        topicQueryString = `${topicQueryString}${buildSourceQueryString(req)}`;
      }


      const params = {
        size: 0,
        query: {
          bool: {
            must: [
              {
                query_string: {
                  query: topicQueryString,
                  analyze_wildcard: true,
                },
              },
              {
                range: {
                  p_created_time: {
                    gte: fromDate || "now-90d",
                    lte: toDate || "now",
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
        },
        aggs: {
          llm_entities_organization: {
            terms: {
              field: "llm_entities.Organization.keyword",
              size: 10,
            },
          },
        },
      };

      if (sentimentType && sentimentType != "") {
        params.query.bool.must.push({
          match: {
            predicted_sentiment_value: sentimentType.trim(),
          },
        });
      }

      // Add category filters to the query
      if (Object.keys(categoryData).length > 0) {
        const categoryFilters = [];
        
        Object.values(categoryData).forEach(data => {
          if (data.keywords && data.keywords.length > 0) {
            data.keywords.forEach(keyword => {
              categoryFilters.push({
                multi_match: {
                  query: keyword,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
          if (data.hashtags && data.hashtags.length > 0) {
            data.hashtags.forEach(hashtag => {
              categoryFilters.push({
                multi_match: {
                  query: hashtag,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
          if (data.urls && data.urls.length > 0) {
            data.urls.forEach(url => {
              categoryFilters.push({
                multi_match: {
                  query: url,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
        });

        if (categoryFilters.length > 0) {
          params.query.bool.must.push({
            bool: {
              should: categoryFilters,
              minimum_should_match: 1
            }
          });
        }
      }

      const response = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: params,
      });

      const entitiesData =
        response?.aggregations?.llm_entities_organization?.buckets || [];

      return res.status(200).json({ entitiesData });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  recurrenceMentions: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType, categoryItems, sources } = req.body;

      // Determine which category data to use
      let categoryData = {};
      if (categoryItems && Array.isArray(categoryItems) && categoryItems.length > 0) {
        categoryData = processCategoryItems(categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      // Validate and filter sources against available data sources
      const availableDataSources = req.processedDataSources || [];
      const validatedSources = sources ? normalizeSourceInput(sources).filter(src =>
        availableDataSources.includes(src) || availableDataSources.length === 0
      ) : [];

      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );
      if (parseInt(topicId) === 2619) {
        topicQueryString = `${topicQueryString} AND source:("LinkedIn" OR "Linkedin")`;
        // Apply special topic source filtering
      }
      // Apply special topic source filtering
      topicQueryString = `${topicQueryString}${buildSourceQueryString(req)}`;


   
      // **Single Aggregation Query**
      const query = {
        size: 0,
        query: {
          bool: {
            must: [
              { query_string: { query: topicQueryString } },
              {
                range: {
                  p_created_time: {
                    gte: fromDate || "now-90d",
                    lte: toDate || "now",
                  },
                },
              },
            ],
            must_not: [{ term: { "llm_mention_recurrence.keyword": "" } }],
          },
        },
        aggs: {
          recurrence_types: {
            terms: { field: "llm_mention_recurrence.keyword", size: 7 },
          },
        },
      };
           // Add category filters to the query
           if (Object.keys(categoryData).length > 0) {
            const categoryFilters = [];
            Object.values(categoryData).forEach(data => {
              if (data.keywords && data.keywords.length > 0) {
                data.keywords.forEach(keyword => {
                  categoryFilters.push({
                    multi_match: {
                      query: keyword,
                      fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                      type: 'phrase'
                    }
                  });
                });
              }
              if (data.hashtags && data.hashtags.length > 0) {
                data.hashtags.forEach(hashtag => {
                  categoryFilters.push({
                    multi_match: {
                      query: hashtag,
                      fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                      type: 'phrase'
                    }
                  });
                });
              }
              if (data.urls && data.urls.length > 0) {
                data.urls.forEach(url => {
                  categoryFilters.push({
                    multi_match: {
                      query: url,
                      fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                      type: 'phrase'
                    }
                  });
                });
              }
            });
            if (categoryFilters.length > 0) {
              query.query.bool.must.push({
                bool: {
                  should: categoryFilters,
                  minimum_should_match: 1
                }
              });
            }
          }

      if (sentimentType && sentimentType != "") {
        query.query.bool.must.push({
          match: {
            predicted_sentiment_value: sentimentType.trim(),
          },
        });
      }

      // Execute query
      const result = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: query,
      });

      // Convert array into object format
      let influencersCoverage = {};
      result.aggregations.recurrence_types.buckets.forEach((bucket) => {
        influencersCoverage[bucket.key] = bucket.doc_count;
      });

      return res.status(200).json({ influencersCoverage });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  urgencyMentions: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType, categoryItems, sources } = req.body;

      // Determine which category data to use
      let categoryData = {};
      if (categoryItems && Array.isArray(categoryItems) && categoryItems.length > 0) {
        categoryData = processCategoryItems(categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      // Validate and filter sources against available data sources
      const availableDataSources = req.processedDataSources || [];
      const validatedSources = sources ? normalizeSourceInput(sources).filter(src =>
        availableDataSources.includes(src) || availableDataSources.length === 0
      ) : [];

      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      if (topicQueryString == "") {
        return res.status(200).json({ responseOutput: {} });
      }
      // Apply special topic source filtering
      topicQueryString = `${topicQueryString}${buildSourceQueryString(req)}`;




      // **Single Aggregation Query for Dynamic Urgency Levels**
      const query = {
        size: 0,
        query: {
          bool: {
            must: [
              { query_string: { query: topicQueryString } },
              {
                range: {
                  p_created_time: {
                    gte: fromDate || "now-90d",
                    lte: toDate || "now",
                  },
                },
              },
            ],
            must_not: [{ term: { "llm_mention_urgency.keyword": "" } }],
          },
        },
        aggs: {
          urgency_levels: {
            terms: { field: "llm_mention_urgency.keyword", size: 7 },
          },
        },
      };

           // Add category filters to the query
           if (Object.keys(categoryData).length > 0) {
            const categoryFilters = [];
            Object.values(categoryData).forEach(data => {
              if (data.keywords && data.keywords.length > 0) {
                data.keywords.forEach(keyword => {
                  categoryFilters.push({
                    multi_match: {
                      query: keyword,
                      fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                      type: 'phrase'
                    }
                  });
                });
              }
              if (data.hashtags && data.hashtags.length > 0) {
                data.hashtags.forEach(hashtag => {
                  categoryFilters.push({
                    multi_match: {
                      query: hashtag,
                      fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                      type: 'phrase'
                    }
                  });
                });
              }
              if (data.urls && data.urls.length > 0) {
                data.urls.forEach(url => {
                  categoryFilters.push({
                    multi_match: {
                      query: url,
                      fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                      type: 'phrase'
                    }
                  });
                });
              }
            });
            if (categoryFilters.length > 0) {
              query.query.bool.must.push({
                bool: {
                  should: categoryFilters,
                  minimum_should_match: 1
                }
              });
            }
          }

      if (sentimentType && sentimentType != "") {
        query.query.bool.must.push({
          match: {
            predicted_sentiment_value: sentimentType.trim(),
          },
        });
      }
      // Execute query
      const result = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: query,
      });

      // Convert dynamic results into required format
      let responseOutput = [];
      let totalSentiments = 0;

      result.aggregations.urgency_levels.buckets.forEach((bucket) => {
        responseOutput.push(`${bucket.key},${bucket.doc_count}`);
        totalSentiments += bucket.doc_count;
      });

      return res
        .status(200)
        .json({ responseOutput: responseOutput.join("|"), totalSentiments });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  audienceMentions: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType, categoryItems, sources } = req.body;

      // Determine which category data to use
      let categoryData = {};
      if (categoryItems && Array.isArray(categoryItems) && categoryItems.length > 0) {
        categoryData = processCategoryItems(categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      // Check if this is the special topicId
      // Validate and filter sources against available data sources
      const availableDataSources = req.processedDataSources || [];
      const validatedSources = sources ? normalizeSourceInput(sources).filter(src =>
        availableDataSources.includes(src) || availableDataSources.length === 0
      ) : [];

      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      if (parseInt(topicId) === 2619) {
        topicQueryString = `${topicQueryString} AND source:("LinkedIn" OR "Linkedin")`;
        // Apply special topic source filtering
      }
      // Apply special topic source filtering
      topicQueryString = `${topicQueryString}${buildSourceQueryString(req)}`;



      // **Single Aggregation Query for Dynamic Urgency Levels**
      const query = {
        size: 1000,
        query: {
          bool: {
            must: [
              { query_string: { query: topicQueryString } },
              {
                range: {
                  p_created_time: {
                    gte: fromDate || "now-90d",
                    lte: toDate || "now",
                  },
                },
              },
            ],
            must_not: [{ term: { "llm_mention_audience.keyword": "" } }],
          },
        },
        aggs: {
          llm_mention_audience: {
            terms: { field: "llm_mention_audience.keyword", size: 7 },
          },
        },
      };

           // Add category filters to the query
           if (Object.keys(categoryData).length > 0) {
            const categoryFilters = [];
            Object.values(categoryData).forEach(data => {
              if (data.keywords && data.keywords.length > 0) {
                data.keywords.forEach(keyword => {
                  categoryFilters.push({
                    multi_match: {
                      query: keyword,
                      fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                      type: 'phrase'
                    }
                  });
                });
              }
              if (data.hashtags && data.hashtags.length > 0) {
                data.hashtags.forEach(hashtag => {
                  categoryFilters.push({
                    multi_match: {
                      query: hashtag,
                      fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                      type: 'phrase'
                    }
                  });
                });
              }
              if (data.urls && data.urls.length > 0) {
                data.urls.forEach(url => {
                  categoryFilters.push({
                    multi_match: {
                      query: url,
                      fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                      type: 'phrase'
                    }
                  });
                });
              }
            });
            if (categoryFilters.length > 0) {
              query.query.bool.must.push({
                bool: {
                  should: categoryFilters,
                  minimum_should_match: 1
                }
              });
            }
          }

      if (sentimentType && sentimentType != "") {
        query.query.bool.must.push({
          match: {
            predicted_sentiment_value: sentimentType.trim(),
          },
        });
      }
      // Execute query
      const result = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: query,
      });

      // Convert array into object format
      let influencersCoverage = {};
      result.aggregations.llm_mention_audience.buckets.forEach((bucket) => {
        influencersCoverage[bucket.key] = bucket.doc_count;
      });

      return res.status(200).json({ influencersCoverage, result });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  audienceMentionsAcrossMentionType: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType, categoryItems, sources } = req.body;

      // Determine which category data to use
      let categoryData = {};
      if (categoryItems && Array.isArray(categoryItems) && categoryItems.length > 0) {
        categoryData = processCategoryItems(categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      const isScadUser = false;
      const selectedTab = "Social";

      // Build the base query string for topic
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );
      if (topicQueryString == "") {
        return res.status(200).json({
          data: [],
          totalAudiences: 0,
          query: {},
        });
      }
      if (parseInt(topicId) === 2619) {
        topicQueryString = `${topicQueryString} AND source:("LinkedIn" OR "Linkedin")`;
        // Apply special topic source filtering
      }
      // Apply special topic source filtering
      topicQueryString = `${topicQueryString}${buildSourceQueryString(req)}`;




      // Elasticsearch query
      const query = {
        size: 0,
        query: {
          bool: {
            must: [
              { query_string: { query: topicQueryString } },
              {
                range: {
                  p_created_time: {
                    gte: fromDate || "now-90d",
                    lte: toDate || "now",
                  },
                },
              },
            ],
            must_not: [{ term: { "llm_mention_audience.keyword": "" } }],
          },
        },
        aggs: {
          audience_group: {
            terms: {
              field: "llm_mention_audience.keyword",
              size: 8,
              order: { _count: "desc" },
              exclude: ["Youth"],
            },
            aggs: {
              mention_types: {
                terms: {
                  field: "llm_mention_type.keyword",
                  size: 8,
                  order: { _count: "desc" },
                },
              },
            },
          },
        },
      };

           // Add category filters to the query
           if (Object.keys(categoryData).length > 0) {
            const categoryFilters = [];
            Object.values(categoryData).forEach(data => {
              if (data.keywords && data.keywords.length > 0) {
                data.keywords.forEach(keyword => {
                  categoryFilters.push({
                    multi_match: {
                      query: keyword,
                      fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                      type: 'phrase'
                    }
                  });
                });
              }
              if (data.hashtags && data.hashtags.length > 0) {
                data.hashtags.forEach(hashtag => {
                  categoryFilters.push({
                    multi_match: {
                      query: hashtag,
                      fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                      type: 'phrase'
                    }
                  });
                });
              }
              if (data.urls && data.urls.length > 0) {
                data.urls.forEach(url => {
                  categoryFilters.push({
                    multi_match: {
                      query: url,
                      fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                      type: 'phrase'
                    }
                  });
                });
              }
            });
            if (categoryFilters.length > 0) {
              query.query.bool.must.push({
                bool: {
                  should: categoryFilters,
                  minimum_should_match: 1
                }
              });
            }
          }

      // Optional sentiment filter
      if (sentimentType && sentimentType.trim() !== "") {
        query.query.bool.must.push({
          match: {
            predicted_sentiment_value: sentimentType.trim(),
          },
        });
      }

      // Execute query
      const result = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: query,
      });

      // Format data for frontend
      const formattedData = result.aggregations.audience_group.buckets.map(
        (audienceBucket) => ({
          audience: audienceBucket.key,
          total: audienceBucket.doc_count,
          types: audienceBucket.mention_types.buckets.reduce(
            (acc, typeBucket) => {
              acc[typeBucket.key] = typeBucket.doc_count;
              return acc;
            },
            {}
          ),
        })
      );

      return res.status(200).json({
        data: formattedData,
        totalAudiences: result.aggregations.audience_group.buckets.length,
        query, // Remove this in production
      });
    } catch (error) {
      console.error("Error fetching mention data:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  },

  riskTypeAcrossCustomerJourney: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType, categoryItems, sources } = req.body;

      // Determine which category data to use
      let categoryData = {};
      if (categoryItems && Array.isArray(categoryItems) && categoryItems.length > 0) {
        categoryData = processCategoryItems(categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      const isScadUser = false;
      const selectedTab = "Social";

      // Build the base query string for topic
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      // Apply special topic source filtering
      topicQueryString = `${topicQueryString}${buildSourceQueryString(req)}`;


   

      // Elasticsearch query
      const query = {
        size: 0,
        query: {
          bool: {
            must: [
              { query_string: { query: topicQueryString } },
              {
                range: {
                  p_created_time: {
                    gte: fromDate || "now-90d",
                    lte: toDate || "now",
                  },
                },
              },
            ],
            must_not: [
              { term: { "llm_highest_risk_type.keyword": "" } },
              { term: { "customer_journey.keyword": "" } },
            ],
          },
        },
        aggs: {
          audience_group: {
            terms: {
              field: "llm_highest_risk_type.keyword",
              size: 8,
              order: { _count: "desc" },
            },
            aggs: {
              mention_types: {
                terms: {
                  field: "customer_journey.keyword",
                  size: 8,
                  order: { _count: "desc" },
                  min_doc_count: 1, // Ensures only journeys with at least 1 doc are included
                },
              },
            },
          },
        },
      };

           // Add category filters to the query
           if (Object.keys(categoryData).length > 0) {
            const categoryFilters = [];
            Object.values(categoryData).forEach(data => {
              if (data.keywords && data.keywords.length > 0) {
                data.keywords.forEach(keyword => {
                  categoryFilters.push({
                    multi_match: {
                      query: keyword,
                      fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                      type: 'phrase'
                    }
                  });
                });
              }
              if (data.hashtags && data.hashtags.length > 0) {
                data.hashtags.forEach(hashtag => {
                  categoryFilters.push({
                    multi_match: {
                      query: hashtag,
                      fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                      type: 'phrase'
                    }
                  });
                });
              }
              if (data.urls && data.urls.length > 0) {
                data.urls.forEach(url => {
                  categoryFilters.push({
                    multi_match: {
                      query: url,
                      fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                      type: 'phrase'
                    }
                  });
                });
              }
            });
            if (categoryFilters.length > 0) {
              query.query.bool.must.push({
                bool: {
                  should: categoryFilters,
                  minimum_should_match: 1
                }
              });
            }
          }

      // Optional sentiment filter
      if (sentimentType && sentimentType.trim() !== "") {
        query.query.bool.must.push({
          match: {
            predicted_sentiment_value: sentimentType.trim(),
          },
        });
      }

      // Execute query
      const result = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: query,
      });

      // Format data for frontend
      const formattedData = result.aggregations.audience_group.buckets
        .filter(
          (audienceBucket) =>
            Object.keys(audienceBucket.mention_types.buckets).length > 0
        )
        .map((audienceBucket) => ({
          audience: audienceBucket.key,
          total: audienceBucket.doc_count,
          types: audienceBucket.mention_types.buckets.reduce(
            (acc, typeBucket) => {
              acc[typeBucket.key] = typeBucket.doc_count;
              return acc;
            },
            {}
          ),
        }));

      return res.status(200).json({
        data: formattedData,
        totalAudiences: result.aggregations.audience_group.buckets.length,
        result: result.aggregations,
      });
    } catch (error) {
      console.error("Error fetching mention data:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  },

  complaintsAcrossCustomerJourneyStagesbyAudience: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType, categoryItems, sources } = req.body;

      // Determine which category data to use
      let categoryData = {};
      if (categoryItems && Array.isArray(categoryItems) && categoryItems.length > 0) {
        categoryData = processCategoryItems(categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      const isScadUser = false;
      const selectedTab = "Social";

      // Build base query
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );
      if (parseInt(topicId) === 2619) {
        topicQueryString = `${topicQueryString} AND source:("LinkedIn" OR "Linkedin")`;
        // Apply special topic source filtering
      }
      // Apply special topic source filtering
      topicQueryString = `${topicQueryString}${buildSourceQueryString(req)}`;


   

      // Elasticsearch query
      const query = {
        size: 0,
        query: {
          bool: {
            must: [
              { query_string: { query: topicQueryString } },
              {
                range: {
                  p_created_time: {
                    gte: fromDate || "now-90d",
                    lte: toDate || "now",
                  },
                },
              },
              {
                terms: {
                  "llm_mention_type.keyword": [
                    "Complaint",
                    "Customer Complaint",
                    "Criticism",
                  ],
                },
              },
            ],
            must_not: [
              { term: { "llm_mention_audience.keyword": "" } },
              { term: { "customer_journey.keyword": "" } },
            ],
          },
        },
        aggs: {
          customer_journey: {
            terms: {
              field: "customer_journey.keyword",
              size: 20,
            },
            aggs: {
              mention_audience: {
                terms: {
                  field: "llm_mention_audience.keyword",
                  size: 10,
                },
              },
            },
          },
        },
      };

           // Add category filters to the query
           if (Object.keys(categoryData).length > 0) {
            const categoryFilters = [];
            Object.values(categoryData).forEach(data => {
              if (data.keywords && data.keywords.length > 0) {
                data.keywords.forEach(keyword => {
                  categoryFilters.push({
                    multi_match: {
                      query: keyword,
                      fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                      type: 'phrase'
                    }
                  });
                });
              }
              if (data.hashtags && data.hashtags.length > 0) {
                data.hashtags.forEach(hashtag => {
                  categoryFilters.push({
                    multi_match: {
                      query: hashtag,
                      fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                      type: 'phrase'
                    }
                  });
                });
              }
              if (data.urls && data.urls.length > 0) {
                data.urls.forEach(url => {
                  categoryFilters.push({
                    multi_match: {
                      query: url,
                      fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                      type: 'phrase'
                    }
                  });
                });
              }
            });
            if (categoryFilters.length > 0) {
              query.query.bool.must.push({
                bool: {
                  should: categoryFilters,
                  minimum_should_match: 1
                }
              });
            }
          }

      // Optional sentiment filter
      if (sentimentType && sentimentType.trim() !== "") {
        query.query.bool.must.push({
          match: {
            predicted_sentiment_value: sentimentType.trim(),
          },
        });
      }

      // Add category filters to the query
      if (Object.keys(categoryData).length > 0) {
        const categoryFilters = [];
        
        Object.values(categoryData).forEach(data => {
          if (data.keywords && data.keywords.length > 0) {
            data.keywords.forEach(keyword => {
              categoryFilters.push({
                multi_match: {
                  query: keyword,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
          if (data.hashtags && data.hashtags.length > 0) {
            data.hashtags.forEach(hashtag => {
              categoryFilters.push({
                multi_match: {
                  query: hashtag,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
          if (data.urls && data.urls.length > 0) {
            data.urls.forEach(url => {
              categoryFilters.push({
                multi_match: {
                  query: url,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
        });

        if (categoryFilters.length > 0) {
          query.query.bool.must.push({
            bool: {
              should: categoryFilters,
              minimum_should_match: 1
            }
          });
        }
      }

      // Execute the ES query
      const result = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: query,
      });

      const journeyBuckets =
        result?.aggregations?.customer_journey?.buckets || [];

      const formattedData = journeyBuckets
        .map((journeyBucket) => {
          const audienceBuckets = journeyBucket.mention_audience?.buckets;

          const types = Array.isArray(audienceBuckets)
            ? audienceBuckets.reduce((acc, bucket) => {
              acc[bucket.key] = bucket.doc_count;
              return acc;
            }, {})
            : {};

          return {
            audience: journeyBucket.key,
            total: journeyBucket.doc_count,
            types,
          };
        })
        .filter((item) => Object.keys(item.types).length > 0);

      return res.status(200).json({
        data: formattedData,
        totalJourneys: journeyBuckets.length,
      });
    } catch (error) {
      console.error("Error fetching complaint journey data:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  },



  languageMentions: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType, categoryItems, sources } = req.body;

      // Determine which category data to use
      let categoryData = {};
      if (categoryItems && Array.isArray(categoryItems) && categoryItems.length > 0) {
        categoryData = processCategoryItems(categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      // Standard languages list for filtering
      const standardLanguages = [
        "English", "Mandarin", "Hindi", "Spanish", "French", "Arabic", "Bengali", "Russian",
        "Portuguese", "Urdu", "Indonesian", "German", "Japanese", "Swahili", "Marathi",
        "Telugu", "Turkish", "Tamil", "Vietnamese", "Korean", "Italian", "Thai", "Gujarati",
        "Polish", "Ukrainian", "Persian", "Malayalam", "Kannada", "Romanian", "Dutch", "Greek",
        "Czech", "Hungarian", "Hebrew", "Bulgarian", "Finnish", "Danish", "Norwegian", "Slovak",
        "Serbian", "Croatian", "Catalan", "Punjabi", "Malay", "Pashto", "Amharic", "Sinhala",
        "Azerbaijani", "Nepali"
      ];

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      // Validate and filter sources against available data sources
      const availableDataSources = req.processedDataSources || [];
      const validatedSources = sources ? normalizeSourceInput(sources).filter(src =>
        availableDataSources.includes(src) || availableDataSources.length === 0
      ) : [];

      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      // Apply special topic source filtering
      topicQueryString = `${topicQueryString}${buildSourceQueryString(req)}`;


    

      // Build base query for aggregation
      const baseQuery = {
        bool: {
          must: [
            { query_string: { query: topicQueryString } },
            {
              range: {
                p_created_time: {
                  gte: fromDate || "now-90d",
                  lte: toDate || "now",
                },
              },
            },
          ],
          must_not: [{ term: { "llm_language.keyword": "" } }],
        },
      };

      if (sentimentType && sentimentType != "") {
        baseQuery.bool.must.push({
          match: {
            predicted_sentiment_value: sentimentType.trim(),
          },
        });
      }

      // Add category filters to the query
      if (Object.keys(categoryData).length > 0) {
        const categoryFilters = [];
        
        Object.values(categoryData).forEach(data => {
          if (data.keywords && data.keywords.length > 0) {
            data.keywords.forEach(keyword => {
              categoryFilters.push({
                multi_match: {
                  query: keyword,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
          if (data.hashtags && data.hashtags.length > 0) {
            data.hashtags.forEach(hashtag => {
              categoryFilters.push({
                multi_match: {
                  query: hashtag,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
          if (data.urls && data.urls.length > 0) {
            data.urls.forEach(url => {
              categoryFilters.push({
                multi_match: {
                  query: url,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
        });

        if (categoryFilters.length > 0) {
          baseQuery.bool.must.push({
            bool: {
              should: categoryFilters,
              minimum_should_match: 1
            }
          });
        }
      }

      // **Single Aggregation Query - Updated to get top 50**
      const aggregationQuery = {
        size: 0,
        query: baseQuery,
        aggs: {
          llm_language: {
            terms: { 
              field: "llm_language.keyword", 
              size: 100  // Increased to 100 to ensure we capture top 50 standard languages
            },
          },
        },
      };

      // Execute aggregation query
      const result = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggregationQuery,
      });

      // Process aggregation results with filtering and normalization
      let languageGroups = {};
      let totalCount = 0;

      result.aggregations.llm_language.buckets.forEach((bucket) => {
        // Skip unknown values and non-language entries
        if (
          bucket.key.toLowerCase() === "unknown" ||
          bucket.key.toLowerCase() === "education"
        ) {
          return;
        }

        // Normalize language names (capitalize first letter)
        const normalizedKey =
          bucket.key.charAt(0).toUpperCase() +
          bucket.key.slice(1).toLowerCase();

        // Only include if it's in the standard languages list
        if (!standardLanguages.includes(normalizedKey)) {
          return;
        }

        // Merge counts if the normalized key already exists
        if (languageGroups[normalizedKey]) {
          languageGroups[normalizedKey].count += bucket.doc_count;
        } else {
          languageGroups[normalizedKey] = {
            name: normalizedKey,
            count: bucket.doc_count,
            originalKeys: [bucket.key], // Keep track of original keys for querying
          };
        }
        totalCount += bucket.doc_count;
      });

      // Now fetch posts for each language
      const languagesWithPosts = [];
      const MAX_POSTS_PER_LANGUAGE = 10;

      for (const [languageName, languageData] of Object.entries(
        languageGroups
      )) {
        try {
          // Create query for this specific language (using original keys)
          const languageQuery = {
            ...baseQuery,
            bool: {
              ...baseQuery.bool,
              must: [
                ...baseQuery.bool.must,
                {
                  terms: {
                    "llm_language.keyword": languageData.originalKeys,
                  },
                },
              ],
            },
          };

          // Get posts for this language
          const postsQuery = {
            size: MAX_POSTS_PER_LANGUAGE,
            query: languageQuery,
            sort: [{ p_created_time: { order: "desc" } }],
          };

          const postsResponse = await elasticClient.search({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: postsQuery,
          });

          // Format posts
          const posts = postsResponse.hits.hits.map((hit) =>
            formatPostDataForLanguage(hit, req)
          );

          // Calculate percentage
          const percentage =
            totalCount > 0
              ? ((languageData.count / totalCount) * 100).toFixed(1)
              : 0;

          languagesWithPosts.push({
            name: languageName,
            count: languageData.count,
            percentage: parseFloat(percentage),
            posts: posts,
          });
        } catch (error) {
          console.error(
            `Error fetching posts for language ${languageName}:`,
            error
          );
          // Add language data without posts if there's an error
          const percentage =
            totalCount > 0
              ? ((languageData.count / totalCount) * 100).toFixed(1)
              : 0;
          languagesWithPosts.push({
            name: languageName,
            count: languageData.count,
            percentage: parseFloat(percentage),
            posts: [],
          });
        }
      }

      // Sort by count (descending) and limit to top 50
      languagesWithPosts.sort((a, b) => b.count - a.count);
      const top50Languages = languagesWithPosts.slice(0, 50);

      // Create backward compatibility object
      const influencersCoverage = {};
      top50Languages.forEach((lang) => {
        influencersCoverage[lang.name] = lang.count;
      });

      return res.status(200).json({
        influencersCoverage,
        languages: top50Languages,
        totalCount,
        result,
      });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  mentionsPost: async (req, res) => {
    try {
      const {
        greaterThanTime,
        lessThanTime,
        topicId,
        sentiment,
        sources,
        source,
        field,
        type,
        value,
        interval,
      } = req.query;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      // Validate and filter sources against available data sources
      const availableDataSources = req.processedDataSources || [];
      const validatedSources = sources ? normalizeSourceInput(sources).filter(src =>
        availableDataSources.includes(src) || availableDataSources.length === 0
      ) : [];

      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      if (topicId && parseInt(topicId) === 2619) {
        topicQueryString = `${topicQueryString} AND source:("LinkedIn" OR "Linkedin")`;
      }
      // Apply special topic source filtering
      topicQueryString = `${topicQueryString}${buildSourceQueryString(req)}`;


    

      // Fetch mention actions in **one** query
      await getPosts(
        greaterThanTime,
        lessThanTime,
        topicQueryString,
        sentiment,
        field,
        type,
        value,
        interval,
        res,
        source || undefined, // source parameter (can be undefined if not provided)
        undefined, // llm_mention_type
        req // <-- Pass req here
      );
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  typeofMentionsTo10: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType, sources } = req.body;
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;
      // Validate and filter sources against available data sources
      const availableDataSources = req.processedDataSources || [];
      const validatedSources = sources ? normalizeSourceInput(sources).filter(src =>
        availableDataSources.includes(src) || availableDataSources.length === 0
      ) : [];

      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      if (topicQueryString == "") {
        return res.status(200).json({ responseOutput: {} });
      }

      // Expanded list of sources (now fully dynamic)
      topicQueryString = `${topicQueryString}${buildSourceQueryString(req)}`;

      // **Single Aggregation Query**
      const query = {
        size: 0,
        query: {
          bool: {
            must: [{ query_string: { query: topicQueryString } }],

            must_not: [{ term: { "llm_mention_type.keyword": "" } }],
          },
        },
        aggs: {
          mention_types: {
            terms: {
              field: "llm_mention_type.keyword",
              size: 8, // 🔥 Changed from 7 to 5 to get only top 5
              order: { _count: "desc" }, // 🔥 Added explicit ordering by count (descending)
            },
            aggs: {
              sources: {
                terms: { field: "source.keyword", size: 15 },
              },
            },
          },
        },
      };

      // if (sentimentType && sentimentType != "") {
      //   query.query.bool.must.push({
      //     match: {
      //       predicted_sentiment_value: sentimentType.trim(),
      //     },
      //   });
      // }

      // Execute query
      const result = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: query,
      });

      // Define all possible sources (ensures consistency)
      const allSources = [
        "twitterContent",
        "facebookContent",
        "instagramContent",
        "youtubeContent",
        "pinterestContent",
        "redditContent",
        "linkedinContent",
        "webContent",
      ];

      let responseOutput = {};

      // 🔥 Now only processes top 5 mention types (automatically limited by Elasticsearch)
      result.aggregations.mention_types.buckets.forEach((mention) => {
        let mentionData = {};

        // ✅ Set all sources to `0` initially to ensure all are present
        allSources.forEach((source) => {
          mentionData[source] = 0;
        });

        mention.sources.buckets.forEach((source) => {
          let keyName = `${source.key.toLowerCase()}Content`;

          // ✅ If source is "FakeNews", "News", "Blogs", "Web", map it to "webContent"
          if (
            ["fakenews", "news", "blogs", "web"].includes(
              source.key.toLowerCase()
            )
          ) {
            keyName = "webContent";
          }

          // ✅ Assign actual count from Elasticsearch
          mentionData[keyName] = source.doc_count;
        });

        responseOutput[mention.key] = mentionData;
      });

      return res.status(200).json({ responseOutput });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  productComplaints: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType } = req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      // Validate and filter sources against available data sources
      const availableDataSources = req.processedDataSources || [];
      const validatedSources = sources ? normalizeSourceInput(sources).filter(src =>
        availableDataSources.includes(src) || availableDataSources.length === 0
      ) : [];

      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      //  if(topicQueryString==""){
      //   return res.status(200).json({ responseOutput:{} });
      // }
      // Apply special topic source filtering
      topicQueryString = `${topicQueryString}${buildSourceQueryString(req)}`;


            // Apply special topic date range
      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "now-90d" : fromDate;
      const effectiveToDate = isSpecialTopic && !toDate ? "now" : toDate;




      // **Single Aggregation Query**
      const query = {
        size: 0,
        query: {
          bool: {
            must: [
              { query_string: { query: topicQueryString } },
              {
                range: {
                  p_created_time: {
                    gte: fromDate || "now-90d",
                    lte: toDate || "now",
                  },
                },
              },
              { term: { "llm_mention_type.keyword": "Complaint" } },
            ],
          },
        },
        aggs: {
          product_ref_types: {
            terms: { field: "product_ref_ind.keyword", size: 10 },
            aggs: {
              mention_graph: {
                date_histogram: {
                  field: "p_created_time",
                  fixed_interval: "1d",
                  min_doc_count: 0,
                  extended_bounds: {
                    min: fromDate || "now-90d",
                    max: toDate || "now",
                  },
                },
                aggs: {
                  date_filter: {
                    filter: {
                      range: {
                        p_created_time: {
                          gte: fromDate || "now-90d",
                          lte: toDate || "now",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      if (sentimentType && sentimentType != "") {
        query.query.bool.must.push({
          match: {
            predicted_sentiment_value: sentimentType.trim(),
          },
        });
      }

      // Execute query
      const result = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: query,
      });

      const series =
        result?.aggregations?.product_ref_types?.buckets?.map((item) => ({
          name: item.key,
          data: item.mention_graph.buckets.map((bucket) => ({
            x: bucket.key_as_string,
            y: bucket.doc_count,
          })),
        })) || [];

      const max = Math.max(
        ...series.flatMap((s) => s.data.map((point) => point.y))
      );
      const frequency = getFrequency(effectiveFromDate, effectiveToDate);

      return res.status(200).json({ series, frequency, max });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  UNDP: async (req, res) => {
    const {
      greaterThanTime,
      lessThanTime,
      subtopicId,
      topicId,
      sentimentType,
      type,
      aidType,
    } = req.body;

    const isScadUser = false;
    const selectedTab = "Social";
    let topicQueryString = await buildQueryString(
      topicId,
      isScadUser,
      selectedTab
    );

    // Expanded list of sources
    // topicQueryString = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"  OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web" ')`;

    if (type === "complaintTouchpoints") {
      try {
        const sourcesArray = [
          "Physical Branches and ATMs",
          "Digital Channels",
          "Customer Service Centers",
          "Financial Advisors",
          "Marketing Channels",
          "Community Initiatives",
          "Partner Networks",
          "Self-Service Portals",
          "Other",
        ];
       

        // const twitterContentQuery = `${topicQueryString} AND llm_mention_touchpoint:("Physical Office")  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`

        let responseOutput = {};

        // const dat= await elasticSearchCount(
        //   elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
        // )
        // console.log('data', dat)

        // const dat= await testClientElasticQuery()
        // console.log('dataasds', dat?.hits?.hits)
        for (let i = 0; i < sourcesArray.length; i++) {
          // let _sources
          // if (sourcesArray[i] === 'Youtube') {
          //   _sources = '"Youtube" OR "Vimeo"'
          // } else if (sourcesArray[i] === 'Web') {
          //   _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
          // } else {
          //   _sources = sourcesArray[i]
          // }

          let complaintContent = 0;
          let query = "";

          query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"')  AND llm_mention_type:("Customer Complaint") AND llm_mention_touchpoint:("${sourcesArray[i]}")`;
          complaintContent = await elasticClient.count({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: elasticMentionQueryTemplate(
              query,
              greaterThanTime,
              lessThanTime
            ),
          });

          // console.log(query, 'complaintContents here')
          if (complaintContent?.count > 0) {
            responseOutput[
              sourcesArray[i] ===
                "Customer Service (Phone, Email, or Live Chat)"
                ? "Customer Service"
                : sourcesArray[i]
            ] = complaintContent?.count;
          }
        }

        return res.status(200).json({ responseOutput });
      } catch (error) {
        console.error("Error fetching data:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    } else if (type === "UNDPtouchpoints") {
      try {
        const sourcesArray = [
          "Infrastructure Rebuilding",
          "Emergency Medical Aid",
          "Humanitarian Aid",
          "International Cooperation",
          "Disaster Relief Coordination",
          "Aid Effectiveness",
          "Recovery Progress",
          "Crisis Communications",
        ];

        // const twitterContentQuery = `${topicQueryString} AND llm_mention_touchpoint:("Physical Office")  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`

        let responseOutput = {};

        // const dat= await elasticSearchCount(
        //   elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
        // )
        // console.log('data', dat)

        // const dat= await testClientElasticQuery()
        // console.log('dataasds', dat?.hits?.hits)
        for (let i = 0; i < sourcesArray.length; i++) {
          // let _sources
          // if (sourcesArray[i] === 'Youtube') {
          //   _sources = '"Youtube" OR "Vimeo"'
          // } else if (sourcesArray[i] === 'Web') {
          //   _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
          // } else {
          //   _sources = sourcesArray[i]
          // }

          let content = 0;
          let query = "";
          let greatertime = "2023-01-01";
          let lesstime = "2023-04-30";

          // query = `${topicQueryString} AND touchpoint_un:("${sourcesArray[i]}") AND 'IGO Entities':("United Nations Development Programme (UNDP)")`
          // query = `${topicQueryString} AND Keywords:("Yes")  AND touchpoint_un:("${sourcesArray[i]}") AND keywords:("Yes") :("United Nations Development Programme (UNDP)")`

          query = `${topicQueryString} AND Keywords:("Yes")  AND llm_mention_touchpoint:("${sourcesArray[i]}")`;
          // content = await elasticSearchCount(elasticMentionQueryTemplate(query, '2023-01-01', '2023-04-30'))

          const data = elasticMentionQueryTemplate(
            query,
            "2023-01-01",
            "2023-04-30"
          );

          content = await elasticClient.count({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: elasticMentionQueryTemplate(
              query,
              "2023-01-01",
              "2023-04-30"
            ),
          });
          if (content?.count > 0) {
            responseOutput[
              sourcesArray[i] ===
                "Customer Service (Phone, Email, or Live Chat)"
                ? "Customer Service"
                : sourcesArray[i]
            ] = content?.count;
          }
        }

        //console.log('data', responseOutput)

        return res.status(200).json({ responseOutput });
      } catch (error) {
        console.error("Error fetching data:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    } else if (type === "UNDPAnnoucement") {
      try {
        const sourcesArray = [
          "Missing Persons",
          "Humanitarian Aid Distribution",
          "Emergency Response Coordination",
          "Damage Reports",
          "Relief Measures",
          "Special Appeals",
          "Safety Tips",
          "Public Health Advisor",
          "Emergency Response Coordination",
          "International Cooperation",
          "Impact Reports",
          "Infrastructure Reports",
        ];
        // const twitterContentQuery = `${topicQueryString} AND llm_mention_touchpoint:("Physical Office")  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`

        let responseOutput = {};

     
        for (let i = 0; i < sourcesArray.length; i++) {
        

          let content = 0;
          let query = "";

          query = `${topicQueryString} AND un_keywords:("Yes") AND announcement:("${sourcesArray[i]}")`;

          content = await elasticSearchCount(
            elasticMentionQueryTemplate(query, "2023-01-01", "2023-04-30")
          );

          if (content?.count > 0) {
            responseOutput[
              sourcesArray[i] ===
                "Customer Service (Phone, Email, or Live Chat)"
                ? "Customer Service"
                : sourcesArray[i]
            ] = content?.count;
          }
        }

        //console.log('data', responseOutput)

        return res.status(200).json({ responseOutput });
      } catch (error) {
        console.error("Error fetching data:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    } else if (type === "touchpointsIdentification") {
      try {
        const sourcesArray = [
          "Infrastructure Rebuilding",
          "Emergency Medical Aid",
          "Humanitarian Aid",
          "International Cooperation",
          "Disaster Relief Coordination",
          "Aid Effectiveness",
          "Recovery Progress",
          "Crisis Communications",
        ];


        let responseOutput = {};

        for (let i = 0; i < sourcesArray.length; i++) {
     
          let content = 0;
          let query = "";

          query = `${topicQueryString} AND touchpoint_un:("${sourcesArray[i]}")`;

          content = await elasticSearchCount(
            elasticMentionQueryTemplate(query, "2023-01-01", "2023-04-30")
          );

          if (content?.count > 0) {
            responseOutput[
              sourcesArray[i] ===
                "Customer Service (Phone, Email, or Live Chat)"
                ? "Customer Service"
                : sourcesArray[i]
            ] = content?.count;
          }
        }

        //console.log('data', responseOutput)

        return res.status(200).json({ responseOutput });
      } catch (error) {
        console.error("Error fetching data:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    } else if (type === "touchpointSentimentsChartUNtopic") {
      try {
        const sourcesArray = [
          "Infrastructure Rebuilding",
          "Emergency Medical Aid",
          "Humanitarian Aid",
          "International Cooperation",
          "Disaster Relief Coordination",
          "Aid Effectiveness",
          "Recovery Progress",
          "Crisis Communications",
        ];

        // const twitterContentQuery = `${topicQueryString} AND llm_mention_touchpoint:("Physical Office")  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`

        let responseOutput = {};

        // const dat: any = await elasticSearchCount(
        //   elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
        // )
        // console.log('data', dat)

        // const dat: any = await testClientElasticQuery()
        // console.log('dataasds', dat?.hits?.hits)
        for (let i = 0; i < sourcesArray.length; i++) {
          // let _sources
          // if (sourcesArray[i] === 'Youtube') {
          //   _sources = '"Youtube" OR "Vimeo"'
          // } else if (sourcesArray[i] === 'Web') {
          //   _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
          // } else {
          //   _sources = sourcesArray[i]
          // }

          let positiveContent = 0,
            negativeContent = 0,
            neutralContent = 0,
            webContent = 0;
          let positiveContentQuery,
            negativeContentQuery,
            neutralContentQuery,
            webContentQuery;

          // let count: any = unData.filter(data => data?.touchpoint_identification === sourcesArray[i])

          positiveContentQuery = `${topicQueryString} AND un_keywords:("Yes") AND touchpoint_un:("${sourcesArray[i]}") AND predicted_sentiment_value:("Positive")`;
          negativeContentQuery = `${topicQueryString} AND un_keywords:("Yes") AND touchpoint_un:("${sourcesArray[i]}") AND predicted_sentiment_value:("Negative")`;
          neutralContentQuery = `${topicQueryString} AND un_keywords:("Yes") AND touchpoint_un:("${sourcesArray[i]}") AND predicted_sentiment_value:("Neutral")`;
     

          positiveContent = await elasticSearchCount(
            elasticMentionQueryTemplate(
              positiveContentQuery,
              "2023-02-05",
              "2023-02-21"
            )
          );
          negativeContent = await elasticSearchCount(
            elasticMentionQueryTemplate(
              negativeContentQuery,
              "2023-02-05",
              "2023-02-21"
            )
          );
          neutralContent = await elasticSearchCount(
            elasticMentionQueryTemplate(
              neutralContentQuery,
              "2023-02-05",
              "2023-02-21"
            )
          );

          if (
            positiveContent.count > 0 ||
            negativeContent.count > 0 ||
            neutralContent.count > 0
          ) {
            responseOutput[
              sourcesArray[i] ===
                "Customer Service (Phone, Email, or Live Chat)"
                ? "Customer Service"
                : sourcesArray[i]
            ] = {
              positiveContent: positiveContent?.count,
              negativeContent: negativeContent?.count,
              neutralContent: neutralContent?.count,
            };
          }
        }

        // console.log('data', responseOutput)

        return res.status(200).json({ responseOutput });
      } catch (error) {
        console.error("Error fetching data:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    } else if (type === "IGOEntities") {
      try {
        const sourcesArray = [
          "United Nations Development Programme (UNDP)",
          "United Nations Children's Fund (UNICEF)",
          "World Health Organization (WHO)",
          "United Nations High Commissioner for Refugees (UNHCR)",
          "World Food Programme (WFP)",
          "International Labour Organization (ILO)",
          "United Nations Educational, Scientific and Cultural Organization (UNESCO)",
          "United Nations Population Fund (UNFPA)",
          "United Nations Office on Drugs and Crime (UNODC)",
          "International Criminal Court (ICC)",
          "International Maritime Organization (IMO)",
          "International Telecommunication Union (ITU)",
          "United Nations Environment Programme (UNEP)",
          "United Nations Office for the Coordination of Humanitarian Affairs (OCHA)",
          "United Nations Institute for Training and Research (UNITAR)",
          "United Nations Conference on Trade and Development (UNCTAD)",
          "United Nations Human Settlements Programme (UN-Habitat)",
          "World Intellectual Property Organization (WIPO)",
          "United Nations Framework Convention on Climate Change (UNFCCC)",
        ];
        // const twitterContentQuery = `${topicQueryString} AND llm_mention_touchpoint:("Physical Office")  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`

        let responseOutput = {};

      
        for (let i = 0; i < sourcesArray.length; i++) {
       

          let content = 0;
          let query = "";

          // query = `${topicQueryString} AND un_keywords:("Yes") AND 'IGO Entities':("${sourcesArray[i]}")`
          query = `${topicQueryString}  AND igo_entities:("${sourcesArray[i]}")`;
          // console.log(query, 'IGO Entities')

          content = await elasticSearchCount(
            elasticMentionQueryTemplate(query, "2023-01-01", "2024-12-03")
          );

          console.log(content, "content");
          if (content?.count > 0) {
            responseOutput[
              sourcesArray[i] ===
                "Customer Service (Phone, Email, or Live Chat)"
                ? "Customer Service"
                : sourcesArray[i]
            ] = content?.count;
          }
        }

        //console.log('data', responseOutput)

        return res.status(200).json({ responseOutput });
      } catch (error) {
        console.error("Error fetching data:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    } else if (type === "IGOSentimentsChartUNtopic") {
      try {
        const sourcesArray = [
          "United Nations Development Programme (UNDP)",
          "United Nations Children's Fund (UNICEF)",
          "World Health Organization (WHO)",
          "United Nations High Commissioner for Refugees (UNHCR)",
          "World Food Programme (WFP)",
          "International Labour Organization (ILO)",
          "United Nations Educational, Scientific and Cultural Organization (UNESCO)",
          "United Nations Population Fund (UNFPA)",
          "United Nations Office on Drugs and Crime (UNODC)",
          "International Criminal Court (ICC)",
          "International Maritime Organization (IMO)",
          "International Telecommunication Union (ITU)",
          "United Nations Environment Programme (UNEP)",
          "United Nations Office for the Coordination of Humanitarian Affairs (OCHA)",
          "United Nations Institute for Training and Research (UNITAR)",
          "United Nations Conference on Trade and Development (UNCTAD)",
          "United Nations Human Settlements Programme (UN-Habitat)",
          "World Intellectual Property Organization (WIPO)",
          "United Nations Framework Convention on Climate Change (UNFCCC)",
        ];
        //const twitterContentQuery = `${topicQueryString} AND un_keywords:("Yes")`

        let responseOutput = {};

        // const dat= await testClientElasticQuery(
        //   elasticMentionQueryTemplate(twitterContentQuery, '2023-02-05', '2023-02-20')
        // )
        // console.log('data', dat?.hits?.hits)

        // const dat= await testClientElasticQuery()

        for (let i = 0; i < sourcesArray.length; i++) {
          // let _sources
          // if (sourcesArray[i] === 'Youtube') {
          //   _sources = '"Youtube" OR "Vimeo"'
          // } else if (sourcesArray[i] === 'Web') {
          //   _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
          // } else {
          //   _sources = sourcesArray[i]
          // }

          let positiveContent = 0,
            negativeContent = 0,
            neutralContent = 0,
            webContent = 0;
          let positiveContentQuery,
            negativeContentQuery,
            neutralContentQuery,
            webContentQuery;

          // let count= unData.filter(data => data?.touchpoint_identification === sourcesArray[i])

          // positiveContentQuery = `${topicQueryString} AND un_keywords:("Yes") AND igo_entities:("${sourcesArray[i]}") AND predicted_sentiment_value:("Positive")`
          // negativeContentQuery = `${topicQueryString} AND un_keywords:("Yes") AND igo_entities:("${sourcesArray[i]}") AND predicted_sentiment_value:("Negative")`
          // neutralContentQuery = `${topicQueryString} AND un_keywords:("Yes") AND igo_entities:("${sourcesArray[i]}") AND predicted_sentiment_value:("Neutral")`

          positiveContentQuery = `${topicQueryString}   AND igo_entities:("${sourcesArray[i]}") AND predicted_sentiment_value:("Positive")`;
          negativeContentQuery = `${topicQueryString}   AND igo_entities:("${sourcesArray[i]}") AND predicted_sentiment_value:("Negative")`;
          neutralContentQuery = `${topicQueryString}  AND igo_entities:("${sourcesArray[i]}") AND predicted_sentiment_value:("Neutral")`;

          positiveContent = await elasticSearchCount(
            elasticMentionQueryTemplate(
              positiveContentQuery,
              "2023-01-01",
              "2024-12-03"
            )
          );

          negativeContent = await elasticSearchCount(
            elasticMentionQueryTemplate(
              negativeContentQuery,
              "2023-01-01",
              "2024-12-03"
            )
          );
          neutralContent = await elasticSearchCount(
            elasticMentionQueryTemplate(
              neutralContentQuery,
              "2023-01-01",
              "2024-12-03"
            )
          );

          if (
            positiveContent.count > 0 ||
            negativeContent.count > 0 ||
            neutralContent.count > 0
          ) {
            responseOutput[
              sourcesArray[i] ===
                "Customer Service (Phone, Email, or Live Chat)"
                ? "Customer Service"
                : sourcesArray[i]
            ] = {
              positiveContent: positiveContent?.count,
              negativeContent: negativeContent?.count,
              neutralContent: neutralContent?.count,
            };
          }
        }

        //console.log('data', responseOutput)

        return res.status(200).json({ responseOutput });
      } catch (error) {
        console.error("Error fetching data:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    } else if (type === "unAidsChart") {
      //elasticQueryTemplateRange
      try {
        let dataArray = [];
        if (aidType === "Aid Requested/Aid Recieved") {
          const query1 = `${topicQueryString}  AND aid_requests_received:("receipt of aid")`;
          const query2 = `${topicQueryString} AND aid_requests_received:("request for aid")`;

          const aidRec = await elasticSearchCount(
            elasticMentionQueryTemplate(query1, "2023-01-01", "2023-04-30")
          );
          const aidReq = await elasticSearchCount(
            elasticMentionQueryTemplate(query2, "2023-01-01", "2023-04-30")
          );

          dataArray = [aidReq.count, aidRec.count];
        } else if (aidType === "Aid Type") {
          const query1 = `${topicQueryString}  AND aid_type:("Local Aid")`;
          const query2 = `${topicQueryString}  AND aid_type:("International Aid")`;

          const local = await elasticSearchCount(
            elasticMentionQueryTemplate(query1, "2023-01-01", "2023-04-30")
          );
          const inter = await elasticSearchCount(
            elasticMentionQueryTemplate(query2, "2023-01-01", "2023-04-30")
          );
          dataArray = [local.count, inter.count];
        } else if (aidType === "Mental Health and Trauma") {
          const query1 = `${topicQueryString}  AND Aid Type:("Local Aid")`;
          const query2 = `${topicQueryString}  AND Aid Type:("International Aid")`;

          const local = await elasticSearchCount(
            elasticMentionQueryTemplate(query1, "2023-01-01", "2023-04-30")
          );
          const inter = await elasticSearchCount(
            elasticMentionQueryTemplate(query2, "2023-01-01", "2023-04-30")
          );
          dataArray = [local.count, inter.count];
        } else if (aidType === "Political or Social Criticism") {
          const query1 = `${topicQueryString} AND Aid Type:("Local Aid")`;
          const query2 = `${topicQueryString} AND Aid Type:("International Aid")`;

          const local = await elasticSearchCount(
            elasticMentionQueryTemplate(query1, "2023-01-01", "2023-04-30")
          );
          const inter = await elasticSearchCount(
            elasticMentionQueryTemplate(query2, "2023-01-01", "2023-04-30")
          );
          dataArray = [local.count, inter.count];
        } else if (aidType === "Environmental Hazards") {
          const query1 = `${topicQueryString}  AND Aid Type:("Local Aid")`;
          const query2 = `${topicQueryString}  AND Aid Type:("International Aid")`;

          const local = await elasticSearchCount(
            elasticMentionQueryTemplate(query1, "2023-01-01", "2023-04-30")
          );
          const inter = await elasticSearchCount(
            elasticMentionQueryTemplate(query2, "2023-01-01", "2023-04-30")
          );
          dataArray = [local.count, inter.count];
        }

        return res.status(200).json({ dataArray });
      } catch (error) {
        console.error("Error fetching data:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    } else if (type === "touchpointIndustry") {
      try {
       

        const sourcesArray = [
          "Physical Branches and ATMs",
          "Digital Channels",
          "Customer Service Centers",
          "Financial Advisors",
          "Marketing Channels",
          "Community Initiatives",
          "Partner Networks",
          "Self-Service Portals",
          "Other",
        ];

        let responseOutput = {};

        // const dat= await elasticSearchCount(
        //   elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
        // )
        // console.log('data', dat)

        // const dat= await testClientElasticQuery()
        // console.log('dataasds', dat?.hits?.hits)
        for (let i = 0; i < sourcesArray.length; i++) {
          // let _sources
          // if (sourcesArray[i] === 'Youtube') {
          //   _sources = '"Youtube" OR "Vimeo"'
          // } else if (sourcesArray[i] === 'Web') {
          //   _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
          // } else {
          //   _sources = sourcesArray[i]
          // }

          let twitterContent = 0,
            facebookContent = 0,
            instagramContent = 0,
            webContent = 0;
          let twitterContentQuery,
            facebookContentQuery,
            instagramContentQuery,
            webContentQuery;

          twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`;
          facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`;
          instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`;
          //webContentQuery = `${topicQueryString} AND source:('"FakeNews" OR "News" OR "Blogs" OR "Web"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
          // console.log(twitterContentQuery, 'touchpointIndustry')
          twitterContent = await elasticSearchCount(
            elasticMentionQueryTemplate(
              twitterContentQuery,
              greaterThanTime,
              lessThanTime
            )
          );
          facebookContent = await elasticSearchCount(
            elasticMentionQueryTemplate(
              facebookContentQuery,
              greaterThanTime,
              lessThanTime
            )
          );
          instagramContent = await elasticSearchCount(
            elasticMentionQueryTemplate(
              instagramContentQuery,
              greaterThanTime,
              lessThanTime
            )
          );
       

          if (
            twitterContent.count > 0 ||
            facebookContent.count > 0 ||
            instagramContent.count > 0
          ) {
            responseOutput[
              sourcesArray[i] ===
                "Customer Service (Phone, Email, or Live Chat)"
                ? "Customer Service"
                : sourcesArray[i]
            ] = {
              twitterContent: twitterContent?.count,
              facebookContent: facebookContent?.count,
              instagramContent: instagramContent?.count,
              // webContent: webContent?.count
            };
          }
        }

        //console.log('data', responseOutput)

        return res.status(200).json({ responseOutput });
      } catch (error) {
        console.error("Error fetching data:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    } else if (type === "touchpointSentimentsChart") {
      try {
  
        const sourcesArray = [
          "Physical Branches and ATMs",
          "Digital Channels",
          "Customer Service Centers",
          "Financial Advisors",
          "Marketing Channels",
          "Community Initiatives",
          "Partner Networks",
          "Self-Service Portals",
          "Other",
        ];


        let responseOutput = {};

        for (let i = 0; i < sourcesArray.length; i++) {
 
          let positiveContent = 0,
            negativeContent = 0,
            neutralContent = 0,
            webContent = 0;
          let positiveContentQuery,
            negativeContentQuery,
            neutralContentQuery,
            webContentQuery;

          positiveContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Positive") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`;
          negativeContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Negative") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`;
          neutralContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Neutral") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`;
          // console.log('touchpointSentimentsChart', positiveContentQuery)
          positiveContent = await elasticSearchCount(
            elasticMentionQueryTemplate(
              positiveContentQuery,
              greaterThanTime,
              lessThanTime
            )
          );
          negativeContent = await elasticSearchCount(
            elasticMentionQueryTemplate(
              negativeContentQuery,
              greaterThanTime,
              lessThanTime
            )
          );
          neutralContent = await elasticSearchCount(
            elasticMentionQueryTemplate(
              neutralContentQuery,
              greaterThanTime,
              lessThanTime
            )
          );

          if (
            positiveContent.count > 0 ||
            negativeContent.count > 0 ||
            neutralContent.count > 0
          ) {
            responseOutput[
              sourcesArray[i] ===
                "Customer Service (Phone, Email, or Live Chat)"
                ? "Customer Service"
                : sourcesArray[i]
            ] = {
              positiveContent: positiveContent?.count,
              negativeContent: negativeContent?.count,
              neutralContent: neutralContent?.count,
            };
          }
        }

        //console.log('data', responseOutput)
        return res.status(200).json({ responseOutput });
      } catch (error) {
        console.error("Error fetching data:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    }
  },

  migrationTopicsSummarye: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType, source } =
        req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      // Validate and filter sources against available data sources
      const availableDataSources = req.processedDataSources || [];
      const validatedSources = sources ? normalizeSourceInput(sources).filter(src =>
        availableDataSources.includes(src) || availableDataSources.length === 0
      ) : [];

      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      // Apply special topic source filtering
      topicQueryString = `${topicQueryString}${buildSourceQueryString(req)}`;



      // **Single Aggregation Query**
      const query = {
        size: 0,
        query: {
          bool: {
            must: [
              { query_string: { query: topicQueryString } },
              {
                range: {
                  p_created_time: {
                    gte: fromDate || "now-90d",
                    lte: toDate || "now",
                  },
                },
              },
            ],

            must_not: [
              { term: { "migration_topics.keyword": "" } },
              { term: { "migration_topics.keyword": "{}" } },
            ],
          },
        },
        aggs: {
          mention_types: {
            terms: { field: "migration_topics.keyword", size: 7 },
            aggs: {
              sources: {
                terms: { field: "source.keyword", size: 15 },
              },
            },
          },
        },
      };

      if (sentimentType && sentimentType != "") {
        query.query.bool.must.push({
          match: {
            predicted_sentiment_value: sentimentType.trim(),
          },
        });
      }
      

      // Execute query
      const result = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: query,
      });

      

      return res.status(200).json({ result,query });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  migrationTopicsSummary: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType, sources,
        categoryItems
       } =
        req.body;

      // Determine which category data to use
      let categoryData = {};
      if (categoryItems && Array.isArray(categoryItems) && categoryItems.length > 0) {
        categoryData = processCategoryItems(categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      // Validate and filter sources against available data sources
      const availableDataSources = req.processedDataSources || [];
      const validatedSources = sources ? normalizeSourceInput(sources).filter(src =>
        availableDataSources.includes(src) || availableDataSources.length === 0
      ) : [];

      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      // Apply special topic source filtering
      if (isSpecialTopic) {
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook")`;
      } else {
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;
      }

      // // Apply special topic date range
      // const effectiveFromDate =
      //   isSpecialTopic && !fromDate ? "" : fromDate;
      // const effectiveToDate = isSpecialTopic && !toDate ? "now" : toDate;

      // Simplified aggregation: group by migration_topics (topic name) and count sentiments using predicted_sentiment_value
      const query = {
        size: 0,
        query: {
          bool: {
            must: [
              { query_string: { query: topicQueryString } },
              {
                range: {
                  p_created_time: {
                    gte: fromDate || "now-90d",
                    lte: toDate || "now",
                  },
                },
              },
            ],
            must_not: [
              { term: { "migration_topics.keyword": "" } },
              { term: { "migration_topics.keyword": "{}" } },
            ],
          },
        },
        aggs: {
          topics: {
            terms: {
              field: "migration_topics.keyword",
              size: 1000,
              order: { _count: "desc" },
            },
            aggs: {
              sentiments: {
                terms: {
                  field: "predicted_sentiment_value.keyword",
                  size: 3,
                },
              },
            },
          },
        },
      };

      // Add category filters to the query
      if (Object.keys(categoryData).length > 0) {
        const categoryFilters = [];
        
        Object.values(categoryData).forEach(data => {
          if (data.keywords && data.keywords.length > 0) {
            data.keywords.forEach(keyword => {
              categoryFilters.push({
                multi_match: {
                  query: keyword,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
          if (data.hashtags && data.hashtags.length > 0) {
            data.hashtags.forEach(hashtag => {
              categoryFilters.push({
                multi_match: {
                  query: hashtag,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
          if (data.urls && data.urls.length > 0) {
            data.urls.forEach(url => {
              categoryFilters.push({
                multi_match: {
                  query: url,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
        });

        if (categoryFilters.length > 0) {
          query.query.bool.must.push({
            bool: {
              should: categoryFilters,
              minimum_should_match: 1
            }
          });
        }
      }

      // Execute query
      const result = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: query,
      });

      // Extract topic name from migration_topics JSON string, ignoring embedded sentiment
      const extractTopicName = (raw) => {
        if (typeof raw !== 'string') return String(raw || '');
        const trimmed = raw.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          try {
            const obj = JSON.parse(trimmed);
            const keys = Object.keys(obj);
            return keys.length > 0 ? keys[0] : '';
          } catch (_) {
            // ignore
          }
        }
        return trimmed;
      };

      // Build topics array with sentiment counts from predicted_sentiment_value
      const topics = (result.aggregations?.topics?.buckets || []).map((bucket) => {
        const topic = extractTopicName(bucket.key) || 'unknown';
        const sentiments = bucket.sentiments?.buckets || [];
        const counts = { Positive: 0, Neutral: 0, Negative: 0 };
        for (const s of sentiments) {
          const label = String(s.key || '').toLowerCase();
          if (label === 'positive') counts.Positive = s.doc_count;
          else if (label === 'neutral') counts.Neutral = s.doc_count;
          else if (label === 'negative') counts.Negative = s.doc_count;
        }
        return { topic, counts, total: bucket.doc_count };
      });

      const totalCount = topics.reduce((sum, t) => sum + t.total, 0);

      return res.status(200).json({ 
        success: true,
        topics,
        totalCount,
        query,
      });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  eventTypePopularity: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType,   sources = []
 } =
        req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      // Validate and filter sources against available data sources
      const availableDataSources = req.processedDataSources || [];
      const validatedSources = sources ? normalizeSourceInput(sources).filter(src =>
        availableDataSources.includes(src) || availableDataSources.length === 0
      ) : [];

      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      // Apply special topic source filtering
      topicQueryString = `${topicQueryString}${buildSourceQueryString(req)}`;


  

      // Build the main query
      const query = {
        size: 0,
        query: {
          bool: {
            must: [
              { query_string: { query: topicQueryString } },
              {
                range: {
                  p_created_time: {
                    gte: fromDate || "now-90d",
                    lte: toDate || "now",
                  },
                },
              },
            ],
            must_not: [
              { term: { "llm_core_insights.event_type.keyword": "" } },
              { term: { "llm_core_insights.event_type.keyword": "null" } },
              {
                bool: {
                  must_not: {
                    exists: { field: "llm_core_insights.event_type" },
                  },
                },
              },
            ],
          },
        },
        aggs: {
          event_types: {
            terms: {
              field: "llm_core_insights.event_type.keyword",
              size: 20,
              missing: "Unknown", // Handle documents without event_type
            },
            aggs: {
              sources: {
                terms: { field: "source.keyword", size: 30 },
              },
            },
          },
        },
      };

      // Add sentiment filter if provided
      if (sentimentType && sentimentType !== "") {
        query.query.bool.must.push({
          match: {
            predicted_sentiment_value: sentimentType.trim(),
          },
        });
      }

      // Add source filter if provided
      if (sources && sources !== "") {
        query.query.bool.must.push({
          term: {
            "source.keyword": sources.trim(),
          },
        });
      }

      // Add subtopic filter if provided
      if (subtopicId && subtopicId !== "") {
        query.query.bool.must.push({
          term: {
            subtopic_id: parseInt(subtopicId),
          },
        });
      }

      // Execute query
      const result = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: query,
      });

      // Transform the aggregation results into a format suitable for pie charts
      const buckets = result.aggregations.event_types.buckets;
      const totalDocs = result.hits.total.value;

      // Map to hold merged event types
      const mergedMap = new Map();

      for (const bucket of buckets) {
        const parts = bucket.key
          .split("|")
          .map((p) => p.trim())
          .filter((p) => p && p !== "null");

        for (const part of parts) {
          const baseName = part; // No lowercasing unless you want to force case-insensitive match

          const current = mergedMap.get(baseName) || {
            name: baseName,
            value: 0,
            sourcesMap: new Map(),
          };

          current.value += bucket.doc_count;

          // Merge sources
          for (const source of bucket.sources.buckets) {
            const prevCount = current.sourcesMap.get(source.key) || 0;
            current.sourcesMap.set(source.key, prevCount + source.doc_count);
          }

          mergedMap.set(baseName, current);
        }
      }

      // Convert to array and calculate percentage
      let pieData = Array.from(mergedMap.values()).map((entry) => ({
        name: entry.name,
        value: entry.value,
        percentage:
          totalDocs > 0 ? ((entry.value / totalDocs) * 100).toFixed(2) : "0.00",
        sources: Array.from(entry.sourcesMap.entries()).map(
          ([name, count]) => ({ name, count })
        ),
      }));

      // Sort descending and take top 6
      pieData = pieData.sort((a, b) => b.value - a.value).slice(0, 6);

      return res.status(200).json({
        success: true,
        data: pieData,
        total: totalDocs,
        results: buckets,
        query: query,
      });
    } catch (error) {
      console.error("Error fetching event type data:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message,
      });
    }
  },

  llmMotivationPhase: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentiment, sources } =
        req.body;

      const topicIdNum = parseInt(topicId);
      const isSpecialTopic = topicIdNum === 2600;
      const isTopic2604 = topicIdNum === 2604 || topicIdNum === 2602;
      const isTopic2603 = topicIdNum === 2603 || topicIdNum === 2601;

      // Validate and filter sources against available data sources
      const availableDataSources = req.processedDataSources || [];
      const validatedSources = sources ? normalizeSourceInput(sources).filter(src =>
        availableDataSources.includes(src) || availableDataSources.length === 0
      ) : [];

      const isScadUser = false;
      const selectedTab = "Social";

      let topicQueryString = await buildQueryString(topicId, isScadUser, selectedTab);

      const allowedSources = isSpecialTopic
        ? `"Twitter" OR "Facebook"`
        : `"Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Linkedin" OR "Web"`;
      topicQueryString += ` AND source:(${allowedSources})`;

      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "2020-01-01" : fromDate;
      const effectiveToDate = isSpecialTopic && !toDate ? "now" : toDate;

      // Handle custom phase logic
      let phaseFilters = null;
      if (isTopic2604) {
        phaseFilters = [
          {
            bool: {
              must: [
                {
                  match_phrase: { "llm_motivation.phase.keyword": "pre_event" },
                },
                {
                  range: {
                    p_created_time: { gte: "2024-01-01", lte: "2024-10-13" },
                  },
                },
              ],
            },
          },
          {
            bool: {
              must: [
                {
                  bool: {
                    should: [
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day1",
                        },
                      },
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day2",
                        },
                      },
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day3",
                        },
                      },
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day4",
                        },
                      },
                    ],
                    minimum_should_match: 1,
                  },
                },
                {
                  range: {
                    p_created_time: { gte: "2024-10-14", lte: "2024-10-18" },
                  },
                },
              ],
            },
          },
          {
            bool: {
              must: [
                {
                  match_phrase: {
                    "llm_motivation.phase.keyword": "post_event",
                  },
                },
                { range: { p_created_time: { gte: "2024-10-19" } } },
              ],
            },
          },
        ];
      } else if (isTopic2603) {
        phaseFilters = [
          {
            bool: {
              must: [
                {
                  match_phrase: { "llm_motivation.phase.keyword": "pre_event" },
                },
                {
                  range: {
                    p_created_time: { gte: "2023-01-30", lte: "2024-03-03" },
                  },
                },
              ],
            },
          },
          {
            bool: {
              must: [
                {
                  bool: {
                    should: [
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day1",
                        },
                      },
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day2",
                        },
                      },
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day3",
                        },
                      },
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day4",
                        },
                      },
                    ],
                    minimum_should_match: 1,
                  },
                },
                {
                  range: {
                    p_created_time: { gte: "2024-03-04", lte: "2024-03-07" },
                  },
                },
              ],
            },
          },
          {
            bool: {
              must: [
                {
                  match_phrase: {
                    "llm_motivation.phase.keyword": "post_event",
                  },
                },
                { range: { p_created_time: { gte: "2024-03-08" } } },
              ],
            },
          },
        ];
      }

      // Main Elasticsearch query
      const query = {
        size: 0,
        query: {
          bool: {
            must: [
              { query_string: { query: topicQueryString } },
              ...(phaseFilters
                ? [{ bool: { should: phaseFilters, minimum_should_match: 1 } }]
                : [
                    {
                      range: {
                        p_created_time: {
                          gte: effectiveFromDate || "now-90d",
                          lte: effectiveToDate || "now",
                        },
                      },
                    },
                  ]),
            ],
            must_not: [
              { term: { "llm_motivation.phase.keyword": "" } },
              { term: { "llm_motivation.phase.keyword": "null" } },
              {
                bool: {
                  must_not: { exists: { field: "llm_motivation.phase" } },
                },
              },
            ],
          },
        },
        aggs: {
          event_types: {
            terms: {
              field: "llm_motivation.phase.keyword",
              size: 20,
              missing: "Unknown",
            },
            aggs: {
              sources: {
                terms: { field: "source.keyword", size: 30 },
              },
              word_cloud_phrases: {
                terms: {
                  field: "llm_motivation.word_cloud_phrases.keyword",
                  size: 100,
                  min_doc_count: 1,
                },
              },
            },
          },
        },
      };

      if (sentiment?.trim()) {
        query.query.bool.must.push({
          match: { predicted_sentiment_value: sentiment.trim() },
        });
      }

      if (sources?.trim()) {
        query.query.bool.must.push({
          term: { "source.keyword": sources.trim() },
        });
      }

      if (subtopicId?.trim()) {
        query.query.bool.must.push({
          term: { subtopic_id: parseInt(subtopicId) },
        });
      }

      // Execute the query
      const result = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: query,
      });

      const buckets = result.aggregations.event_types.buckets;
      const totalDocs = result.hits.total.value;
      const mergedMap = new Map();

      for (const bucket of buckets) {
        const parts = bucket.key
          .split("|")
          .map((p) => p.trim())
          .filter((p) => p && p !== "null");

        for (const part of parts) {
          // Normalize to "exhibition_days"
          const normalized = ["day1", "day2", "day3", "day4"].includes(part)
            ? "exhibition_days"
            : part;

          const current = mergedMap.get(normalized) || {
            name: normalized,
            value: 0,
            sourcesMap: new Map(),
            wordCloudPhrasesMap: new Map(),
          };

          current.value += bucket.doc_count;

          for (const source of bucket.sources.buckets) {
            const prev = current.sourcesMap.get(source.key) || 0;
            current.sourcesMap.set(source.key, prev + source.doc_count);
          }

          for (const phrase of bucket.word_cloud_phrases.buckets) {
            const prev = current.wordCloudPhrasesMap.get(phrase.key) || 0;
            current.wordCloudPhrasesMap.set(
              phrase.key,
              prev + phrase.doc_count
            );
          }

          mergedMap.set(normalized, current);
        }

      let pieData = Array.from(mergedMap.values()).map((entry) => ({
        name: entry.name,
        value: entry.value,
        percentage:
          totalDocs > 0 ? ((entry.value / totalDocs) * 100).toFixed(2) : "0.00",
        sources: Array.from(entry.sourcesMap.entries()).map(
          ([name, count]) => ({ name, count })
        ),
        wordCloudPhrases: Array.from(entry.wordCloudPhrasesMap.entries())
          .map(([phrase, count]) => ({ phrase, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 50),
      }));

      pieData = pieData.sort((a, b) => b.value - a.value).slice(0, 6);

      return res.status(200).json({
        success: true,
        data: pieData,
        total: totalDocs,
        query,
      });
    } 
    
  
  }
  catch (error) {
    console.error("Error fetching event type data:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message,
    });
  }
},

  llmMotivationSentimentTrend: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentiment, sources, categoryItems } =
        req.body;

      // Determine which category data to use
      let categoryData = {};
      if (categoryItems && Array.isArray(categoryItems) && categoryItems.length > 0) {
        categoryData = processCategoryItems(categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      const topicIdNum = parseInt(topicId);
      const isSpecialTopic = topicIdNum === 2600;
      const isTopic2604 = topicIdNum === 2604 || topicIdNum === 2602;
      const isTopic2603 = topicIdNum === 2603 || topicIdNum === 2601;

      // Validate and filter sources against available data sources
      const availableDataSources = req.processedDataSources || [];
      const validatedSources = sources ? normalizeSourceInput(sources).filter(src =>
        availableDataSources.includes(src) || availableDataSources.length === 0
      ) : [];

      const isScadUser = false;
      const selectedTab = "Social";

      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      const allowedSources = isSpecialTopic
        ? `"Twitter" OR "Facebook"`
        : `"Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Linkedin" OR "Web"`;
      topicQueryString += ` AND source:(${allowedSources})`;

      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "2020-01-01" : fromDate;
      const effectiveToDate = isSpecialTopic && !toDate ? "now" : toDate;

      // Handle custom phase logic with date ranges
      let phaseFilters = null;
      let preEventDateRange = null;
      let exhibitionDateRange = null;
      let postEventDateRange = null;

      if (isTopic2604) {
        preEventDateRange = { gte: "2024-01-01", lte: "2024-10-13" };
        exhibitionDateRange = { gte: "2024-10-14", lte: "2024-10-18" };
        postEventDateRange = { gte: "2024-10-19" };

        phaseFilters = [
          {
            bool: {
              must: [
                {
                  match_phrase: { "llm_motivation.phase.keyword": "pre_event" },
                },
                { range: { p_created_time: preEventDateRange } },
              ],
            },
          },
          {
            bool: {
              must: [
                {
                  bool: {
                    should: [
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day1",
                        },
                      },
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day2",
                        },
                      },
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day3",
                        },
                      },
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day4",
                        },
                      },
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day5",
                        },
                      },
                    ],
                    minimum_should_match: 1,
                  },
                },
                { range: { p_created_time: exhibitionDateRange } },
              ],
            },
          },
          {
            bool: {
              must: [
                {
                  match_phrase: {
                    "llm_motivation.phase.keyword": "post_event",
                  },
                },
                { range: { p_created_time: postEventDateRange } },
              ],
            },
          },
        ];
      } else if (isTopic2603) {
        preEventDateRange = { gte: "2023-01-30", lte: "2024-03-03" };
        exhibitionDateRange = { gte: "2024-03-04", lte: "2024-03-07" };
        postEventDateRange = { gte: "2024-03-08" };

        phaseFilters = [
          {
            bool: {
              must: [
                {
                  match_phrase: { "llm_motivation.phase.keyword": "pre_event" },
                },
                { range: { p_created_time: preEventDateRange } },
              ],
            },
          },
          {
            bool: {
              must: [
                {
                  bool: {
                    should: [
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day1",
                        },
                      },
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day2",
                        },
                      },
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day3",
                        },
                      },
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day4",
                        },
                      },
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day5",
                        },
                      },
                    ],
                    minimum_should_match: 1,
                  },
                },
                { range: { p_created_time: exhibitionDateRange } },
              ],
            },
          },
          {
            bool: {
              must: [
                {
                  match_phrase: {
                    "llm_motivation.phase.keyword": "post_event",
                  },
                },
                { range: { p_created_time: postEventDateRange } },
              ],
            },
          },
        ];
      }

      // Build base query filters that will be reused
      const baseFilters = [
        { query_string: { query: topicQueryString } },
        ...(sentiment?.trim()
          ? [{ match: { predicted_sentiment_value: sentiment.trim() } }]
          : []),
        ...(sources?.trim()
          ? [{ term: { "source.keyword": sources.trim() } }]
          : []),
        ...(subtopicId?.trim()
          ? [{ term: { subtopic_id: parseInt(subtopicId) } }]
          : []),
      ];

      const baseMustNot = [
        { term: { "llm_motivation.phase.keyword": "" } },
        { term: { "llm_motivation.phase.keyword": "null" } },
        {
          bool: {
            must_not: { exists: { field: "llm_motivation.phase" } },
          },
        },
      ];

            // Main Elasticsearch query for aggregations only (no posts)
      const query = {
        size: 0,
        query: {
          bool: {
            must: [
              ...baseFilters,
              ...(phaseFilters
                ? [{ bool: { should: phaseFilters, minimum_should_match: 1 } }]
                : [
                    {
                      range: {
                        p_created_time: {
                          gte: effectiveFromDate || "now-90d",
                          lte: effectiveToDate || "now",
                        },
                      },
                    },
                  ]),
            ],
            must_not: baseMustNot,
          },
        },
        aggs: {
          phase_breakdown: {
            terms: {
              field: "llm_motivation.phase.keyword",
              size: 20,
              exclude: "Unknown",
              missing: "Unknown",
            },
            aggs: {
              // Pre-event monthly aggregation
              pre_event_monthly: {
                filter: {
                  bool: {
                    must: [
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "pre_event",
                        },
                      },
                      ...(preEventDateRange
                        ? [{ range: { p_created_time: preEventDateRange } }]
                        : []),
                    ],
                  },
                },
                aggs: {
                  time_intervals: {
                    date_histogram: {
                      field: "p_created_time",
                      calendar_interval: "1M",
                      format: "yyyy-MM",
                      min_doc_count: 0,
                    },
                    aggs: {
                      sentiments: {
                        terms: {
                          field: "predicted_sentiment_value.keyword",
                          size: 100,
                          exclude: "Unknown",
                          missing: "Unknown",
                        },
                      },
                    },
                  },
                },
              },
              // Exhibition days daily aggregation
              exhibition_daily: {
                filter: {
                  bool: {
                    should: [
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day1",
                        },
                      },
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day2",
                        },
                      },
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day3",
                        },
                      },
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day4",
                        },
                      },
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "day5",
                        },
                      },
                    ],
                    minimum_should_match: 1,
                  },
                },
                aggs: {
                  by_day: {
                    terms: {
                      field: "llm_motivation.phase.keyword",
                      size: 10,
                      include: "day[1-5]",
                    },
                    aggs: {
                      time_intervals: {
                        date_histogram: {
                          field: "p_created_time",
                          calendar_interval: "1d",
                          format: "yyyy-MM-dd",
                          min_doc_count: 0,
                        },
                        aggs: {
                          sentiments: {
                            terms: {
                              field: "predicted_sentiment_value.keyword",
                              size: 100,
                              exclude: "Unknown",
                              missing: "Unknown",
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              // Post-event monthly aggregation
              post_event_monthly: {
                filter: {
                  bool: {
                    must: [
                      {
                        match_phrase: {
                          "llm_motivation.phase.keyword": "post_event",
                        },
                      },
                      ...(postEventDateRange
                        ? [{ range: { p_created_time: postEventDateRange } }]
                        : []),
                    ],
                  },
                },
                aggs: {
                  time_intervals: {
                    date_histogram: {
                      field: "p_created_time",
                      calendar_interval: "1M",
                      format: "yyyy-MM",
                      min_doc_count: 0,
                    },
                    aggs: {
                      sentiments: {
                        terms: {
                          field: "predicted_sentiment_value.keyword",
                          size: 100,
                          exclude: "Unknown",
                          missing: "Unknown",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      // Add category filters to the query
      if (Object.keys(categoryData).length > 0) {
        const categoryFilters = [];
        
        Object.values(categoryData).forEach(data => {
          if (data.keywords && data.keywords.length > 0) {
            data.keywords.forEach(keyword => {
              categoryFilters.push({
                multi_match: {
                  query: keyword,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
          if (data.hashtags && data.hashtags.length > 0) {
            data.hashtags.forEach(hashtag => {
              categoryFilters.push({
                multi_match: {
                  query: hashtag,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
          if (data.urls && data.urls.length > 0) {
            data.urls.forEach(url => {
              categoryFilters.push({
                multi_match: {
                  query: url,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
        });

        if (categoryFilters.length > 0) {
          query.query.bool.must.push({
            bool: {
              should: categoryFilters,
              minimum_should_match: 1
            }
          });
        }
      }

      // Helper function to format post data (similar to your getSentimentsAnalysis)
      const formatPostData = (hit) => {
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
        const engagements =
          source.p_engagement > 0 ? `${source.p_engagement}` : "";

        const content =
          source.p_content && source.p_content.trim() !== ""
            ? source.p_content
            : "";
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

        if (source.predicted_category)
          predicted_category = source.predicted_category;

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
        };
      };

      // Helper function to fetch posts for a specific sentiment and time range
      const fetchPostsForSentiment = async (
        sentimentName,
        dateRange,
        phaseFilter,
        maxPosts = 30
      ) => {
        try {
          const postsQuery = {
            size: maxPosts,
            query: {
              bool: {
                must: [
                  ...baseFilters, // Use the same base filters as aggregation
                  { range: { p_created_time: dateRange } },
                  {
                    term: {
                      "predicted_sentiment_value.keyword": sentimentName,
                    },
                  },
                  ...(phaseFilter ? [phaseFilter] : []),
                ],
                must_not: baseMustNot, // Use the same must_not conditions
              },
            },
            sort: [{ p_created_time: { order: "desc" } }],
          };

          const response = await elasticClient.search({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: postsQuery,
          });

          return response.hits.hits.map((hit) => formatPostData(hit));
        } catch (error) {
          console.error(
            `Error fetching posts for sentiment ${sentimentName}:`,
            error
          );
          return [];
        }
      };

      // Execute the main aggregation query
      const result = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: query,
      });

      const totalDocs = result.hits.total.value;
      const phaseBuckets = result.aggregations.phase_breakdown.buckets;

      // Process the results
      const processedData = {
        pre_event: {
          phase: "pre_event",
          interval_type: "monthly",
          time_series: [],
        },
        exhibition_days: {
          phase: "exhibition_days",
          interval_type: "daily",
          time_series: [],
        },
        post_event: {
          phase: "post_event",
          interval_type: "monthly",
          time_series: [],
        },
      };

      // Process each phase bucket
      for (const phaseBucket of phaseBuckets) {
        const phaseKey = phaseBucket.key;

        // Process pre-event monthly data
        if (phaseKey === "pre_event") {
          if (phaseBucket.pre_event_monthly?.time_intervals?.buckets) {
            for (const bucket of phaseBucket.pre_event_monthly.time_intervals
              .buckets) {
              const timeSeriesItem = {
                date: bucket.key_as_string,
                timestamp: bucket.key,
                total_count: bucket.doc_count,
                sentiments: [],
              };

              // Process each sentiment in this time bucket
              for (const sentimentBucket of bucket.sentiments.buckets) {
                const sentimentName = sentimentBucket.key;
                const sentimentCount = sentimentBucket.doc_count;

                // Calculate date range for this month - ensure it matches the aggregation exactly
                const [year, month] = bucket.key_as_string.split("-");
                const startDate = `${year}-${month.padStart(2, "0")}-01`;
                const lastDay = new Date(
                  parseInt(year),
                  parseInt(month),
                  0
                ).getDate();
                const endDate = `${year}-${month.padStart(2, "0")}-${String(
                  lastDay
                ).padStart(2, "0")}`;

                // Use the same date range constraints as aggregation if they exist
                let finalDateRange;
                if (preEventDateRange) {
                  finalDateRange = {
                    gte:
                      startDate > preEventDateRange.gte
                        ? startDate
                        : preEventDateRange.gte,
                    lte:
                      endDate < preEventDateRange.lte
                        ? endDate
                        : preEventDateRange.lte,
                  };
                } else {
                  finalDateRange = { gte: startDate, lte: endDate };
                }

                // Fetch posts for this sentiment
                const posts = await fetchPostsForSentiment(
                  sentimentName,
                  finalDateRange,
                  {
                    match_phrase: {
                      "llm_motivation.phase.keyword": "pre_event",
                    },
                  }
                );

                timeSeriesItem.sentiments.push({
                  sentiment: sentimentName,
                  count: sentimentCount,
                  posts: posts,
                });
              }

              processedData.pre_event.time_series.push(timeSeriesItem);
            }
          }
        }

        // Process exhibition days daily data
        if (phaseKey.startsWith("day")) {
          const exhibitionBucket = phaseBuckets.find(
            (bucket) =>
              bucket.key.startsWith("day") &&
              bucket.exhibition_daily?.by_day?.buckets
          );

          if (
            exhibitionBucket?.exhibition_daily?.by_day?.buckets &&
            processedData.exhibition_days.time_series.length === 0
          ) {
            for (const dayBucket of exhibitionBucket.exhibition_daily.by_day
              .buckets) {
              const dayPhase = dayBucket.key;

              for (const bucket of dayBucket.time_intervals.buckets) {
                const timeSeriesItem = {
                  date: bucket.key_as_string,
                  timestamp: bucket.key,
                  day_phase: dayPhase,
                  total_count: bucket.doc_count,
                  sentiments: [],
                };

                // Process each sentiment in this time bucket
                for (const sentimentBucket of bucket.sentiments.buckets) {
                  const sentimentName = sentimentBucket.key;
                  const sentimentCount = sentimentBucket.doc_count;

                  // Use exact date range for daily data with exhibition constraints
                  let finalDateRange;
                  if (exhibitionDateRange) {
                    const currentDate = bucket.key_as_string;
                    finalDateRange = {
                      gte:
                        currentDate >= exhibitionDateRange.gte
                          ? currentDate
                          : exhibitionDateRange.gte,
                      lte:
                        currentDate <= exhibitionDateRange.lte
                          ? currentDate
                          : exhibitionDateRange.lte,
                    };
                  } else {
                    finalDateRange = {
                      gte: bucket.key_as_string,
                      lte: bucket.key_as_string,
                    };
                  }

                  // Fetch posts for this sentiment and day
                  const posts = await fetchPostsForSentiment(
                    sentimentName,
                    finalDateRange,
                    {
                      match_phrase: {
                        "llm_motivation.phase.keyword": dayPhase,
                      },
                    }
                  );

                  timeSeriesItem.sentiments.push({
                    sentiment: sentimentName,
                    count: sentimentCount,
                    posts: posts,
                  });
                }

                processedData.exhibition_days.time_series.push(timeSeriesItem);
              }
            }
            // Sort by timestamp
            processedData.exhibition_days.time_series.sort(
              (a, b) => a.timestamp - b.timestamp
            );
          }
        }

        // Process post-event monthly data
        if (phaseKey === "post_event") {
          if (phaseBucket.post_event_monthly?.time_intervals?.buckets) {
            for (const bucket of phaseBucket.post_event_monthly.time_intervals
              .buckets) {
              const timeSeriesItem = {
                date: bucket.key_as_string,
                timestamp: bucket.key,
                total_count: bucket.doc_count,
                sentiments: [],
              };

              // Process each sentiment in this time bucket
              for (const sentimentBucket of bucket.sentiments?.buckets || []) {
                const sentimentName = sentimentBucket.key;
                const sentimentCount = sentimentBucket.doc_count;

                // Calculate date range for this month - ensure it matches the aggregation exactly
                const [year, month] = bucket.key_as_string.split("-");
                const startDate = `${year}-${month.padStart(2, "0")}-01`;
                const lastDay = new Date(
                  parseInt(year),
                  parseInt(month),
                  0
                ).getDate();
                const endDate = `${year}-${month.padStart(2, "0")}-${String(
                  lastDay
                ).padStart(2, "0")}`;

                // Use the same date range constraints as aggregation if they exist
                let finalDateRange;
                if (postEventDateRange) {
                  finalDateRange = {
                    gte:
                      startDate > postEventDateRange.gte
                        ? startDate
                        : postEventDateRange.gte,
                    lte: postEventDateRange.lte
                      ? endDate < postEventDateRange.lte
                        ? endDate
                        : postEventDateRange.lte
                      : endDate,
                  };
                } else {
                  finalDateRange = { gte: startDate, lte: endDate };
                }

                // Fetch posts for this sentiment
                const posts = await fetchPostsForSentiment(
                  sentimentName,
                  finalDateRange,
                  {
                    match_phrase: {
                      "llm_motivation.phase.keyword": "post_event",
                    },
                  }
                );

                timeSeriesItem.sentiments.push({
                  sentiment: sentimentName,
                  count: sentimentCount,
                  posts: posts,
                });
              }

              processedData.post_event.time_series.push(timeSeriesItem);
            }
          }
        }
      }

      return res.status(200).json({
        success: true,
        data: processedData,
        total: totalDocs,
      });
    } catch (error) {
      console.error("Error fetching sentiment trend data:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message,
      });
    }
  },

  // Helper function for formatting posts - moved outside methods for reuse
  localFormatPost: function(hit) {
    const src = hit._source || {};
    const profilePic = src.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;
    const llm_emotion = src.llm_emotion || '';
    const commentsUrl = src.p_comments_text && src.p_comments_text.trim() !== ''
      ? (src.p_url || '').toString().trim().replace('https: // ', 'https://')
      : '';
    const imageUrl = src.p_picture_url && src.p_picture_url.trim() !== ''
      ? src.p_picture_url
      : `${process.env.PUBLIC_IMAGES_PATH}grey.png`;
    let predicted_sentiment = '';
    if (src.predicted_sentiment_value) predicted_sentiment = `${src.predicted_sentiment_value}`;
    else if (src.source === 'GoogleMyBusiness' && src.rating) {
      predicted_sentiment = src.rating >= 4 ? 'Positive' : src.rating <= 2 ? 'Negative' : 'Neutral';
    }
    let youtubeVideoUrl = '';
    let profilePicture2 = '';
    if (src.source === 'Youtube') {
      if (src.video_embed_url) youtubeVideoUrl = src.video_embed_url;
      else if (src.p_id) youtubeVideoUrl = `https://www.youtube.com/embed/${src.p_id}`;
    } else {
      profilePicture2 = src.p_picture ? src.p_picture : '';
    }
    let sourceIcon = '';
    const userSource = src.source;
    if (['khaleej_times','Omanobserver','Time of oman','Blogs'].includes(userSource)) sourceIcon = 'Blog';
    else if (userSource === 'Reddit') sourceIcon = 'Reddit';
    else if (['FakeNews','News'].includes(userSource)) sourceIcon = 'News';
    else if (userSource === 'Tumblr') sourceIcon = 'Tumblr';
    else if (userSource === 'Vimeo') sourceIcon = 'Vimeo';
    else if (['Web','DeepWeb'].includes(userSource)) sourceIcon = 'Web';
    else sourceIcon = userSource;
    let message_text = '';
    if (['GoogleMaps','Tripadvisor'].includes(src.source)) {
      const parts = (src.p_message_text || '').split('***|||###');
      message_text = (parts[0] || '').replace(/\n/g, '<br>');
    } else {
      message_text = src.p_message_text ? src.p_message_text.replace(/<\/?[^>]+(>|$)/g, '') : '';
    }
    return {
      profilePicture: profilePic,
      profilePicture2,
      userFullname: src.u_fullname,
      user_data_string: '',
      followers: src.u_followers > 0 ? `${src.u_followers}` : '',
      following: src.u_following > 0 ? `${src.u_following}` : '',
      posts: src.u_posts > 0 ? `${src.u_posts}` : '',
      likes: src.p_likes > 0 ? `${src.p_likes}` : '',
      llm_emotion,
      commentsUrl,
      comments: `${src.p_comments}`,
      shares: src.p_shares > 0 ? `${src.p_shares}` : '',
      engagements: src.p_engagement > 0 ? `${src.p_engagement}` : '',
      content: src.p_content && src.p_content.trim() !== '' ? src.p_content : '',
      image_url: imageUrl,
      predicted_sentiment,
      predicted_category: src.predicted_category || '',
      youtube_video_url: youtubeVideoUrl,
      source_icon: `${src.p_url},${sourceIcon}`,
      message_text,
      source: src.source,
      rating: src.rating,
      comment: src.comment,
      businessResponse: src.business_response,
      uSource: src.u_source,
      googleName: src.name,
      country: src.u_country,
      created_at: new Date(src.p_created_time || src.created_at).toLocaleString()
    };
  },

  trustDimensionsEducationSystem: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType, sources, categoryItems } = req.body;
  
      // Determine which category data to use
      let categoryData = {};
      if (categoryItems && Array.isArray(categoryItems) && categoryItems.length > 0) {
        categoryData = processCategoryItems(categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }
  
      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;
      // Validate and filter sources against available data sources
      const availableDataSources = req.processedDataSources || [];
      const validatedSources = sources ? normalizeSourceInput(sources).filter(src =>
        availableDataSources.includes(src) || availableDataSources.length === 0
      ) : [];

      const isScadUser = false;
      const selectedTab = "Social";
      
      let topicQueryString = await buildQueryString(topicId, isScadUser, selectedTab);
      
      // Apply source filtering based on topicId
      if (parseInt(topicId) === 2619) {
        topicQueryString = `${topicQueryString} AND source:("LinkedIn" OR "Linkedin")`;
      } else if (isSpecialTopic) {
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook")`;
      } else {
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;
      }
  
      // Build the base query
      const baseQuery = {
        bool: {
          must: [
            { query_string: { query: topicQueryString } },
            {
              range: {
                p_created_time: {
                  gte: fromDate || "now-90d",
                  lte: toDate || "now",
                },
              },
            },
          ],
          must_not: [
            { term: { "trust_dimensions.keyword": "" } },
            { term: { "trust_dimensions.keyword": "{}" } },
          ],
        },
      };
  
      // Apply sentiment filter if provided
      if (sentimentType && sentimentType !== "") {
        baseQuery.bool.must.push({
          match: {
            predicted_sentiment_value: sentimentType.trim(),
          },
        });
      }
  
      // Add category filters to the query
      if (Object.keys(categoryData).length > 0) {
        const categoryFilters = [];
        
        Object.values(categoryData).forEach(data => {
          // Process keywords
          if (data.keywords && Array.isArray(data.keywords) && data.keywords.length > 0) {
            data.keywords.forEach(keyword => {
              categoryFilters.push({
                multi_match: {
                  query: keyword,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
          
          // Process hashtags
          if (data.hashtags && Array.isArray(data.hashtags) && data.hashtags.length > 0) {
            data.hashtags.forEach(hashtag => {
              categoryFilters.push({
                multi_match: {
                  query: hashtag,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
          
          // Process URLs
          if (data.urls && Array.isArray(data.urls) && data.urls.length > 0) {
            data.urls.forEach(url => {
              categoryFilters.push({
                multi_match: {
                  query: url,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
        });
  
        if (categoryFilters.length > 0) {
          baseQuery.bool.must.push({
            bool: {
              should: categoryFilters,
              minimum_should_match: 1
            }
          });
        }
      }
  
      // Optimized aggregation-only query
      const aggQuery = {
        size: 0, // Don't return any documents, only aggregations
        query: baseQuery,
        aggs: {
          dimensions: {
            terms: {
              field: 'trust_dimensions.keyword',
              size: 200,
              order: { _count: 'desc' },
              exclude: ['', '{}', 'dimension1'], // Exclude empty values and dimension1
              min_doc_count: 1 // Only return dimensions with at least 1 document
            },
            aggs: {
              emotions: {
                terms: {
                  field: 'llm_emotion.keyword',
                  size: 20,
                  order: { _count: 'desc' },
                  min_doc_count: 1 // Only return emotions with at least 1 document
                }
              }
            }
          }
        },
        track_total_hits: true,
        timeout: '30s' // Increased timeout to be safe
      };
  
      // Execute single aggregation query
      const result = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggQuery,
      });
  
      // Extract total hits from the response
      let totalHits = 0;
      if (result.hits && result.hits.total) {
        if (typeof result.hits.total === 'number') {
          totalHits = result.hits.total;
        } else if (typeof result.hits.total === 'object' && result.hits.total.value) {
          totalHits = result.hits.total.value;
        }
      }
  
      // Process aggregation results
      const buckets = result.aggregations?.dimensions?.buckets || [];
  
      // Transform aggregation data
      const dataAll = buckets.map(bucket => {
        const emotions = (bucket.emotions?.buckets || [])
          .map(emotionBucket => ({
            emotion: emotionBucket.key || 'unknown',
            count: emotionBucket.doc_count || 0
          }))
          .sort((a, b) => b.count - a.count);
  
        const total = emotions.reduce((sum, emotion) => sum + emotion.count, 0);
  
        return {
          dimension: bucket.key || 'unknown',
          emotions,
          total
        };
      })
      .filter(item => item.total > 0) // Remove any items with 0 total
      .sort((a, b) => b.total - a.total);
  
      // Return top 10 dimensions
      const data = dataAll.slice(0, 10);
  
      // Calculate total docs from aggregation buckets
      const totalDocs = buckets.reduce((sum, bucket) => sum + (bucket.doc_count || 0), 0);
  
      return res.status(200).json({
        success: true,
        data,
        total: dataAll.length,
        totalDocs: Math.max(totalDocs, totalHits) // Use the higher of the two values
      });
  
    } catch (error) {
      console.error("Error in trustDimensionsEducationSystem:", error);
      
      // Provide more detailed error information
      let errorMessage = "Internal server error";
      if (error.meta && error.meta.body && error.meta.body.error) {
        errorMessage = error.meta.body.error.reason || errorMessage;
      }
      
      return res.status(500).json({ 
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

   // New: fetch posts for a specific trust dimension and emotion
   trustDimensionsEducationSystemPosts: async function(req, res) {
    try {
      const { fromDate, toDate, topicId, sentimentType, source, categoryItems, dimension, emotion } = req.body;

      if (!dimension) return res.status(400).json({ success: false, error: 'dimension is required' });

      // Determine category data
      let categoryData = {};
      if (categoryItems && Array.isArray(categoryItems) && categoryItems.length > 0) {
        categoryData = processCategoryItems(categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      // topic/source filter
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;
      const isScadUser = false;
      const selectedTab = 'Social';
      let topicQueryString = await buildQueryString(topicId, isScadUser, selectedTab);
      if (parseInt(topicId) === 2619) topicQueryString = `${topicQueryString} AND source:("LinkedIn" OR "Linkedin")`;
      else if (isSpecialTopic) topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook")`;
      else topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;

      // base query
      const must = [
        { query_string: { query: topicQueryString } },
        { range: { p_created_time: { gte: fromDate || 'now-90d', lte: toDate || 'now' } } },
        { terms: { 'trust_dimensions.keyword': [dimension] } }
      ];

      if (sentimentType && sentimentType !== '') {
        must.push({ match: { predicted_sentiment_value: sentimentType.trim() } });
      }
      if (emotion && emotion !== '') {
        must.push({ term: { 'llm_emotion.keyword': emotion } });
      }

      // category filters
      const categoryFilters = [];
      if (Object.keys(categoryData).length > 0) {
        Object.values(categoryData).forEach(data => {
          (data.keywords || []).forEach(keyword => categoryFilters.push({ multi_match: { query: keyword, fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'], type: 'phrase' } }));
          (data.hashtags || []).forEach(hashtag => categoryFilters.push({ multi_match: { query: hashtag, fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'], type: 'phrase' } }));
          (data.urls || []).forEach(url => categoryFilters.push({ multi_match: { query: url, fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'], type: 'phrase' } }));
        });
      }
      if (categoryFilters.length > 0) {
        must.push({ bool: { should: categoryFilters, minimum_should_match: 1 } });
      }

      const searchBody = {
        size: 50,
        query: { bool: { must, must_not: [{ term: { 'trust_dimensions.keyword': '' } }] } },
        sort: [{ p_created_time: { order: 'desc' } }],
        _source: [
          'trust_dimensions','llm_emotion','predicted_sentiment_value','created_at','p_created_time','source','p_message','p_message_text','u_profile_photo','u_followers','u_following','u_posts','p_likes','p_comments_text','p_url','p_comments','p_shares','p_engagement','p_content','p_picture_url','predicted_category','u_fullname','video_embed_url','p_picture','p_id','rating','comment','business_response','u_source','name','u_country'
        ]
      };

      const searchRes = await elasticClient.search({ index: process.env.ELASTICSEARCH_DEFAULTINDEX, body: searchBody });
      const hits = searchRes.hits?.hits || [];
      const posts = hits.map(h => formatTrustPost(h));

      // count total for the same filters
      const countRes = await elasticClient.search({ index: process.env.ELASTICSEARCH_DEFAULTINDEX, body: { size: 0, query: searchBody.query } });
      const total = countRes.hits?.total?.value || 0;

      return res.status(200).json({ success: true, posts, total });
    } catch (error) {
      console.error('Error fetching trustDimensionsEducationSystem posts:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },


  benchMarkingPresenceSentiment: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType, source, categoryItems } =
        req.body;

      // Determine which category data to use
      let categoryData = {};
      if (categoryItems && Array.isArray(categoryItems) && categoryItems.length > 0) {
        categoryData = processCategoryItems(categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      // Validate and filter sources against available data sources
      const availableDataSources = req.processedDataSources || [];
      const validatedSources = sources ? normalizeSourceInput(sources).filter(src =>
        availableDataSources.includes(src) || availableDataSources.length === 0
      ) : [];

      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );
      if (parseInt(topicId) === 2619) {
        topicQueryString = `${topicQueryString} AND source:("LinkedIn" OR "Linkedin")`;
        // Apply special topic source filtering
      }
      // Apply special topic source filtering
      else if (isSpecialTopic) {
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook")`;
      } else {
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;
      }



      // **Single Aggregation Query**
      const query = {
        size: 10000,
        query: {
          bool: {
            must: [
              { query_string: { query: topicQueryString } },
              {
                range: {
                  p_created_time: {
                    gte: fromDate || "now-90d",
                    lte: toDate || "now",
                  },
                },
              },
              {
                terms: {
                  "entity_mentions.entity_type": ["NGO", "IGO"],
                },
              },
            ],
            must_not: [
              { term: { "trust_dimensions": "" } },
              { term: { "trust_dimensions": "{}" } },
            ],
          },
        },
      };

      // Add sentiment filter if provided
      if (sentimentType && sentimentType != "") {
        query.query.bool.must.push({
          match: {
            predicted_sentiment_value: sentimentType.trim(),
          },
        });
      }

      // Add category filters to the query
      if (Object.keys(categoryData).length > 0) {
        const categoryFilters = [];
        
        Object.values(categoryData).forEach(data => {
          if (data.keywords && data.keywords.length > 0) {
            data.keywords.forEach(keyword => {
              categoryFilters.push({
                multi_match: {
                  query: keyword,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
          if (data.hashtags && data.hashtags.length > 0) {
            data.hashtags.forEach(hashtag => {
              categoryFilters.push({
                multi_match: {
                  query: hashtag,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
          if (data.urls && data.urls.length > 0) {
            data.urls.forEach(url => {
              categoryFilters.push({
                multi_match: {
                  query: url,
                  fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                  type: 'phrase'
                }
              });
            });
          }
        });

        if (categoryFilters.length > 0) {
          query.query.bool.must.push({
            bool: {
              should: categoryFilters,
              minimum_should_match: 1
            }
          });
        }
      }

      query.size = 0; // Do not return documents, just aggregations
      query.aggs = {
        sentiment_counts: {
          terms: {
            field: "predicted_sentiment_value.keyword",
            size: 10, // Adjust as needed
          },
        },
      };
      // Execute query
      const result = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: query,
      });

      return res.status(200).json({ result,query });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
};
module.exports = mentionsChartController;
