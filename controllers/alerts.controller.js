const { PrismaClient } = require('@prisma/client');
const cron = require('node-cron');
const axios = require('axios');
const sgMail = require('@sendgrid/mail');
const prisma = new PrismaClient();
const { elasticClient } = require('../config/elasticsearch');

// Store cron jobs in memory
const cronJobs = {};

/**
 * Schedule a cron job for an alert
 * @param {string} alertId - Alert ID
 * @param {string} frequency - Alert frequency
 */
const scheduleCronJob = async (alertId, frequency) => {
    let cronExpression;
    let initialDelayMinutes = 0;
    let defaultStartOffsetMinutes = 0;

    switch (frequency) {
        case 'Instant notification':
            cronExpression = '*/5 * * * *'; // Every 5 minutes
            initialDelayMinutes = 5;
            defaultStartOffsetMinutes = 5;
            break;
        case '1 Hour':
            cronExpression = '0 * * * *'; // Every 1 hour
            initialDelayMinutes = 60;
            defaultStartOffsetMinutes = 60;
            break;
        case '6 Hours':
            cronExpression = '0 */6 * * *'; // Every 6 hours
            initialDelayMinutes = 360;
            defaultStartOffsetMinutes = 360;
            break;
        case '12 Hours':
            cronExpression = '0 */12 * * *'; // Every 12 hours
            initialDelayMinutes = 720;
            defaultStartOffsetMinutes = 720;
            break;
        case '24 Hours':
            cronExpression = '0 0 * * *'; // Every 24 hours (midnight)
            initialDelayMinutes = 1440;
            defaultStartOffsetMinutes = 1440;
            break;
        default:
            cronExpression = '* * * * *'; // Default: every minute
            initialDelayMinutes = 1;
            defaultStartOffsetMinutes = 1;
            break;
    }

    if (cronJobs[alertId]) {
        await scheduleStopCronJob(alertId);
    }

    const executeJob = async () => {
        const alert = await prisma.alerts.findUnique({ where: { id: parseInt(alertId) } });

        if (!alert || alert.isDeleted) {
            await scheduleStopCronJob(alertId);
            return;
        }

        try {
            const endDate = new Date();
            const defaultStartDate = new Date();
            defaultStartDate.setMinutes(defaultStartDate.getMinutes() - defaultStartOffsetMinutes);

            const response = await fetchAlertRecords(alert, defaultStartDate, endDate);
            if (response.totalNewMentions > 0) {
                await prisma.alerts.update({
                    where: { id: parseInt(alertId) },
                    data: { 
                        lastUpdatedAt: endDate, 
                        lastUpdatedFrom: alert.lastUpdatedAt, 
                        updatedAt: new Date() 
                    }
                });

                await prisma.notification.create({
                    data: {
                        alertId: alert.id,
                        startDate: alert.lastUpdatedAt ? alert.lastUpdatedAt : defaultStartDate.toISOString(),
                        endDate: endDate,
                        type: 'alerts',
                        total_mentions: response.totalNewMentions
                    }
                });

                await sendEmail(
                    alert.emails,
                    'Datalyticx Notifications',
                    generateEmailTemplate(response)
                );
            } else {
                await prisma.alerts.update({
                    where: { id: parseInt(alertId) },
                    data: { 
                        lastUpdatedAt: endDate, 
                        lastUpdatedFrom: alert.lastUpdatedAt 
                    }
                });
                console.log('No new records found.');
            }
        } catch (error) {
            console.error('Error executing API call:', error.message);
        }
    };

    // First execution delay
    setTimeout(
        async () => {
            await executeJob();
            // Start the cron job for subsequent executions
            cronJobs[alertId] = cron.schedule(cronExpression, executeJob);
        },
        initialDelayMinutes * 60 * 1000
    );
};

/**
 * Stop a scheduled cron job
 * @param {string} alertId - Alert ID
 */
const scheduleStopCronJob = async (alertId) => {
    if (cronJobs[alertId]) {
        cronJobs[alertId].stop();
        delete cronJobs[alertId];
        if (cronJobs[alertId]) {
            delete cronJobs[alertId];
        }
    }
};

