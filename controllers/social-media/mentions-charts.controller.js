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

const elasticMentionQueryTemplate = (topicQueryString, gte, lte) => ({
  query: {
    bool: {
      must: [
        { query_string: { query: topicQueryString } },
        {
          range: {
            p_created_time: { gte: gte, lte: lte }
          }
        }
      ]
    }
  }
})


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
  res
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
  } else if (field === "customer_journey && llm_mention_audience && llm_mention_type") {
query.query.bool.must.push({ term: { "customer_journey.keyword": value } });
query.query.bool.must.push({ term: { "llm_mention_audience.keyword": type } });
query.query.bool.must.push({
  terms: {
    "llm_mention_type.keyword": [
      "Complaint",
      "Customer Complaint",
      "Criticism",
    ],
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

  const results = await elasticClient.search({
    index: process.env.ELASTICSEARCH_DEFAULTINDEX,
    body: query,
  });

  const responseArray = [];
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

  return res.status(200).json({
    success: true,
    responseArray,
    total: responseArray.length || 0,
    results,
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

const mentionsChartController = {
  actionRequiredMentions: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType } = req.body;

      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );
      topicQueryString = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"  OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web" ')`;
      // Fetch mention actions in **one** query
      const response = await getActionRequired(
        fromDate,
        toDate,
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

      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      // Expanded list of sources (now fully dynamic)
      topicQueryString = `${topicQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;

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
      const isScadUser = false;
      const selectedTab = "Social";

      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      if (sources == "All") {
        topicQueryString = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"  OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web" ')`;
      } else {
        topicQueryString = `${topicQueryString} AND source:(${sources})`;
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

      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      // Expanded list of sources
      topicQueryString = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"  OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web" ')`;

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
      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      // Expanded sources dynamically
      topicQueryString = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"  OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web" ')`;

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
      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      // Expanded sources dynamically
      topicQueryString = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"  OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web" ')`;

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
      const isScadUser = false;
      const selectedTab = "Social";

      // Build the base query string for topic
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      // Add source filters
      topicQueryString += ` AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;

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
      const isScadUser = false;
      const selectedTab = "Social";

      // Build the base query string for topic
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      // Add source filters
      topicQueryString += ` AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;

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
      const isScadUser = false;
      const selectedTab = "Social";

      // Build base query
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );
      topicQueryString += ` AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web")`;

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
      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      // Expanded sources dynamically
      topicQueryString = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"  OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web" ')`;

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
            must_not: [{ term: { "llm_language.keyword": "" } }],
          },
        },
        aggs: {
          llm_language: {
            terms: { field: "llm_language.keyword", size: 7 },
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
      result.aggregations.llm_language.buckets.forEach((bucket) => {
        influencersCoverage[bucket.key] = bucket.doc_count;
      });

      return res.status(200).json({ influencersCoverage, result });
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
        subtopicId,
        topicId,
        sentiment,
        source,
        field,
        type,
        value,
      } = req.query;

      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );
      if (source != "All") {
        topicQueryString = `${topicQueryString} AND source:('${source}')`;
      } else {
        topicQueryString = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"  OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web" ')`;
      }
      // Fetch mention actions in **one** query
      await getPosts(
        greaterThanTime,
        lessThanTime,
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

  productComplaints: async (req, res) => {
    try {
      const { fromDate, toDate, subtopicId, topicId, sentimentType } = req.body;

      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      // Expanded list of sources
      topicQueryString = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"  OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web" ')`;

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
      const frequency = getFrequency(fromDate, toDate);

      return res.status(200).json({ series, frequency, max });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  UNDP: async (req, res) => {
    
      const { greaterThanTime, lessThanTime, subtopicId, topicId, sentimentType } = req.body;

      const isScadUser = false;
      const selectedTab = "Social";
      let topicQueryString = await buildQueryString(
        topicId,
        isScadUser,
        selectedTab
      );

      // Expanded list of sources
      // topicQueryString = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"  OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web" ')`;

    if (type === 'complaintTouchpoints') {
      try {
        const sourcesArray = [
          'Physical Branches and ATMs',
          'Digital Channels',
          'Customer Service Centers',
          'Financial Advisors',
          'Marketing Channels',
          'Community Initiatives',
          'Partner Networks',
          'Self-Service Portals',
          'Other'
        ]
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

        let responseOutput = {}

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

          let complaintContent= 0
          let query= ''

          query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"')  AND llm_mention_type:("Customer Complaint") AND llm_mention_touchpoint:("${sourcesArray[i]}")`
          complaintContent = await elasticSearchCount(elasticMentionQueryTemplate(query, greaterThanTime, lessThanTime))
          // console.log(query, 'complaintContents here')
          if (complaintContent?.count > 0) {
            ;(responseOutput)[
              sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
            ] = complaintContent?.count
          }
        }

      return res.status(200).json({responseOutput});
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
    } else if (type === 'UNDPtouchpoints') {
      try {
        const sourcesArray = [
          'Infrastructure Rebuilding',
          'Emergency Medical Aid',
          'Humanitarian Aid',
          'International Cooperation',
          'Disaster Relief Coordination',
          'Aid Effectiveness',
          'Recovery Progress',
          'Crisis Communications'
        ]

        // const twitterContentQuery = `${topicQueryString} AND llm_mention_touchpoint:("Physical Office")  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`

        let responseOutput = {}

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

          let content= 0
          let query= ''
          let greatertime = '2023-01-01'
          let lesstime = '2023-04-30'

          // query = `${topicQueryString} AND touchpoint_un:("${sourcesArray[i]}") AND 'IGO Entities':("United Nations Development Programme (UNDP)")`
          // query = `${topicQueryString} AND Keywords:("Yes")  AND touchpoint_un:("${sourcesArray[i]}") AND keywords:("Yes") :("United Nations Development Programme (UNDP)")`

          query = `${topicQueryString} AND Keywords:("Yes")  AND llm_mention_touchpoint:("${sourcesArray[i]}")`
          content = await elasticSearchCount(elasticMentionQueryTemplate(query, '2023-01-01', '2023-04-30'))

          if (content?.count > 0) {
            ;(responseOutput)[
              sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
            ] = content?.count
          }
        }

        //console.log('data', responseOutput)

    return res.status(200).json({responseOutput});
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
    } else if (type === 'UNDPAnnoucement') {
      try {
        const sourcesArray = [
          'Missing Persons',
          'Humanitarian Aid Distribution',
          'Emergency Response Coordination',
          'Damage Reports',
          'Relief Measures',
          'Special Appeals',
          'Safety Tips',
          'Public Health Advisor',
          'Emergency Response Coordination',
          'International Cooperation',
          'Impact Reports',
          'Infrastructure Reports'
        ]
        // const twitterContentQuery = `${topicQueryString} AND llm_mention_touchpoint:("Physical Office")  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`

        let responseOutput = {}

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

          let content= 0
          let query= ''

          query = `${topicQueryString} AND un_keywords:("Yes") AND announcement:("${sourcesArray[i]}")`

          content = await elasticSearchCount(elasticMentionQueryTemplate(query, '2023-01-01', '2023-04-30'))

          if (content?.count > 0) {
            ;(responseOutput)[
              sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
            ] = content?.count
          }
        }

        //console.log('data', responseOutput)

    return res.status(200).json({responseOutput});
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
    } else if (type === 'touchpointsIdentification') {
      try {
        const sourcesArray = [
          'Infrastructure Rebuilding',
          'Emergency Medical Aid',
          'Humanitarian Aid',
          'International Cooperation',
          'Disaster Relief Coordination',
          'Aid Effectiveness',
          'Recovery Progress',
          'Crisis Communications'
        ]
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

        let responseOutput = {}

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

          let content= 0
          let query= ''

          query = `${topicQueryString} AND touchpoint_un:("${sourcesArray[i]}")`

          content = await elasticSearchCount(elasticMentionQueryTemplate(query, '2023-01-01', '2023-04-30'))

          if (content?.count > 0) {
            ;(responseOutput)[
              sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
            ] = content?.count
          }
        }

        //console.log('data', responseOutput)


      return res.status(200).json({responseOutput});
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
    } else if (type === 'touchpointSentimentsChartUNtopic') {
      try {
        const sourcesArray = [
          'Infrastructure Rebuilding',
          'Emergency Medical Aid',
          'Humanitarian Aid',
          'International Cooperation',
          'Disaster Relief Coordination',
          'Aid Effectiveness',
          'Recovery Progress',
          'Crisis Communications'
        ]

        // const twitterContentQuery = `${topicQueryString} AND llm_mention_touchpoint:("Physical Office")  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`

        let responseOutput = {}

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

          let positiveContent= 0,
            negativeContent= 0,
            neutralContent= 0,
            webContent= 0
          let positiveContentQuery, negativeContentQuery, neutralContentQuery, webContentQuery

          // let count= unData.filter(data => data?.touchpoint_identification === sourcesArray[i])

          positiveContentQuery = `${topicQueryString} AND un_keywords:("Yes") AND touchpoint_un:("${sourcesArray[i]}") AND predicted_sentiment_value:("Positive")`
          negativeContentQuery = `${topicQueryString} AND un_keywords:("Yes") AND touchpoint_un:("${sourcesArray[i]}") AND predicted_sentiment_value:("Negative")`
          neutralContentQuery = `${topicQueryString} AND un_keywords:("Yes") AND touchpoint_un:("${sourcesArray[i]}") AND predicted_sentiment_value:("Neutral")`

          positiveContent = await elasticSearchCount(
            elasticMentionQueryTemplate(positiveContentQuery, '2023-02-05', '2023-02-21')
          )
          negativeContent = await elasticSearchCount(
            elasticMentionQueryTemplate(negativeContentQuery, '2023-02-05', '2023-02-21')
          )
          neutralContent = await elasticSearchCount(
            elasticMentionQueryTemplate(neutralContentQuery, '2023-02-05', '2023-02-21')
          )

          if (positiveContent.count > 0 || negativeContent.count > 0 || neutralContent.count > 0) {
            ;(responseOutput)[
              sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
            ] = {
              positiveContent: positiveContent?.count,
              negativeContent: negativeContent?.count,
              neutralContent: neutralContent?.count
            }
          }
        }

        // console.log('data', responseOutput)

          return res.status(200).json({responseOutput});
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
     
    } else if (type === 'IGOEntities') {
      try {
        const sourcesArray = [
          'United Nations Development Programme (UNDP)',
          "United Nations Children's Fund (UNICEF)",
          'World Health Organization (WHO)',
          'United Nations High Commissioner for Refugees (UNHCR)',
          'World Food Programme (WFP)',
          'International Labour Organization (ILO)',
          'United Nations Educational, Scientific and Cultural Organization (UNESCO)',
          'United Nations Population Fund (UNFPA)',
          'United Nations Office on Drugs and Crime (UNODC)',
          'International Criminal Court (ICC)',
          'International Maritime Organization (IMO)',
          'International Telecommunication Union (ITU)',
          'United Nations Environment Programme (UNEP)',
          'United Nations Office for the Coordination of Humanitarian Affairs (OCHA)',
          'United Nations Institute for Training and Research (UNITAR)',
          'United Nations Conference on Trade and Development (UNCTAD)',
          'United Nations Human Settlements Programme (UN-Habitat)',
          'World Intellectual Property Organization (WIPO)',
          'United Nations Framework Convention on Climate Change (UNFCCC)'
        ]
        // const twitterContentQuery = `${topicQueryString} AND llm_mention_touchpoint:("Physical Office")  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`

        let responseOutput = {}

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

          let content= 0
          let query= ''

          // query = `${topicQueryString} AND un_keywords:("Yes") AND 'IGO Entities':("${sourcesArray[i]}")`
          query = `${topicQueryString}  AND igo_entities:("${sourcesArray[i]}")`
          // console.log(query, 'IGO Entities')

          content = await elasticSearchCount(elasticMentionQueryTemplate(query, '2023-01-01', '2024-12-03'))

          console.log(content, 'content')
          if (content?.count > 0) {
            ;(responseOutput)[
              sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
            ] = content?.count
          }
        }

        //console.log('data', responseOutput)

      return res.status(200).json({responseOutput});
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
    } else if (type === 'IGOSentimentsChartUNtopic') {
      try {
        const sourcesArray = [
          'United Nations Development Programme (UNDP)',
          "United Nations Children's Fund (UNICEF)",
          'World Health Organization (WHO)',
          'United Nations High Commissioner for Refugees (UNHCR)',
          'World Food Programme (WFP)',
          'International Labour Organization (ILO)',
          'United Nations Educational, Scientific and Cultural Organization (UNESCO)',
          'United Nations Population Fund (UNFPA)',
          'United Nations Office on Drugs and Crime (UNODC)',
          'International Criminal Court (ICC)',
          'International Maritime Organization (IMO)',
          'International Telecommunication Union (ITU)',
          'United Nations Environment Programme (UNEP)',
          'United Nations Office for the Coordination of Humanitarian Affairs (OCHA)',
          'United Nations Institute for Training and Research (UNITAR)',
          'United Nations Conference on Trade and Development (UNCTAD)',
          'United Nations Human Settlements Programme (UN-Habitat)',
          'World Intellectual Property Organization (WIPO)',
          'United Nations Framework Convention on Climate Change (UNFCCC)'
        ]
        //const twitterContentQuery = `${topicQueryString} AND un_keywords:("Yes")`

        let responseOutput = {}

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

          let positiveContent= 0,
            negativeContent= 0,
            neutralContent= 0,
            webContent= 0
          let positiveContentQuery, negativeContentQuery, neutralContentQuery, webContentQuery

          // let count= unData.filter(data => data?.touchpoint_identification === sourcesArray[i])

          // positiveContentQuery = `${topicQueryString} AND un_keywords:("Yes") AND igo_entities:("${sourcesArray[i]}") AND predicted_sentiment_value:("Positive")`
          // negativeContentQuery = `${topicQueryString} AND un_keywords:("Yes") AND igo_entities:("${sourcesArray[i]}") AND predicted_sentiment_value:("Negative")`
          // neutralContentQuery = `${topicQueryString} AND un_keywords:("Yes") AND igo_entities:("${sourcesArray[i]}") AND predicted_sentiment_value:("Neutral")`

          positiveContentQuery = `${topicQueryString}   AND igo_entities:("${sourcesArray[i]}") AND predicted_sentiment_value:("Positive")`
          negativeContentQuery = `${topicQueryString}   AND igo_entities:("${sourcesArray[i]}") AND predicted_sentiment_value:("Negative")`
          neutralContentQuery = `${topicQueryString}  AND igo_entities:("${sourcesArray[i]}") AND predicted_sentiment_value:("Neutral")`

          positiveContent = await elasticSearchCount(
            elasticMentionQueryTemplate(positiveContentQuery, '2023-01-01', '2024-12-03')
          )

          negativeContent = await elasticSearchCount(
            elasticMentionQueryTemplate(negativeContentQuery, '2023-01-01', '2024-12-03')
          )
          neutralContent = await elasticSearchCount(
            elasticMentionQueryTemplate(neutralContentQuery, '2023-01-01', '2024-12-03')
          )

          if (positiveContent.count > 0 || negativeContent.count > 0 || neutralContent.count > 0) {
            ;(responseOutput)[
              sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
            ] = {
              positiveContent: positiveContent?.count,
              negativeContent: negativeContent?.count,
              neutralContent: neutralContent?.count
            }
          }
        }

        //console.log('data', responseOutput)

          return res.status(200).json({responseOutput});
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
      } else if (type === 'unAidsChart') {
      //elasticQueryTemplateRange
      try {
        let dataArray= []
        if (aidType === 'Aid Requested/Aid Recieved') {
          const query1 = `${topicQueryString}  AND aid_requests_received:("receipt of aid")`
          const query2 = `${topicQueryString} AND aid_requests_received:("request for aid")`

          const aidRec= await elasticSearchCount(elasticMentionQueryTemplate(query1, '2023-01-01', '2023-04-30'))
          const aidReq= await elasticSearchCount(elasticMentionQueryTemplate(query2, '2023-01-01', '2023-04-30'))

          dataArray = [aidReq.count, aidRec.count]
        } else if (aidType === 'Aid Type') {
          const query1 = `${topicQueryString}  AND aid_type:("Local Aid")`
          const query2 = `${topicQueryString}  AND aid_type:("International Aid")`

          const local= await elasticSearchCount(elasticMentionQueryTemplate(query1, '2023-01-01', '2023-04-30'))
          const inter= await elasticSearchCount(elasticMentionQueryTemplate(query2, '2023-01-01', '2023-04-30'))
          dataArray = [local.count, inter.count]
        } else if (aidType === 'Mental Health and Trauma') {
          const query1 = `${topicQueryString}  AND Aid Type:("Local Aid")`
          const query2 = `${topicQueryString}  AND Aid Type:("International Aid")`

          const local= await elasticSearchCount(elasticMentionQueryTemplate(query1, '2023-01-01', '2023-04-30'))
          const inter= await elasticSearchCount(elasticMentionQueryTemplate(query2, '2023-01-01', '2023-04-30'))
          dataArray = [local.count, inter.count]
        } else if (aidType === 'Political or Social Criticism') {
          const query1 = `${topicQueryString} AND Aid Type:("Local Aid")`
          const query2 = `${topicQueryString} AND Aid Type:("International Aid")`

          const local= await elasticSearchCount(elasticMentionQueryTemplate(query1, '2023-01-01', '2023-04-30'))
          const inter= await elasticSearchCount(elasticMentionQueryTemplate(query2, '2023-01-01', '2023-04-30'))
          dataArray = [local.count, inter.count]
        } else if (aidType === 'Environmental Hazards') {
          const query1 = `${topicQueryString}  AND Aid Type:("Local Aid")`
          const query2 = `${topicQueryString}  AND Aid Type:("International Aid")`

          const local= await elasticSearchCount(elasticMentionQueryTemplate(query1, '2023-01-01', '2023-04-30'))
          const inter= await elasticSearchCount(elasticMentionQueryTemplate(query2, '2023-01-01', '2023-04-30'))
          dataArray = [local.count, inter.count]
        }

          return res.status(200).json({dataArray});
          } catch (error) {
            console.error("Error fetching data:", error);
            return res.status(500).json({ error: "Internal server error" });
          }
     
    } else if (type === 'touchpointIndustry') {
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
          'Physical Branches and ATMs',
          'Digital Channels',
          'Customer Service Centers',
          'Financial Advisors',
          'Marketing Channels',
          'Community Initiatives',
          'Partner Networks',
          'Self-Service Portals',
          'Other'
        ]

        let responseOutput = {}

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

          let twitterContent= 0,
            facebookContent= 0,
            instagramContent= 0,
            webContent= 0
          let twitterContentQuery, facebookContentQuery, instagramContentQuery, webContentQuery

          twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
          facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
          instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
          //webContentQuery = `${topicQueryString} AND source:('"FakeNews" OR "News" OR "Blogs" OR "Web"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
          // console.log(twitterContentQuery, 'touchpointIndustry')
          twitterContent = await elasticSearchCount(
            elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
          )
          facebookContent = await elasticSearchCount(
            elasticMentionQueryTemplate(facebookContentQuery, greaterThanTime, lessThanTime)
          )
          instagramContent = await elasticSearchCount(
            elasticMentionQueryTemplate(instagramContentQuery, greaterThanTime, lessThanTime)
          )
          // webContent = await elasticSearchCount(
          //   elasticMentionQueryTemplate(webContentQuery, greaterThanTime, lessThanTime)
          // )

          if (twitterContent.count > 0 || facebookContent.count > 0 || instagramContent.count > 0) {
            ;(responseOutput)[
              sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
            ] = {
              twitterContent: twitterContent?.count,
              facebookContent: facebookContent?.count,
              instagramContent: instagramContent?.count
              // webContent: webContent?.count
            }
          }
        }

        //console.log('data', responseOutput)

          return res.status(200).json({responseOutput});
          } catch (error) {
            console.error("Error fetching data:", error);
            return res.status(500).json({ error: "Internal server error" });
          }
        
    
    } else if (type === 'touchpointSentimentsChart') {
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
          'Physical Branches and ATMs',
          'Digital Channels',
          'Customer Service Centers',
          'Financial Advisors',
          'Marketing Channels',
          'Community Initiatives',
          'Partner Networks',
          'Self-Service Portals',
          'Other'
        ]

        // const twitterContentQuery = `${topicQueryString} AND llm_mention_touchpoint:("Physical Office")  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`

        let responseOutput = {}

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

          let positiveContent= 0,
            negativeContent= 0,
            neutralContent= 0,
            webContent= 0
          let positiveContentQuery, negativeContentQuery, neutralContentQuery, webContentQuery

          positiveContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Positive") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
          negativeContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Negative") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
          neutralContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Neutral") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
          // console.log('touchpointSentimentsChart', positiveContentQuery)
          positiveContent = await elasticSearchCount(
            elasticMentionQueryTemplate(positiveContentQuery, greaterThanTime, lessThanTime)
          )
          negativeContent = await elasticSearchCount(
            elasticMentionQueryTemplate(negativeContentQuery, greaterThanTime, lessThanTime)
          )
          neutralContent = await elasticSearchCount(
            elasticMentionQueryTemplate(neutralContentQuery, greaterThanTime, lessThanTime)
          )

          if (positiveContent.count > 0 || negativeContent.count > 0 || neutralContent.count > 0) {
            ;(responseOutput)[
              sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
            ] = {
              positiveContent: positiveContent?.count,
              negativeContent: negativeContent?.count,
              neutralContent: neutralContent?.count
            }
          }
        }

        //console.log('data', responseOutput)
          return res.status(200).json({responseOutput});
          } catch (error) {
            console.error("Error fetching data:", error);
            return res.status(500).json({ error: "Internal server error" });
          }
      
    }
  }
  
};
module.exports = mentionsChartController;
