/**
 * @swagger
 * components:
 *   schemas:
 *     KeywordsChartRequest:
 *       type: object
 *       properties:
 *         topicId:
 *           type: string
 *           description: ID of the topic to analyze
 *         subtopicId:
 *           type: string
 *           description: ID of the subtopic to analyze (alternative to topicId)
 *         greaterThanTime:
 *           type: string
 *           description: Start date for data range (format yyyy-MM-dd)
 *           example: "2023-01-01"
 *         lessThanTime:
 *           type: string
 *           description: End date for data range (format yyyy-MM-dd)
 *           example: "2023-12-31"
 *         isScadUser:
 *           type: string
 *           description: Whether the user is a SCAD user
 *           enum: ["true", "false"]
 *           default: "false"
 *         selectedTab:
 *           type: string
 *           description: Selected tab for filtering
 *           default: ""
 *         unTopic:
 *           type: string
 *           description: Whether to use UN topic specific logic
 *           enum: ["true", "false"]
 *           default: "false"
 *       example:
 *         topicId: "123"
 *         greaterThanTime: "2023-01-01"
 *         lessThanTime: "2023-12-31"
 *         isScadUser: "false"
 *         selectedTab: ""
 *         unTopic: "false"
 *
 *     KeywordsChartResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indicates if the request was successful
 *         responseArray:
 *           type: array
 *           description: Array of keyword data points
 *           items:
 *             type: object
 *             properties:
 *               key_count:
 *                 type: integer
 *                 description: Count of mentions for this keyword
 *               keyword:
 *                 type: string
 *                 description: The keyword
 *       example:
 *         success: true
 *         responseArray: [
 *           { key_count: 150, keyword: "sustainability" },
 *           { key_count: 120, keyword: "climate" },
 *           { key_count: 85, keyword: "renewable" }
 *         ]
 */

module.exports = {
    KeywordsChartRequest: {
        type: 'object',
        properties: {
            topicId: {
                type: 'string',
                description: 'ID of the topic to analyze'
            },
            subtopicId: {
                type: 'string',
                description: 'ID of the subtopic to analyze (alternative to topicId)'
            },
            greaterThanTime: {
                type: 'string',
                description: 'Start date for data range (format yyyy-MM-dd)',
                example: '2023-01-01'
            },
            lessThanTime: {
                type: 'string',
                description: 'End date for data range (format yyyy-MM-dd)',
                example: '2023-12-31'
            },
            isScadUser: {
                type: 'string',
                description: 'Whether the user is a SCAD user',
                enum: ['true', 'false'],
                default: 'false'
            },
            selectedTab: {
                type: 'string',
                description: 'Selected tab for filtering',
                default: ''
            },
            unTopic: {
                type: 'string',
                description: 'Whether to use UN topic specific logic',
                enum: ['true', 'false'],
                default: 'false'
            }
        },
        example: {
            topicId: '123',
            greaterThanTime: '2023-01-01',
            lessThanTime: '2023-12-31',
            isScadUser: 'false',
            selectedTab: '',
            unTopic: 'false'
        }
    },
    KeywordsChartResponse: {
        type: 'object',
        properties: {
            success: {
                type: 'boolean',
                description: 'Indicates if the request was successful'
            },
            responseArray: {
                type: 'array',
                description: 'Array of keyword data points',
                items: {
                    type: 'object',
                    properties: {
                        key_count: {
                            type: 'integer',
                            description: 'Count of mentions for this keyword'
                        },
                        keyword: {
                            type: 'string',
                            description: 'The keyword'
                        }
                    }
                }
            }
        },
        example: {
            success: true,
            responseArray: [
                { key_count: 150, keyword: 'sustainability' },
                { key_count: 120, keyword: 'climate' },
                { key_count: 85, keyword: 'renewable' }
            ]
        }
    }
}; 