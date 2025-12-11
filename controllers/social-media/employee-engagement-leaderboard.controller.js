const mysql = require('mysql2/promise');
// Database configuration
const dbConfig = {
  host: 'datalyticxdatabase.mysql.database.azure.com',
  port: 3306,
  user: 'datalyticx',
  password: 'pygret-xaZwy8@25!',
  database: 'datalyticx_dashboard',
  ssl: {
    rejectUnauthorized: false
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

  const pool = mysql.createPool(dbConfig);

const employee_engagement_leaderboardController = {
   
  
 Create:async(req,res)=>{
    const topicId = req.body.topicId;
     let connection = await pool.getConnection();
    // Prepare bulk insert/update query
        const values = req.body.data.map(row => [
            topicId,
            row.name || '',
            row.position ||'',
            row.profile_url || row.profileUrl || null,
            row.likes || 0,
            row.comments || 0,
            row.reshares || 0,
            row.sum_quality || 0,
            row.avg_quality || 0.00,
            row.high_q || 0,
            row.low_q || 0,
            row.activity_score || 0,
            row.quality_score || 0.00,
            row.final_engagement_score || 0.00
        ]);

         // Insert or Update query using ON DUPLICATE KEY UPDATE
        const insertQuery = `
            INSERT INTO employee_engagement_leaderboard (
                topic_id, name, position, profile_url, likes, comments, reshares, 
                sum_quality, avg_quality, high_q, low_q, 
                activity_score, quality_score, final_engagement_score
            ) VALUES ?
            ON DUPLICATE KEY UPDATE
                profile_url = VALUES(profile_url),
                likes = VALUES(likes),
                comments = VALUES(comments),
                reshares = VALUES(reshares),
                sum_quality = VALUES(sum_quality),
                avg_quality = VALUES(avg_quality),
                high_q = VALUES(high_q),
                low_q = VALUES(low_q),
                activity_score = VALUES(activity_score),
                quality_score = VALUES(quality_score),
                final_engagement_score = VALUES(final_engagement_score),
                updated_at = CURRENT_TIMESTAMP
        `;

        const [result] = await connection.query(insertQuery, [values]);

        return res.status(200).json({
            success: true,
            message: 'Employee engagement leaderboard data uploaded successfully',
            data: {
                topicId,
                totalRecords: result.length,
                affectedRows: result.affectedRows,
                insertedRows: result.affectedRows - result.changedRows,
                updatedRows: result.changedRows
            }
        });
  },
/**
 * API Endpoint: Get Employee Engagement Leaderboard by Topic
 * GET /api/employee-engagement-leaderboard/:topicId
 */
GET: async (req, res) => {
    let connection;
    
    try {
        const { topicId } = req.params;
        const { limit = 100, offset = 0 } = req.query;

        connection = await pool.getConnection();

        const [rows] = await connection.query(
            `SELECT * FROM employee_engagement_leaderboard 
             WHERE topic_id = ? 
             ORDER BY final_engagement_score DESC 
             LIMIT ? OFFSET ?`,
            [topicId, parseInt(limit), parseInt(offset)]
        );

        const [countResult] = await connection.query(
            'SELECT COUNT(*) as total FROM employee_engagement_leaderboard WHERE topic_id = ?',
            [topicId]
        );

        return res.status(200).json({
            success: true,
            data: rows,
            pagination: {
                total: countResult[0].total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });

    } catch (error) {
        console.error('Error fetching employee engagement data:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch employee engagement data',
            error: error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
},

/**
 * API Endpoint: Delete Employee Engagement Data by Topic
 * DELETE /api/employee-engagement-leaderboard/:topicId
 */
Delete: async (req, res) => {
    let connection;
    
    try {
        const { topicId } = req.params;

        connection = await pool.getConnection();

        const [result] = await connection.query(
            'DELETE FROM employee_engagement_leaderboard WHERE topic_id = ?',
            [topicId]
        );

        return res.status(200).json({
            success: true,
            message: 'Employee engagement data deleted successfully',
            deletedRows: result.affectedRows
        });

    } catch (error) {
        console.error('Error deleting employee engagement data:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete employee engagement data',
            error: error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
}}

  module.exports = employee_engagement_leaderboardController;
