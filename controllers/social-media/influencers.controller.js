const { elasticClient } = require("../../config/elasticsearch");
const { buildTopicQueryString } = require("../../utils/queryBuilder");
const { getCountryCode } = require("../../utils/countryHelper");
const { processFilters } = require("./filter.utils");
const processCategoryItems = require('../../helpers/processedCategoryItems');
const prisma = require("../../config/database");

const INFLUENCER_TYPES = [
  { type: "Nano", from: 1000, to: 10000 },
  { type: "Micro", from: 10000, to: 50000 },
  { type: "Midtier", from: 50000, to: 500000 },
  { type: "Macro", from: 500000, to: 1000000 },
  { type: "Mega", from: 1000000, to: 5000000 },
  { type: "Celebrity", from: 5000000, to: 500000000 },
];

// Define the queries for different influencer categories
const INFLUENCER_CATEGORY_QUERIES = [
  { u_followers: { gte: 5000000 } }, // Celebrity
  { u_followers: { gte: 1000000, lte: 5000000 } }, // Mega
  { u_followers: { gte: 500000, lte: 1000000 } }, // Macro
  { u_followers: { gte: 50000, lte: 500000 } }, // Mid-tier
  { u_followers: { gte: 10000, lte: 50000 } }, // Micro
  { u_followers: { gte: 1000, lte: 10000 } }, // Nano
];

const CATEGORY_TYPES = [
  "celebrity",
  "mega",
  "macro",
  "midtier",
  "micro",
  "nano",
];

const getSourceIcon = (userSource) => {
  if (
    ["khaleej_times", "Omanobserver", "Time of oman", "Blogs"].includes(
      userSource
    )
  ) {
    return "Blog";
  } else if (userSource === "Reddit") {
    return "Reddit";
  } else if (["FakeNews", "News"].includes(userSource)) {
    return "News";
  } else if (userSource === "Tumblr") {
    return "Tumblr";
  } else if (userSource === "Vimeo") {
    return "Vimeo";
  } else if (["Web", "DeepWeb"].includes(userSource)) {
    return "Web";
  }
  return userSource;
};

/**
 * Normalize source input to array of sources
 * @param {string|Array} source - Source input (can be "All", comma-separated string, array, or single value)
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

/**
 * Find matching category key with flexible matching.
 * @param {string} selectedCategory
 * @param {Object} categoryData
 * @returns {string|null}
 */
function findMatchingCategoryKey(selectedCategory, categoryData = {}) {
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
}

/**
 * Build source filter string for query_string
 * @param {string|Array} source - Source input
 * @param {number} topicId - Topic ID for special handling
 * @param {boolean} isSpecialTopic - Whether this is a special topic
 * @returns {string} Source filter string for query_string
 */
function buildSourceFilterString(source, topicId, isSpecialTopic = false) {
  const normalizedSources = normalizeSourceInput(source);
  
  if (normalizedSources.length > 0) {
    const sourcesStr = normalizedSources.map(s => `"${s}"`).join(' OR ');
    return `source:(${sourcesStr})`;
  } else if (parseInt(topicId) === 2619 || parseInt(topicId) === 2639 || parseInt(topicId) === 2640) {
    return `source:("LinkedIn" OR "Linkedin")`;
  } else if (parseInt(topicId) === 2646) {
    return `source:("LinkedIn" OR "Linkedin" OR "Twitter")`;
  } 
   else if (isSpecialTopic) {
    return `source:("Facebook" OR "Twitter")`;
  }else if (parseInt(topicId) === 2641 || parseInt(topicId) === 2643 || parseInt(topicId) === 2644 ) {
    return `source:("Facebook" OR "Twitter" OR "Instagram")`;
  } else {
    return `source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Linkedin" OR "Web" OR "TikTok")`;
  }
}

