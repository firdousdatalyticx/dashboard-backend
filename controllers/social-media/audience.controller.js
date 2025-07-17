const { elasticClient } = require("../../config/elasticsearch");
const { buildTopicQueryString } = require("../../utils/queryBuilder");
const { getCountryCode } = require("../../utils/countryHelper");
const { getSourceIcon } = require("../../utils/sourceHelper");
const { processFilters } = require("./filter.utils");

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
      } = req.body;

      const categoryData = req.processedCategories || {};

      if (Object.keys(categoryData).length === 0) {
        return res.json({
          data_array: [],
        });
      }

      const topicQueryString = buildTopicQueryString(categoryData);
      let sourcesQuery = null;
      if (parseInt(topicId) === 2619) {
        sourcesQuery = ` AND source:("LinkedIn" OR "Linkedin")`;
      } else {
        sourcesQuery = ` AND source:("Twitter" OR "Instagram" OR "Facebook" OR "TikTok" OR "Youtube" OR "LinkedIn" OR "Linkedin" OR "Pinterest" OR "Web" OR "Reddit")`;
      }

      // Process filters for time range
      const filters = processFilters({
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        queryString: topicQueryString,
      });

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
      } = req.body;

      const categoryData = req.processedCategories || {};

      if (Object.keys(categoryData).length === 0) {
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

      const topicQueryString = buildTopicQueryString(categoryData);
      let sourcesQuery = null;
      if (parseInt(topicId) === 2619) {
        sourcesQuery = ` AND source:("LinkedIn" OR "Linkedin")`;
      } else {
        sourcesQuery = ` AND source:("Twitter" OR "Instagram" OR "Facebook" OR "TikTok" OR "Youtube" OR "LinkedIn" OR "Linkedin" OR "Pinterest" OR "Web" OR "Reddit")`;
      }

      // Process filters for time range
      const filters = processFilters({
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        queryString: topicQueryString,
      });

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
              ],
              must_not: [
                { term: { "p_comments_data.keyword": "" } },
                { term: { "p_comments_data.keyword": "[]" } },
              ],
            },
          },
        },
      };

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
      } = req.body;

      const categoryData = req.processedCategories || {};

      if (Object.keys(categoryData).length === 0) {
        return res.json({
          dates: [],
          maxTrendData: "0,0",
        });
      }

      const topicQueryString = buildTopicQueryString(categoryData);
      let sourcesQuery = ` AND source:("Twitter" OR "Instagram" OR "Facebook" OR "TikTok" OR "Youtube" OR "LinkedIn" OR "Linkedin" OR "Pinterest" OR "Web" OR "Reddit")`;
      if (parseInt(topicId) === 2619) {
        sourcesQuery = ` AND source:("LinkedIn" OR "Linkedin")`;
      }

      // Process filters for time range
      const filters = processFilters({
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        queryString: topicQueryString,
      });

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
              ],
              must_not: [
                { term: { "p_comments_data.keyword": "" } },
                { term: { "p_comments_data.keyword": "[]" } },
              ],
            },
          },
        },
      };

      const results = await elasticClient.search(params);
      const posts = results.hits.hits.map((hit) => formatPostData(hit));
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

  getCommenterEngagementBySeniority: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        records = 20,
        topicId,
      } = req.body;

      const categoryData = req.processedCategories || {};

      if (Object.keys(categoryData).length === 0) {
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

      const topicQueryString = buildTopicQueryString(categoryData);
      let sourcesQuery = ` AND source:("Twitter" OR "Instagram" OR "Facebook" OR "TikTok" OR "Youtube" OR "LinkedIn" OR "Linkedin" OR "Pinterest" OR "Web" OR "Reddit")`;
      if (parseInt(topicId) === 2619) {
        sourcesQuery = ` AND source:("LinkedIn" OR "Linkedin")`;
      }

      const filters = processFilters({
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        queryString: topicQueryString,
      });

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
        const positionLower = String(position || "").toLowerCase();
        const summaryLower = String(summary || "").toLowerCase();
        const combinedText = `${positionLower} ${summaryLower}`;

        // Expanded and prioritized keyword lists with better ordering
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

        // PRIORITY CHECK: Executive level first with exact matches
        if (
          executiveKeywords.some((keyword) =>
            new RegExp(
              `\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
              "i"
            ).test(combinedText)
          )
        ) {
          return "Executive Level";
        }

        // PRIORITY CHECK: Area Vice President should be Executive
        if (/\barea\s+vice\s+president\b/i.test(combinedText)) {
          return "Executive Level";
        }

        // PRIORITY CHECK: Senior patterns - must come before mid-level checks
        if (
          seniorKeywords.some((keyword) =>
            new RegExp(
              `\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
              "i"
            ).test(combinedText)
          )
        ) {
          return "Senior Level";
        }

        // PRIORITY CHECK: Manager positions (but not assistant manager)
        if (
          /\bmanager\b/i.test(combinedText) &&
          !/\bassistant\s+manager\b/i.test(combinedText)
        ) {
          return "Senior Level";
        }

        // PRIORITY CHECK: Director positions
        if (
          /\bdirector\b/i.test(combinedText) &&
          !/\bassistant\s+director\b/i.test(combinedText)
        ) {
          return "Senior Level";
        }

        // PRIORITY CHECK: Lead positions
        if (
          /\blead\b/i.test(combinedText) &&
          !/\bassistant\s+lead\b/i.test(combinedText)
        ) {
          return "Senior Level";
        }

        // PRIORITY CHECK: Sr. or Senior prefix
        if (/\b(sr\.?|senior)\s+/i.test(combinedText)) {
          return "Senior Level";
        }

        // Check for junior level explicitly
        if (
          juniorKeywords.some((keyword) =>
            new RegExp(
              `\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
              "i"
            ).test(combinedText)
          )
        ) {
          return "Entry Level";
        }

        // Check for mid level
        if (
          midKeywords.some((keyword) =>
            new RegExp(
              `\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
              "i"
            ).test(combinedText)
          )
        ) {
          return "Mid Level";
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

        // Fallback based on title complexity
        if (
          positionLower.split(/\s+/).length > 3 &&
          !/(assistant|associate|junior|jr\.?|intern)/i.test(positionLower)
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

      // console.log(seniorityBreakdown);

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
        category = "all",
        source = "All",
        topicId,
      } = req.body;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      const categoryData = req.processedCategories || {};

      if (Object.keys(categoryData).length === 0) {
        return res.json({
          responseArray: [],
        });
      }

      // Build base query for filters processing
      const baseQueryString = buildBaseQueryString(category, categoryData);

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
};

/**
 * Format post data for the frontend
 * @param {Object} hit - Elasticsearch document hit
 * @returns {Object} Formatted post data
 */
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

  if (topicId === 2619) {
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
    // Add source filter if a specific source is selected
    if (source !== "All") {
      query.bool.must.push({
        match_phrase: { source: source },
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
            { match_phrase: { source: "Pinterest" } },
            { match_phrase: { source: "Web" } },
            { match_phrase: { source: "Reddit" } },
            { match_phrase: { source: "TikTok" } },
          ],
          minimum_should_match: 1,
        },
      });
    }
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
