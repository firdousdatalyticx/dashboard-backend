/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Dashboard analytics endpoints
 * 
 * /dashboard/keywords:
 *   post:
 *     summary: Get keywords chart data
 *     description: Retrieves keywords frequency data for visualization in dashboard charts
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/KeywordsChartRequest'
 *           example:
 *             topicId: "123"
 *             greaterThanTime: "2023-01-01"
 *             lessThanTime: "2023-12-31"
 *             isScadUser: "false"
 *             selectedTab: ""
 *             unTopic: "false"
 *     responses:
 *       200:
 *         description: Keywords data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KeywordsChartResponse'
 *       400:
 *         description: Bad request - Missing required parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Either subtopicId or topicId is required"
 *       401:
 *         description: Unauthorized - Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Unauthorized"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */

module.exports = {
  '/dashboard/keywords': {
    post: {
      summary: 'Get keywords chart data',
      description: 'Retrieves keywords frequency data for visualization in dashboard charts',
      tags: ['Dashboard'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/KeywordsChartRequest'
            },
            example: {
              topicId: "123",
              greaterThanTime: "2023-01-01",
              lessThanTime: "2023-12-31",
              isScadUser: "false",
              selectedTab: "",
              unTopic: "false"
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Keywords data retrieved successfully',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/KeywordsChartResponse'
              }
            }
          }
        },
        400: {
          description: 'Bad request - Missing required parameters',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false
                  },
                  error: {
                    type: 'string',
                    example: "Either subtopicId or topicId is required"
                  }
                }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized - Authentication required',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false
                  },
                  error: {
                    type: 'string',
                    example: "Unauthorized"
                  }
                }
              }
            }
          }
        },
        500: {
          description: 'Server error',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false
                  },
                  error: {
                    type: 'string',
                    example: "Internal server error"
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}; 