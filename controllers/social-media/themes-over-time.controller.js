
const { elasticClient } = require('../../config/elasticsearch');
const { format, parseISO, subDays, startOfMonth, endOfMonth, eachMonthOfInterval, eachWeekOfInterval, eachDayOfInterval } = require('date-fns');
const processCategoryItems = require('../../helpers/processedCategoryItems');

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

const themesOverTimeController = {
    /**
     * Get themes over time analysis data (counts only) using ES aggregations
     */
    getThemesOverTimeAnalysis: async (req, res) => {
        try {
            const {
                source = 'All',
                category = 'all',
                topicId,
                greaterThanTime,
                lessThanTime,
                sentiment
            } = req.body;

            const interval = 'monthly';
            const isSpecialTopic = topicId && parseInt(topicId) === 2600;

            let categoryData = {};
            if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
              categoryData = processCategoryItems(req.body.categoryItems);
            } else {
              categoryData = req.processedCategories || {};
            }
            if (Object.keys(categoryData).length === 0) {
                return res.json({ success: true, themes: [], timeIntervals: [], totalCount: 0 });
            }

            let workingCategory = category;
            if (workingCategory !== 'all' && workingCategory !== '' && workingCategory !== 'custom') {
                const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);
                if (!matchedKey) {
                    return res.json({ success: true, themes: [], timeIntervals: [], totalCount: 0, error: 'Category not found' });
                }
                categoryData = { [matchedKey]: categoryData[matchedKey] };
                workingCategory = matchedKey;
            }

            const now = new Date();
            let effectiveGreaterThanTime, effectiveLessThanTime;
            if (isSpecialTopic) {
                if (greaterThanTime && lessThanTime) {
                    effectiveGreaterThanTime = greaterThanTime;
                    effectiveLessThanTime = lessThanTime;
                } else {
                    const fourMonthsAgo = subDays(now, 90);
                    effectiveGreaterThanTime = format(fourMonthsAgo, 'yyyy-MM-dd');
                    effectiveLessThanTime = format(now, 'yyyy-MM-dd');
                }
            } else {
                const fourMonthsAgo = subDays(now, 90);
                effectiveGreaterThanTime = format(fourMonthsAgo, 'yyyy-MM-dd');
                effectiveLessThanTime = format(now, 'yyyy-MM-dd');
            }

            const query = buildBaseQuery({
                greaterThanTime: effectiveGreaterThanTime,
                lessThanTime: effectiveLessThanTime
            }, source, isSpecialTopic, parseInt(topicId));

            if (sentiment) {
                if (sentiment.toLowerCase() === 'all') {
                    query.bool.must.push({
                        bool: {
                            should: [
                                { match: { predicted_sentiment_value: 'Positive' } },
                                { match: { predicted_sentiment_value: 'positive' } },
                                { match: { predicted_sentiment_value: 'Negative' } },
                                { match: { predicted_sentiment_value: 'negative' } },
                                { match: { predicted_sentiment_value: 'Neutral' } },
                                { match: { predicted_sentiment_value: 'neutral' } }
                            ],
                            minimum_should_match: 1
                        }
                    });
                } else if (sentiment !== 'All') {
                    query.bool.must.push({
                        bool: {
                            should: [
                                { match: { predicted_sentiment_value: sentiment } },
                                { match: { predicted_sentiment_value: sentiment.toLowerCase() } },
                                { match: { predicted_sentiment_value: sentiment.charAt(0).toUpperCase() + sentiment.slice(1).toLowerCase() } }
                            ],
                            minimum_should_match: 1
                        }
                    });
                }
            }

            addCategoryFilters(query, workingCategory, categoryData);

            query.bool.must.push({ exists: { field: 'themes_sentiments' } });
            query.bool.must_not = query.bool.must_not || [];
            query.bool.must_not.push({ term: { 'themes_sentiments.keyword': '' } });
            query.bool.must_not.push({ term: { 'themes_sentiments.keyword': '{}' } });

            let calendarInterval = 'month';
            let formatPattern = 'yyyy-MM';
            switch (interval) {
                case 'daily':
                    calendarInterval = 'day'; formatPattern = 'yyyy-MM-dd'; break;
                case 'weekly':
                    calendarInterval = 'week'; formatPattern = 'yyyy-w'; break;
                default:
                    calendarInterval = 'month'; formatPattern = 'yyyy-MM';
            }

            const params = {
                size: 0,
                query,
                aggs: {
                    timeline: {
                        date_histogram: {
                            field: 'p_created_time',
                            calendar_interval: calendarInterval,
                            min_doc_count: 0,
                            extended_bounds: { min: `${effectiveGreaterThanTime}T00:00:00.000Z`, max: `${effectiveLessThanTime}T23:59:59.999Z` }
                        },
                        aggs: {
                            themes: { terms: { field: 'themes_sentiments.keyword', size: 200 } }
                        }
                    }
                },
                track_total_hits: false,
                timeout: '10s'
            };

            const response = await elasticClient.search({ index: process.env.ELASTICSEARCH_DEFAULTINDEX, body: params });

            const timeIntervals = generateTimeIntervals(effectiveGreaterThanTime, effectiveLessThanTime, interval);
            const buckets = response.aggregations?.timeline?.buckets || [];

            const themeMap = new Map(); // theme -> Map(interval->count)
            let totalCount = 0;
            for (const b of buckets) {
                const label = format(new Date(b.key), formatPattern);
                const tBuckets = b.themes?.buckets || [];
                for (const tb of tBuckets) {
                    const name = tb.key;
                    if (!themeMap.has(name)) themeMap.set(name, new Map());
                    const entry = themeMap.get(name);
                    const count = tb.doc_count || 0; totalCount += count;
                    entry.set(label, (entry.get(label) || 0) + count);
                }
            }

            const themesData = Array.from(themeMap.entries()).map(([theme, counts]) => {
                const series = timeIntervals.map(ti => ({ date: ti, count: counts.get(ti) || 0 }));
                return { theme, data: series, totalCount: series.reduce((s, p) => s + p.count, 0) };
            }).sort((a, b) => b.totalCount - a.totalCount);

            return res.json({ success: true, themes: themesData, timeIntervals, totalCount, dateRange: { from: effectiveGreaterThanTime, to: effectiveLessThanTime } });
        } catch (error) {
            console.error('Error fetching themes over time analysis data:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    },

    // New: posts endpoint for a specific theme with the same filters
    getThemesOverTimePosts: async (req, res) => {
        try {
            const {
                source = 'All',
                category = 'all',
                topicId,
                greaterThanTime,
                lessThanTime,
                sentiment,
                theme,
                page = 1,
                limit = 50
            } = req.body;

            if (!theme || String(theme).trim() === '') {
                return res.status(400).json({ success: false, error: 'theme is required' });
            }

            const isSpecialTopic = topicId && parseInt(topicId) === 2600;

            let categoryData = {};
            if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
              categoryData = processCategoryItems(req.body.categoryItems);
            } else {
              categoryData = req.processedCategories || {};
            }
            if (Object.keys(categoryData).length === 0) {
                return res.json({ success: true, posts: [], total: 0, page: Number(page), limit: Number(limit) });
            }

            let workingCategory = category;
            if (workingCategory !== 'all' && workingCategory !== '' && workingCategory !== 'custom') {
                const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);
                if (!matchedKey) {
                    return res.json({ success: true, posts: [], total: 0, page: Number(page), limit: Number(limit), error: 'Category not found' });
                }
                categoryData = { [matchedKey]: categoryData[matchedKey] };
                workingCategory = matchedKey;
            }

            const now = new Date();
            let effectiveGreaterThanTime, effectiveLessThanTime;
            if (!greaterThanTime || !lessThanTime) {
                const ninetyDaysAgo = subDays(now, 90);
                effectiveGreaterThanTime = greaterThanTime || format(ninetyDaysAgo, 'yyyy-MM-dd');
                effectiveLessThanTime = lessThanTime || format(now, 'yyyy-MM-dd');
            } else {
                effectiveGreaterThanTime = greaterThanTime;
                effectiveLessThanTime = lessThanTime;
            }

            const query = buildBaseQuery({ greaterThanTime: effectiveGreaterThanTime, lessThanTime: effectiveLessThanTime }, source, isSpecialTopic, parseInt(topicId));

            if (sentiment) {
                if (sentiment.toLowerCase() === 'all') {
                    query.bool.must.push({
                        bool: { should: [
                            { match: { predicted_sentiment_value: 'Positive' } },
                            { match: { predicted_sentiment_value: 'positive' } },
                            { match: { predicted_sentiment_value: 'Negative' } },
                            { match: { predicted_sentiment_value: 'negative' } },
                            { match: { predicted_sentiment_value: 'Neutral' } },
                            { match: { predicted_sentiment_value: 'neutral' } }
                        ], minimum_should_match: 1 }
                    });
                } else if (sentiment !== 'All') {
                    query.bool.must.push({
                        bool: { should: [
                            { match: { predicted_sentiment_value: sentiment } },
                            { match: { predicted_sentiment_value: sentiment.toLowerCase() } },
                            { match: { predicted_sentiment_value: sentiment.charAt(0).toUpperCase() + sentiment.slice(1).toLowerCase() } }
                        ], minimum_should_match: 1 }
                    });
                }
            }

            addCategoryFilters(query, workingCategory, categoryData);

            query.bool.must.push({ exists: { field: 'themes_sentiments' } });
            query.bool.must_not = query.bool.must_not || [];
            query.bool.must_not.push({ term: { 'themes_sentiments.keyword': '' } });
            query.bool.must_not.push({ term: { 'themes_sentiments.keyword': '{}' } });
            query.bool.must.push({ term: { 'themes_sentiments.keyword': String(theme) } });

            const from = (Number(page) - 1) * Number(limit);
            const params = {
                from,
                size: Number(limit),
                query,
                sort: [{ p_created_time: { order: 'desc' } }],
                _source: [
                    'themes_sentiments','created_at','p_created_time','source','p_message','p_message_text','u_profile_photo','u_fullname','p_url','p_id','p_picture','p_picture_url','predicted_sentiment_value','predicted_category','llm_emotion','u_followers','u_following','u_posts','p_likes','p_comments_text','p_comments','p_shares','p_engagement','p_content','u_source','name'
                ],
                track_total_hits: true,
                timeout: '10s'
            };

            const result = await elasticClient.search({ index: process.env.ELASTICSEARCH_DEFAULTINDEX, body: params });
            const hits = result.hits?.hits || [];
            const posts = hits.map(h => formatPostData(h));
            const total = result.hits?.total?.value || 0;

            return res.json({ success: true, posts, total, page: Number(page), limit: Number(limit) });
        } catch (error) {
            console.error('Error fetching themes over time posts:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
};

function generateTimeIntervals(startDate, endDate, interval) {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const intervals = [];
    switch (interval) {
        case 'daily':
            const dailyIntervals = eachDayOfInterval({ start, end });
            return dailyIntervals.map(date => format(date, 'yyyy-MM-dd'));
        case 'weekly':
            const weeklyIntervals = eachWeekOfInterval({ start, end });
            return weeklyIntervals.map(date => format(date, 'yyyy-w'));
        default:
            const monthlyIntervals = eachMonthOfInterval({ start, end });
            return monthlyIntervals.map(date => format(date, 'yyyy-MM'));
    }
}

function getTimeInterval(dateString, interval) {
    const date = parseISO(dateString);
    switch (interval) {
        case 'daily': return format(date, 'yyyy-MM-dd');
        case 'weekly': return format(date, 'yyyy-w');
        default: return format(date, 'yyyy-MM');
    }
}

const formatPostData = (hit) => {
    const source = hit._source;
    const profilePic = source.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;
    const followers = source.u_followers > 0 ? `${source.u_followers}` : '';
    const following = source.u_following > 0 ? `${source.u_following}` : '';
    const posts = source.u_posts > 0 ? `${source.u_posts}` : '';
    const likes = source.p_likes > 0 ? `${source.p_likes}` : '';
    const llm_emotion = source.llm_emotion || '';
    const commentsUrl = source.p_comments_text && source.p_comments_text.trim() !== ''
        ? source.p_url.trim().replace('https: // ', 'https://')
        : '';
    const content = source.p_content && source.p_content.trim() !== '' ? source.p_content : '';
    const imageUrl = source.p_picture_url && source.p_picture_url.trim() !== '' ? source.p_picture_url : `${process.env.PUBLIC_IMAGES_PATH}grey.png`;
    let predicted_sentiment = '';
    if (source.predicted_sentiment_value) predicted_sentiment = `${source.predicted_sentiment_value}`;
    else if (source.source === 'GoogleMyBusiness' && source.rating) {
        predicted_sentiment = source.rating >= 4 ? 'Positive' : source.rating <= 2 ? 'Negative' : 'Neutral';
    }
    return {
        profilePicture: profilePic,
        userFullname: source.u_fullname,
        followers, following, posts, likes,
        llm_emotion,
        commentsUrl,
        content,
        image_url: imageUrl,
        predicted_sentiment,
        predicted_category: source.predicted_category || '',
        source_icon: `${source.p_url},${source.source}`,
        message_text: source.p_message_text ? source.p_message_text.replace(/<\/?[^>]+(>|$)/g, '') : '',
        source: source.source,
        created_at: new Date(source.p_created_time || source.created_at).toLocaleString()
    };
};

/**
 * Normalize source input to handle comma-separated strings, arrays, or single values
 * @param {string|Array} source - Source input
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

function buildBaseQuery(dateRange, source, isSpecialTopic = false, topicId) {
    const query = {
        bool: {
            must: [{ range: { p_created_time: { gte: dateRange.greaterThanTime, lte: dateRange.lessThanTime } } }]
        }
    };
    
    const normalizedSources = normalizeSourceInput(source);
    
    if (normalizedSources.length > 0) {
        // Multiple sources provided - create should clause
        query.bool.must.push({
            bool: {
                should: normalizedSources.map(s => ({ match_phrase: { source: s } })),
                minimum_should_match: 1
            }
        });
    } else if (topicId === 2619 || topicId === 2639 || topicId === 2640) {
        query.bool.must.push({
            bool: {
                should: [
                    { match_phrase: { source: "LinkedIn" } },
                    { match_phrase: { source: "Linkedin" } }
                ],
                minimum_should_match: 1
            }
        });
    } else if (isSpecialTopic) {
        query.bool.must.push({
            bool: {
                should: [
                    { match_phrase: { source: "Facebook" } },
                    { match_phrase: { source: "Twitter" } }
                ],
                minimum_should_match: 1
            }
        });
    } else {
        // Default: all social media sources
        query.bool.must.push({
            bool: {
                should: [
                    { match_phrase: { source: "Facebook" } },
                    { match_phrase: { source: "Twitter" } },
                    { match_phrase: { source: "Instagram" } },
                    { match_phrase: { source: "Youtube" } },
                    { match_phrase: { source: "LinkedIn" } },
                    { match_phrase: { source: "Linkedin" } },
                    { match_phrase: { source: "Pinterest" } },
                    { match_phrase: { source: "Web" } },
                    { match_phrase: { source: "Reddit" } },
                    { match_phrase: { source: "TikTok" } }
                ],
                minimum_should_match: 1
            }
        });
    }
    
    return query;
}

function addCategoryFilters(query, selectedCategory, categoryData) {
    if (selectedCategory === 'all') {
        query.bool.must.push({
            bool: {
                should: [
                    ...Object.values(categoryData).flatMap(data => (data.keywords || []).map(keyword => ({ multi_match: { query: keyword, fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'], type: 'phrase' } }))),
                    ...Object.values(categoryData).flatMap(data => (data.hashtags || []).map(hashtag => ({ multi_match: { query: hashtag, fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'], type: 'phrase' } }))),
                    ...Object.values(categoryData).flatMap(data => (data.urls || []).map(url => ({ multi_match: { query: url, fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'], type: 'phrase' } })))
                ],
                minimum_should_match: 1
            }
        });
    } else if (categoryData[selectedCategory]) {
        const data = categoryData[selectedCategory];
        const hasKeywords = Array.isArray(data.keywords) && data.keywords.length > 0;
        const hasHashtags = Array.isArray(data.hashtags) && data.hashtags.length > 0;
        const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;
        if (hasKeywords || hasHashtags || hasUrls) {
            query.bool.must.push({
                bool: {
                    should: [
                        ...(data.keywords || []).map(keyword => ({ multi_match: { query: keyword, fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'], type: 'phrase' } })),
                        ...(data.hashtags || []).map(hashtag => ({ multi_match: { query: hashtag, fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'], type: 'phrase' } })),
                        ...(data.urls || []).map(url => ({ multi_match: { query: url, fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'], type: 'phrase' } }))
                    ],
                    minimum_should_match: 1
                }
            });
        } else {
            query.bool.must.push({ bool: { must_not: { match_all: {} } } });
        }
    }
}

module.exports = themesOverTimeController; 