// Helper function to create Elasticsearch query
const createElasticQuery = (
  queryString,
  greaterThanTime,
  lessThanTime,
  range,
  category,
  topicId
) => {
  const queryBody = {
    index: process.env.ELASTICSEARCH_DEFAULTINDEX,
    body: {
      query: {
        bool: {
          must: [
            { query_string: { query: queryString } },
            {
              range: {
                p_created_time: {
                  gte: greaterThanTime,
                  lte: lessThanTime,
                },
              },
            },
            { range: range },
          ],
        },
      },
    },
  };

  // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
  if ( parseInt(topicId) === 2643 || parseInt(topicId) === 2644 ) {
    queryBody.body.query.bool.must.push({
      term: { is_public_opinion: true }
    });
  }

  // ✅ Add category filter only if category is not "all"
  if (category && category !== "all") {
    const categoryFilter = {
      bool: {
        should: [
          { match_phrase: { p_message_text: category } },
          { match_phrase: { keywords: category } },
          { match_phrase: { hashtags: category } },
          { match_phrase: { u_source: category } },
          { match_phrase: { p_url: category } }
        ],
        minimum_should_match: 1,
      },
    };

    queryBody.body.query.bool.must.push(categoryFilter);
  }

  return queryBody;
};

// Helper function to create Elasticsearch query
const createElasticQueryPost = (
  queryString,
  greaterThanTime,
  lessThanTime,
  range,
  category,
  topicId
) => {
  const queryBody = {
    index: process.env.ELASTICSEARCH_DEFAULTINDEX,
    body: {
      query: {
        bool: {
          must: [
            { query_string: { query: queryString } },
            {
              range: {
                p_created_time: { gte: greaterThanTime, lte: lessThanTime },
              },
            },
            { range: range },
          ],
        },
      },
      size: 30,
    },
    };

    // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
    if (parseInt(topicId) === 2643 || parseInt(topicId) === 2644 ) {
      queryBody.body.query.bool.must.push({
        term: { is_public_opinion: true }
      });
    }

  // ✅ Apply category filter only if valid
  if (category && category !== "all") {
    const categoryFilter = {
      bool: {
        should: [
          { match_phrase: { p_message_text: category } },
          { match_phrase: { keywords: category } },
          { match_phrase: { hashtags: category } },
          { match_phrase: { u_source: category } },
          { match_phrase: { p_url: category } }
        ],
        minimum_should_match: 1,
      },
    };

    queryBody.body.query.bool.must.push(categoryFilter);
  }

  return queryBody;
};


