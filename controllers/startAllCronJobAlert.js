const { PrismaClient } = require('@prisma/client');
const cron = require('node-cron');
const axios = require('axios');
const sgMail = require('@sendgrid/mail');
const prisma = new PrismaClient();
const { elasticClient } = require('../config/elasticsearch');

module.exports.index = async () => {
  try {
    const Alerts = await prisma.alerts.findMany({
      orderBy: {
        createdAt: 'asc'
      }
    })

    for (const element of Alerts) {
      await scheduleCronJob(element.id.toString(), element.frequency)
    }

    return{ Alerts }
  } catch (error) {
    console.error(error.message)
    console.log(error)
    return { error: 'Internal server error' };
  }
}

const cronJobs= {}


const scheduleCronJob = async (alertId, frequency) => {
  let cronExpression;
  let defaultStartOffsetMinutes = 0;
  let initialDelayMinutes = 0;

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
      cronExpression = '0 0 * * *'; // Every 24 hours
      initialDelayMinutes = 1440;
      defaultStartOffsetMinutes = 1440;
      break;
    default:
      cronExpression = '* * * * *'; // Default: every minute
      initialDelayMinutes = 1;
      defaultStartOffsetMinutes = 1;
      break;
  }

  if (!cronExpression) {
    console.error(`Invalid frequency for alertId ${alertId}: ${frequency}`);
    return;
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

      const response = await fetchAlertRecords(alert, endDate);
      if (response.totalNewMentions > 0) {
        await prisma.alerts.update({
          where: { id: parseInt(alertId) },
          data: { lastUpdatedAt: endDate, lastUpdatedFrom: alert.lastUpdatedAt, updatedAt: new Date() }
        });

        await prisma.notification.create({
          data: {
            alert: { connect: { id: alert.id } },
            startDate: alert.lastUpdatedAt ? alert.lastUpdatedAt : defaultStartDate.toISOString(),
            endDate: endDate,
            type: 'alerts',
            total_mentions: response.totalNewMentions
          }
        });

        await sendEmail(
          alert.emails,
          'Datalyticx Notifications',
          `<html>
  <body>
    <p>Dear User,</p>

    <p>We have detected new mentions related to your alert. Our sentiment analysis has evaluated these mentions, providing valuable insights into public perception.</p>

    <h3>Alert Summary:</h3>
    <p><strong>Tracked Keyword/Topic:</strong> ${response.trackedKeyword}</p>
    <p><strong>Total New Mentions:</strong> ${response.totalNewMentions}</p>
    <h4>Sentiment Breakdown:</h4>
    <ul>
      <li>😊 Positive Mentions: ${response.sentimentBreakdown['😊 Positive Mentions']}</li>
      <li>😐 Neutral Mentions: ${response.sentimentBreakdown['😐 Neutral Mentions']}</li>
      <li>😠 Negative Mentions: ${response.sentimentBreakdown['😠 Negative Mentions']}</li>
    </ul>

    <h4>Key Highlights:</h4>
    <p>The overall sentiment trend is <strong>${response.keyHighlights.overallSentimentTrend}</strong></p>
    <p>Notable discussions are emerging from <strong>${
      response.keyHighlights.notableDiscussionsFrom.includes('Twitter')
        ? 'X'
        : response.keyHighlights.notableDiscussionsFrom
    }</strong></p>
   <p>View Full Analysis in Dashboard <a href="${process.env.FRONT_END_HOST}/en/dashboards">here</a></p>
    <p>Stay informed with real-time sentiment insights and make data-driven decisions with Datalyticx.</p>
    <p>Best regards,<br>The Datalyticx Team</p>
  </body>
</html>`
        );
      } else {
        await prisma.alerts.update({
          where: { id: parseInt(alertId) },
          data: { lastUpdatedAt: endDate, lastUpdatedFrom: alert.lastUpdatedAt }
        });
        console.log('No records found for the alert.');
      }
    } catch (error) {
      console.error('Error executing API call:', error.message);
    }
  };


  // First execution delay
  setTimeout(async () => {
    await executeJob();

    // Start the cron job for subsequent executions
    cronJobs[alertId] = cron.schedule(cronExpression, executeJob);
  }, initialDelayMinutes * 60 * 1000);
};


const scheduleStopCronJob = async (alertId) => {
  if (cronJobs[alertId]) {
    cronJobs[alertId].stop()
    delete cronJobs[alertId]
    if (cronJobs[alertId]) {
      delete cronJobs[alertId]
    }
  }
}



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

const sendEmail = async (recipient, subject, html) => {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
  const recipientList = recipient.split(',').map(email => email.trim())

  const msg = {
    to: recipientList,
    from: 'notifications@datalyticx.ai',
    subject: subject,
    html: html
  }
  try {
    await sgMail.send(msg)
    console.log('Email sent')
    return { msg }
  } catch (error) {
    console.error('Error sending email:', error)
    throw error
  }
}