/**
 * Fetch alert records from Elasticsearch
 * @param {Object} alert - Alert object
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 */
const fetchAlertRecords = async (alert, startDate, endDate) => {
    try {
 

              const topicId = alert.topicId;
              const keywords =alert.keywords || ""; 
              const sources = alert.filterBySource?.split(',') || []
              const sentiments = alert.sentimentTypes?.split(',') || []
               startDate = alert.lastUpdatedAt ? alert.lastUpdatedAt : startDate;
               endDate = endDate ? endDate : null;
        
              if (!keywords.trim()) {
                return { error: 'Keywords are required' };
              }
              const now = new Date()
              const defaultStartDate = new Date()
              defaultStartDate.setDate(defaultStartDate.getDate() - 90)
        
              const rangeQuery = {
                range: {
                  created_at: {
                    gte: (startDate || defaultStartDate).toISOString(),
                    lte: (endDate || now).toISOString(),
                    format: 'strict_date_optional_time'
                  }
                }
              }
        
              // Construct ElasticSearch Query
              const params = {
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: {
                size: 0,
                query: {
                  bool: {
                    must: [
                      rangeQuery,
        
                      {
                        query_string: {
                          query: keywords,
                          default_field: 'p_message',
                          default_operator: 'AND'
                        }
                      },
        
                      sources.length > 0
                        ? {
                          bool: {
                            should: sources.map(source => ({
                              match_phrase: { source }
                            })),
                            minimum_should_match: 1
                          }
                        }
                        : null,
        
                      sentiments.length > 0
                        ? {
                          bool: {
                            should: sentiments.map(sentiment => ({
                              match_phrase: { 'predicted_sentiment_value.keyword': sentiment }
                            })),
                            minimum_should_match: 1
                          }
                        }
                        : null
                    ].filter(Boolean)
                  }
                },
                aggs: {
                  sentiment_breakdown: {
                    terms: {
                      field: 'predicted_sentiment_value.keyword',
                      size: 3
                    }
                  }
                }
              }
            }
              const response = await elasticClient.search(params)
        
              if (!response.aggregations?.sentiment_breakdown) {
                return {
                  trackedKeyword: keywords,
                  totalNewMentions: 0,
                  sentimentBreakdown: {
                    '😊 Positive Mentions': 0,
                    '😐 Neutral Mentions': 0,
                    '😠 Negative Mentions': 0
                  },
                  keyHighlights: {
                    overallSentimentTrend: 'Neutral',
                    notableDiscussionsFrom: sources.join(', ')
                  }
                }
              }
        
              const sentimentBuckets = response.aggregations.sentiment_breakdown.buckets || []
        
              const sentimentCounts = {
                '😊 Positive Mentions': sentimentBuckets.find(b => b.key === 'Positive')?.doc_count || 0,
                '😐 Neutral Mentions': sentimentBuckets.find(b => b.key === 'Neutral')?.doc_count || 0,
                '😠 Negative Mentions': sentimentBuckets.find(b => b.key === 'Negative')?.doc_count || 0
              }
        
              const totalNewMentions =
                sentimentCounts['😊 Positive Mentions'] +
                sentimentCounts['😐 Neutral Mentions'] +
                sentimentCounts['😠 Negative Mentions']
        
              const overallSentimentTrend =
                sentimentCounts['😊 Positive Mentions'] > sentimentCounts['😠 Negative Mentions']
                  ? 'Positive'
                  : sentimentCounts['😠 Negative Mentions'] > sentimentCounts['😊 Positive Mentions']
                    ? 'Negative'
                    : 'Neutral'
        
              return {
                trackedKeyword: keywords,
                totalNewMentions,
                sentimentBreakdown: sentimentCounts,
                keyHighlights: {
                  overallSentimentTrend,
                  notableDiscussionsFrom: sources.join(', ')
                }
              }


    } catch (error) {
        console.error('Error fetching alert records:', error);
        return {};
    }
};


/**
 * Send email notification
 * @param {string} recipient - Comma-separated email addresses
 * @param {string} subject - Email subject
 * @param {string} html - Email HTML content
 */
