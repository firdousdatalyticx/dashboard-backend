const { elasticClient } = require('../config/elasticsearch');
const { buildQueryString } = require('../utils/query.utils');
const { format } = require('date-fns');
const prisma = require('../config/database');

/**
 * Calculate the difference in days between two dates
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @returns {number} - Number of days difference
 */
const dateDifference = (endDate, startDate) => {
    const end = new Date(endDate);
    const start = new Date(startDate);
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Controller for handling report generation and retrieval
 * @module controllers/reports
 */
const reportsController = {
    /**
     * Get all reports from database for the authenticated user
     * @async
     * @function getAllReports
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with user's reports or error
     */
    getAllReports: async (req, res) => {
        try {
            const userId = req.user.id;
            
            const reports = await prisma.$queryRaw`
                SELECT * FROM reports 
                WHERE user_id = ${userId}
                ORDER BY id DESC
            `;

            return res.status(200).json({
                success: true,
                reports
            });
        } catch (error) {
            console.error('Error fetching reports:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    /**
     * Save a new report
     * @async
     * @function saveReport
     * @param {Object} req - Express request object
     * @param {Object} req.body - Request body
     * @param {string} req.body.title - Title of the report
     * @param {string} req.body.report_data - Report data (job_id)
     * @param {string} req.body.user_id - ID of the user creating the report
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with created report or error
     */
  saveReport: async (req, res) => {
  try {
    const { title, report_data, user_id, startDate, endDate } = req.body;

    if (!title || !report_data || !user_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, report_data, or user_id'
      });
    }

    // Step 1: Insert report
    await prisma.$executeRaw`
      INSERT INTO reports (title, report_data, user_id, startDate, endDate, date_created)
      VALUES (${title}, ${report_data}, ${user_id}, ${new Date(startDate)}, ${new Date(endDate)}, ${new Date()});
    `;

    // Step 2: Fetch the inserted report using LAST_INSERT_ID
    const report = await prisma.$queryRaw`
      SELECT * FROM reports WHERE id = LAST_INSERT_ID();
    `;

    return res.status(200).json({
      success: true,
      report: report[0] // $queryRaw returns an array
    });

  } catch (error) {
    console.error('Error saving report:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
},

  saveCompetitiveReport: async (req, res) => {
    try {
      const { 
        report_data, 
        dashboard_name_1, 
        dashboard_name_2, 
        topic_id_1, 
        topic_id_2, 
        user_id, 
        start_date_1, 
        end_date_1, 
        start_date_2, 
        end_date_2,
        comparison_analysis_id,
        status = false,
      } = req.body;

      if (!report_data || !user_id || !topic_id_1 || !topic_id_2) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: report_data, user_id, topic_id_1, or topic_id_2'
        });
      }

      // Step 1: Insert competitive report
      await prisma.$executeRaw`
        INSERT INTO competitive_reports (
          report_data, 
          dashboard_name_1, 
          dashboard_name_2, 
          topic_id_1, 
          topic_id_2, 
          user_id, 
          start_date_1, 
          end_date_1, 
          start_date_2, 
          end_date_2, 
          comparison_analysis_id,
          status,
          date_created
        )
        VALUES (
          ${report_data}, 
          ${dashboard_name_1 || null}, 
          ${dashboard_name_2 || null}, 
          ${topic_id_1}, 
          ${topic_id_2}, 
          ${user_id}, 
          ${start_date_1 ? new Date(start_date_1) : null}, 
          ${end_date_1 ? new Date(end_date_1) : null}, 
          ${start_date_2 ? new Date(start_date_2) : null}, 
          ${end_date_2 ? new Date(end_date_2) : null}, 
          ${comparison_analysis_id || null},
          ${status || false},
          ${new Date()}
        );
      `;

      // Step 2: Fetch the inserted report using LAST_INSERT_ID
      const report = await prisma.$queryRaw`
        SELECT * FROM competitive_reports WHERE id = LAST_INSERT_ID();
      `;

      return res.status(200).json({
        success: true,
        report: report[0] // $queryRaw returns an array
      });

    } catch (error) {
      console.error('Error saving competitive report:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

    /**
     * Get competitive reports filtered by comparison_analysis_id
     * @async
     * @function getCompetitiveReports
     * @param {Object} req - Express request object
     * @param {Object} req.query - Query parameters
     * @param {number} req.query.comparison_analysis_id - ID of the comparison analysis to filter by
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with competitive reports or error
     */
    getCompetitiveReports: async (req, res) => {
        try {
            const userId = req.user.id;
            const comparisonAnalysisId = req.query.comparison_analysis_id || req.body.comparison_analysis_id;

            if (!comparisonAnalysisId) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required parameter: comparison_analysis_id'
                });
            }

            const reports = await prisma.$queryRaw`
                SELECT * FROM competitive_reports 
                WHERE comparison_analysis_id = ${parseInt(comparisonAnalysisId)}
                AND user_id = ${userId}
                ORDER BY id DESC
            `;

            return res.status(200).json({
                success: true,
                reports
            });
        } catch (error) {
            console.error('Error fetching competitive reports:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    /**
     * Delete a report by ID
     * @async
     * @function deleteReport
     * @param {Object} req - Express request object
     * @param {Object} req.params - Request parameters
     * @param {string} req.params.id - ID of the report to delete
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with success status or error
     */
    deleteReport: async (req, res) => {
        try {
            const reportId = parseInt(req.params.id);

            if (isNaN(reportId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid report ID'
                });
            }

            await prisma.$executeRaw`DELETE FROM reports WHERE id = ${reportId}`;

            return res.status(200).json({
                success: true,
                message: `Report with ID ${reportId} deleted successfully`
            });
        } catch (error) {
            console.error('Error deleting report:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    /**
     * Delete a competitive report by ID
     * @async
     * @function deleteCompetitiveReport
     * @param {Object} req - Express request object
     * @param {Object} req.params - Request parameters
     * @param {string} req.params.id - ID of the competitive report to delete
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with success status or error
     */
    deleteCompetitiveReport: async (req, res) => {
        try {
            const reportId = parseInt(req.params.id);
            const userId = req.user.id;

            if (isNaN(reportId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid report ID'
                });
            }

            // First, check if the report exists and belongs to the user
            const report = await prisma.$queryRaw`
                SELECT id FROM competitive_reports 
                WHERE id = ${reportId} AND user_id = ${userId}
            `;

            if (!report || report.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Report not found or you do not have permission to delete it'
                });
            }

            // Delete the report
            await prisma.$executeRaw`
                DELETE FROM competitive_reports 
                WHERE id = ${reportId} AND user_id = ${userId}
            `;

            return res.status(200).json({
                success: true,
                message: `Competitive report with ID ${reportId} deleted successfully`
            });
        } catch (error) {
            console.error('Error deleting competitive report:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    /**
     * Get Elasticsearch mentions data
     * @async
     * @function getElasticMentions
     * @param {Object} req - Express request object
     * @param {Object} req.body - Request body containing filter parameters
     * @param {string} req.body.topicId - ID of the topic to search mentions for
     * @param {string} [req.body.timeSlot] - Predefined time slot or 'Custom Dates'
     * @param {string} [req.body.startDate] - Start date for custom date range (when timeSlot is 'Custom Dates')
     * @param {string} [req.body.endDate] - End date for custom date range (when timeSlot is 'Custom Dates')
     * @param {string} [req.body.sentimentType] - Filter by sentiment values, comma-separated
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with Elasticsearch data or error
     */
    getElasticMentions: async (req, res) => {
        try {
            const filtersDat = req.body;
            let topicQueryString = await buildQueryString(filtersDat.topicId, true, "SOCIAL");
            let daysDifference = parseInt(process.env.DATA_FETCH_DAYS_NUMBER?.replace('d', '') || '90');

            // Handle time range
            let greaterThanTime = process.env.DATA_FETCH_FROM_TIME;
            let lessThanTime = process.env.DATA_FETCH_TO_TIME;

            if (filtersDat?.timeSlot === 'Custom Dates') {
                if (filtersDat?.startDate) {
                    const greaterThanDate = new Date(filtersDat.startDate);
                    greaterThanTime = format(greaterThanDate, 'yyyy-MM-dd');
                } else {
                    greaterThanTime = format(new Date(new Date().setDate(new Date().getDate() - 90)), 'yyyy-MM-dd');
                }

                if (filtersDat?.endDate) {
                    const lessThanDate = new Date(filtersDat.endDate);
                    lessThanTime = format(lessThanDate, 'yyyy-MM-dd');
                } else {
                    lessThanTime = format(new Date(), 'yyyy-MM-dd');
                }
            } else if (filtersDat?.timeSlot) {
                switch (filtersDat.timeSlot) {
                    case 'today':
                        greaterThanTime = format(new Date(), 'yyyy-MM-dd');
                        lessThanTime = format(new Date(), 'yyyy-MM-dd');
                        break;
                    case '24h':
                        greaterThanTime = format(new Date(new Date().setHours(new Date().getHours() - 24)), 'yyyy-MM-dd');
                        lessThanTime = format(new Date(), 'yyyy-MM-dd');
                        break;
                    default:
                        greaterThanTime = format(
                            new Date(new Date().setDate(new Date().getDate() - parseInt(filtersDat.timeSlot))),
                            'yyyy-MM-dd'
                        );
                        lessThanTime = format(new Date(), 'yyyy-MM-dd');
                }
            }

            daysDifference = dateDifference(lessThanTime, greaterThanTime);

            // Handle sentiment filter
            if (filtersDat?.sentimentType && filtersDat.sentimentType !== 'null' && filtersDat.sentimentType.toLowerCase() !== 'all') {
                const sentiArray = filtersDat.sentimentType.split(',');
                const sentiStr = sentiArray.map(s => `"${s}"`).join(' OR ');
                topicQueryString += ` AND predicted_sentiment_value:(${sentiStr})`;
            }

                 if(parseInt(req.body.topicId)==2619 || parseInt(req.body.topicId)==2639 || parseInt(req.body.topicId)==2640 || parseInt(req.body.topicId)==2642 || parseInt(req.body.topicId)==2647 || parseInt(req.body.topicId)==2648 || parseInt(req.body.topicId)==2649){
            topicQueryString += ` AND source:(linkedin OR LinkedIn OR Linkedin)`;
        }else if(parseInt(req.body.topicId)==2619){
                      topicQueryString += ` AND source:(linkedin OR LinkedIn OR Linkedin OR Twitter)`;
        }else if(parseInt(req.body.topicId)==2646 || parseInt(req.body.topicId)==2650){
          topicQueryString += ` AND source:(linkedin OR LinkedIn OR Linkedin OR Twitter OR Web OR Instagram OR Facebook)`;
        }

      // Build Elasticsearch query
      const params = {
        from: 0,
        size: 10000,
        _source: [
          "source",
          "predicted_sentiment_value",
          "llm_mention_action",
          "llm_mention_type",
          "llm_mention_tone",
          "llm_mention_recurrence",
          "p_engagement",
          "p_likes",
          "p_comments",
          "p_shares",
          "day_of_week",
          "u_followers",
          "p_created_time",
          "llm_mention_urgency",
          "llm_mention_touchpoint",
          "p_message",
          "u_country",
          "query_hashtag",
          "llm_emotion",
          "rating",
          "created_at",
          "llm_mention_audience",
          "llm_language",
          "llm_positive_points",
          "llm_negative_points",
          "p_comments_data"
        ],
        query: {
          bool: {
            must: [
              {
                query_string: {
                  query: topicQueryString,
                },
              },
              {
                range: {
                  p_created_time: {
                    gte: greaterThanTime,
                    lte: lessThanTime,
                  },
                },
              },
            ],
          },
        },
        sort: [{ p_created_time: { order: "desc" } }],
      };

           return res.status(200).json({
                success: true,
                query: params
            });

            // Execute Elasticsearch query
            const esData = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: params
            });

            return res.status(200).json({
                success: true,
                data: esData
            });

        } catch (error) {
            console.error('Error fetching Elasticsearch mentions:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
};

module.exports = reportsController; 