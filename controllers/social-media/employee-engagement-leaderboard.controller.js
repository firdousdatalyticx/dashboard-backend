const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const employee_engagement_leaderboardController = {
   
  /**
   * Create/Update Employee Engagement Leaderboard
   * POST /api/employee-engagement-leaderboard
   */
  Create: async (req, res) => {
    try {
      const topicId = parseInt(req.body.topicId); // Parse to integer
      const data = req.body.data;

      if (!topicId || isNaN(topicId) || !data || !Array.isArray(data)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid request data. topicId (integer) and data array are required.'
        });
      }

      // Prepare data for upsert operations
      const upsertPromises = data.map(row => {
        return prisma.employee_engagement_leaderboard.upsert({
          where: {
            topic_id_name_position: {
              topic_id: topicId,
              name: row.name || '',
              position: row.position || ''
            }
          },
          update: {
            profile_url: row.profile_url || row.profileUrl || null,
            likes: row.likes || 0,
            comments: row.comments || 0,
            reshares: row.reshares || 0,
            sum_quality: row.sum_quality || 0,
            avg_quality: parseFloat(row.avg_quality) || 0.00,
            high_q: row.high_q || 0,
            low_q: row.low_q || 0,
            activity_score: row.activity_score || 0,
            quality_score: parseFloat(row.quality_score) || 0.00,
            final_engagement_score: parseFloat(row.final_engagement_score) || 0.00,
            updated_at: new Date()
          },
          create: {
            topic_id: topicId,
            name: row.name || '',
            position: row.position || '',
            profile_url: row.profile_url || row.profileUrl || null,
            likes: row.likes || 0,
            comments: row.comments || 0,
            reshares: row.reshares || 0,
            sum_quality: row.sum_quality || 0,
            avg_quality: parseFloat(row.avg_quality) || 0.00,
            high_q: row.high_q || 0,
            low_q: row.low_q || 0,
            activity_score: row.activity_score || 0,
            quality_score: parseFloat(row.quality_score) || 0.00,
            final_engagement_score: parseFloat(row.final_engagement_score) || 0.00
          }
        });
      });

      // Execute all upsert operations
      const results = await prisma.$transaction(upsertPromises);

      return res.status(200).json({
        success: true,
        message: 'Employee engagement leaderboard data uploaded successfully',
        data: {
          topicId,
          totalRecords: results.length,
          processedRows: results.length
        }
      });

    } catch (error) {
      console.error('Error creating/updating employee engagement data:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload employee engagement data',
        error: error.message
      });
    }
  },

  /**
   * Get Employee Engagement Leaderboard by Topic
   * GET /api/employee-engagement-leaderboard/:topicId
   */
  GET: async (req, res) => {
    try {
      const topicId = parseInt(req.params.topicId); // Parse to integer
      const { limit = 100, offset = 0,isPublic="false" } = req.query;

      // Validate topicId
      if (isNaN(topicId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid topicId. Must be a valid integer.'
        });
      }

      // Parse limit and offset
      const parsedLimit = parseInt(limit);
      const parsedOffset = parseInt(offset);
      console.log("isPublic",isPublic)

      // Fetch leaderboard data
      const rows = await prisma.employee_engagement_leaderboard.findMany({
        where: {
          topic_id: topicId,
          isPublic:isPublic=="false"?false:true
        },
        orderBy: {
          final_engagement_score: 'desc'
        },
        take: parsedLimit,
        skip: parsedOffset
      });

      // Get total count
      const total = await prisma.employee_engagement_leaderboard.count({
        where: {
          topic_id: topicId,
          isPublic:isPublic=="false"?false:true
        }
      });

      return res.status(200).json({
        success: true,
        data: rows,
        pagination: {
          total: total,
          limit: parsedLimit,
          offset: parsedOffset,
          hasMore: parsedOffset + parsedLimit < total
        }
      });

    } catch (error) {
      console.error('Error fetching employee engagement data:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch employee engagement data',
        error: error.message
      });
    }
  },

  /**
   * Delete Employee Engagement Data by Topic
   * DELETE /api/employee-engagement-leaderboard/:topicId
   */
  Delete: async (req, res) => {
    try {
      const topicId = parseInt(req.params.topicId); // Parse to integer

      // Validate topicId
      if (isNaN(topicId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid topicId. Must be a valid integer.'
        });
      }

      // Delete all records for the given topic
      const result = await prisma.employee_engagement_leaderboard.deleteMany({
        where: {
          topic_id: topicId
        }
      });

      return res.status(200).json({
        success: true,
        message: 'Employee engagement data deleted successfully',
        deletedRows: result.count
      });

    } catch (error) {
      console.error('Error deleting employee engagement data:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete employee engagement data',
        error: error.message
      });
    }
  },

  /**
   * Get Top Performers (High Quality Contributors)
   * GET /api/employee-engagement-leaderboard/:topicId/top-performers
   */
  GetTopPerformers: async (req, res) => {
    try {
      const topicId = parseInt(req.params.topicId); // Parse to integer
      const { limit = 10 } = req.query;

      // Validate topicId
      if (isNaN(topicId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid topicId. Must be a valid integer.'
        });
      }

      const topPerformers = await prisma.employee_engagement_leaderboard.findMany({
        where: {
          topic_id: topicId,
          high_q: 1
        },
        orderBy: {
          final_engagement_score: 'desc'
        },
        take: parseInt(limit)
      });

      return res.status(200).json({
        success: true,
        data: topPerformers,
        count: topPerformers.length
      });

    } catch (error) {
      console.error('Error fetching top performers:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch top performers',
        error: error.message
      });
    }
  },

  /**
   * Get Statistics by Topic
   * GET /api/employee-engagement-leaderboard/:topicId/statistics
   */
  GetStatistics: async (req, res) => {
    try {
      const topicId = parseInt(req.params.topicId); // Parse to integer

      // Validate topicId
      if (isNaN(topicId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid topicId. Must be a valid integer.'
        });
      }

      // Get aggregate statistics
      const stats = await prisma.employee_engagement_leaderboard.aggregate({
        where: {
          topic_id: topicId
        },
        _avg: {
          final_engagement_score: true,
          quality_score: true,
          activity_score: true,
          avg_quality: true
        },
        _sum: {
          likes: true,
          comments: true,
          reshares: true
        },
        _count: {
          id: true
        }
      });

      // Get quality distribution
      const highQualityCount = await prisma.employee_engagement_leaderboard.count({
        where: {
          topic_id: topicId,
          high_q: 1
        }
      });

      const lowQualityCount = await prisma.employee_engagement_leaderboard.count({
        where: {
          topic_id: topicId,
          low_q: 1
        }
      });

      const mediumQualityCount = stats._count.id - highQualityCount - lowQualityCount;

      return res.status(200).json({
        success: true,
        data: {
          totalEmployees: stats._count.id,
          averages: {
            engagementScore: stats._avg.final_engagement_score?.toFixed(2) || 0,
            qualityScore: stats._avg.quality_score?.toFixed(2) || 0,
            activityScore: stats._avg.activity_score?.toFixed(2) || 0,
            avgQuality: stats._avg.avg_quality?.toFixed(2) || 0
          },
          totals: {
            likes: stats._sum.likes || 0,
            comments: stats._sum.comments || 0,
            reshares: stats._sum.reshares || 0
          },
          qualityDistribution: {
            highQuality: highQualityCount,
            mediumQuality: mediumQualityCount,
            lowQuality: lowQualityCount,
            percentages: {
              high: stats._count.id > 0 ? ((highQualityCount / stats._count.id) * 100).toFixed(1) : '0.0',
              medium: stats._count.id > 0 ? ((mediumQualityCount / stats._count.id) * 100).toFixed(1) : '0.0',
              low: stats._count.id > 0 ? ((lowQualityCount / stats._count.id) * 100).toFixed(1) : '0.0'
            }
          }
        }
      });

    } catch (error) {
      console.error('Error fetching statistics:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics',
        error: error.message
      });
    }
  }
};

module.exports = employee_engagement_leaderboardController;