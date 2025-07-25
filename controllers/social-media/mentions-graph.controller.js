const { clientmetiontrends } = require('../../config/elasticsearch');

const mentionsGraphController = {
    getMentionsGraph: async (req, res) => {
        try {
            const { interval = 'monthly', category = 'all', source = 'All' } = req.body;
            const categoryData = req.processedCategories || {};

            if (Object.keys(categoryData).length === 0) {
                return res.json({ 
                    mentionsGraphData: '', 
                    maxMentionData: '' 
                });
            }

            const now = new Date();
            let startDate = new Date(now);
            let calendarInterval = 'month';
            let formatPattern = 'yyyy-MM';

            // Set date range based on interval
            switch (interval) {
                case 'daily':
                    startDate.setDate(now.getDate() - 7);
                    calendarInterval = 'day';
                    formatPattern = 'yyyy-MM-dd';
                    break;
                case 'weekly':
                    startDate.setDate(now.getDate() - 28);
                    calendarInterval = 'week';
                    formatPattern = 'yyyy-w';
                    break;
                case 'yearly':
                    startDate.setFullYear(now.getFullYear() - 1);
                    calendarInterval = 'month';
                    formatPattern = 'yyyy-MM';
                    break;
                case '2years':
                    startDate.setFullYear(now.getFullYear() - 2);
                    calendarInterval = 'month';
                    formatPattern = 'yyyy-MM';
                    break;
                default: // monthly (3 months)
                    startDate.setMonth(now.getMonth() - 3);
                    calendarInterval = 'month';
                    formatPattern = 'yyyy-MM';
            }

            const formatDate = (date, pattern) => {
                const year = date.getFullYear();
                if (pattern === 'yyyy-w') {
                    const week = Math.ceil((date.getDate() + date.getDay()) / 7);
                    return `${year}-${String(week).padStart(2, '0')}`;
                }
                const month = String(date.getMonth() + 1).padStart(2, '0');
                return pattern === 'yyyy-MM-dd'
                    ? `${year}-${month}-${String(date.getDate()).padStart(2, '0')}`
                    : `${year}-${month}`;
            };

            const minBound = formatDate(startDate, formatPattern);
            const maxBound = formatDate(now, formatPattern);

            // Build base query with date range
            const query = {
                bool: {
                    must: [
                        {
                            range: {
                                created_at: {
                                    gte: startDate.toISOString(),
                                    lte: now.toISOString()
                                }
                            }
                        }
                    ]
                }
            };

            // Add source filter
            if (source !== 'All') {
                query.bool.must.push({
                    match_phrase: { source: source }
                });
            } else {
                query.bool.must.push({
                    bool: {
                        should: [
                            { match_phrase: { source: 'Facebook' } },
                            { match_phrase: { source: 'Twitter' } },
                            { match_phrase: { source: 'Instagram' } },
                            { match_phrase: { source: 'Youtube' } },
                            { match_phrase: { source: 'Pinterest' } },
                            { match_phrase: { source: 'Reddit' } },
                            { match_phrase: { source: 'LinkedIn' } },
                            { match_phrase: { source: 'Web' } }
                        ],
                        minimum_should_match: 1
                    }
                });
            }

            // Add category filters
            if (category === 'all') {
                query.bool.must.push({
                    bool: {
                        should: [
                            ...Object.values(categoryData).flatMap(data =>
                                (data.keywords || []).map(keyword => ({
                                    multi_match: {
                                        query: keyword,
                                        fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                        type: 'phrase'
                                    }
                                }))
                            ),
                            ...Object.values(categoryData).flatMap(data =>
                                (data.hashtags || []).map(hashtag => ({
                                    multi_match: {
                                        query: hashtag,
                                        fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                        type: 'phrase'
                                    }
                                }))
                            ),
                            ...Object.values(categoryData).flatMap(data =>
                                (data.urls || []).map(url => ({
                                    multi_match: {
                                        query: url,
                                        fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                        type: 'phrase'
                                    }
                                }))
                            )
                        ],
                        minimum_should_match: 1
                    }
                });
            } else if (categoryData[category]) {
                const data = categoryData[category];
                query.bool.must.push({
                    bool: {
                        should: [
                            ...(data.keywords || []).map(keyword => ({
                                multi_match: {
                                    query: keyword,
                                    fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source'],
                                    type: 'phrase'
                                }
                            })),
                            ...(data.hashtags || []).map(hashtag => ({
                                match_phrase: {
                                    hashtags: hashtag
                                }
                            })),
                            ...(data.urls || []).map(url => ({
                                match_phrase: {
                                    urls: url
                                }
                            }))
                        ],
                        minimum_should_match: 1
                    }
                });
            }

            const params = {
                size: 0,
                query: query,
                aggs: {
                    time_intervals: {
                        date_histogram: {
                            field: 'created_at',
                            calendar_interval: calendarInterval,
                            format: formatPattern,
                            min_doc_count: 0,
                            extended_bounds: {
                                min: minBound,
                                max: maxBound
                            }
                        }
                    }
                }
            };

            const response = await clientmetiontrends(params);
            const intervalData = response.aggregations?.time_intervals?.buckets || [];

            let maxDate = '';
            let maxMentions = 0;
            const datesArray = [];

            for (const bucket of intervalData) {
                const docCount = bucket.doc_count;
                const keyAsString = bucket.key_as_string;

                if (docCount > maxMentions) {
                    maxMentions = docCount;
                    maxDate = keyAsString;
                }

                datesArray.push(`${keyAsString},${docCount}`);
            }

            datesArray.sort((a, b) => {
                const dateA = a.split(',')[0];
                const dateB = b.split(',')[0];
                return formatPattern === 'yyyy-w'
                    ? dateB.localeCompare(dateA)
                    : new Date(dateB).getTime() - new Date(dateA).getTime();
            });

            const mentionsGraphData = datesArray.join('|');
            const maxMentionData = `${maxDate},${maxMentions}`;

            // Gather all filter terms
            let allFilterTerms = [];
            if (categoryData) {
                Object.values(categoryData).forEach((data) => {
                    if (data.keywords && data.keywords.length > 0) allFilterTerms.push(...data.keywords);
                    if (data.hashtags && data.hashtags.length > 0) allFilterTerms.push(...data.hashtags);
                    if (data.urls && data.urls.length > 0) allFilterTerms.push(...data.urls);
                });
            }

            // If posts are returned, add matched_terms to each post
            // (Assume posts are in datesArray or similar)
            // This part of the logic needs to be implemented based on how posts are returned
            // For now, we'll just return the data as is.

            return res.json({
                mentionsGraphData,
                maxMentionData
            });
        } catch (error) {
            console.error('Error fetching results:', error);
            return res.status(500).json({ 
                success: false,
                error: 'Internal server error' 
            });
        }
    }
};

module.exports = mentionsGraphController; 