const influencersController = {
  getInfluencers: async (req, res) => {
    try {
      let {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        isScadUser = "false",
        topicId,
        category: inputCategory = 'all',
      } = req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      let category = inputCategory;
      let categoryData = {};
      
      if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        // Fall back to middleware data
        categoryData = req.processedCategories || {};
      }
      if (Object.keys(categoryData).length === 0) {
        return res.json({
          finalDataArray: [],
        });
      }

      if (category !== 'all' && category !== '' && category !== 'custom') {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        if (matchedKey) {
          category = matchedKey;
        }else{
           inputCategory = "all";
        }
      }

      const topicQueryString = buildTopicQueryString(categoryData);

      // Process filters for time range and sentiment
      const filters = processFilters({
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        queryString: topicQueryString,
      });

      const finalDataArray = [];

      // Get source parameter if provided
      const source = req.body.source || 'All';
      const normalizedSources = normalizeSourceInput(source);

      for (const followerType of INFLUENCER_TYPES) {
        const { type, from, to } = followerType;

        // Build source filter based on special topic or normalized sources
        let sourceFilterBool;
        if (normalizedSources.length > 0) {
          sourceFilterBool = {
            bool: {
              should: normalizedSources.map(s => ({ match_phrase: { source: s } })),
              minimum_should_match: 1,
            },
          };
        } else if (parseInt(topicId) === 2619 || parseInt(topicId) === 2639 || parseInt(topicId) === 2640) {
          sourceFilterBool = {
            bool: {
              should: [
                { match_phrase: { source: "LinkedIn" } },
                { match_phrase: { source: "Linkedin" } },
              ],
              minimum_should_match: 1,
            },
          };
        }
         else if (parseInt(topicId) === 2646) {
          sourceFilterBool = {
            bool: {
              should: [
                { match_phrase: { source: "LinkedIn" } },
                { match_phrase: { source: "Linkedin" } },
                 { match_phrase: { source: "Twitter" } },
              ],
              minimum_should_match: 1,
            },
          };
        }
        
        else if (isSpecialTopic) {
          sourceFilterBool = {
            bool: {
              should: [
                { match_phrase: { source: "Facebook" } },
                { match_phrase: { source: "Twitter" } },
              ],
              minimum_should_match: 1,
            },
          };
        } else if ( parseInt(topicId) === 2641 || parseInt(topicId) === 2643 || parseInt(topicId) === 2644 ) {
          sourceFilterBool = {
            bool: {
              should: [
                { match_phrase: { source: "Facebook" } },
                { match_phrase: { source: "Twitter" } },
                { match_phrase: { source: "Instagram" } },
              ],
              minimum_should_match: 1,
            },
          };
        }else {
          sourceFilterBool = {
            bool: {
              should: [
                { match_phrase: { source: "Facebook" } },
                { match_phrase: { source: "Twitter" } },
                { match_phrase: { source: "Instagram" } },
                { match_phrase: { source: "Youtube" } },
                { match_phrase: { source: "Pinterest" } },
                { match_phrase: { source: "Reddit" } },
                { match_phrase: { source: "LinkedIn" } },
                { match_phrase: { source: "Linkedin" } },
                { match_phrase: { source: "Web" } },
                { match_phrase: { source: "TikTok" } },
              ],
              minimum_should_match: 1,
            },
          };
        }

        const params = {
          index: process.env.ELASTICSEARCH_DEFAULTINDEX,
          body: {
            query: {
              bool: {
                must: [
                  { query_string: { query: filters.queryString } },
                  { exists: { field: "u_profile_photo" } },
                  {
                    range: {
                      p_created_time: {
                        gte: filters.greaterThanTime,
                        lte: filters.lessThanTime,
                      },
                    },
                  },
                  { range: { u_followers: { gte: from, lte: to } } },
                  sourceFilterBool,
                ],
                must_not: [{ term: { "u_profile_photo.keyword": "" } }],
              },
            },
            aggs: {
              group_by_user: {
                terms: {
                  field: "u_source.keyword",
                  size: 10,
                  order: { "followers_count.value": "desc" },
                },
                aggs: {
                  grouped_results: {
                    top_hits: {
                      size: 1,
                      _source: {
                        includes: [
                          "u_fullname",
                          "u_profile_photo",
                          "u_country",
                          "u_followers",
                          "source",
                          "u_source",
                        ],
                      },
                      sort: [{ p_created_time: { order: "desc" } }],
                    },
                  },
                  followers_count: { max: { field: "u_followers" } },
                },
              },
            },
          },
        };

          if(inputCategory!=="all"){
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
                                params.body.query.bool.must.push(categoryFilter);
                        }

                        // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
                        if ( parseInt(topicId) === 2643 || parseInt(topicId) === 2644 ) {
                            params.body.query.bool.must.push({
                                term: { is_public_opinion: true }
                            });
                        }

        const results = await elasticClient.search(params);

        if (!results?.aggregations?.group_by_user?.buckets) {
          console.log("no record found for", type);
          continue;
        }

        const data_array = [];

        for (const bucket of results.aggregations.group_by_user.buckets) {
          if (!bucket.key) continue;

          const userSource = bucket.grouped_results.hits.hits[0]._source.source;
          const validSources = [
            "Twitter",
            "Instagram",
            "Facebook",
            "GoogleMyBusiness",
            "Youtube",
            "Pinterest",
            "Reddit",
            "LinkedIn",
            "Linkedin",
            "Web",
            "TikTok",
          ];

          if (isScadUser === "true" && !validSources.includes(userSource)) {
            continue;
          }

          const sourceData = bucket.grouped_results.hits.hits[0]._source;
          const flag_image = sourceData.u_country
            ? await getCountryCode(sourceData.u_country)
            : "&nbsp;";

          const sourceIcon = getSourceIcon(userSource);

          data_array.push({
            profile_image: sourceData.u_profile_photo,
            fullname: sourceData.u_fullname,
            source: `${sourceData.u_source},${sourceIcon}`,
            country: flag_image,
            followers: sourceData.u_followers.toString(),
            posts: bucket.doc_count.toString(),
          });
        }

        finalDataArray.push({ type, data: data_array });
      }

      return res.json({ finalDataArray });
    } catch (error) {
      console.error("Error fetching influencers data:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getInfluencerCategories: async (req, res) => {
    try {
      let {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        isScadUser = "false",
        selectedTab = "",
        topicId,
        category: inputCategory = 'all',
      } = req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      let category = inputCategory;
      let categoryData = {};
      
      if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        // Fall back to middleware data
        categoryData = req.processedCategories || {};
      }
      if (Object.keys(categoryData).length === 0) {
        return res.json({
          success: true,
          infArray: {},
        });
      }

      if (category !== 'all' && category !== '' && category !== 'custom') {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        if (matchedKey) {
          category = matchedKey;
        }else{
          inputCategory="all";
        }
      }

      // Build initial topic query string
      let topicQueryString = buildTopicQueryString(categoryData);

      // Process filters for time range and sentiment
      const filters = processFilters({
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        queryString: topicQueryString,
      });

      // Handle source filtering based on user type and selected tab
      const source = req.body.source || 'All';
      let finalQueryString = filters.queryString;
      
      if (isScadUser === "true" && selectedTab === "GOOGLE") {
        finalQueryString = finalQueryString
          ? `${finalQueryString} AND source:("GoogleMyBusiness")`
          : `source:("GoogleMyBusiness")`;
      } else {
        const sourceFilter = buildSourceFilterString(source, topicId, isSpecialTopic);
        finalQueryString = finalQueryString
          ? `${finalQueryString} AND ${sourceFilter}`
          : sourceFilter;
      }

      // Execute Elasticsearch queries concurrently for each category
      const results = await Promise.all(
        INFLUENCER_CATEGORY_QUERIES.map((range) =>
          elasticClient.count(
            createElasticQuery(
              finalQueryString,
              filters.greaterThanTime,
              filters.lessThanTime,
              range,
              inputCategory==="all"?category:"all",
              topicId
            )
          )
        )
      );

      // Transform results into the expected format
      const infArray = results.reduce((acc, result, index) => {
        acc[CATEGORY_TYPES[index]] = result.count || 0;
        return acc;
      }, {});

      return res.json({
        success: true,
        infArray,
      });
    } catch (error) {
      console.error("Error fetching influencer categories:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getInfluencerPost: async (req, res) => {
    try {
      let {
        timeSlot,
        greaterThanTime,
        lessThanTime,
        sentiment,
        isScadUser = "false",
        selectedTab = "",
        type,
        topicId,
        category: inputCategory = 'all',
      } = req.query;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      console.log(req.query);

      let categoryData = {};
      
      if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        // Fall back to middleware data
        categoryData = req.processedCategories || {};
      }
      if (Object.keys(categoryData).length === 0) {
        return res.json({
          success: true,
          infArray: {},
        });
      }

      let category = inputCategory;
      if (category !== 'all' && category !== '' && category !== 'custom') {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        if (matchedKey) {
          category = matchedKey;
        }else{
          inputCategory="all";
        }
      }

      // Build initial topic query string
      let topicQueryString = buildTopicQueryString(categoryData);

      // Process filters for time range and sentiment
      const filters = processFilters({
        timeSlot,
        fromDate: greaterThanTime,
        toDate: lessThanTime,
        sentimentType: sentiment,
        queryString: topicQueryString,
      });

      // Handle source filtering based on user type and selected tab
      const source = req.query.source || 'All';
      let finalQueryString = filters.queryString;
      
      if (isScadUser === "true" && selectedTab === "GOOGLE") {
        finalQueryString = finalQueryString
          ? `${finalQueryString} AND source:("GoogleMyBusiness")`
          : `source:("GoogleMyBusiness")`;
      } else {
        const sourceFilter = buildSourceFilterString(source, topicId, isSpecialTopic);
        finalQueryString = finalQueryString
          ? `${finalQueryString} AND ${sourceFilter}`
          : sourceFilter;
      }

      const index = CATEGORY_TYPES.indexOf(type);
      const results = await elasticClient.search(
        createElasticQueryPost(
          finalQueryString,
          filters.greaterThanTime,
          filters.lessThanTime,
          INFLUENCER_CATEGORY_QUERIES[index],
          inputCategory==="all"?category:"all",
          topicId
        )
      );

      const responseArray = [];
      // Gather all filter terms
      let allFilterTerms = [];
      if (categoryData) {
        Object.values(categoryData).forEach((data) => {
          if (data.keywords && data.keywords.length > 0) allFilterTerms.push(...data.keywords);
          if (data.hashtags && data.hashtags.length > 0) allFilterTerms.push(...data.hashtags);
          if (data.urls && data.urls.length > 0) allFilterTerms.push(...data.urls);
        });
      }
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
        let posts =
          esData._source.u_posts > 0 ? `${esData._source.u_posts}` : "";
        let likes =
          esData._source.p_likes > 0 ? `${esData._source.p_likes}` : "";
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
          esData._source.p_engagement > 0
            ? `${esData._source.p_engagement}`
            : "";
        let content =
          esData._source.p_content && esData._source.p_content.trim() !== ""
            ? `${esData._source.p_content}`
            : "";
        let imageUrl =
          esData._source.p_picture_url &&
          esData._source.p_picture_url.trim() !== ""
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
          llm_language: esData._source.llm_language,
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
        const textFields = [
          esData._source.p_message_text,
          esData._source.p_message,
          esData._source.keywords,
          esData._source.title,
          esData._source.hashtags,
          esData._source.u_source,
          esData._source.p_url,
          esData._source.u_fullname
        ];
        cardData.matched_terms = allFilterTerms.filter(term => {
          const termLower = term.toLowerCase();
          
          return textFields.some(field => {
            if (!field) return false;
            
            if (Array.isArray(field)) {
              return field.some(f => {
                if (!f || typeof f !== 'string') return false;
                const fLower = f.toLowerCase();
                // Check exact match, contains match, and word boundary match
                return fLower === termLower || 
                       fLower.includes(termLower) ||
                       new RegExp(`\\b${termLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(fLower);
              });
            }
            
            if (typeof field === 'string') {
              const fieldLower = field.toLowerCase();
              // Check exact match, contains match, and word boundary match
              return fieldLower === termLower || 
                     fieldLower.includes(termLower) ||
                     new RegExp(`\\b${termLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(fieldLower);
            }
            
            return false;
          });
        });
        responseArray.push(cardData);
      }

      return res.status(200).json({
        success: true,
        responseArray,
        total: responseArray.length || 0,
        results,
      });

      return res.json({
        success: true,
      });
      // Transform results into the expected format
      const infArray = results.reduce((acc, result, index) => {
        acc[CATEGORY_TYPES[index]] = result.count || 0;
        return acc;
      }, {});

      return res.json({
        success: true,
        infArray,
      });
    } catch (error) {
      console.error("Error fetching influencer categories:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
};

module.exports = influencersController;
