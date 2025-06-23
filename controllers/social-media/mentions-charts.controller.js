const { elasticClient } = require("../../config/elasticsearch");
const express = require("express");
const router = express.Router();
const prisma = require("../../config/database");

const buildQueryString = async (topicId, isScadUser, selectedTab) => {
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
  sentimentType
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
    "linkedinContent",
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

      // ✅ Assign actual count from Elasticsearch, if available
      actionData[keyName] = source.doc_count;
    });

    responseOutput[action.key] = actionData;
  });

  return { responseOutput };
};

const getPosts = async (
  fromDate,
  toDate,
  topicQueryString,
  sentimentType,
  field,
  type,
  value,
  res,
  source,
  llm_mention_type
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
        migration_topics: `${type}: "${sentimentType}"`,
      },
    });
    sentimentType = null;
  } else if (field === "trust_dimensions") {
    query.query.bool.must.push({
      match_phrase: {
        trust_dimensions: `${type}: "${sentimentType}"`,
      },
    });
    sentimentType = null;
  } else if (field === "llm_core_insights.event_type") {
    query.query.bool.must.push({
      match_phrase: {
        "llm_core_insights.event_type": `${type}`,
      },
    });
  } else if (field === "llm_motivation.word_cloud_phrases") {
    query.query.bool.must.push(
      {
        term: {
          "llm_motivation.word_cloud_phrases.keyword": `${value}`,
        },
      },
      {
        term: {
          "llm_motivation.phase.keyword": `${type}`,
        },
      }
    );
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
    };

    responseArray.push(cardData);
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
const formatPostDataForLanguage = (hit) => {
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
      const { fromDate, toDate, subtopicId, topicId, sentimentType } = req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

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
      if (isSpecialTopic) {
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook")`;
      } else {
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram"  OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;
      }

      // Apply special topic date range
      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "2020-01-01" : fromDate;
      const effectiveToDate = isSpecialTopic && !toDate ? "now" : toDate;

      // Fetch mention actions in **one** query
      const response = await getActionRequired(
        effectiveFromDate,
        effectiveToDate,
        topicQueryString,
        sentimentType
      );

      return res.status(200).json(response);
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  typeofMentions: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType } = req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

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
      if (isSpecialTopic) {
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook")`;
      } else {
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;
      }

      // Apply special topic date range
      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "2020-01-01" : fromDate;
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
                    gte: effectiveFromDate || "now-90d",
                    lte: effectiveToDate || "now",
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
        sources = "All",
      } = req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

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
        if (sources == "All") {
          topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram"  OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;
        } else {
          topicQueryString = `${topicQueryString} AND source:(${sources})`;
        }
      }

      // Apply special topic date range
      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "2020-01-01" : fromDate;
      const effectiveToDate = isSpecialTopic && !toDate ? "now" : toDate;

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
                    gte: effectiveFromDate || "now-90d",
                    lte: effectiveToDate || "now",
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
      const { fromDate, toDate, subtopicId, topicId, sentimentType } = req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

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
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram"  OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;
      }

      // Apply special topic date range
      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "2020-01-01" : fromDate;
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
                    gte: effectiveFromDate || "now-90d",
                    lte: effectiveToDate || "now",
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
      const { fromDate, toDate, subtopicId, topicId, sentimentType } = req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

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
      if (isSpecialTopic) {
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook")`;
      } else {
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram"  OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;
      }

      // Apply special topic date range
      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "2020-01-01" : fromDate;
      const effectiveToDate = isSpecialTopic && !toDate ? "now" : toDate;

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
                    gte: effectiveFromDate || "now-90d",
                    lte: effectiveToDate || "now",
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
      const { fromDate, toDate, subtopicId, topicId, sentimentType } = req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

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
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram"  OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;
      }

      // Apply special topic date range
      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "2020-01-01" : fromDate;
      const effectiveToDate = isSpecialTopic && !toDate ? "now" : toDate;

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
                    gte: effectiveFromDate || "now-90d",
                    lte: effectiveToDate || "now",
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
      const { fromDate, toDate, subtopicId, topicId, sentimentType } = req.body;

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

      // Apply special topic source filtering
      if (isSpecialTopic) {
        topicQueryString += ` AND source:("Twitter" OR "Facebook")`;
      } else {
        topicQueryString += ` AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;
      }

      // Apply special topic date range
      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "2020-01-01" : fromDate;
      const effectiveToDate = isSpecialTopic && !toDate ? "now" : toDate;

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
                    gte: effectiveFromDate || "now-90d",
                    lte: effectiveToDate || "now",
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
      const { fromDate, toDate, subtopicId, topicId, sentimentType } = req.body;

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
      if (isSpecialTopic) {
        topicQueryString += ` AND source:("Twitter" OR "Facebook")`;
      } else {
        topicQueryString += ` AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;
      }

      // Apply special topic date range
      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "2020-01-01" : fromDate;
      const effectiveToDate = isSpecialTopic && !toDate ? "now" : toDate;

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
                    gte: effectiveFromDate || "now-90d",
                    lte: effectiveToDate || "now",
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
      const { fromDate, toDate, subtopicId, topicId, sentimentType } = req.body;

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

      // Apply special topic source filtering
      if (isSpecialTopic) {
        topicQueryString += ` AND source:("Twitter" OR "Facebook")`;
      } else {
        topicQueryString += ` AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;
      }

      // Apply special topic date range
      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "2020-01-01" : fromDate;
      const effectiveToDate = isSpecialTopic && !toDate ? "now" : toDate;

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
                    gte: effectiveFromDate || "now-90d",
                    lte: effectiveToDate || "now",
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

      // Optional sentiment filter
      if (sentimentType && sentimentType.trim() !== "") {
        query.query.bool.must.push({
          match: {
            predicted_sentiment_value: sentimentType.trim(),
          },
        });
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
      const { fromDate, toDate, subtopicId, topicId, sentimentType } = req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

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
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram"  OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;
      }

      // Apply special topic date range
      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "2020-01-01" : fromDate;
      const effectiveToDate = isSpecialTopic && !toDate ? "now" : toDate;

      // Build base query for aggregation
      const baseQuery = {
        bool: {
          must: [
            { query_string: { query: topicQueryString } },
            {
              range: {
                p_created_time: {
                  gte: effectiveFromDate || "now-90d",
                  lte: effectiveToDate || "now",
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

      // **Single Aggregation Query**
      const aggregationQuery = {
        size: 0,
        query: baseQuery,
        aggs: {
          llm_language: {
            terms: { field: "llm_language.keyword", size: 10 },
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
            formatPostDataForLanguage(hit)
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

      // Sort by count (descending)
      languagesWithPosts.sort((a, b) => b.count - a.count);

      // Create backward compatibility object
      const influencersCoverage = {};
      languagesWithPosts.forEach((lang) => {
        influencersCoverage[lang.name] = lang.count;
      });

      return res.status(200).json({
        influencersCoverage,
        languages: languagesWithPosts,
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
        source,
        field,
        type,
        value,
      } = req.query;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      // Apply special topic source filtering
      if (isSpecialTopic) {
        if (source != "All") {
          // Only allow Facebook or Twitter for special topic
          if (source === "Facebook" || source === "Twitter") {
            topicQueryString = `${topicQueryString} AND source:("${source}")`;
          } else {
            // If source is not Facebook or Twitter, use Facebook and Twitter
            topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook")`;
          }
        } else {
          topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook")`;
        }
      } else {
        if (source != "All") {
          topicQueryString = `${topicQueryString} AND source:("${source}")`;
        } else {
          topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram"  OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;
        }
      }

      // Apply special topic date range
      const effectiveGreaterThanTime =
        isSpecialTopic && !greaterThanTime ? "2020-01-01" : greaterThanTime;
      const effectiveLessThanTime =
        isSpecialTopic && !lessThanTime ? "now" : lessThanTime;

      // Fetch mention actions in **one** query
      await getPosts(
        effectiveGreaterThanTime,
        effectiveLessThanTime,
        topicQueryString,
        sentiment,
        field,
        type,
        value,
        res
      );
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  typeofMentionsTo10: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType } = req.body;

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
      topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram")`;

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
      if (isSpecialTopic) {
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook")`;
      } else {
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram"  OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;
      }

      // Apply special topic date range
      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "2020-01-01" : fromDate;
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
                    gte: effectiveFromDate || "now-90d",
                    lte: effectiveToDate || "now",
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
                    min: effectiveFromDate || "now-90d",
                    max: effectiveToDate || "now",
                  },
                },
                aggs: {
                  date_filter: {
                    filter: {
                      range: {
                        p_created_time: {
                          gte: effectiveFromDate || "now-90d",
                          lte: effectiveToDate || "now",
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
        // const sourcesArray = [
        //   'Mobile Banking App',
        //   'Mobile App',
        //   'Website',
        //   'ATM',
        //   'Physical Branch',
        //   'Social Media',
        //   'Online Banking Platform',
        //   'Customer Service (Phone, Email, or Live Chat)',
        //   'IVR System',
        //   'Call Center',
        //   'Bill Payment Platform',
        //   'Loan Application Process',
        //   'Service Connection/Disconnection',
        //   'Physical Office',
        //   'Installation/Technical Support',
        //   'Network Coverage',
        //   'Billing System',
        //   'Data Roaming',
        //   'Plan Upgrades',
        //   'Device Purchases/Repairs',
        //   'Wi-Fi Services',
        //   'Home Internet Services',
        //   'Meter Reading',
        //   'Outage Reporting System',
        //   'Mortgage Services',
        //   'Credit Card Services',
        //   'Fraud Detection/Resolution',
        //   'Wealth Management',
        //   'Transaction Alerts',
        //   'Airport Check-in Counter',
        //   'Self-service Kiosk',
        //   'In-flight Experience',
        //   'Boarding Process',
        //   'Baggage Handling',
        //   'Loyalty Program',
        //   'Government Website/Portal',
        //   'Public Service Office',
        //   'Document Submission Process',
        //   'Permit/License Application',
        //   'In-person Appointment',
        //   'Physical Store',
        //   'Digital Channels',
        //   'Physical Channels',
        //   'Customer Support',
        //   'Social and Engagement Channels',
        //   'Messaging and Alerts',
        //   'Loyalty and Rewards',
        //   'Other'
        // ]

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
        // const sourcesArray = [
        //   'Physical Branches and ATMs',
        //   'Digital Channels',
        //   'Customer Service Centers',
        //   'Financial Advisors',
        //   'Marketing Channels',
        //   'Community Initiatives',
        //   'Partner Networks',
        //   'Self-Service Portals',
        //   'Other'
        // ]

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
          console.log();

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
        // const sourcesArray = [
        //   'Mobile Banking App',
        //   'Mobile App',
        //   'Website',
        //   'ATM',
        //   'Physical Branch',
        //   'Social Media',
        //   'Online Banking Platform',
        //   'Customer Service (Phone, Email, or Live Chat)',
        //   'IVR System',
        //   'Call Center',
        //   'Bill Payment Platform',
        //   'Loan Application Process',
        //   'Service Connection/Disconnection',
        //   'Physical Office',
        //   'Installation/Technical Support',
        //   'Network Coverage',
        //   'Billing System',
        //   'Data Roaming',
        //   'Plan Upgrades',
        //   'Device Purchases/Repairs',
        //   'Wi-Fi Services',
        //   'Home Internet Services',
        //   'Meter Reading',
        //   'Outage Reporting System',
        //   'Mortgage Services',
        //   'Credit Card Services',
        //   'Fraud Detection/Resolution',
        //   'Wealth Management',
        //   'Transaction Alerts',
        //   'Airport Check-in Counter',
        //   'Self-service Kiosk',
        //   'In-flight Experience',
        //   'Boarding Process',
        //   'Baggage Handling',
        //   'Loyalty Program',
        //   'Government Website/Portal',
        //   'Public Service Office',
        //   'Document Submission Process',
        //   'Permit/License Application',
        //   'In-person Appointment',
        //   'Physical Store',
        //   'Digital Channels',
        //   'Customer Support',
        //   'Physical Channels',
        //   'Social and Engagement Channels',
        //   'Messaging and Alerts',
        //   'Loyalty and Rewards',
        //   'Other'
        // ]

        //       const sourcesArray = [
        //         "Infrastructure Rebuilding", "Emergency Medical Aid", "Humanitarian Aid",
        // "International Cooperation", "Disaster Relief Coordination", "Aid Effectiveness",
        // "Recovery Progress", "Crisis Communications"
        //      ]

        // const twitterContentQuery = `${topicQueryString} AND llm_mention_touchpoint:("Physical Office")  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`

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
          // webContent = await elasticSearchCount(
          //   elasticMentionQueryTemplate(webContentQuery, greaterThanTime, lessThanTime)
          // )

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
        // const sourcesArray = [
        //   'Mobile Banking App',
        //   'Mobile App',
        //   'Website',
        //   'ATM',
        //   'Physical Branch',
        //   'Social Media',
        //   'Online Banking Platform',
        //   'Customer Service (Phone, Email, or Live Chat)',
        //   'IVR System',
        //   'Call Center',
        //   'Bill Payment Platform',
        //   'Loan Application Process',
        //   'Service Connection/Disconnection',
        //   'Physical Office',
        //   'Installation/Technical Support',
        //   'Network Coverage',
        //   'Billing System',
        //   'Data Roaming',
        //   'Plan Upgrades',
        //   'Device Purchases/Repairs',
        //   'Wi-Fi Services',
        //   'Home Internet Services',
        //   'Meter Reading',
        //   'Outage Reporting System',
        //   'Mortgage Services',
        //   'Credit Card Services',
        //   'Fraud Detection/Resolution',
        //   'Wealth Management',
        //   'Transaction Alerts',
        //   'Airport Check-in Counter',
        //   'Self-service Kiosk',
        //   'In-flight Experience',
        //   'Boarding Process',
        //   'Baggage Handling',
        //   'Loyalty Program',
        //   'Government Website/Portal',
        //   'Public Service Office',
        //   'Document Submission Process',
        //   'Permit/License Application',
        //   'In-person Appointment',
        //   'Physical Store',
        //   'Digital Channels',

        //   'Customer Support',
        //   'Physical Channels',
        //   'Social and Engagement Channels',
        //   'Messaging and Alerts',
        //   'Loyalty and Rewards',
        //   'Other'
        // ]
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

  migrationTopicsSummary: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType, source } =
        req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

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

      // Apply special topic date range
      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "2020-01-01" : fromDate;
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
                    gte: effectiveFromDate || "now-90d",
                    lte: effectiveToDate || "now",
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

      return res.status(200).json({ result });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  eventTypePopularity: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType, source } =
        req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

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
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Linkedin" OR "Web")`;
      }

      // Apply special topic date range
      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "2020-01-01" : fromDate;
      const effectiveToDate = isSpecialTopic && !toDate ? "now" : toDate;

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
                    gte: effectiveFromDate || "now-90d",
                    lte: effectiveToDate || "now",
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
      if (source && source !== "") {
        query.query.bool.must.push({
          term: {
            "source.keyword": source.trim(),
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
      const { fromDate, toDate, subtopicId, topicId, sentiment, source } =
        req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

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
        topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Linkedin" OR "Web")`;
      }

      // Apply special topic date range
      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "2020-01-01" : fromDate;
      const effectiveToDate = isSpecialTopic && !toDate ? "now" : toDate;

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
                    gte: effectiveFromDate || "now-90d",
                    lte: effectiveToDate || "now",
                  },
                },
              },
            ],
            must_not: [
              { term: { "llm_motivation.phase.keyword": "" } },
              { term: { "llm_motivation.phase.keyword": "null" } },
              {
                bool: {
                  must_not: {
                    exists: { field: "llm_motivation.phase" },
                  },
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
              // Add word cloud phrases aggregation
              word_cloud_phrases: {
                terms: {
                  field: "llm_motivation.word_cloud_phrases.keyword",
                  size: 100, // Adjust size based on your needs
                  min_doc_count: 1,
                },
              },
            },
          },
        },
      };

      // Add sentiment filter if provided
      if (sentiment && sentiment !== "") {
        query.query.bool.must.push({
          match: {
            predicted_sentiment_value: sentiment.trim(),
          },
        });
      }

      // Add source filter if provided
      if (source && source !== "") {
        query.query.bool.must.push({
          term: {
            "source.keyword": source.trim(),
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

      // Transform the aggregation results
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
          const baseName = part;

          const current = mergedMap.get(baseName) || {
            name: baseName,
            value: 0,
            sourcesMap: new Map(),
            wordCloudPhrasesMap: new Map(),
          };

          current.value += bucket.doc_count;

          // Merge sources
          for (const source of bucket.sources.buckets) {
            const prevCount = current.sourcesMap.get(source.key) || 0;
            current.sourcesMap.set(source.key, prevCount + source.doc_count);
          }

          // Merge word cloud phrases
          for (const phrase of bucket.word_cloud_phrases.buckets) {
            const prevCount = current.wordCloudPhrasesMap.get(phrase.key) || 0;
            current.wordCloudPhrasesMap.set(
              phrase.key,
              prevCount + phrase.doc_count
            );
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
        wordCloudPhrases: Array.from(entry.wordCloudPhrasesMap.entries())
          .map(([phrase, count]) => ({ phrase, count }))
          .sort((a, b) => b.count - a.count) // Sort by count descending
          .slice(0, 50), // Limit to top 50 phrases per phase
      }));

      // Sort descending and take top 6
      pieData = pieData.sort((a, b) => b.value - a.value).slice(0, 6);

      return res.status(200).json({
        success: true,
        data: pieData,
        total: totalDocs,
        // results: buckets,
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



llmMotivationSentimentTrend: async (req, res) => {
  try {
    const { fromDate, toDate, subtopicId, topicId, source } = req.body;
    const isSpecialTopic = parseInt(topicId) === 2600;
    const selectedTab = "Social";
    const isScadUser = false;

    let topicQueryString = await buildQueryString(topicId, isScadUser, selectedTab);

    topicQueryString += isSpecialTopic
      ? ` AND source:("Twitter" OR "Facebook")`
      : ` AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;

    const effectiveFrom = isSpecialTopic && !fromDate ? "2020-01-01" : fromDate || "now-90d";
    const effectiveTo = isSpecialTopic && !toDate ? "now" : toDate || "now";

    const query = {
      size: 0,
      query: {
        bool: {
          must: [
            { query_string: { query: topicQueryString } },
            {
              range: {
                p_created_time: {
                  gte: effectiveFrom,
                  lte: effectiveTo,
                },
              },
            },
          ],
          must_not: [
            { terms: { "llm_motivation.phase.keyword": ["", "null"] } },
            { terms: { "llm_motivation.sentiment.keyword": ["", "null"] } },
            { bool: { must_not: { exists: { field: "llm_motivation.phase" } } } },
            { bool: { must_not: { exists: { field: "llm_motivation.sentiment" } } } },
          ],
        },
      },
      aggs: {
        phases: {
          terms: { field: "llm_motivation.phase.keyword", size: 20 },
          aggs: {
            sentiments: {
              terms: { field: "llm_motivation.sentiment.keyword", size: 10 },
              aggs: {
                trend: {
                  date_histogram: {
                    field: "p_created_time",
                    calendar_interval: "1d",
                    min_doc_count: 1,
                  },
                },
              },
            },
          },
        },
      },
    };

    // Optional filters
    if (source) query.query.bool.must.push({ term: { "source.keyword": source.trim() } });
    if (subtopicId) query.query.bool.must.push({ term: { subtopic_id: parseInt(subtopicId) } });

    const result = await elasticClient.search({
      index: process.env.ELASTICSEARCH_DEFAULTINDEX,
      body: query,
    });

    const totalDocs = result.hits.total.value;
    const categoriesSet = new Set();
    const series = [];
    const phaseSeriesMap = {};

    // Process data for ApexCharts
    for (const phase of result.aggregations.phases.buckets) {
      phaseSeriesMap[phase.key] = {
        positive: [],
        negative: [],
        neutral: []
      };

      for (const sentiment of phase.sentiments.buckets) {
        const sentimentData = sentiment.trend.buckets.map(b => {
          categoriesSet.add(b.key_as_string);
          return {
            x: new Date(b.key_as_string).getTime(),
            y: b.doc_count
          };
        });

        // Group by sentiment type for each phase
        const sentimentType = sentiment.key.toLowerCase();
        if (phaseSeriesMap[phase.key][sentimentType]) {
          phaseSeriesMap[phase.key][sentimentType] = sentimentData;
        }
      }
    }

    // Format series for ApexCharts
    for (const [phase, sentiments] of Object.entries(phaseSeriesMap)) {
      if (sentiments.positive.length > 0) {
        series.push({
          name: `${phase} - Positive`,
          data: sentiments.positive,
          color: '#10B981' // Green for positive
        });
      }
      if (sentiments.negative.length > 0) {
        series.push({
          name: `${phase} - Negative`,
          data: sentiments.negative,
          color: '#EF4444' // Red for negative
        });
      }
      if (sentiments.neutral.length > 0) {
        series.push({
          name: `${phase} - Neutral`,
          data: sentiments.neutral,
          color: '#6B7280' // Gray for neutral
        });
      }
    }

    const categories = Array.from(categoriesSet)
      .sort()
      .map(date => new Date(date).getTime());

    return res.status(200).json({
      success: true,
      chartData: {
        series,
        categories,
      },
      stats: {
        totalDocuments: totalDocs,
        phasesCount: result.aggregations.phases.buckets.length,
        dateRange: { from: effectiveFrom, to: effectiveTo },
      },
    });
  } catch (error) {
    console.error("Sentiment trend error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch trend data",
      details: error.message,
    });
  }
},
  trustDimensionsEducationSystem: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType, source } =
        req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

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

      // Apply special topic date range
      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "2020-01-01" : fromDate;
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
                    gte: effectiveFromDate || "now-90d",
                    lte: effectiveToDate || "now",
                  },
                },
              },
            ],

            must_not: [
              { term: { "trust_dimensions.keyword": "" } },
              { term: { "trust_dimensions.keyword": "{}" } },
            ],
          },
        },
        aggs: {
          mention_types: {
            terms: { field: "trust_dimensions.keyword", size: 20 },
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

      return res.status(200).json({ result });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  trustDimensionsEducationSystem: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType, source } =
        req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

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

      // Apply special topic date range
      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "2020-01-01" : fromDate;
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
                    gte: effectiveFromDate || "now-90d",
                    lte: effectiveToDate || "now",
                  },
                },
              },
            ],

            must_not: [
              { term: { "trust_dimensions.keyword": "" } },
              { term: { "trust_dimensions.keyword": "{}" } },
            ],
          },
        },
        aggs: {
          mention_types: {
            terms: { field: "trust_dimensions.keyword", size: 7 },
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

      return res.status(200).json({ result });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  benchMarkingPresenceSentiment: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType, source } =
        req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

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

      // Apply special topic date range
      const effectiveFromDate =
        isSpecialTopic && !fromDate ? "2020-01-01" : fromDate;
      const effectiveToDate = isSpecialTopic && !toDate ? "now" : toDate;

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
                    gte: effectiveFromDate || "now-90d",
                    lte: effectiveToDate || "now",
                  },
                },
              },
              {
                terms: {
                  "entity_mentions.entity_type.keyword": ["NGO", "IGO"],
                },
              },
            ],
            must_not: [
              { term: { "trust_dimensions.keyword": "" } },
              { term: { "trust_dimensions.keyword": "{}" } },
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

      // Execute query
      const result = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: query,
      });

      return res.status(200).json({ result });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
};
module.exports = mentionsChartController;