const sendEmail = async (recipient, subject, html) => {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    const recipientList = recipient.split(',').map(email => email.trim());

    const msg = {
        to: recipientList,
        from: 'notifications@datalyticx.ai',
        subject: subject,
        html: html
    };

    try {
        await sgMail.send(msg);
        console.log('Email sent successfully');
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
};

/**
 * Generate email template
 * @param {Object} data - Alert data
 * @returns {string} - HTML email template
 */
const generateEmailTemplate = (data) => {
    return `<html>
        <body>
            <p>Dear User,</p>
            <p>We have detected new mentions related to your alert. Our sentiment analysis has evaluated these mentions, providing valuable insights into public perception.</p>
            <h3>Alert Summary:</h3>
            <p><strong>Tracked Keyword/Topic:</strong> ${data.trackedKeyword}</p>
            <p><strong>Total New Mentions:</strong> ${data.totalNewMentions}</p>
            <h4>Sentiment Breakdown:</h4>
            <ul>
                <li>😊 Positive Mentions: ${data.sentimentBreakdown['😊 Positive Mentions']}</li>
                <li>😐 Neutral Mentions: ${data.sentimentBreakdown['😐 Neutral Mentions']}</li>
                <li>😠 Negative Mentions: ${data.sentimentBreakdown['😠 Negative Mentions']}</li>
            </ul>
            <h4>Key Highlights:</h4>
            <p>The overall sentiment trend is <strong>${data.keyHighlights.overallSentimentTrend}</strong></p>
            <p>Notable discussions are emerging from <strong>${
                data.keyHighlights.notableDiscussionsFrom.includes('Twitter')
                    ? 'X'
                    : data.keyHighlights.notableDiscussionsFrom
            }</strong></p>
            <p>View Full Analysis in Dashboard <a href="${process.env.FRONT_END_HOST}/en/dashboards">here</a></p>
            <p>Stay informed with real-time sentiment insights and make data-driven decisions with Datalyticx.</p>
            <p>Best regards,<br>The Datalyticx Team</p>
        </body>
    </html>`;
};

/**
 * Controller for handling alert operations
 * @module controllers/alerts
 */
const alertsController = {
    /**
     * Create or update an alert
     * @async
     * @function createOrUpdateAlert
     * @param {Object} req - Express request object
     * @param {Object} req.query - Query parameters
     * @param {string} [req.query.id] - ID of the alert to update (omit for creating new alert)
     * @param {Object} req.body - Request body
     * @param {Array<string>} req.body.keywords - Keywords to monitor
     * @param {Array<string>} req.body.emails - Email addresses for notifications
     * @param {Array<string>} req.body.sentimentTypes - Sentiment types to monitor (Positive, Negative, Neutral)
     * @param {Array<string>} req.body.sources - Social media sources to monitor
     * @param {string} req.body.frequency - Alert check frequency
     * @param {number} req.body.user_id - ID of the user creating the alert
     * @param {string} req.body.title - Title of the alert
     * @param {string} req.body.topicId - ID of the topic to monitor
     * @param {string} req.body.topicName - Name of the topic to monitor
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with created/updated alert or error
     */
    createOrUpdateAlert: async (req, res) => {
        try {
            const { id } = req.query;
            const {
                keywords,
                emails,
                sentimentTypes,
                sources,
                frequency,
                user_id,
                title,
                topicId,
                topicName
            } = req.body;

            const sourceMap = {
                Google: 'GoogleMyBusiness',
                X: 'Twitter'
            };

            const filterBySource = sources.map(source => sourceMap[source] || source);

            if (!id) {
                const alert = await prisma.alerts.create({
                    data: {
                        title,
                        keywords: keywords.join(','),
                        emails: emails.join(','),
                        sentimentTypes: sentimentTypes.join(','),
                        filterBySource: filterBySource.join(','),
                        frequency,
                        user_id,
                        topicId,
                        topicName
                    }
                });

                await scheduleCronJob(alert.id.toString(), frequency);

                return res.status(200).json(
                    alert
                );
            } else {
                await scheduleStopCronJob(id);

                const alertsData = await prisma.alerts.findUnique({
                    where: { id: parseInt(id) }
                });

                const alert = await prisma.alerts.create({
                    data: {
                        title,
                        keywords: keywords.join(','),
                        emails: emails.join(','),
                        sentimentTypes: sentimentTypes.join(','),
                        filterBySource: filterBySource.join(','),
                        frequency,
                        user_id,
                        topicId,
                        createdAt: alertsData?.createdAt ? new Date(alertsData.createdAt) : new Date(),
                        lastUpdatedAt: alertsData?.lastUpdatedAt ? new Date(alertsData.lastUpdatedAt) : null,
                        topicName
                    }
                });

                await prisma.notification.deleteMany({
                    where: { alertId: parseInt(id) }
                });

                await prisma.alerts.delete({
                    where: { id: parseInt(id) }
                });

                await scheduleCronJob(alert.id.toString(), frequency);

                return res.status(200).json(alert);
            }
        } catch (error) {
            console.error('Error creating/updating alert:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    /**
     * Get alerts or delete an alert
     * @async
     * @function getOrDeleteAlert
     * @param {Object} req - Express request object
     * @param {Object} req.query - Query parameters
     * @param {string} req.query.user_id - ID of the user whose alerts to retrieve
     * @param {string} [req.query.id] - ID of the alert to delete (omit to get all alerts)
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with alerts, deleted alert confirmation, or error
     */
    getOrDeleteAlert: async (req, res) => {
        try {
            const { user_id, id } = req.query;

            if (!user_id) {
                return res.status(400).json({
                    success: false,
                    error: 'user_id is required'
                });
            }

            if (!id) {
                const alerts = await prisma.alerts.findMany({
                    where: {
                        user_id: parseInt(user_id),
                        OR: [{ isDeleted: false }, { isDeleted: null }]
                    },
                    orderBy: {
                        createdAt: 'asc'
                    }
                });

                return res.status(200).json(alerts);
            } else {
                await scheduleStopCronJob(id);

                await prisma.notification.deleteMany({
                    where: { alertId: parseInt(id) }
                });

                const alert = await prisma.alerts.delete({
                    where: { id: parseInt(id) }
                });

                return res.status(200).json(alert);
            }
        } catch (error) {
            console.error('Error getting/deleting alert:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },


    alertPostShow:async (req,res)=>{
        try {
            const { id, recordsToShow, isScadUser, keywords, sources, sentiments, startDate, endDate } = req.query
        
            const topicId = parseInt(id)
            const records = parseInt(recordsToShow) || 30
            const isScad = isScadUser || 'false'
            const keywordQuery = keywords || ''
            const sourceList = sources ? sources.split(',') : []
            const sentimentList = sentiments ? sentiments.split(',') : []
            const start = startDate ? new Date(startDate) : null
            const end = endDate ? new Date(endDate) : null
        
            if (!keywordQuery.trim()) {
              return res.status(400).json({ error: 'Keywords are required' })
            }
        
            const now = new Date()
            const defaultStartDate = new Date()
            defaultStartDate.setDate(defaultStartDate.getDate() - 90)
        
            const rangeQuery = {
              range: {
                created_at: {
                  gte: (start || defaultStartDate).toISOString(),
                  lte: (end || now).toISOString(),
                  format: 'strict_date_optional_time'
                }
              }
            }
        
            const rangeToShow =
              records === 30
                ? { startRange: 0, endRange: 30 }
                : { startRange: records - 30, endRange: records }
        
            const params = {
              size: rangeToShow.endRange - rangeToShow.startRange,
              from: rangeToShow.startRange,
              _source: [
                'p_message_text',
                'p_created_time',
                'predicted_sentiment_value',
                'p_url',
                'source',
                'llm_entities.Other'
              ],
              request_cache: true,
              query: {
                bool: {
                  must: [
                    rangeQuery,
        
                    {
                      query_string: {
                        query: keywordQuery,
                        default_field: 'p_message_text',
                        default_operator: 'AND'
                      }
                    },
        
                    sourceList.length > 0
                      ? {
                          bool: {
                            should: sourceList.map(source => ({
                              match_phrase: { source }
                            })),
                            minimum_should_match: 1
                          }
                        }
                      : null,
        
                    sentimentList.length > 0
                      ? {
                          bool: {
                            should: sentimentList.map(sentiment => ({
                              match_phrase: { 'predicted_sentiment_value.keyword': sentiment }
                            })),
                            minimum_should_match: 1
                          }
                        }
                      : null
                  ].filter(Boolean)
                }
              }
            }
        
            const results = await elasticClient.search(params)
        
            let responseArray = []
        
            for (let hit of results?.hits?.hits || []) {
              const esData = hit._source
        
              let message_text = esData.p_message_text ? esData.p_message_text.replace(/<\/?[^>]+(>|$)/g, '') : ''
              let created_at = esData.p_created_time ? new Date(esData.p_created_time).toLocaleString() : 'Unknown Date'
              let predicted_sentiment = esData.predicted_sentiment_value || 'Neutral'
              let source_icon = esData.p_url || ''
              let source = esData.source || 'Unknown Source'
              let extracted_keywords = esData['llm_entities.Other'] || []
        
           
              responseArray.push({
                message_text,
                created_at,
                predicted_sentiment,
                source_icon,
                source,
                keywords: extracted_keywords
              })
            }
        
            return res.status(200).json({ responseArray })
          } catch (error) {
            console.error('Error fetching alerts:', error)
            return res.status(500).json({ error: 'Internal server error' })
          }
    }
};

module.exports = alertsController; 