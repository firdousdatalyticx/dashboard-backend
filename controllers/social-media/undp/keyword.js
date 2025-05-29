// src/app/api/apps/getElasticMentions/route.ts
// import { NextRequest, NextResponse } from 'next/server'
const { parse, format, isValid } = require('date-fns')

const {
  buildQueryForAllKeywordsString,
  buildQueryString,
  elasticQueryTemplateRange,
  customerReviewElasticId,
  buildsubTopicQueryString,
  getTouchpointData,
  elasticMentionQueryTemplates,
  elasticMentionQueryTemplate,
  getAllTouchpoints,
  buildTouchPointQueryString
} = require('./searchKitClient')


const { elasticClient } = require("../../../config/elasticsearch");

const prisma = require("../../../config/database");

// import { getServerSession } from 'next-auth/next'
// import { authOptions } from '@/libs/auth'

// const session = await getServerSession(authOptions)
//const parentAccountId = 168

const client = async (params) => {
  try {
    const response = await elasticClient.search({
      index: process.env.ELASTICSEARCH_DEFAULTINDEX, // Default index for the search query
      body: params
    })
    return response
  } catch (error) {
    console.error('Elasticsearch client search error:', error)
    throw error
  }
}

const elasticSearchCount = async (params) => {
  try {
    const response = await elasticClient.count({
      index: process.env.ELASTICSEARCH_DEFAULTINDEX, // Specify the default index here
      body: params
    })

    return response
  } catch (error) {
    console.error('Elasticsearch count error:', error)
    throw error
  }
}

const elasticSearchCounts = async (params) => {
  try {
    const response = await elasticClient.count({
      index: process.env.ELASTICSEARCH_DEFAULTINDEX, // Specify the default index here
      body: params.body
    })
    return response
  } catch (error) {
    console.error('Elasticsearch count error:', error)
    throw error
  }
}



const elasticSearch = async (params) => {
  try {
    const response = await elasticClient.search({
      index: process.env.ELASTICSEARCH_DEFAULTINDEX, // Specify the default index here
      body: params.body
    })
    return response
  } catch (error) {
    console.error('Elasticsearch count error:', error)
    throw error
  }
}



const elasticPrintSearchCount = async (params) => {
  try {
    const response = await elasticClient.count({
      index: process.env.PRINTMEDIA_ELASTIC_INDEX,
      body: params
    })
    return response
  } catch (error) {
    console.error('Elasticsearch print media count error:', error)
    throw error
  }
}

// const elasticSearchs = async () => {
//   try {
//     const response = await elasticClient.search({
//       index: process.env.ELASTICSEARCH_DEFAULTINDEX,
//       body: {
//         query: {
//           match_all: {} // ye query index ka sara data le kar aayegi
//         }
//       },
//       size: 10000 // size parameter ko adjust karein agar data zyada ho
//     })
//     console.log('response of all data', response.hits.hits)
//     return response.hits.hits // ye hits array return karega jisme sara data hoga
//   } catch (error) {
//     console.error('Elasticsearch search error:', error)
//     throw error
//   }
// }

// ;(async () => {
//   const data = await elasticSearchs()
//   console.log('Total documents:', data.length)
//   console.log('Data:', data)
// })()

const formatSafeDate = (date) => {
  if (!date) return format(new Date(), 'yyyy-MM-dd')

  const dateObj = typeof date === 'string' ? new Date(date) : date
  return isValid(dateObj) ? format(dateObj, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
}

const undpController = {
  UNDP: async (req, res) => {
      let { greaterThanTime, lessThanTime, subtopicId, topicId:id, sentimentType,type,aidType,filters,filterData,touchId,parentAccountId,unTopic,isScadUser,selectedTab} = req.body;

//   const { searchParams } = new URL(req.url)



  const decodedFilterData = filterData ? decodeURIComponent(filterData):null;
  const sanitizedData =decodedFilterData==null?null:
    decodedFilterData.startsWith('"') && decodedFilterData.endsWith('"')
      ? decodedFilterData.slice(1, -1)
      : decodedFilterData
  const filtersDat = sanitizedData && JSON.parse(sanitizedData)


  if (!id) {
 return res.status(400).json({ error: "ID is required" });
  }

  const topicId = Number(id)
  if (isNaN(topicId)) {
    return res.status(400).json({ error: "Invalid ID" });
  }


  let topicQueryString = ''

  // let daysDifference = process.env.DATA_FETCH_DAYS_NUMBER
  // let greaterThanTime = process.env.DATA_FETCH_FROM_TIME
  // let lessThanTime = process.env.DATA_FETCH_TO_TIME

  let daysDifference = parseInt(process.env.DATA_FETCH_DAYS_NUMBER?.replace('d', ''))
   greaterThanTime = process.env.DATA_FETCH_FROM_TIME;
   lessThanTime = process.env.DATA_FETCH_TO_TIME;

  let incDecToDate;
  let incDecFromDate;

  topicQueryString = await buildQueryString(topicId, isScadUser, selectedTab)

  if (filtersDat && filters === 'true') {
    if (filtersDat?.timeSlot && filtersDat?.timeSlot === 'Custom Dates') {
      if (filtersDat?.startDate && filtersDat?.startDate !== '') {
        let greaterThanDate = new Date(filtersDat?.startDate)
        greaterThanTime = formatSafeDate(greaterThanDate)
      } else {
        greaterThanTime = formatSafeDate(new Date(new Date().setDate(new Date().getDate() - 90)))
      }

      if (filtersDat?.endDate && filtersDat?.endDate !== '') {
        let lessThanDate = new Date(filtersDat?.endDate)
        lessThanTime = formatSafeDate(lessThanDate)
      } else {
        lessThanTime = formatSafeDate(new Date())
      }
    } else {
      if (filtersDat?.timeSlot !== '') {
        switch (filtersDat?.timeSlot) {
          case 'today':
            greaterThanTime = formatSafeDate(new Date())
            lessThanTime = formatSafeDate(new Date())
            break
          case '24h':
            greaterThanTime = formatSafeDate(new Date(new Date().setHours(new Date().getHours() - 24)))
            lessThanTime = formatSafeDate(new Date())
            break
          default:
            greaterThanTime = formatSafeDate(
              new Date(new Date().setDate(new Date().getDate() - parseInt(filtersDat?.timeSlot)))
            )
            lessThanTime = formatSafeDate(new Date())
        }
      }
    }

    //daysDifference = dateDifference(lessThanTime, greaterThanTime)

    if (filtersDat?.tags && filtersDat?.tags !== '') {
      let tagsStr = filtersDat?.tags
      let tagsArray = tagsStr.split(',')
      let topicUrls = '',
        topicKeyHash = ''

      tagsArray.forEach((tag) => {
        if (tag) {
          if (tag.startsWith('http')) {
            topicUrls += `"${tag}" ${filtersDat?.operator} `
          } else {
            topicKeyHash += `"${tag}" ${filtersDat?.operator} `
          }
        }
      })

      if (filtersDat?.operator === 'OR') {
        topicKeyHash = topicKeyHash.slice(0, -4)
        topicUrls = topicUrls.slice(0, -4)
      } else {
        topicKeyHash = topicKeyHash.slice(0, -5)
        topicUrls = topicUrls.slice(0, -5)
      }

      if (topicKeyHash && topicUrls) {
        topicQueryString = `(p_message_text:(${topicKeyHash} OR ${topicUrls}) OR p_message:(${topicKeyHash} OR ${topicUrls}) OR keywords:(${topicKeyHash} OR ${topicUrls}) OR title:(${topicKeyHash} OR ${topicUrls}) OR hashtags:(${topicKeyHash} OR ${topicUrls}) OR u_source:(${topicKeyHash} OR ${topicUrls}) OR p_url:(${topicKeyHash} OR ${topicUrls}))`
      } else if (topicKeyHash && !topicUrls) {
        topicQueryString = `(p_message_text:(${topicKeyHash}) OR p_message:(${topicKeyHash}) OR keywords:(${topicKeyHash}) OR title:(${topicKeyHash}) OR hashtags:(${topicKeyHash}) OR u_source:(${topicKeyHash}) OR p_url:(${topicKeyHash}))`
      } else if (!topicKeyHash && topicUrls) {
        topicQueryString = `(p_message_text:(${topicUrls}) OR p_message:(${topicUrls}) OR keywords:(${topicUrls}) OR title:(${topicUrls}) OR hashtags:(${topicUrls}) OR u_source:(${topicUrls}) OR p_url:(${topicUrls}))`
      }
    }

    if (filtersDat?.sentimentType && filtersDat?.sentimentType !== 'null') {
      let sentiArray = filtersDat?.sentimentType.split(',')
      let sentiStr = sentiArray.map((s) => `"${s}"`).join(' OR ')
      topicQueryString += ` AND predicted_sentiment_value:(${sentiStr})`
    }

    if (filtersDat?.dataSource && filtersDat?.dataSource !== 'null' && filtersDat?.dataSource !== '') {
      let dsourceArray = filtersDat?.dataSource.split(',')
      let dsourceStr = dsourceArray.map((d) => `"${d}"`).join(' OR ')
      topicQueryString += ` AND source:(${dsourceStr})`
    }

    if (filtersDat?.location && filtersDat?.location !== 'null' && filtersDat?.location !== '') {
      let dlocArray = filtersDat?.location.split(',')
      let dlocStr = dlocArray.map((d) => `"${d}"`).join(' OR ')
      topicQueryString += ` AND u_country:(${dlocStr})`
    }

    if (filtersDat?.language && filtersDat?.language !== 'null' && filtersDat?.language !== '') {
      let dlangArray = filtersDat?.language.split(',')
      let dlangStr = dlangArray.map((d) => `"${d}"`).join(' OR ')
      topicQueryString += ` AND lange_detect:(${dlangStr})`
    }
  }

  let subTopicQueryString = ''
  if (subtopicId) {
    subTopicQueryString = await buildsubTopicQueryString(Number(subtopicId))
    topicQueryString += ` AND ${subTopicQueryString}`
  }

  let touchPointQueryString = ''
  if (touchId) {
    touchPointQueryString = await buildTouchPointQueryString(Number(touchId))

    topicQueryString += ` AND ${touchPointQueryString}`
  }

  if (type === 'mentions') {
    try {
      if (unTopic === 'true') {
        greaterThanTime = '2023-01-01'
        lessThanTime = '2023-04-30'
        // topicQueryString = `${topicQueryString} AND un_keywords:("Yes")`
        topicQueryString = `${topicQueryString}`
      }
      if (isScadUser == 'true') {
        if (selectedTab === 'GOOGLE') {
          if (topicQueryString == '') {
            topicQueryString = `source:('"GoogleMyBusiness"')`
          } else {
            topicQueryString = topicQueryString + ` AND source:('"GoogleMyBusiness"')`
          }
        } else {
          topicQueryString =
            topicQueryString +
            ` AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Linkedin" OR "Pinterest" OR "Reddit" OR "Web")`
        }
      }
      const esData = await elasticSearchCount(
        elasticMentionQueryTemplate(topicQueryString, greaterThanTime, lessThanTime)
      )

      // await elasticSearchCounttwo(elasticQuerys(topicQueryString, greaterThanTime, lessThanTime))

      const count = (esData)?.count

       return res.status(200).json({count});

    }catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'channelSource') {
    try {
      let responseOutput = ''
      let printMediaCount = null

      // Define sources and queries dynamically
      let sources = [
        { name: 'YouTube', query: 'source:("Youtube" OR "Vimeo")', count: 0 },
        { name: 'News', query: 'source:("FakeNews" OR "News")', count: 0 },
        { name: 'Twitter', query: 'source:("Twitter")', count: 0 },
        { name: 'Pinterest', query: 'source:("Pinterest")', count: 0 },
        { name: 'Instagram', query: 'source:("Instagram")', count: 0 },
        { name: 'Blogs', query: 'source:("Blogs")', count: 0 },
        { name: 'Reddit', query: 'source:("Reddit")', count: 0 },
        { name: 'Tumblr', query: 'source:("Tumblr")', count: 0 },
        { name: 'Facebook', query: 'source:("Facebook")', count: 0 },
        { name: 'Web', query: 'source:("Web")', count: 0 },
        { name: 'GoogleMaps', query: 'source:("GoogleMaps")', count: 0 },
        { name: 'Tripadvisor', query: 'source:("Tripadvisor")', count: 0 },
        { name: 'Linkedin', query: 'source:("Linkedin")', count: 0 },
        { name: 'Tiktok', query: 'source:("Tiktok")', count: 0 },
        { name: 'GoogleMyBusiness', query: 'source:("GoogleMyBusiness")', count: 0 }
      ]

      if (isScadUser == 'true') {
        if (selectedTab === 'GOOGLE') {
          sources = [{ name: 'GoogleMyBusiness', query: 'source:("GoogleMyBusiness")', count: 0 }]
        } else {
          sources = [
            { name: 'Twitter', query: 'source:("Twitter")', count: 0 },
            { name: 'Instagram', query: 'source:("Instagram")', count: 0 },
            { name: 'Facebook', query: 'source:("Facebook")', count: 0 },
            { name: 'Linkedin', query: 'source:("Linkedin")', count: 0 },
            { name: 'Pinterest', query: 'source:("Pinterest")', count: 0 },
            { name: 'Reddit', query: 'source:("Reddit")', count: 0 },
            { name: 'Web', query: 'source:("Web")', count: 0 },
            { name: 'Youtube', query: 'source:("Youtube")', count: 0 }
          ]
        }
      }

      // Fetch counts for each source
      await Promise.all(
        sources.map(async source => {
          const result = await elasticSearchCount(
            elasticMentionQueryTemplate(`${topicQueryString} AND ${source.query}`, greaterThanTime, lessThanTime)
          )
          source.count = result.count
        })
      )

      const blogCounts = sources.find(s => s.name === 'Blogs')?.count || 0
      const newsCounts = sources.find(s => s.name === 'News')?.count || 0
      const webCount = sources.find(s => s.name === 'Web')?.count || 0 + blogCounts + newsCounts

      const totalSourcesCount = sources.reduce((sum, source) => sum + source.count, 0)

      // Process Print Media Count
      const printMediaResponse = await elasticPrintSearchCount(
        elasticMentionQueryTemplate(
          topicQueryString.replace('p_message_text', 'p_message'),
          greaterThanTime,
          lessThanTime
        )
      )
      if (printMediaResponse?.count > 0) {
        printMediaCount = `Printmedia,${printMediaResponse.count}`
      }

      // Construct response for web sources
      if (webCount > 0) {
        responseOutput += `Web,${webCount},${((webCount / totalSourcesCount) * 100).toFixed(2)}|`
      }

      // Construct response for other sources
      responseOutput +=
        sources
          .filter(source => source.name !== 'Web' && source.count > 0)
          .map(source => `${source.name},${source.count},${((source.count / totalSourcesCount) * 100).toFixed(2)}`)
          .join('|') + '|'

      // Additional review handling
      const reviewsCustomerArray = ['292', '309', '310', '312', '412', '420']
      const reviewsTopicIdsArray = ['2325', '2388', '2391', '2401', '2416', '2443']
      const reviewsSourceArray = [
        'GooglePlayStore',
        'GoogleMyBusiness',
        'AppleAppStore',
        'HuaweiAppGallery',
        'Glassdoor',
        'Zomato',
        'Talabat'
      ]

      const customerRevElasticId = await customerReviewElasticId(parentAccountId || '')

      if (
        reviewsCustomerArray.includes((parentAccountId || '').toString()) &&
        reviewsTopicIdsArray.includes('2388') && // Example topic ID
        customerRevElasticId
      ) {
        const reviewResults = await Promise.all(
          reviewsSourceArray.map(async source => {
            if ('2388' === '2388' && source === 'GooglePlayStore') return null // Skip specific case
            const queryString = `source:("${source}") AND manual_entry_type:("review") AND review_customer:("${customerRevElasticId}")`
            try {
              const result = await elasticSearchCount(
                elasticMentionQueryTemplate(queryString, greaterThanTime, lessThanTime)
              )
              return result.count > 0 ? `${source},${result.count}` : null
            } catch (error) {
              console.error(`Error counting documents for source channel ${source}:`, error)
              return null
            }
          })
        )

        // Append review results to the response
        responseOutput += reviewResults.filter(Boolean).join('|') + '|'
      }

      const channelSourceCount = responseOutput.slice(0, -1) // Remove trailing '|'

      return res.status(200).json({ channelSourceCount, printMediaCount });

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // else if (type === 'channelSource') {
  //   try {
  //     // const topicQueryString = await buildQueryString(topicId)

  //     let responseOutput = ''
  //     let printMediaCount = null
  //     // let blogCounts = 0, newsCounts = 0, twitterCount = 0, youtubeCount = 0, linkedinCount = 0, tumblrCount = 0, facebookCount = 0, redditCount = 0, webCount = 0, pinterestCount = 0, instagramCount = 0, googlemapsCount = 0, tripadvisorCount = 0, tiktokCount = 0;

  //     const sources[] = [
  //       { name: 'YouTube', query: `${topicQueryString} AND source:("Youtube" OR "Vimeo")`, count: 0 },
  //       { name: 'News', query: `${topicQueryString} AND source:("FakeNews" OR "News")`, count: 0 },
  //       { name: 'Twitter', query: `${topicQueryString} AND source:("Twitter")`, count: 0 },
  //       { name: 'Pinterest', query: `${topicQueryString} AND source:("Pinterest")`, count: 0 },
  //       { name: 'Instagram', query: `${topicQueryString} AND source:("Instagram")`, count: 0 },
  //       { name: 'Blogs', query: `${topicQueryString} AND source:("Blogs")`, count: 0 },
  //       { name: 'Reddit', query: `${topicQueryString} AND source:("Reddit")`, count: 0 },
  //       { name: 'Tumblr', query: `${topicQueryString} AND source:("Tumblr")`, count: 0 },
  //       { name: 'Facebook', query: `${topicQueryString} AND source:("Facebook")`, count: 0 },
  //       { name: 'Web', query: `${topicQueryString} AND source:("Web")`, count: 0 },
  //       { name: 'GoogleMaps', query: `${topicQueryString} AND source:("GoogleMaps")`, count: 0 },
  //       { name: 'Tripadvisor', query: `${topicQueryString} AND source:("Tripadvisor")`, count: 0 },
  //       { name: 'Linkedin', query: `${topicQueryString} AND source:("Linkedin")`, count: 0 },
  //       { name: 'Tiktok', query: `${topicQueryString} AND source:("Tiktok")`, count: 0 }
  //     ]

  //     for (const source of sources) {
  //       const result = await elasticSearchCount(
  //         elasticMentionQueryTemplate(source.query, greaterThanTime, lessThanTime)
  //       )
  //       source.count = result.count
  //     }

  //     const blogCounts = sources.find(s => s.name === 'Blogs').count
  //     const newsCounts = sources.find(s => s.name === 'News').count
  //     const webCount = sources.find(s => s.name === 'Web').count + blogCounts + newsCounts

  //     const printmediaCount = await elasticPrintSearchCount(
  //       elasticMentionQueryTemplate(
  //         topicQueryString.replace('p_message_text', 'p_message'),
  //         greaterThanTime,
  //         lessThanTime
  //       )
  //     )
  //     if (printmediaCount > 0) {
  //       printMediaCount = `Printmedia,${printmediaCount}`
  //     }

  //     const totalSourcesCount = sources.reduce((sum, source) => sum + source.count, 0)

  //     if (webCount > 0) {
  //       responseOutput += `Web,${webCount},${((webCount / totalSourcesCount) * 100).toFixed(2)}|`
  //     }
  //     sources.forEach(source => {
  //       if (source.name !== 'Web' && source.count > 0) {
  //         responseOutput += `${source.name},${source.count},${((source.count / totalSourcesCount) * 100).toFixed(2)}|`
  //       }
  //     })

  //     const reviewsCustomerArray = ['292', '309', '310', '312', '412', '420']
  //     const reviewsTopicIdsArray = ['2325', '2388', '2391', '2401', '2416', '2443']
  //     const reviewsSourceArray = [
  //       'GooglePlayStore',
  //       'GoogleMyBusiness',
  //       'AppleAppStore',
  //       'HuaweiAppGallery',
  //       'Glassdoor',
  //       'Zomato',
  //       'Talabat'
  //     ]

  //     const parentAccId = parentAccountId || ''
  //     const loadedTopicId = 2388 // Example topic ID, replace as needed
  //     const subtopicSessionId = 1 // Example session ID, replace as needed
  //     //const section = 'sources_counts_subtopic'; // Example section, replace as needed
  //     const customerRevElasticId = await customerReviewElasticId(parentAccountId) // Replace with actual method to get customer review elastic ID

  //     if (
  //       reviewsCustomerArray.includes(parentAccId.toString()) &&
  //       reviewsTopicIdsArray.includes(loadedTopicId.toString())
  //       //  || section === 'sources_counts_subtopic'
  //     ) {
  //       if (customerRevElasticId) {
  //         let rquery = ''
  //         let proceedFurther = true

  //         // if (section === 'sources_counts_subtopic') {
  //         //     rquery = `p_message_text:(${subtopicObj.getSubtopicKeywordsEs(subtopicSessionId)}) AND `;
  //         //     if (subtopicObj.getSubtopicParent(subtopicSessionId) !== "2325") {
  //         //         proceedFurther = false;
  //         //     }
  //         // }

  //         if (proceedFurther) {
  //           reviewsSourceArray.forEach(async source => {
  //             if (loadedTopicId === 2388 && source === 'GooglePlayStore') return
  //             const query_string = `${rquery}source:("${source}") AND manual_entry_type:("review") AND review_customer:("${customerRevElasticId}")`

  //             try {
  //               const result = await elasticSearchCount(
  //                 elasticMentionQueryTemplate(query_string, greaterThanTime, lessThanTime)
  //               )
  //               const resultsCount = result.count

  //               if (resultsCount > 0) {
  //                 responseOutput += `${source},${resultsCount}|`
  //               }
  //             } catch (error) {
  //               console.error(`Error counting documents for source channels${source}:`, error)
  //             }
  //           })
  //         }
  //       }
  //     }

  //     const channelSourceCount = responseOutput.slice(0, -1)

  //     return NextResponse.json({ channelSourceCount, printMediaCount }, { status: 200 })
  //   } catch (error) {
  //     console.error('Error fetching results:', error)
  //     return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  //   }
  // }
  else if (type === 'channelSentiments') {
    try {
      let sourcesArray = [
        'Youtube',
        'Twitter',
        'Pinterest',
        'Instagram',
        'Reddit',
        'Tumblr',
        'Facebook',
        'Web',
        'Linkedin',
        'GooglePlayStore',
        'GoogleMyBusiness',
        'AppleAppStore',
        'HuaweiAppGallery',
        'Glassdoor'
      ]

      if (isScadUser == 'true') {
        if (selectedTab === 'GOOGLE') {
          sourcesArray = ['GoogleMyBusiness']
        } else {
          sourcesArray = ['Twitter', 'Instagram', 'Facebook', 'Linkedin', 'Pinterest', 'Reddit', 'Web', 'Youtube']
        }
      }

      const responseOutput = {}

      // Helper function to fetch sentiment counts
      const fetchSentiments = async (source, queryString) => {
        const queries = ['Positive', 'Negative', 'Neutral'].map(sentiment => {
          const query = `${queryString} AND source:(${source}) AND predicted_sentiment_value:("${sentiment}")`
          return elasticSearchCount(elasticMentionQueryTemplate(query, greaterThanTime, lessThanTime))
        })

        const [Positive, Negative, Neutral] = await Promise.all(queries)
        return {
          positive: Positive.count,
          negative: Negative.count,
          neutral: Neutral.count
        }
      }

      // Helper function for specific sources
      const fetchCustomSourceSentiments = async (source) => {
        const cusRevElasticId = customerReviewElasticId(parentAccountId)
        const queryTemplate = (range) => ({
          body: {
            query: {
              bool: {
                must: [
                  {
                    query_string: {
                      query: `source:("${source}") AND manual_entry_type:("review") AND review_customer:("${cusRevElasticId}")`
                    }
                  },
                  { range },
                  { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
                ]
              }
            }
          }
        })

        const [positive, negative, neutral] = await Promise.all([
          elasticSearchCount(queryTemplate({ p_likes: { gt: 3 } })),
          elasticSearchCount(queryTemplate({ p_likes: { lt: 2 } })),
          elasticSearchCount(queryTemplate({ p_likes: { gte: 2, lte: 3 } }))
        ])

        return {
          positive: positive.count,
          negative: negative.count,
          neutral: neutral.count
        }
      }

      // Process all sources
      await Promise.all(
        sourcesArray.map(async source => {
          if (topicId === 2388 && source === 'GooglePlayStore') return // Skip specific source for topicId 2388

          let sentiments
          if (
            topicId === 2325 ||
            (topicId === 2388 &&
              ['GooglePlayStore', 'GoogleMyBusiness', 'AppleAppStore', 'HuaweiAppGallery', 'Glassdoor'].includes(
                source
              ))
          ) {
            sentiments = await fetchCustomSourceSentiments(source)
          } else {
            const sourceQuery =
              source === 'Youtube'
                ? '"Youtube" OR "Vimeo"'
                : source === 'Web'
                  ? '"FakeNews" OR "News" OR "Blogs" OR "Web"'
                  : source

            sentiments = await fetchSentiments(sourceQuery, topicQueryString)
          }

          // Add non-zero sentiments to response
          if (sentiments.positive > 0 || sentiments.negative > 0 || sentiments.neutral > 0) {
            responseOutput[source] = sentiments
          }
        })
      )
      return res.status(200).json({responseOutput });

    }catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
  // else if (type === 'channelSentiments') {
  //   try {
  //     const sourcesArray = [
  //       'Youtube',
  //       'Twitter',
  //       'Pinterest',
  //       'Instagram',
  //       'Reddit',
  //       'Tumblr',
  //       'Facebook',
  //       'Web',
  //       'Linkedin',
  //       'GooglePlayStore',
  //       'GoogleMyBusiness',
  //       'AppleAppStore',
  //       'HuaweiAppGallery',
  //       'Glassdoor'
  //     ]

  //     let responseOutput = {}

  //     for (let i = 0; i < sourcesArray.length; i++) {
  //       let _sources
  //       if (sourcesArray[i] === 'Youtube') {
  //         _sources = '"Youtube" OR "Vimeo"'
  //       } else if (sourcesArray[i] === 'Web') {
  //         _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
  //       } else {
  //         _sources = sourcesArray[i]
  //       }

  //       let posSenti = 0,
  //         negSenti = 0,
  //         neuSenti = 0

  //       const posSentQuery = `${topicQueryString} AND source:(${_sources}) AND predicted_sentiment_value:("Positive")`
  //       const negSentQuery = `${topicQueryString} AND source:(${_sources}) AND predicted_sentiment_value:("Negative")`
  //       const nueSentQuery = `${topicQueryString} AND source:(${_sources}) AND predicted_sentiment_value:("Neutral")`

  //       posSenti = await elasticSearchCount(elasticMentionQueryTemplate(posSentQuery, greaterThanTime, lessThanTime))
  //       negSenti = await elasticSearchCount(elasticMentionQueryTemplate(negSentQuery, greaterThanTime, lessThanTime))
  //       neuSenti = await elasticSearchCount(elasticMentionQueryTemplate(nueSentQuery, greaterThanTime, lessThanTime))

  //       console.log(posSenti, 'posSenti')
  //       console.log(negSenti, 'negSenti')
  //       console.log(neuSenti, 'neuSenti')
  //       if (topicId === 2325 || topicId === 2388) {
  //         // Sohar international bank & gdrfa
  //         if (topicId === 2388 && sourcesArray[i] === 'GooglePlayStore') continue // Skip Google Play Store for gdrfa

  //         if (
  //           ['GooglePlayStore', 'GoogleMyBusiness', 'AppleAppStore', 'HuaweiAppGallery', 'Glassdoor'].includes(
  //             sourcesArray[i]
  //           )
  //         ) {
  //           const cusRevElasticId = customerReviewElasticId(parentAccountId)
  //           //console.log('customerReviewElasticId', cusRevElasticId)
  //           const queryTemp = (range) => ({
  //             body: {
  //               query: {
  //                 bool: {
  //                   must: [
  //                     {
  //                       query_string: {
  //                         query: `source:("${sourcesArray[i]}") AND manual_entry_type:("review") AND review_customer:("${cusRevElasticId}")`
  //                       }
  //                     },
  //                     { range: range },
  //                     { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
  //                   ]
  //                 }
  //               }
  //             }
  //           })

  //           const range1 = { p_likes: { gt: 3 } }
  //           const range2 = { p_likes: { lt: 2 } }
  //           const range3 = { p_likes: { gte: 2, lte: 3 } }
  //           posSenti = await elasticSearchCount(queryTemp(range1))
  //           negSenti = await elasticSearchCount(queryTemp(range2))
  //           neuSenti = await elasticSearchCount(queryTemp(range3))
  //         }
  //       }

  //       if (posSenti.count > 0 || negSenti.count > 0 || neuSenti.count > 0) {
  //         ;(responseOutput )[sourcesArray[i]] = {
  //           positive: posSenti.count,
  //           negative: negSenti.count,
  //           neutral: neuSenti.count
  //         }
  //       }
  //     }

  //     return NextResponse.json({ responseOutput }, { status: 200 })
  //   } catch (error) {
  //     console.error('Error fetching results:', error)
  //     return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  //   }
  // }
  // else if (type === 'typeofMentions') {
  //   try {
  //     // const sourcesArray = [
  //     //   'Youtube',
  //     //   'Twitter',
  //     //   'Pinterest',
  //     //   'Instagram',
  //     //   'Reddit',
  //     //   'Tumblr',
  //     //   'Facebook',
  //     //   'Web',
  //     //   'Linkedin',
  //     //   'GooglePlayStore',
  //     //   'GoogleMyBusiness',
  //     //   'AppleAppStore',
  //     //   'HuaweiAppGallery',
  //     //   'Glassdoor'
  //     // ]

  //     const sourcesArray2 = [
  //       'Marketing Content',
  //       // 'Customer Complaint',
  //       // 'Inquiry',
  //       'Clarification',
  //       'Praise',
  //       // 'Suggestion',
  //       'Product Feedback',
  //       'Energy Sector News',
  //       'Customer Inquiry',
  //       'Complaint',
  //       'Service Feedback',
  //        'Suggestions',
  //       'Other',
  //     ]

  //     let responseOutput = {}

  //     for (let i = 0; i < sourcesArray2.length; i++) {
  //       // let _sources
  //       // if (sourcesArray[i] === 'Youtube') {
  //       //   _sources = '"Youtube" OR "Vimeo"'
  //       // } else if (sourcesArray[i] === 'Web') {
  //       //   _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
  //       // } else {
  //       //   _sources = sourcesArray[i]
  //       // }

  //       let twitterContent = 0,
  //         facebookContent = 0,
  //         instagramContent = 0
  //       // Clarification = 0,
  //       // Praise = 0,
  //       // Suggestion = 0,
  //       // ProductFeedback = 0,
  //       // Other = 0

  //       const twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND llm_mention_type:("${sourcesArray2[i]}")`
  //       const facebookComplaintQuery = `${topicQueryString} AND source:("Facebook") AND llm_mention_type:("${sourcesArray2[i]}")`
  //       const instagramQuery = `${topicQueryString} AND source:("Instagram") AND llm_mention_type:("${sourcesArray2[i]}")`
  //       // const ClarificationQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_type:("Clarification")`
  //       // const PraiseQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_type:("Praise")`
  //       // const SuggestionQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_type:("Suggestion")`
  //       // const ProductFeedbackQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_type:("ProductFeedback")`
  //       // const OtherQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_type:("Other")`

  //       twitterContent = await elasticSearchCount(
  //         elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
  //       )
  //       facebookContent = await elasticSearchCount(
  //         elasticMentionQueryTemplate(facebookComplaintQuery, greaterThanTime, lessThanTime)
  //       )
  //       instagramContent = await elasticSearchCount(
  //         elasticMentionQueryTemplate(instagramQuery, greaterThanTime, lessThanTime)
  //       )
  //       // Clarification = await elasticSearchCount(
  //       //   elasticMentionQueryTemplate(ClarificationQuery, greaterThanTime, lessThanTime)
  //       // )
  //       // Praise = await elasticSearchCount(elasticMentionQueryTemplate(PraiseQuery, greaterThanTime, lessThanTime))
  //       // Suggestion = await elasticSearchCount(
  //       //   elasticMentionQueryTemplate(SuggestionQuery, greaterThanTime, lessThanTime)
  //       // )
  //       // ProductFeedback = await elasticSearchCount(
  //       //   elasticMentionQueryTemplate(ProductFeedbackQuery, greaterThanTime, lessThanTime)
  //       // )
  //       // Other = await elasticSearchCount(elasticMentionQueryTemplate(OtherQuery, greaterThanTime, lessThanTime))

  //       // if (topicId === 2325 || topicId === 2388) {
  //       //   // Sohar international bank & gdrfa
  //       //   if (topicId === 2388 && sourcesArray[i] === 'GooglePlayStore') continue // Skip Google Play Store for gdrfa

  //       //   if (
  //       //     ['GooglePlayStore', 'GoogleMyBusiness', 'AppleAppStore', 'HuaweiAppGallery', 'Glassdoor'].includes(
  //       //       sourcesArray[i]
  //       //     )
  //       //   ) {
  //       //     const cusRevElasticId = customerReviewElasticId(parentAccountId)
  //       //     //console.log('customerReviewElasticId', cusRevElasticId)
  //       //     const queryTemp = (range) => ({
  //       //       body: {
  //       //         query: {
  //       //           bool: {
  //       //             must: [
  //       //               {
  //       //                 query_string: {
  //       //                   query: `source:("${sourcesArray[i]}") AND manual_entry_type:("review") AND review_customer:("${cusRevElasticId}")`
  //       //                 }
  //       //               },
  //       //               { range: range },
  //       //               { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
  //       //             ]
  //       //           }
  //       //         }
  //       //       }
  //       //     })

  //       //     const range1 = { p_likes: { gt: 3 } }
  //       //     const range2 = { p_likes: { lt: 2 } }
  //       //     const range3 = { p_likes: { gte: 2, lte: 3 } }
  //       //     posSenti = await elasticSearchCount(queryTemp(range1))
  //       //     negSenti = await elasticSearchCount(queryTemp(range2))
  //       //     neuSenti = await elasticSearchCount(queryTemp(range3))
  //       //   }
  //       // }

  //       if (
  //         twitterContent.count > 0 ||
  //         facebookContent.count > 0 ||
  //         instagramContent.count > 0
  //         //||
  //         // Clarification.count > 0 ||
  //         // Praise.count > 0 ||
  //         // Suggestion.count > 0 ||
  //         // ProductFeedback.count > 0 ||
  //         // Other.count > 0
  //       ) {
  //         ;(responseOutput )[sourcesArray2[i]] = {
  //           twitterContent: twitterContent?.count,
  //           facebookContent: facebookContent?.count,
  //           instagramContent: instagramContent?.count
  //           // Clarification: Clarification?.count,
  //           // Praise: Praise?.count,
  //           // Suggestion: Suggestion?.count,
  //           // ProductFeedback: ProductFeedback?.count,
  //           // Other: Other?.count
  //         }
  //       }
  //     }

  //     //console.log('data', responseOutput)

  //     return NextResponse.json({ responseOutput }, { status: 200 })
  //   } catch (error) {
  //     console.error('Error fetching results:', error)
  //     return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  //   }
  // }
  else if (type === 'typeofMentions') {
    try {
      const sourcesArray2 = [
        'Marketing Content',
        // 'Customer Complaint',
        // 'Inquiry',
        'Clarification',
        'Praise',
        // 'Suggestion',
        'Product Feedback',
        'Energy Sector News',
        'Customer Inquiry',
        'Complaint',
        'Service Feedback',
        'Suggestions',
        'Other'
      ]

      // Function to generate queries
      const createQuery = (source, mentionType) =>
        `${topicQueryString} AND source:("${source}") AND llm_mention_type:("${mentionType}")`

      // Map to hold results
      const responseOutput = {}

      // Perform all queries concurrently
      const queryPromises = sourcesArray2.map(async mentionType => {
        const [twitterContent, facebookContent, instagramContent] = await Promise.all([
          elasticSearchCount(
            elasticMentionQueryTemplate(createQuery('Twitter', mentionType), greaterThanTime, lessThanTime)
          ),
          elasticSearchCount(
            elasticMentionQueryTemplate(createQuery('Facebook', mentionType), greaterThanTime, lessThanTime)
          ),
          elasticSearchCount(
            elasticMentionQueryTemplate(createQuery('Instagram', mentionType), greaterThanTime, lessThanTime)
          )
        ])

        if (twitterContent?.count > 0 || facebookContent?.count > 0 || instagramContent?.count > 0) {
          responseOutput[mentionType] = {
            twitterContent: twitterContent?.count || 0,
            facebookContent: facebookContent?.count || 0,
            instagramContent: instagramContent?.count || 0
          }
        }
      })

      // Wait for all queries to complete
      await Promise.all(queryPromises)

      // Return the final response\
      return res.status(200).json({ responseOutput });

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'categoryMentions') {
    try {
      const sourcesArray = [
        'Business & Retail',
        'Finance',
        'Technology',
        'Healthcare',
        'Energy & Automotive',
        'Fashion',
        'Food & Beverage',
        'Travel & Tourism',
        'Entertainment & News',
        'Other'
      ]

      let responseOutput = {}

      for (let i = 0; i < sourcesArray.length; i++) {
        // let _sources
        // if (sourcesArray[i] === 'Youtube') {
        //   _sources = '"Youtube" OR "Vimeo"'
        // } else if (sourcesArray[i] === 'Web') {
        //   _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
        // } else {
        //   _sources = sourcesArray[i]
        // }

        let twitterContent = 0,
          facebookContent = 0,
          instagramContent = 0
        let twitterContentQuery, facebookContentQuery, instagramContentQuery
        // Healthcare = 0,
        // EnergyAutomotive = 0,
        // Fashion = 0,
        // FoodBeverage = 0,
        // TravelTourism = 0,
        // EntertainmentNews = 0,
        // Other = 0

        if (sourcesArray[i] === 'Business & Retail') {
          twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND predicted_category:("Business") OR predicted_category:("Retail")`
          facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND predicted_category:("Business") OR predicted_category:("Retail")`
          instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND predicted_category:("Business") OR predicted_category:("Retail")`
        } else if (sourcesArray[i] === 'Energy & Automotive') {
          twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND predicted_category:("Energy/Utilities") OR predicted_category:("Transportation") OR predicted_category:("Utilities") OR predicted_category:("Energy & Utilities") OR predicted_category:("Energy/Electricity")`
          facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND predicted_category:("Energy/Utilities") OR predicted_category:("Transportation") OR predicted_category:("Utilities") OR predicted_category:("Energy & Utilities") OR predicted_category:("Energy/Electricity")`
          instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND predicted_category:("Energy/Utilities") OR predicted_category:("Transportation") OR predicted_category:("Utilities") OR predicted_category:("Energy & Utilities") OR predicted_category:("Energy/Electricity")`
        } else if (sourcesArray[i] === 'Food & Beverage') {
          twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND predicted_category:("Food & Beverage") OR predicted_category:("Bevarage")OR predicted_category:("Food")OR predicted_category:("Bevarages") OR predicted_category:("Food/Bevarage") OR predicted_category:("Food/Bevarages") OR predicted_category:("Food & Bevarages")`
          facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND predicted_category:("Food & Beverage") OR predicted_category:("Bevarage")OR predicted_category:("Food")OR predicted_category:("Bevarages") OR predicted_category:("Food/Bevarage") OR predicted_category:("Food/Bevarages") OR predicted_category:("Food & Bevarages")`
          instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND predicted_category:("Food & Beverage") OR predicted_category:("Bevarage")OR predicted_category:("Food")OR predicted_category:("Bevarages") OR predicted_category:("Food/Bevarage") OR predicted_category:("Food/Bevarages") OR predicted_category:("Food & Bevarages")`
        } else if (sourcesArray[i] === 'Travel & Tourism') {
          twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND predicted_category:("Travel & Tourism") OR predicted_category:("Travel/Tourism") OR predicted_category:("Travel") OR predicted_category:("Tourism")`
          facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND predicted_category:("Travel & Tourism") OR predicted_category:("Travel/Tourism") OR predicted_category:("Travel") OR predicted_category:("Tourism")`
          instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND predicted_category:("Travel & Tourism") OR predicted_category:("Travel/Tourism") OR predicted_category:("Travel") OR predicted_category:("Tourism")`
        } else if (sourcesArray[i] === 'Entertainment & News') {
          twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND predicted_category:("Entertainment") OR predicted_category:("News") OR predicted_category:("Entertainment & News")`
          facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND predicted_category:("Entertainment") OR predicted_category:("News") OR predicted_category:("Entertainment & News")`
          instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND predicted_category:("Entertainment") OR predicted_category:("News") OR predicted_category:("Entertainment & News")`
        } else if (sourcesArray[i] === 'Other') {
          twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND predicted_category:("Other") OR predicted_category:("")`
          facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND predicted_category:("Other") OR predicted_category:("")`
          instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND predicted_category:("Other") OR predicted_category:("")`
        } else {
          twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND predicted_category:("${sourcesArray[i]}")`
          facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND predicted_category:("${sourcesArray[i]}")`
          instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND predicted_category:("${sourcesArray[i]}")`
        }
        // const HealthcareQuery = `${topicQueryString} AND source:(${_sources}) AND predicted_category:("Healthcare")`
        // const EnergyAutomotiveQuery = `${topicQueryString} AND source:(${_sources}) AND predicted_category:("Energy/Utilities") OR predicted_category:("Transportation") OR predicted_category:("Utilities") OR predicted_category:("Energy & Utilities") OR predicted_category:("Energy/Electricity")`
        // const FashionQuery = `${topicQueryString} AND source:(${_sources}) AND predicted_category:("Fashion")`
        // const FoodBeverageQuery = `${topicQueryString} AND source:(${_sources})  AND predicted_category:("Food & Beverage") OR predicted_category:("Bevarage")OR predicted_category:("Food")OR predicted_category:("Bevarages") OR predicted_category:("Food/Bevarage") OR predicted_category:("Food/Bevarages") OR predicted_category:("Food & Bevarages")`
        // const TravelTourismQuery = `${topicQueryString} AND source:(${_sources}) AND predicted_category:("Travel & Tourism") OR predicted_category:("Travel/Tourism") OR predicted_category:("Travel") OR predicted_category:("Tourism")`
        // const EntertainmentNewsQuery = `${topicQueryString} AND source:(${_sources}) AND predicted_category:("Entertainment") OR predicted_category:("News") OR predicted_category:("Entertainment & News")`
        // const OtherQuery = `${topicQueryString} AND source:(${_sources}) AND predicted_category:("Other") OR predicted_category:("")`

        twitterContent = await elasticSearchCount(
          elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
        )
        facebookContent = await elasticSearchCount(
          elasticMentionQueryTemplate(facebookContentQuery, greaterThanTime, lessThanTime)
        )
        instagramContent = await elasticSearchCount(
          elasticMentionQueryTemplate(instagramContentQuery, greaterThanTime, lessThanTime)
        )

        if (
          twitterContent.count > 0 ||
          facebookContent.count > 0 ||
          instagramContent.count > 0
          //||
          // Clarification.count > 0 ||
          // Praise.count > 0 ||
          // Suggestion.count > 0 ||
          // ProductFeedback.count > 0 ||
          // Other.count > 0
        ) {
          ;(responseOutput )[sourcesArray[i]] = {
            twitterContent: twitterContent?.count,
            facebookContent: facebookContent?.count,
            instagramContent: instagramContent?.count
            // Clarification: Clarification?.count,
            // Praise: Praise?.count,
            // Suggestion: Suggestion?.count,
            // ProductFeedback: ProductFeedback?.count,
            // Other: Other?.count
          }
        }
      }

      //console.log('data', responseOutput)
return res.status(200).json({ responseOutput});

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
  //  else if (type === 'touchpointReference') {
  //   try {
  //     const sourcesArray = [
  //       'Physical Branches and ATMs',
  //       'Digital Channels',
  //       'Customer Service Centers',
  //       'Financial Advisors',
  //       'Marketing Channels',
  //       'Community Initiatives',
  //       'Partner Networks',
  //       'Self-Service Portals',
  //       'Other'
  //     ]
  //     // const sourcesArray = [
  //     //   'Mobile App',
  //     //   'Physical Branch',
  //     //   'Website',
  //     //   'Customer Service',
  //     //   'Social Media',
  //     //   'E-commerce Platform',
  //     //   'Loyalty Program',
  //     //   'Product Packaging',
  //     //   'Digital Access',
  //     //   'Customer Support',
  //     //   'Automated Assistance',
  //     //   'Energy Management Services',
  //     //   'In-Person Services',
  //     //   'Incident and Service Reporting',
  //     //   'Digital Channels',
  //     //   'Physical Channels',
  //     //   'Customer Support',
  //     //   'Social and Engagement Channels',
  //     //   'Messaging and Alerts',
  //     //   'Loyalty and Rewards',
  //     //   'Other'
  //     // ]

  //     let responseOutput = {}

  //     for (let i = 0; i < sourcesArray.length; i++) {
  //       //   let _sources
  //       //   if (sourcesArray[i] === 'Youtube') {
  //       //     _sources = '"Youtube" OR "Vimeo"'
  //       //   } else if (sourcesArray[i] === 'Web') {
  //       //     _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
  //       //   } else {
  //       //     _sources = sourcesArray[i]
  //       //   }

  //       let MarketingContent = 0,
  //         CustomerComplaint = 0,
  //         Inquiry = 0,
  //         Clarification = 0,
  //         Praise = 0,
  //         Suggestion = 0,
  //         ProductFeedback = 0,
  //         Other = 0
  //       // CustomerService = 0,
  //       // SocialMedia = 0,
  //       // EcommercePlatform = 0,
  //       // LoyaltyProgram = 0,
  //       // ProductPackaging = 0,
  //       // Other = 0

  //       const MarketingContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Marketing Content")`
  //       const CustomerComplaintQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Customer Complaint")`
  //       const InquiryQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Inquiry")`
  //       const ClarificationQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Clarification")`
  //       const PraiseQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Praise")`
  //       const SuggestionQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Suggestion")`
  //       const ProductFeedbackQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Product Feedback")`

  //       const OtherQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Other")`

  //       // const WebsiteQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_touchpoint:("Website")`
  //       // const CustomerServiceQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_touchpoint:("Customer Service")`
  //       // const SocialMediaQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_touchpoint:("Social Media") `
  //       // const EcommercePlatformQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_touchpoint:("E-commerce Platform")`
  //       // const LoyaltyProgramQuery = `${topicQueryString} AND source:(${_sources})  AND llm_mention_touchpoint:("Loyalty Program")`
  //       // const ProductPackagingQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_touchpoint:("Product Packaging")`
  //       // const OtherQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_touchpoint:("Other") OR llm_mention_touchpoint:('')`

  //       MarketingContent = await elasticSearchCount(
  //         elasticMentionQueryTemplate(MarketingContentQuery, greaterThanTime, lessThanTime)
  //       )
  //       CustomerComplaint = await elasticSearchCount(
  //         elasticMentionQueryTemplate(CustomerComplaintQuery, greaterThanTime, lessThanTime)
  //       )
  //       Inquiry = await elasticSearchCount(elasticMentionQueryTemplate(InquiryQuery, greaterThanTime, lessThanTime))
  //       Clarification = await elasticSearchCount(
  //         elasticMentionQueryTemplate(ClarificationQuery, greaterThanTime, lessThanTime)
  //       )
  //       Praise = await elasticSearchCount(elasticMentionQueryTemplate(PraiseQuery, greaterThanTime, lessThanTime))
  //       Suggestion = await elasticSearchCount(
  //         elasticMentionQueryTemplate(SuggestionQuery, greaterThanTime, lessThanTime)
  //       )
  //       ProductFeedback = await elasticSearchCount(
  //         elasticMentionQueryTemplate(ProductFeedbackQuery, greaterThanTime, lessThanTime)
  //       )

  //       Other = await elasticSearchCount(elasticMentionQueryTemplate(OtherQuery, greaterThanTime, lessThanTime))

  //       if (
  //         MarketingContent?.count > 0 ||
  //         CustomerComplaint?.count > 0 ||
  //         Inquiry?.count > 0 ||
  //         Clarification?.count > 0 ||
  //         Praise?.count > 0 ||
  //         Suggestion?.count > 0 ||
  //         ProductFeedback?.count > 0 ||
  //         Other?.count > 0
  //       ) {
  //         ;(responseOutput )[sourcesArray[i]] = {
  //           MarketingContent: MarketingContent?.count,
  //           CustomerComplaint: CustomerComplaint?.count,
  //           Inquiry: Inquiry?.count,
  //           Clarification: Clarification?.count,
  //           Praise: Praise?.count,
  //           Suggestion: Suggestion?.count,
  //           ProductFeedback: ProductFeedback?.count,
  //           Other: Other?.count
  //         }
  //       }
  //     }

  //     // console.log('data', responseOutput)

  //     return NextResponse.json({ responseOutput }, { status: 200 })
  //   } catch (error) {
  //     console.error('Error fetching results:', error)
  //     return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  //   }
  // }
  //  else if (type === 'touchpointReference') {
  //   try {
  //     const sourcesArray = [
  //       'Physical Branches and ATMs',
  //       'Digital Channels',
  //       'Customer Service Centers',
  //       'Financial Advisors',
  //       'Marketing Channels',
  //       'Community Initiatives',
  //       'Partner Networks',
  //       'Self-Service Portals',
  //       'Other'
  //     ]
  //     let responseOutput = {}
  //     for (let i = 0; i < sourcesArray.length; i++) {

  //        let MarketingContent = 0,
  //         CustomerComplaint = 0,
  //         Inquiry = 0,
  //         Clarification = 0,
  //         Praise = 0,
  //         Suggestion = 0,
  //         ProductFeedback = 0,
  //         Other = 0

  //       const MarketingContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Marketing Content")`
  //       const CustomerComplaintQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Customer Complaint")`
  //       const InquiryQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Inquiry")`
  //       const ClarificationQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Clarification")`
  //       const PraiseQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Praise")`
  //       const SuggestionQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Suggestion")`
  //       const ProductFeedbackQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Product Feedback")`

  //       const OtherQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Other")`

  //       MarketingContent = await elasticSearchCount(
  //         elasticMentionQueryTemplate(MarketingContentQuery, greaterThanTime, lessThanTime)
  //       )
  //       CustomerComplaint = await elasticSearchCount(
  //         elasticMentionQueryTemplate(CustomerComplaintQuery, greaterThanTime, lessThanTime)
  //       )
  //       Inquiry = await elasticSearchCount(elasticMentionQueryTemplate(InquiryQuery, greaterThanTime, lessThanTime))
  //       Clarification = await elasticSearchCount(
  //         elasticMentionQueryTemplate(ClarificationQuery, greaterThanTime, lessThanTime)
  //       )
  //       Praise = await elasticSearchCount(elasticMentionQueryTemplate(PraiseQuery, greaterThanTime, lessThanTime))
  //       Suggestion = await elasticSearchCount(
  //         elasticMentionQueryTemplate(SuggestionQuery, greaterThanTime, lessThanTime)
  //       )
  //       ProductFeedback = await elasticSearchCount(
  //         elasticMentionQueryTemplate(ProductFeedbackQuery, greaterThanTime, lessThanTime)
  //       )

  //       Other = await elasticSearchCount(elasticMentionQueryTemplate(OtherQuery, greaterThanTime, lessThanTime))

  //       if (
  //         MarketingContent?.count > 0 ||
  //         CustomerComplaint?.count > 0 ||
  //         Inquiry?.count > 0 ||
  //         Clarification?.count > 0 ||
  //         Praise?.count > 0 ||
  //         Suggestion?.count > 0 ||
  //         ProductFeedback?.count > 0 ||
  //         Other?.count > 0
  //       ) {
  //         ;(responseOutput )[sourcesArray[i]] = {
  //           MarketingContent: MarketingContent?.count,
  //           CustomerComplaint: CustomerComplaint?.count,
  //           Inquiry: Inquiry?.count,
  //           Clarification: Clarification?.count,
  //           Praise: Praise?.count,
  //           Suggestion: Suggestion?.count,
  //           ProductFeedback: ProductFeedback?.count,
  //           Other: Other?.count
  //         }
  //       }
  //     }

  //     // console.log('data', responseOutput)

  //     return NextResponse.json({ responseOutput }, { status: 200 })
  //   } catch (error) {
  //     console.error('Error fetching results:', error)
  //     return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  //   }
  // }
  // else if (type === 'touchpointReference') {
  //   try {
  //     const sourcesArray = [
  //       'Physical Branches and ATMs',
  //       'Digital Channels',
  //       'Customer Service Centers',
  //       'Financial Advisors',
  //       'Marketing Channels',
  //       'Community Initiatives',
  //       'Partner Networks',
  //       'Self-Service Portals',
  //       'Other'
  //     ]

  //     const mentionTypes = [
  //       'Marketing Content',
  //       'Customer Complaint',
  //       'Inquiry',
  //       'Clarification',
  //       'Praise',
  //       'Suggestion',
  //       'Product Feedback',
  //       'Other'
  //     ]

  //     let responseOutput = {}

  //     // Prepare all queries to execute in parallel
  //     const allQueries = []

  //     for (const touchpoint of sourcesArray) {
  //       const mentionCounts = {}
  //       for (const mentionType of mentionTypes) {
  //         const query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${touchpoint}") AND llm_mention_type:("${mentionType}")`

  //         // Push the promise for execution
  //         allQueries.push(
  //           elasticSearchCount(elasticMentionQueryTemplate(query, greaterThanTime, lessThanTime))
  //             .then(result => {
  //               mentionCounts[mentionType] = result?.count || 0
  //             })
  //             .catch(error => {
  //               console.error(`Error fetching ${mentionType} for ${touchpoint}:`, error)
  //               mentionCounts[mentionType] = 0 // Default to 0 on error
  //             })
  //         )
  //       }

  //       // Push touchpoint data into responseOutput after all queries for it resolve
  //       allQueries.push(
  //         Promise.all(allQueries).then(() => {
  //           if (Object.values(mentionCounts).some(count => count > 0)) {
  //             responseOutput[touchpoint] = mentionCounts
  //           }
  //         })
  //       )
  //     }

  //     // Wait for all queries to resolve
  //     await Promise.all(allQueries)

  //     // Return the final response
  //     return NextResponse.json({ responseOutput }, { status: 200 })
  //   } catch (error) {
  //     console.error('Error fetching results:', error)
  //     return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  //   }
  // }
  // else if (type === 'touchpointReference') {
  //   try {
  //     const sourcesArray = [
  //       'Physical Branches and ATMs',
  //       'Digital Channels',
  //       'Customer Service Centers',
  //       'Financial Advisors',
  //       'Marketing Channels',
  //       'Community Initiatives',
  //       'Partner Networks',
  //       'Self-Service Portals',
  //       'Other'
  //     ]

  //     const mentionTypes = [
  //       'Marketing Content',
  //       'Customer Complaint',
  //       'Inquiry',
  //       'Clarification',
  //       'Praise',
  //       'Suggestion',
  //       'Product Feedback',
  //       'Other'
  //     ]

  //     let responseOutput = {}

  //     // Prepare all queries to execute in parallel
  //     const allQueries = []

  //     for (const touchpoint of sourcesArray) {
  //       const mentionCounts = {}

  //       // Create queries for each mention type and touchpoint
  //       for (const mentionType of mentionTypes) {
  //         const query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${touchpoint}") AND llm_mention_type:("${mentionType}")`

  //         // Push the promise for execution
  //         allQueries.push(
  //           elasticSearchCount(elasticMentionQueryTemplates(query, greaterThanTime, lessThanTime))
  //             .then(result => {
  //               mentionCounts[mentionType] = result?.count || 0
  //             })
  //             .catch(error => {
  //               console.error(`Error fetching ${mentionType} for ${touchpoint}:`, error)
  //               mentionCounts[mentionType] = 0 // Default to 0 on error
  //             })
  //         )
  //       }

  //       // Push touchpoint data into responseOutput after all queries for it resolve
  //       allQueries.push(
  //         Promise.all(allQueries).then(() => {
  //           if (
  //             mentionCounts['Marketing Content'] > 0 ||
  //             mentionCounts['Customer Complaint'] > 0 ||
  //             mentionCounts['Inquiry'] > 0 ||
  //             mentionCounts['Clarification'] > 0 ||
  //             mentionCounts['Praise'] > 0 ||
  //             mentionCounts['Suggestion'] > 0 ||
  //             mentionCounts['Product Feedback'] > 0 ||
  //             mentionCounts['Other'] > 0
  //           ) {
  //             responseOutput[touchpoint] = {
  //               MarketingContent: mentionCounts['Marketing Content'],
  //               CustomerComplaint: mentionCounts['Customer Complaint'],
  //               Inquiry: mentionCounts['Inquiry'],
  //               Clarification: mentionCounts['Clarification'],
  //               Praise: mentionCounts['Praise'],
  //               Suggestion: mentionCounts['Suggestion'],
  //               ProductFeedback: mentionCounts['Product Feedback'],
  //               Other: mentionCounts['Other']
  //             }
  //           }
  //         })
  //       )
  //     }

  //     // Wait for all queries to resolve
  //     await Promise.all(allQueries)

  //     // Return the final response
  //     return NextResponse.json({ responseOutput }, { status: 200 })
  //   } catch (error) {
  //     console.error('Error fetching results:', error)
  //     return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  //   }
  // }
  // else if (type === 'touchpointReference') {
  //   try {
  //     const sourcesArray = [
  //       'Physical Branches and ATMs',
  //       'Digital Channels',
  //       'Customer Service Centers',
  //       'Financial Advisors',
  //       'Marketing Channels',
  //       'Community Initiatives',
  //       'Partner Networks',
  //       'Self-Service Portals',
  //       'Other'
  //     ];

  //     const mentionTypes = [
  //       'Marketing Content',
  //       'Customer Complaint',
  //       'Inquiry',
  //       'Clarification',
  //       'Praise',
  //       'Suggestion',
  //       'Product Feedback',
  //       'Other'
  //     ];

  //     let responseOutput = {};

  //     // Create queries for each touchpoint
  //     const touchpointQueries = sourcesArray.map(async (touchpoint) => {
  //       const mentionCounts = {};

  //       // Execute queries for each mention type in parallel
  //       await Promise.all(
  //         mentionTypes.map(async (mentionType) => {
  //           const query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${touchpoint}") AND llm_mention_type:("${mentionType}")`;

  //           try {
  //             const result = await elasticSearchCount(elasticMentionQueryTemplates(query, greaterThanTime, lessThanTime));
  //             mentionCounts[mentionType] = result?.count || 0;
  //           } catch (error) {
  //             console.error(`Error fetching ${mentionType} for ${touchpoint}:`, error);
  //             mentionCounts[mentionType] = 0; // Default to 0 on error
  //           }
  //         })
  //       );

  //       // Add touchpoint data to responseOutput if there are non-zero counts
  //       if (Object.values(mentionCounts).some((count) => count > 0)) {
  //         responseOutput[touchpoint] = {
  //           MarketingContent: mentionCounts['Marketing Content'],
  //           CustomerComplaint: mentionCounts['Customer Complaint'],
  //           Inquiry: mentionCounts['Inquiry'],
  //           Clarification: mentionCounts['Clarification'],
  //           Praise: mentionCounts['Praise'],
  //           Suggestion: mentionCounts['Suggestion'],
  //           ProductFeedback: mentionCounts['Product Feedback'],
  //           Other: mentionCounts['Other']
  //         };
  //       }
  //     });

  //     // Wait for all touchpoint queries to resolve
  //     await Promise.all(touchpointQueries);

  //     // Return the final response
  //     return NextResponse.json({ responseOutput }, { status: 200 });
  //   } catch (error) {
  //     console.error('Error fetching results:', error);
  //     return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  //   }
  // }
  else if (type === 'touchpointReference') {
    try {
      const sourcesArray = [
        'Physical Branches and ATMs',
        'Digital Channels',
        'Customer Service Centers',
        'Financial Advisors',
        'Marketing Channels',
        'Community Initiatives',
        'Partner Networks',
        'Self-Service Portals',
        'Other'
      ]

      const mentionTypes = [
        'Marketing Content',
        'Customer Complaint',
        'Inquiry',
        'Clarification',
        'Praise',
        'Suggestion',
        'Product Feedback',
        'Other'
      ]

      let responseOutput = {}

      // Iterate over each touchpoint
      for (const touchpoint of sourcesArray) {
        const mentionCounts = {}

        // Create and execute all queries for the current touchpoint in parallel
        const queryPromises = mentionTypes.map(async mentionType => {
          const query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${touchpoint}") AND llm_mention_type:("${mentionType}")`

          try {
            const result = await elasticSearchCount(elasticMentionQueryTemplates(query, greaterThanTime, lessThanTime))
            mentionCounts[mentionType] = result?.count || 0
          } catch (error) {
            console.error(`Error fetching ${mentionType} for ${touchpoint}:`, error)
            mentionCounts[mentionType] = 0 // Default to 0 on error
          }
          
        })

        // Wait for all mention queries of the current touchpoint to resolve
        await Promise.all(queryPromises)

        // Only add touchpoint data if any mention type has a non-zero count
        if (Object.values(mentionCounts).some(count => count > 0)) {
          responseOutput[touchpoint] = {
            MarketingContent: mentionCounts['Marketing Content'],
            CustomerComplaint: mentionCounts['Customer Complaint'],
            Inquiry: mentionCounts['Inquiry'],
            Clarification: mentionCounts['Clarification'],
            Praise: mentionCounts['Praise'],
            Suggestion: mentionCounts['Suggestion'],
            ProductFeedback: mentionCounts['Product Feedback'],
            Other: mentionCounts['Other']
          }
        }
      }

      // Return the final response
return res.status(200).json({ responseOutput});
    }catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // else if (type === 'urgencyMentions') {
  //   try {
  //     let high = 0,
  //       medium = 0,
  //       low = 0

  //     const highQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"')  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback" OR  "Energy Sector News" OR  "Customer Inquiry" OR  "Complaint" OR  "Clarification" OR "Service Feedback" OR  "Suggestions" ') AND llm_mention_urgency:("High")`
  //     const mediumQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"')  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"  OR  "Energy Sector News" OR  "Customer Inquiry" OR  "Complaint" OR  "Clarification" OR "Service Feedback" OR  "Suggestions"') AND llm_mention_urgency:("Medium")`
  //     const lowQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"')  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback" OR  "Energy Sector News" OR  "Customer Inquiry" OR  "Complaint" OR  "Clarification" OR "Service Feedback" OR  "Suggestions"') AND llm_mention_urgency:("Low")`

  //     high = await elasticSearchCount(elasticMentionQueryTemplate(highQuery, greaterThanTime, lessThanTime))
  //     medium = await elasticSearchCount(elasticMentionQueryTemplate(mediumQuery, greaterThanTime, lessThanTime))
  //     low = await elasticSearchCount(elasticMentionQueryTemplate(lowQuery, greaterThanTime, lessThanTime))

  //     const totalSentiments = high?.count + medium?.count + low?.count

  //     const responseOutput = `High,${high?.count}|Medium,${medium?.count}|Low,${low?.count}`

  //     return NextResponse.json({ responseOutput, totalSentiments }, { status: 200 })
  //   } catch (error) {
  //     console.error('Error fetching results:', error)
  //     return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  //   }
  // }
  else if (type === 'urgencyMentions') {
    try {
      // Initialize counts
      let high = 0,
        medium = 0,
        low = 0

      // Define the base query for all mentions
      let baseQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram" OR "GoogleMyBusiness"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback" OR "Energy Sector News" OR "Customer Inquiry" OR "Complaint" OR "Clarification" OR "Service Feedback" OR "Suggestions"')`
      if (isScadUser == 'true') {
        if (selectedTab === 'GOOGLE') {
          if (topicQueryString == '') {
            baseQuery = `source:('"GoogleMyBusiness"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback" OR "Energy Sector News" OR "Customer Inquiry" OR "Complaint" OR "Clarification" OR "Service Feedback" OR "Suggestions"')`
          } else {
            baseQuery = `${topicQueryString} AND source:('"GoogleMyBusiness"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback" OR "Energy Sector News" OR "Customer Inquiry" OR "Complaint" OR "Clarification" OR "Service Feedback" OR "Suggestions"')`
          }
        } else {
          baseQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback" OR "Energy Sector News" OR "Customer Inquiry" OR "Complaint" OR "Clarification" OR "Service Feedback" OR "Suggestions"')`
        }
      }
      // Create a helper function to fetch counts
      const getMentionCount = async (urgency) => {
        const query = `${baseQuery} AND llm_mention_urgency:("${urgency}")`
        return await elasticSearchCount(elasticMentionQueryTemplate(query, greaterThanTime, lessThanTime))
      }

      // Fetch the counts for high, medium, and low urgency
      high = await getMentionCount('High')
      medium = await getMentionCount('Medium')
      low = await getMentionCount('Low')

      // Calculate total sentiment count
      const totalSentiments = high?.count + medium?.count + low?.count

      // Format the response output
      const responseOutput = `High,${high?.count}|Medium,${medium?.count}|Low,${low?.count}`

      return res.status(200).json({ responseOutput,totalSentiments});

    }catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'recurrenceMentions') {
    try {
      let firstTime = 0,
        repeatedMention = 0,
        ongoingIssue = 0

      const firstTimeQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_recurrence:("First Time" OR "First Mention")`
      const repeatedMentionQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_recurrence:("Repeated Mention" OR "Recurring Issue")`
      const ongoingIssueQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_recurrence:("Recurring Issue" OR "Ongoing Issue" OR "Ongoing Problem") `

      firstTime = await elasticSearchCount(elasticMentionQueryTemplate(firstTimeQuery, greaterThanTime, lessThanTime))

      repeatedMention = await elasticSearchCount(
        elasticMentionQueryTemplate(repeatedMentionQuery, greaterThanTime, lessThanTime)
      )
      ongoingIssue = await elasticSearchCount(
        elasticMentionQueryTemplate(ongoingIssueQuery, greaterThanTime, lessThanTime)
      )

      const influencersCoverage = [firstTime?.count, repeatedMention?.count, ongoingIssue?.count]
            return res.status(200).json({ influencersCoverage});

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'languageToneMentions') {
    try {
      const sourcesArray = [
        'Formal',
        'Informal',
        'Sarcastic',
        'Technical',
        'Professional',
        'Neutral',
        'Critical',
        'Other'
      ]

      let responseOutput = {}

      for (let i = 0; i < sourcesArray.length; i++) {
        // let _sources
        // if (sourcesArray[i] === 'Youtube') {
        //   _sources = '"Youtube" OR "Vimeo"'
        // } else if (sourcesArray[i] === 'Web') {
        //   _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
        // } else {
        //   _sources = sourcesArray[i]
        // }

        let twitterContent = 0,
          facebookContent = 0,
          instagramContent = 0,
          webContent = 0
        let twitterContentQuery, facebookContentQuery, instagramContentQuery, webContentQuery

        twitterContentQuery = `${topicQueryString} AND source:('"Twitter"')  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"  OR  "Energy Sector News" OR  "Customer Inquiry" OR  "Complaint" OR  "Clarification" OR "Service Feedback" OR  "Suggestions"') AND  llm_mention_tone:("${sourcesArray[i]}")`
        facebookContentQuery = `${topicQueryString} AND source:('"Facebook"')  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"  OR  "Energy Sector News" OR  "Customer Inquiry" OR  "Complaint" OR  "Clarification" OR "Service Feedback" OR  "Suggestions"') AND  llm_mention_tone:("${sourcesArray[i]}")`
        instagramContentQuery = `${topicQueryString} AND source:('"Instagram"')  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"  OR  "Energy Sector News" OR  "Customer Inquiry" OR  "Complaint" OR  "Clarification" OR "Service Feedback" OR  "Suggestions"') AND  llm_mention_tone:("${sourcesArray[i]}")`
        //webContentQuery = `${topicQueryString} AND source:('"FakeNews" OR "News" OR "Blogs" OR "Web"')  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND  llm_mention_tone:("${sourcesArray[i]}")`

        twitterContent = await elasticSearchCount(
          elasticMentionQueryTemplates(twitterContentQuery, greaterThanTime, lessThanTime)
        )
        facebookContent = await elasticSearchCount(
          elasticMentionQueryTemplates(facebookContentQuery, greaterThanTime, lessThanTime)
        )
        instagramContent = await elasticSearchCount(
          elasticMentionQueryTemplates(instagramContentQuery, greaterThanTime, lessThanTime)
        )
        // webContent = await elasticSearchCount(
        //   elasticMentionQueryTemplate(webContentQuery, greaterThanTime, lessThanTime)
        // )

        if (twitterContent?.count > 0 || facebookContent?.count > 0 || instagramContent?.count > 0) {
          ;(responseOutput )[sourcesArray[i]] = {
            twitterContent: twitterContent?.count,
            facebookContent: facebookContent?.count,
            instagramContent: instagramContent?.count
            // webContent: webContent?.count
          }
        }
      }
            return res.status(200).json({ responseOutput});

    }catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'audienceMentions') {
    try {
      const sourcesArray = [
        'Youtube',
        'Twitter',
        'Pinterest',
        'Instagram',
        'Reddit',
        'Tumblr',
        'Facebook',
        'Web',
        'Linkedin',
        'GooglePlayStore',
        'GoogleMyBusiness',
        'AppleAppStore',
        'HuaweiAppGallery',
        'Glassdoor'
      ]

      let responseOutput = {}

      for (let i = 0; i < sourcesArray.length; i++) {
        let _sources
        if (sourcesArray[i] === 'Youtube') {
          _sources = '"Youtube" OR "Vimeo"'
        } else if (sourcesArray[i] === 'Web') {
          _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
        } else {
          _sources = sourcesArray[i]
        }

        //Existing Customer, Potential Customer, Influencer, Partner, General Public

        let ExistingCustomer = 0,
          PotentialCustomer = 0,
          Influencer = 0,
          Partner = 0,
          GeneralPublic = 0

        const ExistingCustomerQuery = `${topicQueryString} AND source:(${_sources}) AND  llm_mention_audience:("Existing Customer")`
        const PotentialCustomerQuery = `${topicQueryString} AND source:(${_sources}) AND  llm_mention_audience:("Potential Customer")`
        const InfluencerQuery = `${topicQueryString} AND source:(${_sources}) AND  llm_mention_audience:("Influencer")`
        const PartnerQuery = `${topicQueryString} AND source:(${_sources}) AND  llm_mention_audience:("Partner")  OR  llm_mention_audience:("Ongoing Issue") `
        const GeneralPublicQuery = `${topicQueryString} AND source:(${_sources}) AND  llm_mention_audience:("General Public" OR "Public")`

        ExistingCustomer = await elasticSearchCount(
          elasticMentionQueryTemplate(ExistingCustomerQuery, greaterThanTime, lessThanTime)
        )
        PotentialCustomer = await elasticSearchCount(
          elasticMentionQueryTemplate(PotentialCustomerQuery, greaterThanTime, lessThanTime)
        )
        Influencer = await elasticSearchCount(
          elasticMentionQueryTemplate(InfluencerQuery, greaterThanTime, lessThanTime)
        )
        Partner = await elasticSearchCount(elasticMentionQueryTemplate(PartnerQuery, greaterThanTime, lessThanTime))
        GeneralPublic = await elasticSearchCount(
          elasticMentionQueryTemplate(GeneralPublicQuery, greaterThanTime, lessThanTime)
        )

        if (
          ExistingCustomer.count > 0 ||
          PotentialCustomer.count > 0 ||
          Influencer.count > 0 ||
          Partner.count > 0 ||
          GeneralPublic.count > 0
        ) {
          ;(responseOutput )[sourcesArray[i]] = {
            ExistingCustomer: ExistingCustomer.count,
            PotentialCustomer: PotentialCustomer.count,
            Influencer: Influencer.count,
            Partner: Partner.count,
            GeneralPublic: GeneralPublic.count
          }
        }
      }

      //console.log('asdasd', responseOutput)

      return res.status(200).json({ responseOutput });

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'actionRequiredMentions') {
    try {
      const sourcesArray = [
        'No Action Needed',
        'None',
        'Immediate Response Needed',
        'Follow-Up Required',
        'No Action Required',
        'Escalation Required',
        'Follow-Up Needed',
        'No Action Required.',
        'Other'
      ]

      let responseOutput = {}

      for (let i = 0; i < sourcesArray.length; i++) {
        // let _sources
        // if (sourcesArray[i] === 'Youtube') {
        //   _sources = '"Youtube" OR "Vimeo"'
        // } else if (sourcesArray[i] === 'Web') {
        //   _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
        // } else {
        //   _sources = sourcesArray[i]
        // }

        let twitterContent = 0,
          facebookContent = 0,
          instagramContent = 0,
          webContent = 0
        let twitterContentQuery, facebookContentQuery, instagramContentQuery, webContentQuery

        twitterContentQuery = `${topicQueryString} AND source:('"Twitter"')  AND llm_mention_action:("${sourcesArray[i]}")`
        facebookContentQuery = `${topicQueryString} AND source:('"Facebook"')  AND llm_mention_action:("${sourcesArray[i]}")`
        instagramContentQuery = `${topicQueryString} AND source:('"Instagram"')  AND llm_mention_action:("${sourcesArray[i]}")`
        //webContentQuery = `${topicQueryString} AND source:('"FakeNews" OR "News" OR "Blogs" OR "Web"')  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND  llm_mention_action:("${sourcesArray[i]}")`

        twitterContent = await elasticSearchCount(
          elasticMentionQueryTemplates(twitterContentQuery, greaterThanTime, lessThanTime)
        )
        facebookContent = await elasticSearchCount(
          elasticMentionQueryTemplates(facebookContentQuery, greaterThanTime, lessThanTime)
        )
        instagramContent = await elasticSearchCount(
          elasticMentionQueryTemplates(instagramContentQuery, greaterThanTime, lessThanTime)
        )
        // webContent = await elasticSearchCount(
        //   elasticMentionQueryTemplate(webContentQuery, greaterThanTime, lessThanTime)
        // )

        if (
          twitterContent.count > 0 ||
          facebookContent.count > 0 ||
          instagramContent.count > 0
          //webContent.count > 0
        ) {
          ;(responseOutput )[sourcesArray[i]] = {
            twitterContent: twitterContent?.count,
            facebookContent: facebookContent?.count,
            instagramContent: instagramContent?.count
            // webContent: webContent?.count
          }
        }
      }

      return res.status(200).json({ responseOutput });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'sentimentSummary') {
    try {
      // const params = (sentValue) => ({
      //   body: {
      //     query: {
      //       bool: {
      //         must: [
      //           { query_string: { query: topicQueryString } },
      //           { match: { predicted_sentiment_value: sentValue } },
      //           { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
      //         ]
      //       }
      //     }
      //   }
      // })

      if (isScadUser == 'true') {
        if (selectedTab === 'GOOGLE') {
          if (topicQueryString == '') {
            topicQueryString = `source:('"GoogleMyBusiness"')`
          } else {
            topicQueryString = topicQueryString + ` AND source:('"GoogleMyBusiness"')`
          }
        } else {
          topicQueryString = topicQueryString + ` AND source:('"Twitter" OR "Facebook" OR "Instagram"')`
        }
      }
      const params = (sentValue) => ({
        body: {
          query: {
            bool: {
              must: [
                {
                  query_string: {
                    query: topicQueryString,
                    analyze_wildcard: true, // Analyze wildcard agar special characters hain
                    default_operator: 'AND'
                  }
                },
                {
                  match: {
                    predicted_sentiment_value: sentValue
                  }
                },
                {
                  range: {
                    p_created_time: {
                      gte: greaterThanTime,
                      lte: lessThanTime
                    }
                  }
                }
              ]
            }
          }
        }
      })
      // const esData2 = await testClientElasticQuery()
      // console.log('dataTesting', esData2?.hits?.hits)
      // console.log("----")
      // console.log(JSON.stringify(params('Positive')))
      // console.log("----")
      // ['predicted_sentiment_value', 'predicted_category', 'llm_mention_type', 'llm_mention_touchpoint', 'llm_mention_urgency', 'llm_mention_audience', 'llm_mention_action', 'llm_product_ref', 'llm_mention_tone', 'llm_mention_recurrence']
      const posSenti = await elasticSearchCounts(params('Positive'))
      const negSenti = await elasticSearchCounts(params('Negative'))
      const neuSenti = await elasticSearchCounts(params('Neutral'))

      const totalSentiments = posSenti?.count + negSenti?.count + neuSenti?.count

      const responseOutput = `Positive,${posSenti?.count}|Negative,${negSenti?.count}|Neutral,${neuSenti?.count}`
      return res.status(200).json({ responseOutput,totalSentiments });

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'influencersCategory') {
    try {
      const queries = [
        { u_followers: { gte: 5000000 } }, // Celebrity
        { u_followers: { gte: 1000000, lte: 5000000 } }, // Mega
        { u_followers: { gte: 500000, lte: 1000000 } }, // Macro
        { u_followers: { gte: 50000, lte: 500000 } }, // Mid-tier
        { u_followers: { gte: 10000, lte: 50000 } }, // Micro
        { u_followers: { gte: 1000, lte: 10000 } } // Nano
      ]

      if (isScadUser == 'true') {
        if (selectedTab === 'GOOGLE') {
          if (topicQueryString == '') {
            topicQueryString = `source:('"GoogleMyBusiness"')`
          } else {
            topicQueryString = topicQueryString + ` AND source:('"GoogleMyBusiness"')`
          }
        } else {
          topicQueryString =
            topicQueryString +
            ` AND source:('"Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Linkedin" OR "Pinterest" OR "Web" OR "Vimeo" OR "News"')`
        }
      } else {
        topicQueryString =
          topicQueryString +
          ` AND source:('"Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Linkedin" OR "Pinterest" OR "Web" OR "Vimeo" OR "News"')`
      }

      // Execute Elasticsearch queries concurrently
      const results = await Promise.all(
        queries.map(params =>
          elasticSearchCounts(elasticQueryTemplateRange(topicQueryString, greaterThanTime, lessThanTime, params))
        )
      )

      // Prepare response object
      const infArray = {}
      results.forEach((item, index) => {
        infArray[['celebrity', 'mega', 'macro', 'midtier', 'micro', 'nano'][index]] = item?.count
      })

      return res.statue(200).json({ infArray })
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'languages') {
    try {
      const esData = await elasticSearchCount(
        elasticMentionQueryTemplate(topicQueryString, greaterThanTime, lessThanTime)
      )
      let totalMentions = (esData )?.count

      const engQueryString = `${topicQueryString} AND lange_detect:("en")`
      const esData1 = await elasticSearchCount(
        elasticMentionQueryTemplate(engQueryString, greaterThanTime, lessThanTime)
      )
      const totalEngMentions = (esData1 )?.count

      const arQueryString = `${topicQueryString} AND lange_detect:("ar")`
      const esData2 = await elasticSearchCount(
        elasticMentionQueryTemplate(arQueryString, greaterThanTime, lessThanTime)
      )
      const totalArabicMentions = (esData2 )?.count

      if (totalMentions === 0) totalMentions = 1

      const mentionsEnglish = ((totalEngMentions / totalMentions) * 100).toFixed(2)
      const mentionsArabic = ((totalArabicMentions / totalMentions) * 100).toFixed(2)
      const otherMentions = (100 - (parseFloat(mentionsEnglish) + parseFloat(mentionsArabic))).toFixed(2)

      const response = `${mentionsArabic},${mentionsEnglish},${otherMentions}`

      return res.statue(200).json({ response })
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'ave') {
    try {
      const aveQueryString = `${topicQueryString} AND source:("khaleej_times" OR "Omanobserver" OR "Time of oman" OR "Blogs" OR "FakeNews" OR "News")`
      const esData = await elasticSearchCount(
        elasticMentionQueryTemplate(aveQueryString, greaterThanTime, lessThanTime)
      )
      const count = (esData )?.count
      const digitalMentions = count * 735.76

      //conventional= printMedia

      const printQueryString = topicQueryString.replace('p_message_text', 'p_message')
      const esData1 = await elasticPrintSearchCount(
        elasticMentionQueryTemplate(printQueryString, greaterThanTime, lessThanTime)
      )
      const count1 = (esData1 )?.count
      const conventionalMentions = count1 * 3276.45

      const formattedDigitalMentions = digitalMentions
      const formattedConventionalMentions = new Intl.NumberFormat().format(conventionalMentions)

            return res.statue(200).json({ formattedDigitalMentions, formattedConventionalMentions })

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'emotions') {
    try {
      const emotions = ['anger', 'fear', 'happy', 'sadness', 'surprise']
      const emotionCounts = {}

      for (const emotion of emotions) {
        const emotionQueryString = `${topicQueryString} AND emotion_detector:("${emotion}")`

        try {
          const esData = await elasticSearchCount(
            elasticMentionQueryTemplate(emotionQueryString, greaterThanTime, lessThanTime)
          )
          emotionCounts[emotion] = (esData )?.count
        } catch (error) {
          console.error(`Error fetching ${emotion} data:`, error)
          emotionCounts[emotion] = 0
        }
      }

      let emoArray, emoCounts
      const totalEmos = Object.values(emotionCounts).reduce((sum, count) => sum + count, 0)
      if (totalEmos == 0) {
        emoArray = ['Anger', 'Fear', 'Happy', 'Sadness', 'Surprise']
        emoCounts = [0, 0, 0, 0, 0]
      } else {
        emoArray = emotions.map(emotion => emotion.charAt(0).toUpperCase() + emotion.slice(1))
        emoCounts = emotions.map(emotion => emotionCounts[emotion])
      }

      const emoData = {
        emos: emoArray,
        counts: emoCounts
      }


                  return res.statue(200).json({ emoData})

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'emotionTouchpointChart') {
    try {
      const responseOutput = {}
      const touchpointsIds = await getAllTouchpoints(Number(subtopicId))

      const emotionsArray = ['Anger', 'Fear', 'Happy', 'Sadness', 'Surprise']

      if (touchpointsIds.length > 0) {
        for (let i = 0; i < touchpointsIds.length; i++) {
          const tpId = touchpointsIds[i].cx_tp_tp_id
          const tpEsQuery = await buildTouchPointQueryString(tpId)

          const emotions = await Promise.all(
            emotionsArray.map(async emotion => {
              const params = {
                body: {
                  query: {
                    bool: {
                      must: [
                        {
                          query_string: {
                            query: `${topicQueryString} AND ${tpEsQuery} AND emotion_detector:("${emotion}")`
                          }
                        },
                        {
                          range: {
                            p_created_time: {
                              gte: greaterThanTime,
                              lte: lessThanTime
                            }
                          }
                        }
                      ]
                    }
                  }
                }
              }
              const result = await elasticSearchCounts(params)
              return { emotion, count: result.count }
            })
          )

          const nonZeroEmotions = emotions.filter(e => e.count > 0)

          if (nonZeroEmotions.length > 0) {
            const tpData = await getTouchpointData(tpId)
            const tpName = tpData[0]?.tp_name

            ;(responseOutput )[tpName] = emotions.reduce((acc, e) => {
              acc[e.emotion] = e.count
              return acc
            }, {})
          }
        }
      }
      
      return res.status(200).json({ responseOutput })
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'influencersCoverage') {
    //elasticQueryTemplateRange
    if (isScadUser == 'true') {
      if (selectedTab === 'GOOGLE') {
        if (topicQueryString == '') {
          topicQueryString = `source:('"GoogleMyBusiness"')`
        } else {
          topicQueryString = topicQueryString + ` AND source:('"GoogleMyBusiness"')`
        }
      } else {
        topicQueryString = topicQueryString + ` AND source:('"Twitter" OR "Facebook" OR "Instagram"')`
      }
    }
    try {
      const normalRange = { u_followers: { gte: 0, lte: 1000 } }
      const resultNormalUser = await elasticSearchCounts(
        elasticQueryTemplateRange(topicQueryString, greaterThanTime, lessThanTime, normalRange)
      )

      const influencerRange = { u_followers: { gte: 1000 } }
      const resultInfluencer = await elasticSearchCounts(
        elasticQueryTemplateRange(topicQueryString, greaterThanTime, lessThanTime, influencerRange)
      )

      const influencersCoverage = [resultNormalUser.count, resultInfluencer.count]
            return res.status(200).json({ influencersCoverage })

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'keywordsChart') {
    try {
      if (subtopicId) {
        const responseArray = []

        let tp_names = []
        let tp_counts = []

        const all_touchpoints = await getAllTouchpoints(Number(subtopicId))

        for (let i = 0; i < all_touchpoints.length; i++) {
          const tp_id = all_touchpoints[i].cx_tp_tp_id

          // Fetch touchpoint data and elastic query
          const tp_data = await getTouchpointData(tp_id)
          const tp_es_query_string = await buildTouchPointQueryString(tp_id)

          if (isScadUser == 'true') {
            if (selectedTab === 'GOOGLE') {
              if (topicQueryString == '') {
                topicQueryString = `source:('"GoogleMyBusiness"')`
              } else {
                topicQueryString = topicQueryString + ` AND source:('"GoogleMyBusiness"')`
              }
            } else {
              topicQueryString = topicQueryString + ` AND source:('"Twitter" OR "Facebook" OR "Instagram"')`
            }
          }

          // Construct Elasticsearch query parameters
          const params = {
            body: {
              query: {
                bool: {
                  must: [
                    {
                      query_string: {
                        query: `${topicQueryString} AND ${tp_es_query_string}`
                      }
                    },
                    {
                      range: {
                        p_created_time: {
                          gte: greaterThanTime,
                          lte: lessThanTime
                        }
                      }
                    }
                  ]
                }
              }
            }
          }

          // Fetch data from Elasticsearch
          const es_data = await elasticSearchCounts(params)

          // Store touchpoint names and counts

          responseArray.push({
            key_count: es_data.count,
            keyword: tp_data[0].tp_name
          })

          responseArray.sort((a, b) => b.key_count - a.key_count)

          // }
          //   tp_names.push(tp_data[0].tp_name);
          //   tp_counts.push(tp_count);
        }

        // Return response as JSON
        return res.status(200).json({ responseArray});

      } else {
        let keyHashArray = []

        const keyHash = await prisma.customer_topics.findUnique({
          select: {
            topic_hash_tags: true,
            topic_keywords: true
          },
          where: { topic_id: topicId }
        })

        if (!keyHash) {
            
          return res.status(400).json({ error: 'keywords not found' })
        }

        const keywords = keyHash?.topic_keywords.split(',')

        if (keywords[0] !== '') {
          for (let i = 0; i < keywords.length; i++) {
            keyHashArray.push(keywords[i].trim())
          }
        }

        const hashTags = keyHash?.topic_hash_tags.split('|')

        if (hashTags[0] !== '') {
          for (let i = 0; i < hashTags.length; i++) {
            keyHashArray.push(hashTags[i].trim())
          }
        }

        const responseArray = []

        if (isScadUser == 'true') {
          if (selectedTab === 'GOOGLE') {
            if (topicQueryString == '') {
              topicQueryString = `source:('"GoogleMyBusiness"')`
            } else {
              topicQueryString = topicQueryString + ` AND source:('"GoogleMyBusiness"')`
            }
          } else {
            topicQueryString = topicQueryString + ` AND source:('"Twitter" OR "Facebook" OR "Instagram"')`
          }
        }
        keyHashArray = keyHashArray.slice(0, 10)

        for (let i = 0; i < keyHashArray.length; i++) {
          if (unTopic === true) {
            greaterThanTime = process?.env.GREATER_THEN_TIME_UNDP || ''
            lessThanTime = process?.env.LESS_THEN_TIME_UNDP || ''
            topicQueryString = `${topicQueryString} AND un_keywords:("Yes")`
          }
          const params = {
            body: {
              query: {
                bool: {
                  must: [
                    {
                      query_string: {
                        query: `${topicQueryString} AND p_message_text:("${keyHashArray[i]}")`
                      }
                    },
                    {
                      range: {
                        p_created_time: {
                          gte: greaterThanTime,
                          lte: lessThanTime
                        }
                      }
                    }
                  ]
                }
              }
            }
          }

          const results = await elasticSearchCounts(params)
          responseArray.push({
            key_count: results.count,
            keyword: keyHashArray[i],
            params
          })
        }

        responseArray.sort((a, b) => b.key_count - a.key_count)
        //console.log('dd', responseArray)
        return res.status(200).json({ responseArray,success:true })
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'keywordsSentimentChart') {
    try {
      if (subtopicId) {
        const responseArray = []

        let tp_names = []
        let tp_counts = []

        const all_touchpoints = await getAllTouchpoints(Number(subtopicId))

        for (let i = 0; i < all_touchpoints.length; i++) {
          const tp_id = all_touchpoints[i].cx_tp_tp_id

          // Fetch touchpoint data and elastic query
          const tp_data = await getTouchpointData(tp_id)
          const tp_es_query_string = await buildTouchPointQueryString(tp_id)

          if (isScadUser == 'true') {
            if (selectedTab === 'GOOGLE') {
              if (topicQueryString == '') {
                topicQueryString = `source:('"GoogleMyBusiness"')`
              } else {
                topicQueryString = topicQueryString + ` AND source:('"GoogleMyBusiness"')`
              }
            } else {
              topicQueryString =
                topicQueryString +
                ` AND source:("Twitter" OR "Youtube" OR "Linkedin" OR "FakeNews" OR "News" OR "Pinterest" OR "Reddit" OR "Tumblr" OR "Vimeo" OR "Instagram" OR "Facebook")`
            }
          }

          // Construct Elasticsearch query parameters
          const params = {
            body: {
              query: {
                bool: {
                  must: [
                    {
                      query_string: {
                        query: `${topicQueryString} AND ${tp_es_query_string}`
                      }
                    },
                    {
                      range: {
                        p_created_time: {
                          gte: greaterThanTime,
                          lte: lessThanTime
                        }
                      }
                    }
                  ]
                }
              }
            }
          }

          // Fetch data from Elasticsearch
          const es_data = await elasticSearchCounts(params)

          // Store touchpoint names and counts

          responseArray.push({
            key_count: es_data.count,
            keyword: tp_data[0].tp_name
          })

          responseArray.sort((a, b) => b.key_count - a.key_count)

          // }
          //   tp_names.push(tp_data[0].tp_name);
          //   tp_counts.push(tp_count);
        }

        // Return response as JSON
        return res.status(200).json({ responseArray })
      } else {
        let keyHashArray = []

        const keyHash = await prisma.customer_topics.findUnique({
          select: {
            topic_hash_tags: true,
            topic_keywords: true
          },
          where: { topic_id: topicId }
        })

        if (!keyHash) {
                    return res.status(400).json({ error: 'keywords not found' })

        }

        const keywords = keyHash?.topic_keywords.split(',')

        if (keywords[0] !== '') {
          for (let i = 0; i < keywords.length; i++) {
            keyHashArray.push(keywords[i].trim())
          }
        }

        const hashTags = keyHash?.topic_hash_tags.split('|')

        if (hashTags[0] !== '') {
          for (let i = 0; i < hashTags.length; i++) {
            keyHashArray.push(hashTags[i].trim())
          }
        }

        const keywordSentimentMap = {} // Map to track keyword sentiments
        if (isScadUser == 'true') {
          if (selectedTab === 'GOOGLE') {
            if (topicQueryString == '') {
              topicQueryString = `source:('"GoogleMyBusiness"')`
            } else {
              topicQueryString = topicQueryString + ` AND source:('"GoogleMyBusiness"')`
            }
          } else {
            topicQueryString =
              topicQueryString +
              ` AND source:('"Twitter" OR "Instagram" OR "Facebook" OR "Youtube" OR "LinkedIn" OR "Pinterest" OR "Reddit" OR "Vimeo" OR "News"')`
          }
        }
        keyHashArray = keyHashArray.slice(0, 10)

        for (let i = 0; i < keyHashArray.length; i++) {
          if (unTopic === 'true') {
            greaterThanTime = process?.env.GREATER_THEN_TIME_UNDP || ''
            lessThanTime = process?.env.LESS_THEN_TIME_UNDP || ''
            topicQueryString = `${topicQueryString} AND un_keywords:("Yes")`
          }
          const params = {
            query: {
              bool: {
                must: [
                  {
                    query_string: {
                      query: `${topicQueryString} AND p_message_text:("${keyHashArray[i]}")`
                    }
                  },
                  {
                    range: {
                      p_created_time: {
                        gte: greaterThanTime,
                        lte: lessThanTime
                      }
                    }
                  }
                ]
              }
            },
            aggs: {
              sentiment_group: {
                terms: { field: 'predicted_sentiment_value.keyword' }
              }
            }
          }

          const results = await client(params)
          if (!keywordSentimentMap[keyHashArray[i]]) {
            keywordSentimentMap[keyHashArray[i]] = { Positive: 0, Neutral: 0, Negative: 0 }
          }

          if (results.aggregations?.sentiment_group?.buckets) {
            results.aggregations.sentiment_group.buckets.forEach((bucket) => {
              const sentiment = bucket.key || 'Neutral' // Default to "Neutral" if no sentiment is found
              keywordSentimentMap[keyHashArray[i]][sentiment] = bucket.doc_count // Store count per sentiment
            })
          }
        }

        // Convert to desired output format
        const responseArray = Object.keys(keywordSentimentMap).map(keyword => ({
          keyword_name: keyword,
          sentiment_counts: keywordSentimentMap[keyword]
        }))
        return res.status(200).json({ responseArray })
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'totalMentions') {
    try {
      if (!prisma) {
        throw new Error('Prisma client is not initialized')
      }

      // Calculate timestamps for the last 90 days
      const now = new Date()
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(now.getDate() - 90)

      const { searchParams } = new URL(req.url)
      const userId = searchParams.get('id') ? parseInt(searchParams.get('id'), 10) : null

      // console.log({ userId })

      const greaterThanTime = ninetyDaysAgo.toISOString() // Start time (90 days ago)
      const lessThanTime = now.toISOString() // End time (now)

      // Get all active topics
      const topics = await prisma.customer_topics.findMany({
        where: {
          customer_portal: 'D24',
          topic_is_deleted: {
            not: 'Y'
          },
          topic_user_id: userId
        },
        orderBy: {
          topic_order: 'asc'
        }
      })

      if (!topics || topics.length === 0) {
                return res.status(400).json({  mentions: 0, googleReviews: 0  })

      }

      let mentionsCount = 0
      let googleReviewsCount = 0
      // Process each topic
      await Promise.all(
        topics.map(async topic => {
          try {
            // Build base topic query string
            const topicQuery = await buildQueryForAllKeywordsString(topic.topic_id, isScadUser, selectedTab)

            // Query for social media mentions
            const socialTopicQuery =
              topicQuery +
              ` source:('"Twitter" OR "Instagram" OR "Facebook" OR "Youtube" OR "LinkedIn" OR "Pinterest" OR "Reddit" OR "Vimeo" OR "News"')`
            const socialMentionsData = await elasticSearchCount(
              elasticMentionQueryTemplate(socialTopicQuery, greaterThanTime, lessThanTime)
            )
            mentionsCount += (socialMentionsData )?.count || 0

            // Query for Google My Business mentions
            const googleTopicQuery = topicQuery + ` AND source:('"GoogleMyBusiness"')`
            const googleMentionsData = await elasticSearchCount(
              elasticMentionQueryTemplate(googleTopicQuery, greaterThanTime, lessThanTime)
            )
            googleReviewsCount += (googleMentionsData )?.count || 0
          } catch (err) {
            console.error(`Error processing topic ${topic.topic_id}:`, err)
            // Continue with other topics even if one fails
          }
        })
      )

      return res.statue(200).json(
        {
          mentions: mentionsCount,
          googleReviews: googleReviewsCount
        }
      )
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'all') {
    try {
      const queryString =
        topicQueryString +
        ` AND source:('"Twitter" OR "Instagram" OR "Facebook" OR "Youtube" OR "LinkedIn" OR "Pinterest" OR "Reddit" OR "News"')`
      let aggQuery = elasticMentionQueryTemplate(queryString, greaterThanTime, lessThanTime)
      aggQuery.size = 0
      aggQuery.aggs = {
        source_counts: {
          terms: {
            field: 'source.keyword',
            size: 10
          }
        }
      }

      const count = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX, // Default index for the search query
        body: aggQuery
      })

      const buckets = count.aggregations.source_counts.buckets
      const counts = buckets.reduce((acc, bucket) => {
        acc[bucket.key] = bucket.doc_count
        return acc
      }, {})
      return res.status(200).json(
        {
          counts
        }
      )
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'dashboardsCoRelation') {
    try {
      const startDate = searchParams.get('startDate')
      const endDate = searchParams.get('endDate')

      const queryString =
        topicQueryString +
        ` AND source:('"Twitter" OR "Instagram" OR "Facebook" OR "Youtube" OR "LinkedIn" OR "Pinterest" OR "Reddit" OR "News"')`
      let aggQuery = elasticMentionQueryTemplate(queryString, startDate, endDate)
      aggQuery.size = 0
      aggQuery.aggs = {
        source_counts: {
          terms: {
            field: 'source.keyword',
            size: 10
          }
        }
      }

      const count = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX, // Default index for the search query
        body: aggQuery
      })

      const buckets = count.aggregations.source_counts.buckets
      const counts = buckets.reduce((acc, bucket) => {
        acc[bucket.key] = bucket.doc_count
        return acc
      }, {})
      return res.status(200).json(
        {
          counts
        }
      )
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else {
          return res.status(400).json({ error: "Invalid type parameter" });

  }
}, UNDP_post: async (req, res) => {
      let { greaterThanTime, lessThanTime, subtopicId, topicId:id, sentimentType,type,aidType,filters,filterData,touchId,parentAccountId,unTopic,isScadUser,selectedTab,category} = req.query;

//   const { searchParams } = new URL(req.url)



  const decodedFilterData = filterData ? decodeURIComponent(filterData):null;
  const sanitizedData =decodedFilterData==null?null:
    decodedFilterData.startsWith('"') && decodedFilterData.endsWith('"')
      ? decodedFilterData.slice(1, -1)
      : decodedFilterData
  const filtersDat = sanitizedData && JSON.parse(sanitizedData)


  if (!id) {
 return res.status(400).json({ error: "ID is required" });
  }

  const topicId = Number(id)
  if (isNaN(topicId)) {
    return res.status(400).json({ error: "Invalid ID" });
  }


  let topicQueryString = ''

  // let daysDifference = process.env.DATA_FETCH_DAYS_NUMBER
  // let greaterThanTime = process.env.DATA_FETCH_FROM_TIME
  // let lessThanTime = process.env.DATA_FETCH_TO_TIME

  let daysDifference = parseInt(process.env.DATA_FETCH_DAYS_NUMBER?.replace('d', ''))
   greaterThanTime = process.env.DATA_FETCH_FROM_TIME;
   lessThanTime = process.env.DATA_FETCH_TO_TIME;

  let incDecToDate;
  let incDecFromDate;

  topicQueryString = await buildQueryString(topicId, isScadUser, selectedTab)

  if (filtersDat && filters === 'true') {
    if (filtersDat?.timeSlot && filtersDat?.timeSlot === 'Custom Dates') {
      if (filtersDat?.startDate && filtersDat?.startDate !== '') {
        let greaterThanDate = new Date(filtersDat?.startDate)
        greaterThanTime = formatSafeDate(greaterThanDate)
      } else {
        greaterThanTime = formatSafeDate(new Date(new Date().setDate(new Date().getDate() - 90)))
      }

      if (filtersDat?.endDate && filtersDat?.endDate !== '') {
        let lessThanDate = new Date(filtersDat?.endDate)
        lessThanTime = formatSafeDate(lessThanDate)
      } else {
        lessThanTime = formatSafeDate(new Date())
      }
    } else {
      if (filtersDat?.timeSlot !== '') {
        switch (filtersDat?.timeSlot) {
          case 'today':
            greaterThanTime = formatSafeDate(new Date())
            lessThanTime = formatSafeDate(new Date())
            break
          case '24h':
            greaterThanTime = formatSafeDate(new Date(new Date().setHours(new Date().getHours() - 24)))
            lessThanTime = formatSafeDate(new Date())
            break
          default:
            greaterThanTime = formatSafeDate(
              new Date(new Date().setDate(new Date().getDate() - parseInt(filtersDat?.timeSlot)))
            )
            lessThanTime = formatSafeDate(new Date())
        }
      }
    }

    //daysDifference = dateDifference(lessThanTime, greaterThanTime)

    if (filtersDat?.tags && filtersDat?.tags !== '') {
      let tagsStr = filtersDat?.tags
      let tagsArray = tagsStr.split(',')
      let topicUrls = '',
        topicKeyHash = ''

      tagsArray.forEach((tag) => {
        if (tag) {
          if (tag.startsWith('http')) {
            topicUrls += `"${tag}" ${filtersDat?.operator} `
          } else {
            topicKeyHash += `"${tag}" ${filtersDat?.operator} `
          }
        }
      })

      if (filtersDat?.operator === 'OR') {
        topicKeyHash = topicKeyHash.slice(0, -4)
        topicUrls = topicUrls.slice(0, -4)
      } else {
        topicKeyHash = topicKeyHash.slice(0, -5)
        topicUrls = topicUrls.slice(0, -5)
      }

      if (topicKeyHash && topicUrls) {
        topicQueryString = `(p_message_text:(${topicKeyHash} OR ${topicUrls}) OR p_message:(${topicKeyHash} OR ${topicUrls}) OR keywords:(${topicKeyHash} OR ${topicUrls}) OR title:(${topicKeyHash} OR ${topicUrls}) OR hashtags:(${topicKeyHash} OR ${topicUrls}) OR u_source:(${topicKeyHash} OR ${topicUrls}) OR p_url:(${topicKeyHash} OR ${topicUrls}))`
      } else if (topicKeyHash && !topicUrls) {
        topicQueryString = `(p_message_text:(${topicKeyHash}) OR p_message:(${topicKeyHash}) OR keywords:(${topicKeyHash}) OR title:(${topicKeyHash}) OR hashtags:(${topicKeyHash}) OR u_source:(${topicKeyHash}) OR p_url:(${topicKeyHash}))`
      } else if (!topicKeyHash && topicUrls) {
        topicQueryString = `(p_message_text:(${topicUrls}) OR p_message:(${topicUrls}) OR keywords:(${topicUrls}) OR title:(${topicUrls}) OR hashtags:(${topicUrls}) OR u_source:(${topicUrls}) OR p_url:(${topicUrls}))`
      }
    }

    if (filtersDat?.sentimentType && filtersDat?.sentimentType !== 'null') {
      let sentiArray = filtersDat?.sentimentType.split(',')
      let sentiStr = sentiArray.map((s) => `"${s}"`).join(' OR ')
      topicQueryString += ` AND predicted_sentiment_value:(${sentiStr})`
    }

    if (filtersDat?.dataSource && filtersDat?.dataSource !== 'null' && filtersDat?.dataSource !== '') {
      let dsourceArray = filtersDat?.dataSource.split(',')
      let dsourceStr = dsourceArray.map((d) => `"${d}"`).join(' OR ')
      topicQueryString += ` AND source:(${dsourceStr})`
    }

    if (filtersDat?.location && filtersDat?.location !== 'null' && filtersDat?.location !== '') {
      let dlocArray = filtersDat?.location.split(',')
      let dlocStr = dlocArray.map((d) => `"${d}"`).join(' OR ')
      topicQueryString += ` AND u_country:(${dlocStr})`
    }

    if (filtersDat?.language && filtersDat?.language !== 'null' && filtersDat?.language !== '') {
      let dlangArray = filtersDat?.language.split(',')
      let dlangStr = dlangArray.map((d) => `"${d}"`).join(' OR ')
      topicQueryString += ` AND lange_detect:(${dlangStr})`
    }
  }

  let subTopicQueryString = ''
  if (subtopicId) {
    subTopicQueryString = await buildsubTopicQueryString(Number(subtopicId))
    topicQueryString += ` AND ${subTopicQueryString}`
  }

  let touchPointQueryString = ''
  if (touchId) {
    touchPointQueryString = await buildTouchPointQueryString(Number(touchId))

    topicQueryString += ` AND ${touchPointQueryString}`
  }

  if (type === 'mentions') {
    try {
      if (unTopic === 'true') {
        greaterThanTime = '2023-01-01'
        lessThanTime = '2023-04-30'
        // topicQueryString = `${topicQueryString} AND un_keywords:("Yes")`
        topicQueryString = `${topicQueryString}`
      }
      if (isScadUser == 'true') {
        if (selectedTab === 'GOOGLE') {
          if (topicQueryString == '') {
            topicQueryString = `source:('"GoogleMyBusiness"')`
          } else {
            topicQueryString = topicQueryString + ` AND source:('"GoogleMyBusiness"')`
          }
        } else {
          topicQueryString =
            topicQueryString +
            ` AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Linkedin" OR "Pinterest" OR "Reddit" OR "Web")`
        }
      }
      const esData = await elasticSearchCount(
        elasticMentionQueryTemplate(topicQueryString, greaterThanTime, lessThanTime)
      )

      // await elasticSearchCounttwo(elasticQuerys(topicQueryString, greaterThanTime, lessThanTime))

      const count = (esData)?.count

       return res.status(200).json({count});

    }catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'channelSource') {
    try {
      let responseOutput = ''
      let printMediaCount = null

      // Define sources and queries dynamically
      let sources = [
        { name: 'YouTube', query: 'source:("Youtube" OR "Vimeo")', count: 0 },
        { name: 'News', query: 'source:("FakeNews" OR "News")', count: 0 },
        { name: 'Twitter', query: 'source:("Twitter")', count: 0 },
        { name: 'Pinterest', query: 'source:("Pinterest")', count: 0 },
        { name: 'Instagram', query: 'source:("Instagram")', count: 0 },
        { name: 'Blogs', query: 'source:("Blogs")', count: 0 },
        { name: 'Reddit', query: 'source:("Reddit")', count: 0 },
        { name: 'Tumblr', query: 'source:("Tumblr")', count: 0 },
        { name: 'Facebook', query: 'source:("Facebook")', count: 0 },
        { name: 'Web', query: 'source:("Web")', count: 0 },
        { name: 'GoogleMaps', query: 'source:("GoogleMaps")', count: 0 },
        { name: 'Tripadvisor', query: 'source:("Tripadvisor")', count: 0 },
        { name: 'Linkedin', query: 'source:("Linkedin")', count: 0 },
        { name: 'Tiktok', query: 'source:("Tiktok")', count: 0 },
        { name: 'GoogleMyBusiness', query: 'source:("GoogleMyBusiness")', count: 0 }
      ]

      if (isScadUser == 'true') {
        if (selectedTab === 'GOOGLE') {
          sources = [{ name: 'GoogleMyBusiness', query: 'source:("GoogleMyBusiness")', count: 0 }]
        } else {
          sources = [
            { name: 'Twitter', query: 'source:("Twitter")', count: 0 },
            { name: 'Instagram', query: 'source:("Instagram")', count: 0 },
            { name: 'Facebook', query: 'source:("Facebook")', count: 0 },
            { name: 'Linkedin', query: 'source:("Linkedin")', count: 0 },
            { name: 'Pinterest', query: 'source:("Pinterest")', count: 0 },
            { name: 'Reddit', query: 'source:("Reddit")', count: 0 },
            { name: 'Web', query: 'source:("Web")', count: 0 },
            { name: 'Youtube', query: 'source:("Youtube")', count: 0 }
          ]
        }
      }

      // Fetch counts for each source
      await Promise.all(
        sources.map(async source => {
          const result = await elasticSearchCount(
            elasticMentionQueryTemplate(`${topicQueryString} AND ${source.query}`, greaterThanTime, lessThanTime)
          )
          source.count = result.count
        })
      )

      const blogCounts = sources.find(s => s.name === 'Blogs')?.count || 0
      const newsCounts = sources.find(s => s.name === 'News')?.count || 0
      const webCount = sources.find(s => s.name === 'Web')?.count || 0 + blogCounts + newsCounts

      const totalSourcesCount = sources.reduce((sum, source) => sum + source.count, 0)

      // Process Print Media Count
      const printMediaResponse = await elasticPrintSearchCount(
        elasticMentionQueryTemplate(
          topicQueryString.replace('p_message_text', 'p_message'),
          greaterThanTime,
          lessThanTime
        )
      )
      if (printMediaResponse?.count > 0) {
        printMediaCount = `Printmedia,${printMediaResponse.count}`
      }

      // Construct response for web sources
      if (webCount > 0) {
        responseOutput += `Web,${webCount},${((webCount / totalSourcesCount) * 100).toFixed(2)}|`
      }

      // Construct response for other sources
      responseOutput +=
        sources
          .filter(source => source.name !== 'Web' && source.count > 0)
          .map(source => `${source.name},${source.count},${((source.count / totalSourcesCount) * 100).toFixed(2)}`)
          .join('|') + '|'

      // Additional review handling
      const reviewsCustomerArray = ['292', '309', '310', '312', '412', '420']
      const reviewsTopicIdsArray = ['2325', '2388', '2391', '2401', '2416', '2443']
      const reviewsSourceArray = [
        'GooglePlayStore',
        'GoogleMyBusiness',
        'AppleAppStore',
        'HuaweiAppGallery',
        'Glassdoor',
        'Zomato',
        'Talabat'
      ]

      const customerRevElasticId = await customerReviewElasticId(parentAccountId || '')

      if (
        reviewsCustomerArray.includes((parentAccountId || '').toString()) &&
        reviewsTopicIdsArray.includes('2388') && // Example topic ID
        customerRevElasticId
      ) {
        const reviewResults = await Promise.all(
          reviewsSourceArray.map(async source => {
            if ('2388' === '2388' && source === 'GooglePlayStore') return null // Skip specific case
            const queryString = `source:("${source}") AND manual_entry_type:("review") AND review_customer:("${customerRevElasticId}")`
            try {
              const result = await elasticSearchCount(
                elasticMentionQueryTemplate(queryString, greaterThanTime, lessThanTime)
              )
              return result.count > 0 ? `${source},${result.count}` : null
            } catch (error) {
              console.error(`Error counting documents for source channel ${source}:`, error)
              return null
            }
          })
        )

        // Append review results to the response
        responseOutput += reviewResults.filter(Boolean).join('|') + '|'
      }

      const channelSourceCount = responseOutput.slice(0, -1) // Remove trailing '|'

      return res.status(200).json({ channelSourceCount, printMediaCount });

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // else if (type === 'channelSource') {
  //   try {
  //     // const topicQueryString = await buildQueryString(topicId)

  //     let responseOutput = ''
  //     let printMediaCount = null
  //     // let blogCounts = 0, newsCounts = 0, twitterCount = 0, youtubeCount = 0, linkedinCount = 0, tumblrCount = 0, facebookCount = 0, redditCount = 0, webCount = 0, pinterestCount = 0, instagramCount = 0, googlemapsCount = 0, tripadvisorCount = 0, tiktokCount = 0;

  //     const sources[] = [
  //       { name: 'YouTube', query: `${topicQueryString} AND source:("Youtube" OR "Vimeo")`, count: 0 },
  //       { name: 'News', query: `${topicQueryString} AND source:("FakeNews" OR "News")`, count: 0 },
  //       { name: 'Twitter', query: `${topicQueryString} AND source:("Twitter")`, count: 0 },
  //       { name: 'Pinterest', query: `${topicQueryString} AND source:("Pinterest")`, count: 0 },
  //       { name: 'Instagram', query: `${topicQueryString} AND source:("Instagram")`, count: 0 },
  //       { name: 'Blogs', query: `${topicQueryString} AND source:("Blogs")`, count: 0 },
  //       { name: 'Reddit', query: `${topicQueryString} AND source:("Reddit")`, count: 0 },
  //       { name: 'Tumblr', query: `${topicQueryString} AND source:("Tumblr")`, count: 0 },
  //       { name: 'Facebook', query: `${topicQueryString} AND source:("Facebook")`, count: 0 },
  //       { name: 'Web', query: `${topicQueryString} AND source:("Web")`, count: 0 },
  //       { name: 'GoogleMaps', query: `${topicQueryString} AND source:("GoogleMaps")`, count: 0 },
  //       { name: 'Tripadvisor', query: `${topicQueryString} AND source:("Tripadvisor")`, count: 0 },
  //       { name: 'Linkedin', query: `${topicQueryString} AND source:("Linkedin")`, count: 0 },
  //       { name: 'Tiktok', query: `${topicQueryString} AND source:("Tiktok")`, count: 0 }
  //     ]

  //     for (const source of sources) {
  //       const result = await elasticSearchCount(
  //         elasticMentionQueryTemplate(source.query, greaterThanTime, lessThanTime)
  //       )
  //       source.count = result.count
  //     }

  //     const blogCounts = sources.find(s => s.name === 'Blogs').count
  //     const newsCounts = sources.find(s => s.name === 'News').count
  //     const webCount = sources.find(s => s.name === 'Web').count + blogCounts + newsCounts

  //     const printmediaCount = await elasticPrintSearchCount(
  //       elasticMentionQueryTemplate(
  //         topicQueryString.replace('p_message_text', 'p_message'),
  //         greaterThanTime,
  //         lessThanTime
  //       )
  //     )
  //     if (printmediaCount > 0) {
  //       printMediaCount = `Printmedia,${printmediaCount}`
  //     }

  //     const totalSourcesCount = sources.reduce((sum, source) => sum + source.count, 0)

  //     if (webCount > 0) {
  //       responseOutput += `Web,${webCount},${((webCount / totalSourcesCount) * 100).toFixed(2)}|`
  //     }
  //     sources.forEach(source => {
  //       if (source.name !== 'Web' && source.count > 0) {
  //         responseOutput += `${source.name},${source.count},${((source.count / totalSourcesCount) * 100).toFixed(2)}|`
  //       }
  //     })

  //     const reviewsCustomerArray = ['292', '309', '310', '312', '412', '420']
  //     const reviewsTopicIdsArray = ['2325', '2388', '2391', '2401', '2416', '2443']
  //     const reviewsSourceArray = [
  //       'GooglePlayStore',
  //       'GoogleMyBusiness',
  //       'AppleAppStore',
  //       'HuaweiAppGallery',
  //       'Glassdoor',
  //       'Zomato',
  //       'Talabat'
  //     ]

  //     const parentAccId = parentAccountId || ''
  //     const loadedTopicId = 2388 // Example topic ID, replace as needed
  //     const subtopicSessionId = 1 // Example session ID, replace as needed
  //     //const section = 'sources_counts_subtopic'; // Example section, replace as needed
  //     const customerRevElasticId = await customerReviewElasticId(parentAccountId) // Replace with actual method to get customer review elastic ID

  //     if (
  //       reviewsCustomerArray.includes(parentAccId.toString()) &&
  //       reviewsTopicIdsArray.includes(loadedTopicId.toString())
  //       //  || section === 'sources_counts_subtopic'
  //     ) {
  //       if (customerRevElasticId) {
  //         let rquery = ''
  //         let proceedFurther = true

  //         // if (section === 'sources_counts_subtopic') {
  //         //     rquery = `p_message_text:(${subtopicObj.getSubtopicKeywordsEs(subtopicSessionId)}) AND `;
  //         //     if (subtopicObj.getSubtopicParent(subtopicSessionId) !== "2325") {
  //         //         proceedFurther = false;
  //         //     }
  //         // }

  //         if (proceedFurther) {
  //           reviewsSourceArray.forEach(async source => {
  //             if (loadedTopicId === 2388 && source === 'GooglePlayStore') return
  //             const query_string = `${rquery}source:("${source}") AND manual_entry_type:("review") AND review_customer:("${customerRevElasticId}")`

  //             try {
  //               const result = await elasticSearchCount(
  //                 elasticMentionQueryTemplate(query_string, greaterThanTime, lessThanTime)
  //               )
  //               const resultsCount = result.count

  //               if (resultsCount > 0) {
  //                 responseOutput += `${source},${resultsCount}|`
  //               }
  //             } catch (error) {
  //               console.error(`Error counting documents for source channels${source}:`, error)
  //             }
  //           })
  //         }
  //       }
  //     }

  //     const channelSourceCount = responseOutput.slice(0, -1)

  //     return NextResponse.json({ channelSourceCount, printMediaCount }, { status: 200 })
  //   } catch (error) {
  //     console.error('Error fetching results:', error)
  //     return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  //   }
  // }
  else if (type === 'channelSentiments') {
    try {
      let sourcesArray = [
        'Youtube',
        'Twitter',
        'Pinterest',
        'Instagram',
        'Reddit',
        'Tumblr',
        'Facebook',
        'Web',
        'Linkedin',
        'GooglePlayStore',
        'GoogleMyBusiness',
        'AppleAppStore',
        'HuaweiAppGallery',
        'Glassdoor'
      ]

      if (isScadUser == 'true') {
        if (selectedTab === 'GOOGLE') {
          sourcesArray = ['GoogleMyBusiness']
        } else {
          sourcesArray = ['Twitter', 'Instagram', 'Facebook', 'Linkedin', 'Pinterest', 'Reddit', 'Web', 'Youtube']
        }
      }

      const responseOutput = {}

      // Helper function to fetch sentiment counts
      const fetchSentiments = async (source, queryString) => {
        const queries = ['Positive', 'Negative', 'Neutral'].map(sentiment => {
          const query = `${queryString} AND source:(${source}) AND predicted_sentiment_value:("${sentiment}")`
          return elasticSearchCount(elasticMentionQueryTemplate(query, greaterThanTime, lessThanTime))
        })

        const [Positive, Negative, Neutral] = await Promise.all(queries)
        return {
          positive: Positive.count,
          negative: Negative.count,
          neutral: Neutral.count
        }
      }

      // Helper function for specific sources
      const fetchCustomSourceSentiments = async (source) => {
        const cusRevElasticId = customerReviewElasticId(parentAccountId)
        const queryTemplate = (range) => ({
          body: {
            query: {
              bool: {
                must: [
                  {
                    query_string: {
                      query: `source:("${source}") AND manual_entry_type:("review") AND review_customer:("${cusRevElasticId}")`
                    }
                  },
                  { range },
                  { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
                ]
              }
            }
          }
        })

        const [positive, negative, neutral] = await Promise.all([
          elasticSearchCount(queryTemplate({ p_likes: { gt: 3 } })),
          elasticSearchCount(queryTemplate({ p_likes: { lt: 2 } })),
          elasticSearchCount(queryTemplate({ p_likes: { gte: 2, lte: 3 } }))
        ])

        return {
          positive: positive.count,
          negative: negative.count,
          neutral: neutral.count
        }
      }

      // Process all sources
      await Promise.all(
        sourcesArray.map(async source => {
          if (topicId === 2388 && source === 'GooglePlayStore') return // Skip specific source for topicId 2388

          let sentiments
          if (
            topicId === 2325 ||
            (topicId === 2388 &&
              ['GooglePlayStore', 'GoogleMyBusiness', 'AppleAppStore', 'HuaweiAppGallery', 'Glassdoor'].includes(
                source
              ))
          ) {
            sentiments = await fetchCustomSourceSentiments(source)
          } else {
            const sourceQuery =
              source === 'Youtube'
                ? '"Youtube" OR "Vimeo"'
                : source === 'Web'
                  ? '"FakeNews" OR "News" OR "Blogs" OR "Web"'
                  : source

            sentiments = await fetchSentiments(sourceQuery, topicQueryString)
          }

          // Add non-zero sentiments to response
          if (sentiments.positive > 0 || sentiments.negative > 0 || sentiments.neutral > 0) {
            responseOutput[source] = sentiments
          }
        })
      )
      return res.status(200).json({responseOutput });

    }catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
  // else if (type === 'channelSentiments') {
  //   try {
  //     const sourcesArray = [
  //       'Youtube',
  //       'Twitter',
  //       'Pinterest',
  //       'Instagram',
  //       'Reddit',
  //       'Tumblr',
  //       'Facebook',
  //       'Web',
  //       'Linkedin',
  //       'GooglePlayStore',
  //       'GoogleMyBusiness',
  //       'AppleAppStore',
  //       'HuaweiAppGallery',
  //       'Glassdoor'
  //     ]

  //     let responseOutput = {}

  //     for (let i = 0; i < sourcesArray.length; i++) {
  //       let _sources
  //       if (sourcesArray[i] === 'Youtube') {
  //         _sources = '"Youtube" OR "Vimeo"'
  //       } else if (sourcesArray[i] === 'Web') {
  //         _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
  //       } else {
  //         _sources = sourcesArray[i]
  //       }

  //       let posSenti = 0,
  //         negSenti = 0,
  //         neuSenti = 0

  //       const posSentQuery = `${topicQueryString} AND source:(${_sources}) AND predicted_sentiment_value:("Positive")`
  //       const negSentQuery = `${topicQueryString} AND source:(${_sources}) AND predicted_sentiment_value:("Negative")`
  //       const nueSentQuery = `${topicQueryString} AND source:(${_sources}) AND predicted_sentiment_value:("Neutral")`

  //       posSenti = await elasticSearchCount(elasticMentionQueryTemplate(posSentQuery, greaterThanTime, lessThanTime))
  //       negSenti = await elasticSearchCount(elasticMentionQueryTemplate(negSentQuery, greaterThanTime, lessThanTime))
  //       neuSenti = await elasticSearchCount(elasticMentionQueryTemplate(nueSentQuery, greaterThanTime, lessThanTime))

  //       console.log(posSenti, 'posSenti')
  //       console.log(negSenti, 'negSenti')
  //       console.log(neuSenti, 'neuSenti')
  //       if (topicId === 2325 || topicId === 2388) {
  //         // Sohar international bank & gdrfa
  //         if (topicId === 2388 && sourcesArray[i] === 'GooglePlayStore') continue // Skip Google Play Store for gdrfa

  //         if (
  //           ['GooglePlayStore', 'GoogleMyBusiness', 'AppleAppStore', 'HuaweiAppGallery', 'Glassdoor'].includes(
  //             sourcesArray[i]
  //           )
  //         ) {
  //           const cusRevElasticId = customerReviewElasticId(parentAccountId)
  //           //console.log('customerReviewElasticId', cusRevElasticId)
  //           const queryTemp = (range) => ({
  //             body: {
  //               query: {
  //                 bool: {
  //                   must: [
  //                     {
  //                       query_string: {
  //                         query: `source:("${sourcesArray[i]}") AND manual_entry_type:("review") AND review_customer:("${cusRevElasticId}")`
  //                       }
  //                     },
  //                     { range: range },
  //                     { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
  //                   ]
  //                 }
  //               }
  //             }
  //           })

  //           const range1 = { p_likes: { gt: 3 } }
  //           const range2 = { p_likes: { lt: 2 } }
  //           const range3 = { p_likes: { gte: 2, lte: 3 } }
  //           posSenti = await elasticSearchCount(queryTemp(range1))
  //           negSenti = await elasticSearchCount(queryTemp(range2))
  //           neuSenti = await elasticSearchCount(queryTemp(range3))
  //         }
  //       }

  //       if (posSenti.count > 0 || negSenti.count > 0 || neuSenti.count > 0) {
  //         ;(responseOutput )[sourcesArray[i]] = {
  //           positive: posSenti.count,
  //           negative: negSenti.count,
  //           neutral: neuSenti.count
  //         }
  //       }
  //     }

  //     return NextResponse.json({ responseOutput }, { status: 200 })
  //   } catch (error) {
  //     console.error('Error fetching results:', error)
  //     return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  //   }
  // }
  // else if (type === 'typeofMentions') {
  //   try {
  //     // const sourcesArray = [
  //     //   'Youtube',
  //     //   'Twitter',
  //     //   'Pinterest',
  //     //   'Instagram',
  //     //   'Reddit',
  //     //   'Tumblr',
  //     //   'Facebook',
  //     //   'Web',
  //     //   'Linkedin',
  //     //   'GooglePlayStore',
  //     //   'GoogleMyBusiness',
  //     //   'AppleAppStore',
  //     //   'HuaweiAppGallery',
  //     //   'Glassdoor'
  //     // ]

  //     const sourcesArray2 = [
  //       'Marketing Content',
  //       // 'Customer Complaint',
  //       // 'Inquiry',
  //       'Clarification',
  //       'Praise',
  //       // 'Suggestion',
  //       'Product Feedback',
  //       'Energy Sector News',
  //       'Customer Inquiry',
  //       'Complaint',
  //       'Service Feedback',
  //        'Suggestions',
  //       'Other',
  //     ]

  //     let responseOutput = {}

  //     for (let i = 0; i < sourcesArray2.length; i++) {
  //       // let _sources
  //       // if (sourcesArray[i] === 'Youtube') {
  //       //   _sources = '"Youtube" OR "Vimeo"'
  //       // } else if (sourcesArray[i] === 'Web') {
  //       //   _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
  //       // } else {
  //       //   _sources = sourcesArray[i]
  //       // }

  //       let twitterContent = 0,
  //         facebookContent = 0,
  //         instagramContent = 0
  //       // Clarification = 0,
  //       // Praise = 0,
  //       // Suggestion = 0,
  //       // ProductFeedback = 0,
  //       // Other = 0

  //       const twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND llm_mention_type:("${sourcesArray2[i]}")`
  //       const facebookComplaintQuery = `${topicQueryString} AND source:("Facebook") AND llm_mention_type:("${sourcesArray2[i]}")`
  //       const instagramQuery = `${topicQueryString} AND source:("Instagram") AND llm_mention_type:("${sourcesArray2[i]}")`
  //       // const ClarificationQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_type:("Clarification")`
  //       // const PraiseQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_type:("Praise")`
  //       // const SuggestionQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_type:("Suggestion")`
  //       // const ProductFeedbackQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_type:("ProductFeedback")`
  //       // const OtherQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_type:("Other")`

  //       twitterContent = await elasticSearchCount(
  //         elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
  //       )
  //       facebookContent = await elasticSearchCount(
  //         elasticMentionQueryTemplate(facebookComplaintQuery, greaterThanTime, lessThanTime)
  //       )
  //       instagramContent = await elasticSearchCount(
  //         elasticMentionQueryTemplate(instagramQuery, greaterThanTime, lessThanTime)
  //       )
  //       // Clarification = await elasticSearchCount(
  //       //   elasticMentionQueryTemplate(ClarificationQuery, greaterThanTime, lessThanTime)
  //       // )
  //       // Praise = await elasticSearchCount(elasticMentionQueryTemplate(PraiseQuery, greaterThanTime, lessThanTime))
  //       // Suggestion = await elasticSearchCount(
  //       //   elasticMentionQueryTemplate(SuggestionQuery, greaterThanTime, lessThanTime)
  //       // )
  //       // ProductFeedback = await elasticSearchCount(
  //       //   elasticMentionQueryTemplate(ProductFeedbackQuery, greaterThanTime, lessThanTime)
  //       // )
  //       // Other = await elasticSearchCount(elasticMentionQueryTemplate(OtherQuery, greaterThanTime, lessThanTime))

  //       // if (topicId === 2325 || topicId === 2388) {
  //       //   // Sohar international bank & gdrfa
  //       //   if (topicId === 2388 && sourcesArray[i] === 'GooglePlayStore') continue // Skip Google Play Store for gdrfa

  //       //   if (
  //       //     ['GooglePlayStore', 'GoogleMyBusiness', 'AppleAppStore', 'HuaweiAppGallery', 'Glassdoor'].includes(
  //       //       sourcesArray[i]
  //       //     )
  //       //   ) {
  //       //     const cusRevElasticId = customerReviewElasticId(parentAccountId)
  //       //     //console.log('customerReviewElasticId', cusRevElasticId)
  //       //     const queryTemp = (range) => ({
  //       //       body: {
  //       //         query: {
  //       //           bool: {
  //       //             must: [
  //       //               {
  //       //                 query_string: {
  //       //                   query: `source:("${sourcesArray[i]}") AND manual_entry_type:("review") AND review_customer:("${cusRevElasticId}")`
  //       //                 }
  //       //               },
  //       //               { range: range },
  //       //               { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
  //       //             ]
  //       //           }
  //       //         }
  //       //       }
  //       //     })

  //       //     const range1 = { p_likes: { gt: 3 } }
  //       //     const range2 = { p_likes: { lt: 2 } }
  //       //     const range3 = { p_likes: { gte: 2, lte: 3 } }
  //       //     posSenti = await elasticSearchCount(queryTemp(range1))
  //       //     negSenti = await elasticSearchCount(queryTemp(range2))
  //       //     neuSenti = await elasticSearchCount(queryTemp(range3))
  //       //   }
  //       // }

  //       if (
  //         twitterContent.count > 0 ||
  //         facebookContent.count > 0 ||
  //         instagramContent.count > 0
  //         //||
  //         // Clarification.count > 0 ||
  //         // Praise.count > 0 ||
  //         // Suggestion.count > 0 ||
  //         // ProductFeedback.count > 0 ||
  //         // Other.count > 0
  //       ) {
  //         ;(responseOutput )[sourcesArray2[i]] = {
  //           twitterContent: twitterContent?.count,
  //           facebookContent: facebookContent?.count,
  //           instagramContent: instagramContent?.count
  //           // Clarification: Clarification?.count,
  //           // Praise: Praise?.count,
  //           // Suggestion: Suggestion?.count,
  //           // ProductFeedback: ProductFeedback?.count,
  //           // Other: Other?.count
  //         }
  //       }
  //     }

  //     //console.log('data', responseOutput)

  //     return NextResponse.json({ responseOutput }, { status: 200 })
  //   } catch (error) {
  //     console.error('Error fetching results:', error)
  //     return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  //   }
  // }
  else if (type === 'typeofMentions') {
    try {
      const sourcesArray2 = [
        'Marketing Content',
        // 'Customer Complaint',
        // 'Inquiry',
        'Clarification',
        'Praise',
        // 'Suggestion',
        'Product Feedback',
        'Energy Sector News',
        'Customer Inquiry',
        'Complaint',
        'Service Feedback',
        'Suggestions',
        'Other'
      ]

      // Function to generate queries
      const createQuery = (source, mentionType) =>
        `${topicQueryString} AND source:("${source}") AND llm_mention_type:("${mentionType}")`

      // Map to hold results
      const responseOutput = {}

      // Perform all queries concurrently
      const queryPromises = sourcesArray2.map(async mentionType => {
        const [twitterContent, facebookContent, instagramContent] = await Promise.all([
          elasticSearchCount(
            elasticMentionQueryTemplate(createQuery('Twitter', mentionType), greaterThanTime, lessThanTime)
          ),
          elasticSearchCount(
            elasticMentionQueryTemplate(createQuery('Facebook', mentionType), greaterThanTime, lessThanTime)
          ),
          elasticSearchCount(
            elasticMentionQueryTemplate(createQuery('Instagram', mentionType), greaterThanTime, lessThanTime)
          )
        ])

        if (twitterContent?.count > 0 || facebookContent?.count > 0 || instagramContent?.count > 0) {
          responseOutput[mentionType] = {
            twitterContent: twitterContent?.count || 0,
            facebookContent: facebookContent?.count || 0,
            instagramContent: instagramContent?.count || 0
          }
        }
      })

      // Wait for all queries to complete
      await Promise.all(queryPromises)

      // Return the final response\
      return res.status(200).json({ responseOutput });

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'categoryMentions') {
    try {
      const sourcesArray = [
        'Business & Retail',
        'Finance',
        'Technology',
        'Healthcare',
        'Energy & Automotive',
        'Fashion',
        'Food & Beverage',
        'Travel & Tourism',
        'Entertainment & News',
        'Other'
      ]

      let responseOutput = {}

      for (let i = 0; i < sourcesArray.length; i++) {
        // let _sources
        // if (sourcesArray[i] === 'Youtube') {
        //   _sources = '"Youtube" OR "Vimeo"'
        // } else if (sourcesArray[i] === 'Web') {
        //   _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
        // } else {
        //   _sources = sourcesArray[i]
        // }

        let twitterContent = 0,
          facebookContent = 0,
          instagramContent = 0
        let twitterContentQuery, facebookContentQuery, instagramContentQuery
        // Healthcare = 0,
        // EnergyAutomotive = 0,
        // Fashion = 0,
        // FoodBeverage = 0,
        // TravelTourism = 0,
        // EntertainmentNews = 0,
        // Other = 0

        if (sourcesArray[i] === 'Business & Retail') {
          twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND predicted_category:("Business") OR predicted_category:("Retail")`
          facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND predicted_category:("Business") OR predicted_category:("Retail")`
          instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND predicted_category:("Business") OR predicted_category:("Retail")`
        } else if (sourcesArray[i] === 'Energy & Automotive') {
          twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND predicted_category:("Energy/Utilities") OR predicted_category:("Transportation") OR predicted_category:("Utilities") OR predicted_category:("Energy & Utilities") OR predicted_category:("Energy/Electricity")`
          facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND predicted_category:("Energy/Utilities") OR predicted_category:("Transportation") OR predicted_category:("Utilities") OR predicted_category:("Energy & Utilities") OR predicted_category:("Energy/Electricity")`
          instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND predicted_category:("Energy/Utilities") OR predicted_category:("Transportation") OR predicted_category:("Utilities") OR predicted_category:("Energy & Utilities") OR predicted_category:("Energy/Electricity")`
        } else if (sourcesArray[i] === 'Food & Beverage') {
          twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND predicted_category:("Food & Beverage") OR predicted_category:("Bevarage")OR predicted_category:("Food")OR predicted_category:("Bevarages") OR predicted_category:("Food/Bevarage") OR predicted_category:("Food/Bevarages") OR predicted_category:("Food & Bevarages")`
          facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND predicted_category:("Food & Beverage") OR predicted_category:("Bevarage")OR predicted_category:("Food")OR predicted_category:("Bevarages") OR predicted_category:("Food/Bevarage") OR predicted_category:("Food/Bevarages") OR predicted_category:("Food & Bevarages")`
          instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND predicted_category:("Food & Beverage") OR predicted_category:("Bevarage")OR predicted_category:("Food")OR predicted_category:("Bevarages") OR predicted_category:("Food/Bevarage") OR predicted_category:("Food/Bevarages") OR predicted_category:("Food & Bevarages")`
        } else if (sourcesArray[i] === 'Travel & Tourism') {
          twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND predicted_category:("Travel & Tourism") OR predicted_category:("Travel/Tourism") OR predicted_category:("Travel") OR predicted_category:("Tourism")`
          facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND predicted_category:("Travel & Tourism") OR predicted_category:("Travel/Tourism") OR predicted_category:("Travel") OR predicted_category:("Tourism")`
          instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND predicted_category:("Travel & Tourism") OR predicted_category:("Travel/Tourism") OR predicted_category:("Travel") OR predicted_category:("Tourism")`
        } else if (sourcesArray[i] === 'Entertainment & News') {
          twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND predicted_category:("Entertainment") OR predicted_category:("News") OR predicted_category:("Entertainment & News")`
          facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND predicted_category:("Entertainment") OR predicted_category:("News") OR predicted_category:("Entertainment & News")`
          instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND predicted_category:("Entertainment") OR predicted_category:("News") OR predicted_category:("Entertainment & News")`
        } else if (sourcesArray[i] === 'Other') {
          twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND predicted_category:("Other") OR predicted_category:("")`
          facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND predicted_category:("Other") OR predicted_category:("")`
          instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND predicted_category:("Other") OR predicted_category:("")`
        } else {
          twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND predicted_category:("${sourcesArray[i]}")`
          facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND predicted_category:("${sourcesArray[i]}")`
          instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND predicted_category:("${sourcesArray[i]}")`
        }
        // const HealthcareQuery = `${topicQueryString} AND source:(${_sources}) AND predicted_category:("Healthcare")`
        // const EnergyAutomotiveQuery = `${topicQueryString} AND source:(${_sources}) AND predicted_category:("Energy/Utilities") OR predicted_category:("Transportation") OR predicted_category:("Utilities") OR predicted_category:("Energy & Utilities") OR predicted_category:("Energy/Electricity")`
        // const FashionQuery = `${topicQueryString} AND source:(${_sources}) AND predicted_category:("Fashion")`
        // const FoodBeverageQuery = `${topicQueryString} AND source:(${_sources})  AND predicted_category:("Food & Beverage") OR predicted_category:("Bevarage")OR predicted_category:("Food")OR predicted_category:("Bevarages") OR predicted_category:("Food/Bevarage") OR predicted_category:("Food/Bevarages") OR predicted_category:("Food & Bevarages")`
        // const TravelTourismQuery = `${topicQueryString} AND source:(${_sources}) AND predicted_category:("Travel & Tourism") OR predicted_category:("Travel/Tourism") OR predicted_category:("Travel") OR predicted_category:("Tourism")`
        // const EntertainmentNewsQuery = `${topicQueryString} AND source:(${_sources}) AND predicted_category:("Entertainment") OR predicted_category:("News") OR predicted_category:("Entertainment & News")`
        // const OtherQuery = `${topicQueryString} AND source:(${_sources}) AND predicted_category:("Other") OR predicted_category:("")`

        twitterContent = await elasticSearchCount(
          elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
        )
        facebookContent = await elasticSearchCount(
          elasticMentionQueryTemplate(facebookContentQuery, greaterThanTime, lessThanTime)
        )
        instagramContent = await elasticSearchCount(
          elasticMentionQueryTemplate(instagramContentQuery, greaterThanTime, lessThanTime)
        )

        if (
          twitterContent.count > 0 ||
          facebookContent.count > 0 ||
          instagramContent.count > 0
          //||
          // Clarification.count > 0 ||
          // Praise.count > 0 ||
          // Suggestion.count > 0 ||
          // ProductFeedback.count > 0 ||
          // Other.count > 0
        ) {
          ;(responseOutput )[sourcesArray[i]] = {
            twitterContent: twitterContent?.count,
            facebookContent: facebookContent?.count,
            instagramContent: instagramContent?.count
            // Clarification: Clarification?.count,
            // Praise: Praise?.count,
            // Suggestion: Suggestion?.count,
            // ProductFeedback: ProductFeedback?.count,
            // Other: Other?.count
          }
        }
      }

      //console.log('data', responseOutput)
return res.status(200).json({ responseOutput});

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
  //  else if (type === 'touchpointReference') {
  //   try {
  //     const sourcesArray = [
  //       'Physical Branches and ATMs',
  //       'Digital Channels',
  //       'Customer Service Centers',
  //       'Financial Advisors',
  //       'Marketing Channels',
  //       'Community Initiatives',
  //       'Partner Networks',
  //       'Self-Service Portals',
  //       'Other'
  //     ]
  //     // const sourcesArray = [
  //     //   'Mobile App',
  //     //   'Physical Branch',
  //     //   'Website',
  //     //   'Customer Service',
  //     //   'Social Media',
  //     //   'E-commerce Platform',
  //     //   'Loyalty Program',
  //     //   'Product Packaging',
  //     //   'Digital Access',
  //     //   'Customer Support',
  //     //   'Automated Assistance',
  //     //   'Energy Management Services',
  //     //   'In-Person Services',
  //     //   'Incident and Service Reporting',
  //     //   'Digital Channels',
  //     //   'Physical Channels',
  //     //   'Customer Support',
  //     //   'Social and Engagement Channels',
  //     //   'Messaging and Alerts',
  //     //   'Loyalty and Rewards',
  //     //   'Other'
  //     // ]

  //     let responseOutput = {}

  //     for (let i = 0; i < sourcesArray.length; i++) {
  //       //   let _sources
  //       //   if (sourcesArray[i] === 'Youtube') {
  //       //     _sources = '"Youtube" OR "Vimeo"'
  //       //   } else if (sourcesArray[i] === 'Web') {
  //       //     _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
  //       //   } else {
  //       //     _sources = sourcesArray[i]
  //       //   }

  //       let MarketingContent = 0,
  //         CustomerComplaint = 0,
  //         Inquiry = 0,
  //         Clarification = 0,
  //         Praise = 0,
  //         Suggestion = 0,
  //         ProductFeedback = 0,
  //         Other = 0
  //       // CustomerService = 0,
  //       // SocialMedia = 0,
  //       // EcommercePlatform = 0,
  //       // LoyaltyProgram = 0,
  //       // ProductPackaging = 0,
  //       // Other = 0

  //       const MarketingContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Marketing Content")`
  //       const CustomerComplaintQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Customer Complaint")`
  //       const InquiryQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Inquiry")`
  //       const ClarificationQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Clarification")`
  //       const PraiseQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Praise")`
  //       const SuggestionQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Suggestion")`
  //       const ProductFeedbackQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Product Feedback")`

  //       const OtherQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Other")`

  //       // const WebsiteQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_touchpoint:("Website")`
  //       // const CustomerServiceQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_touchpoint:("Customer Service")`
  //       // const SocialMediaQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_touchpoint:("Social Media") `
  //       // const EcommercePlatformQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_touchpoint:("E-commerce Platform")`
  //       // const LoyaltyProgramQuery = `${topicQueryString} AND source:(${_sources})  AND llm_mention_touchpoint:("Loyalty Program")`
  //       // const ProductPackagingQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_touchpoint:("Product Packaging")`
  //       // const OtherQuery = `${topicQueryString} AND source:(${_sources}) AND llm_mention_touchpoint:("Other") OR llm_mention_touchpoint:('')`

  //       MarketingContent = await elasticSearchCount(
  //         elasticMentionQueryTemplate(MarketingContentQuery, greaterThanTime, lessThanTime)
  //       )
  //       CustomerComplaint = await elasticSearchCount(
  //         elasticMentionQueryTemplate(CustomerComplaintQuery, greaterThanTime, lessThanTime)
  //       )
  //       Inquiry = await elasticSearchCount(elasticMentionQueryTemplate(InquiryQuery, greaterThanTime, lessThanTime))
  //       Clarification = await elasticSearchCount(
  //         elasticMentionQueryTemplate(ClarificationQuery, greaterThanTime, lessThanTime)
  //       )
  //       Praise = await elasticSearchCount(elasticMentionQueryTemplate(PraiseQuery, greaterThanTime, lessThanTime))
  //       Suggestion = await elasticSearchCount(
  //         elasticMentionQueryTemplate(SuggestionQuery, greaterThanTime, lessThanTime)
  //       )
  //       ProductFeedback = await elasticSearchCount(
  //         elasticMentionQueryTemplate(ProductFeedbackQuery, greaterThanTime, lessThanTime)
  //       )

  //       Other = await elasticSearchCount(elasticMentionQueryTemplate(OtherQuery, greaterThanTime, lessThanTime))

  //       if (
  //         MarketingContent?.count > 0 ||
  //         CustomerComplaint?.count > 0 ||
  //         Inquiry?.count > 0 ||
  //         Clarification?.count > 0 ||
  //         Praise?.count > 0 ||
  //         Suggestion?.count > 0 ||
  //         ProductFeedback?.count > 0 ||
  //         Other?.count > 0
  //       ) {
  //         ;(responseOutput )[sourcesArray[i]] = {
  //           MarketingContent: MarketingContent?.count,
  //           CustomerComplaint: CustomerComplaint?.count,
  //           Inquiry: Inquiry?.count,
  //           Clarification: Clarification?.count,
  //           Praise: Praise?.count,
  //           Suggestion: Suggestion?.count,
  //           ProductFeedback: ProductFeedback?.count,
  //           Other: Other?.count
  //         }
  //       }
  //     }

  //     // console.log('data', responseOutput)

  //     return NextResponse.json({ responseOutput }, { status: 200 })
  //   } catch (error) {
  //     console.error('Error fetching results:', error)
  //     return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  //   }
  // }
  //  else if (type === 'touchpointReference') {
  //   try {
  //     const sourcesArray = [
  //       'Physical Branches and ATMs',
  //       'Digital Channels',
  //       'Customer Service Centers',
  //       'Financial Advisors',
  //       'Marketing Channels',
  //       'Community Initiatives',
  //       'Partner Networks',
  //       'Self-Service Portals',
  //       'Other'
  //     ]
  //     let responseOutput = {}
  //     for (let i = 0; i < sourcesArray.length; i++) {

  //        let MarketingContent = 0,
  //         CustomerComplaint = 0,
  //         Inquiry = 0,
  //         Clarification = 0,
  //         Praise = 0,
  //         Suggestion = 0,
  //         ProductFeedback = 0,
  //         Other = 0

  //       const MarketingContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Marketing Content")`
  //       const CustomerComplaintQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Customer Complaint")`
  //       const InquiryQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Inquiry")`
  //       const ClarificationQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Clarification")`
  //       const PraiseQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Praise")`
  //       const SuggestionQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Suggestion")`
  //       const ProductFeedbackQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Product Feedback")`

  //       const OtherQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${sourcesArray[i]}") AND llm_mention_type:("Other")`

  //       MarketingContent = await elasticSearchCount(
  //         elasticMentionQueryTemplate(MarketingContentQuery, greaterThanTime, lessThanTime)
  //       )
  //       CustomerComplaint = await elasticSearchCount(
  //         elasticMentionQueryTemplate(CustomerComplaintQuery, greaterThanTime, lessThanTime)
  //       )
  //       Inquiry = await elasticSearchCount(elasticMentionQueryTemplate(InquiryQuery, greaterThanTime, lessThanTime))
  //       Clarification = await elasticSearchCount(
  //         elasticMentionQueryTemplate(ClarificationQuery, greaterThanTime, lessThanTime)
  //       )
  //       Praise = await elasticSearchCount(elasticMentionQueryTemplate(PraiseQuery, greaterThanTime, lessThanTime))
  //       Suggestion = await elasticSearchCount(
  //         elasticMentionQueryTemplate(SuggestionQuery, greaterThanTime, lessThanTime)
  //       )
  //       ProductFeedback = await elasticSearchCount(
  //         elasticMentionQueryTemplate(ProductFeedbackQuery, greaterThanTime, lessThanTime)
  //       )

  //       Other = await elasticSearchCount(elasticMentionQueryTemplate(OtherQuery, greaterThanTime, lessThanTime))

  //       if (
  //         MarketingContent?.count > 0 ||
  //         CustomerComplaint?.count > 0 ||
  //         Inquiry?.count > 0 ||
  //         Clarification?.count > 0 ||
  //         Praise?.count > 0 ||
  //         Suggestion?.count > 0 ||
  //         ProductFeedback?.count > 0 ||
  //         Other?.count > 0
  //       ) {
  //         ;(responseOutput )[sourcesArray[i]] = {
  //           MarketingContent: MarketingContent?.count,
  //           CustomerComplaint: CustomerComplaint?.count,
  //           Inquiry: Inquiry?.count,
  //           Clarification: Clarification?.count,
  //           Praise: Praise?.count,
  //           Suggestion: Suggestion?.count,
  //           ProductFeedback: ProductFeedback?.count,
  //           Other: Other?.count
  //         }
  //       }
  //     }

  //     // console.log('data', responseOutput)

  //     return NextResponse.json({ responseOutput }, { status: 200 })
  //   } catch (error) {
  //     console.error('Error fetching results:', error)
  //     return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  //   }
  // }
  // else if (type === 'touchpointReference') {
  //   try {
  //     const sourcesArray = [
  //       'Physical Branches and ATMs',
  //       'Digital Channels',
  //       'Customer Service Centers',
  //       'Financial Advisors',
  //       'Marketing Channels',
  //       'Community Initiatives',
  //       'Partner Networks',
  //       'Self-Service Portals',
  //       'Other'
  //     ]

  //     const mentionTypes = [
  //       'Marketing Content',
  //       'Customer Complaint',
  //       'Inquiry',
  //       'Clarification',
  //       'Praise',
  //       'Suggestion',
  //       'Product Feedback',
  //       'Other'
  //     ]

  //     let responseOutput = {}

  //     // Prepare all queries to execute in parallel
  //     const allQueries = []

  //     for (const touchpoint of sourcesArray) {
  //       const mentionCounts = {}
  //       for (const mentionType of mentionTypes) {
  //         const query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${touchpoint}") AND llm_mention_type:("${mentionType}")`

  //         // Push the promise for execution
  //         allQueries.push(
  //           elasticSearchCount(elasticMentionQueryTemplate(query, greaterThanTime, lessThanTime))
  //             .then(result => {
  //               mentionCounts[mentionType] = result?.count || 0
  //             })
  //             .catch(error => {
  //               console.error(`Error fetching ${mentionType} for ${touchpoint}:`, error)
  //               mentionCounts[mentionType] = 0 // Default to 0 on error
  //             })
  //         )
  //       }

  //       // Push touchpoint data into responseOutput after all queries for it resolve
  //       allQueries.push(
  //         Promise.all(allQueries).then(() => {
  //           if (Object.values(mentionCounts).some(count => count > 0)) {
  //             responseOutput[touchpoint] = mentionCounts
  //           }
  //         })
  //       )
  //     }

  //     // Wait for all queries to resolve
  //     await Promise.all(allQueries)

  //     // Return the final response
  //     return NextResponse.json({ responseOutput }, { status: 200 })
  //   } catch (error) {
  //     console.error('Error fetching results:', error)
  //     return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  //   }
  // }
  // else if (type === 'touchpointReference') {
  //   try {
  //     const sourcesArray = [
  //       'Physical Branches and ATMs',
  //       'Digital Channels',
  //       'Customer Service Centers',
  //       'Financial Advisors',
  //       'Marketing Channels',
  //       'Community Initiatives',
  //       'Partner Networks',
  //       'Self-Service Portals',
  //       'Other'
  //     ]

  //     const mentionTypes = [
  //       'Marketing Content',
  //       'Customer Complaint',
  //       'Inquiry',
  //       'Clarification',
  //       'Praise',
  //       'Suggestion',
  //       'Product Feedback',
  //       'Other'
  //     ]

  //     let responseOutput = {}

  //     // Prepare all queries to execute in parallel
  //     const allQueries = []

  //     for (const touchpoint of sourcesArray) {
  //       const mentionCounts = {}

  //       // Create queries for each mention type and touchpoint
  //       for (const mentionType of mentionTypes) {
  //         const query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${touchpoint}") AND llm_mention_type:("${mentionType}")`

  //         // Push the promise for execution
  //         allQueries.push(
  //           elasticSearchCount(elasticMentionQueryTemplates(query, greaterThanTime, lessThanTime))
  //             .then(result => {
  //               mentionCounts[mentionType] = result?.count || 0
  //             })
  //             .catch(error => {
  //               console.error(`Error fetching ${mentionType} for ${touchpoint}:`, error)
  //               mentionCounts[mentionType] = 0 // Default to 0 on error
  //             })
  //         )
  //       }

  //       // Push touchpoint data into responseOutput after all queries for it resolve
  //       allQueries.push(
  //         Promise.all(allQueries).then(() => {
  //           if (
  //             mentionCounts['Marketing Content'] > 0 ||
  //             mentionCounts['Customer Complaint'] > 0 ||
  //             mentionCounts['Inquiry'] > 0 ||
  //             mentionCounts['Clarification'] > 0 ||
  //             mentionCounts['Praise'] > 0 ||
  //             mentionCounts['Suggestion'] > 0 ||
  //             mentionCounts['Product Feedback'] > 0 ||
  //             mentionCounts['Other'] > 0
  //           ) {
  //             responseOutput[touchpoint] = {
  //               MarketingContent: mentionCounts['Marketing Content'],
  //               CustomerComplaint: mentionCounts['Customer Complaint'],
  //               Inquiry: mentionCounts['Inquiry'],
  //               Clarification: mentionCounts['Clarification'],
  //               Praise: mentionCounts['Praise'],
  //               Suggestion: mentionCounts['Suggestion'],
  //               ProductFeedback: mentionCounts['Product Feedback'],
  //               Other: mentionCounts['Other']
  //             }
  //           }
  //         })
  //       )
  //     }

  //     // Wait for all queries to resolve
  //     await Promise.all(allQueries)

  //     // Return the final response
  //     return NextResponse.json({ responseOutput }, { status: 200 })
  //   } catch (error) {
  //     console.error('Error fetching results:', error)
  //     return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  //   }
  // }
  // else if (type === 'touchpointReference') {
  //   try {
  //     const sourcesArray = [
  //       'Physical Branches and ATMs',
  //       'Digital Channels',
  //       'Customer Service Centers',
  //       'Financial Advisors',
  //       'Marketing Channels',
  //       'Community Initiatives',
  //       'Partner Networks',
  //       'Self-Service Portals',
  //       'Other'
  //     ];

  //     const mentionTypes = [
  //       'Marketing Content',
  //       'Customer Complaint',
  //       'Inquiry',
  //       'Clarification',
  //       'Praise',
  //       'Suggestion',
  //       'Product Feedback',
  //       'Other'
  //     ];

  //     let responseOutput = {};

  //     // Create queries for each touchpoint
  //     const touchpointQueries = sourcesArray.map(async (touchpoint) => {
  //       const mentionCounts = {};

  //       // Execute queries for each mention type in parallel
  //       await Promise.all(
  //         mentionTypes.map(async (mentionType) => {
  //           const query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${touchpoint}") AND llm_mention_type:("${mentionType}")`;

  //           try {
  //             const result = await elasticSearchCount(elasticMentionQueryTemplates(query, greaterThanTime, lessThanTime));
  //             mentionCounts[mentionType] = result?.count || 0;
  //           } catch (error) {
  //             console.error(`Error fetching ${mentionType} for ${touchpoint}:`, error);
  //             mentionCounts[mentionType] = 0; // Default to 0 on error
  //           }
  //         })
  //       );

  //       // Add touchpoint data to responseOutput if there are non-zero counts
  //       if (Object.values(mentionCounts).some((count) => count > 0)) {
  //         responseOutput[touchpoint] = {
  //           MarketingContent: mentionCounts['Marketing Content'],
  //           CustomerComplaint: mentionCounts['Customer Complaint'],
  //           Inquiry: mentionCounts['Inquiry'],
  //           Clarification: mentionCounts['Clarification'],
  //           Praise: mentionCounts['Praise'],
  //           Suggestion: mentionCounts['Suggestion'],
  //           ProductFeedback: mentionCounts['Product Feedback'],
  //           Other: mentionCounts['Other']
  //         };
  //       }
  //     });

  //     // Wait for all touchpoint queries to resolve
  //     await Promise.all(touchpointQueries);

  //     // Return the final response
  //     return NextResponse.json({ responseOutput }, { status: 200 });
  //   } catch (error) {
  //     console.error('Error fetching results:', error);
  //     return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  //   }
  // }
  else if (type === 'touchpointReference') {
    try {
      const sourcesArray = [
        'Physical Branches and ATMs',
        'Digital Channels',
        'Customer Service Centers',
        'Financial Advisors',
        'Marketing Channels',
        'Community Initiatives',
        'Partner Networks',
        'Self-Service Portals',
        'Other'
      ]

      const mentionTypes = [
        'Marketing Content',
        'Customer Complaint',
        'Inquiry',
        'Clarification',
        'Praise',
        'Suggestion',
        'Product Feedback',
        'Other'
      ]

      let responseOutput = {}

      // Iterate over each touchpoint
      for (const touchpoint of sourcesArray) {
        const mentionCounts = {}

        // Create and execute all queries for the current touchpoint in parallel
        const queryPromises = mentionTypes.map(async mentionType => {
          const query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_touchpoint:("${touchpoint}") AND llm_mention_type:("${mentionType}")`

          try {
            const result = await elasticSearchCount(elasticMentionQueryTemplates(query, greaterThanTime, lessThanTime))
            mentionCounts[mentionType] = result?.count || 0
          } catch (error) {
            console.error(`Error fetching ${mentionType} for ${touchpoint}:`, error)
            mentionCounts[mentionType] = 0 // Default to 0 on error
          }
          
        })

        // Wait for all mention queries of the current touchpoint to resolve
        await Promise.all(queryPromises)

        // Only add touchpoint data if any mention type has a non-zero count
        if (Object.values(mentionCounts).some(count => count > 0)) {
          responseOutput[touchpoint] = {
            MarketingContent: mentionCounts['Marketing Content'],
            CustomerComplaint: mentionCounts['Customer Complaint'],
            Inquiry: mentionCounts['Inquiry'],
            Clarification: mentionCounts['Clarification'],
            Praise: mentionCounts['Praise'],
            Suggestion: mentionCounts['Suggestion'],
            ProductFeedback: mentionCounts['Product Feedback'],
            Other: mentionCounts['Other']
          }
        }
      }

      // Return the final response
return res.status(200).json({ responseOutput});
    }catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // else if (type === 'urgencyMentions') {
  //   try {
  //     let high = 0,
  //       medium = 0,
  //       low = 0

  //     const highQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"')  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback" OR  "Energy Sector News" OR  "Customer Inquiry" OR  "Complaint" OR  "Clarification" OR "Service Feedback" OR  "Suggestions" ') AND llm_mention_urgency:("High")`
  //     const mediumQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"')  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"  OR  "Energy Sector News" OR  "Customer Inquiry" OR  "Complaint" OR  "Clarification" OR "Service Feedback" OR  "Suggestions"') AND llm_mention_urgency:("Medium")`
  //     const lowQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"')  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback" OR  "Energy Sector News" OR  "Customer Inquiry" OR  "Complaint" OR  "Clarification" OR "Service Feedback" OR  "Suggestions"') AND llm_mention_urgency:("Low")`

  //     high = await elasticSearchCount(elasticMentionQueryTemplate(highQuery, greaterThanTime, lessThanTime))
  //     medium = await elasticSearchCount(elasticMentionQueryTemplate(mediumQuery, greaterThanTime, lessThanTime))
  //     low = await elasticSearchCount(elasticMentionQueryTemplate(lowQuery, greaterThanTime, lessThanTime))

  //     const totalSentiments = high?.count + medium?.count + low?.count

  //     const responseOutput = `High,${high?.count}|Medium,${medium?.count}|Low,${low?.count}`

  //     return NextResponse.json({ responseOutput, totalSentiments }, { status: 200 })
  //   } catch (error) {
  //     console.error('Error fetching results:', error)
  //     return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  //   }
  // }
  else if (type === 'urgencyMentions') {
    try {
      // Initialize counts
      let high = 0,
        medium = 0,
        low = 0

      // Define the base query for all mentions
      let baseQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram" OR "GoogleMyBusiness"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback" OR "Energy Sector News" OR "Customer Inquiry" OR "Complaint" OR "Clarification" OR "Service Feedback" OR "Suggestions"')`
      if (isScadUser == 'true') {
        if (selectedTab === 'GOOGLE') {
          if (topicQueryString == '') {
            baseQuery = `source:('"GoogleMyBusiness"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback" OR "Energy Sector News" OR "Customer Inquiry" OR "Complaint" OR "Clarification" OR "Service Feedback" OR "Suggestions"')`
          } else {
            baseQuery = `${topicQueryString} AND source:('"GoogleMyBusiness"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback" OR "Energy Sector News" OR "Customer Inquiry" OR "Complaint" OR "Clarification" OR "Service Feedback" OR "Suggestions"')`
          }
        } else {
          baseQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback" OR "Energy Sector News" OR "Customer Inquiry" OR "Complaint" OR "Clarification" OR "Service Feedback" OR "Suggestions"')`
        }
      }
      // Create a helper function to fetch counts
      const getMentionCount = async (urgency) => {
        const query = `${baseQuery} AND llm_mention_urgency:("${urgency}")`
        return await elasticSearchCount(elasticMentionQueryTemplate(query, greaterThanTime, lessThanTime))
      }

      // Fetch the counts for high, medium, and low urgency
      high = await getMentionCount('High')
      medium = await getMentionCount('Medium')
      low = await getMentionCount('Low')

      // Calculate total sentiment count
      const totalSentiments = high?.count + medium?.count + low?.count

      // Format the response output
      const responseOutput = `High,${high?.count}|Medium,${medium?.count}|Low,${low?.count}`

      return res.status(200).json({ responseOutput,totalSentiments});

    }catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'recurrenceMentions') {
    try {
      let firstTime = 0,
        repeatedMention = 0,
        ongoingIssue = 0

      const firstTimeQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_recurrence:("First Time" OR "First Mention")`
      const repeatedMentionQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_recurrence:("Repeated Mention" OR "Recurring Issue")`
      const ongoingIssueQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_recurrence:("Recurring Issue" OR "Ongoing Issue" OR "Ongoing Problem") `

      firstTime = await elasticSearchCount(elasticMentionQueryTemplate(firstTimeQuery, greaterThanTime, lessThanTime))

      repeatedMention = await elasticSearchCount(
        elasticMentionQueryTemplate(repeatedMentionQuery, greaterThanTime, lessThanTime)
      )
      ongoingIssue = await elasticSearchCount(
        elasticMentionQueryTemplate(ongoingIssueQuery, greaterThanTime, lessThanTime)
      )

      const influencersCoverage = [firstTime?.count, repeatedMention?.count, ongoingIssue?.count]
            return res.status(200).json({ influencersCoverage});

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'languageToneMentions') {
    try {
      const sourcesArray = [
        'Formal',
        'Informal',
        'Sarcastic',
        'Technical',
        'Professional',
        'Neutral',
        'Critical',
        'Other'
      ]

      let responseOutput = {}

      for (let i = 0; i < sourcesArray.length; i++) {
        // let _sources
        // if (sourcesArray[i] === 'Youtube') {
        //   _sources = '"Youtube" OR "Vimeo"'
        // } else if (sourcesArray[i] === 'Web') {
        //   _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
        // } else {
        //   _sources = sourcesArray[i]
        // }

        let twitterContent = 0,
          facebookContent = 0,
          instagramContent = 0,
          webContent = 0
        let twitterContentQuery, facebookContentQuery, instagramContentQuery, webContentQuery

        twitterContentQuery = `${topicQueryString} AND source:('"Twitter"')  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"  OR  "Energy Sector News" OR  "Customer Inquiry" OR  "Complaint" OR  "Clarification" OR "Service Feedback" OR  "Suggestions"') AND  llm_mention_tone:("${sourcesArray[i]}")`
        facebookContentQuery = `${topicQueryString} AND source:('"Facebook"')  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"  OR  "Energy Sector News" OR  "Customer Inquiry" OR  "Complaint" OR  "Clarification" OR "Service Feedback" OR  "Suggestions"') AND  llm_mention_tone:("${sourcesArray[i]}")`
        instagramContentQuery = `${topicQueryString} AND source:('"Instagram"')  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"  OR  "Energy Sector News" OR  "Customer Inquiry" OR  "Complaint" OR  "Clarification" OR "Service Feedback" OR  "Suggestions"') AND  llm_mention_tone:("${sourcesArray[i]}")`
        //webContentQuery = `${topicQueryString} AND source:('"FakeNews" OR "News" OR "Blogs" OR "Web"')  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND  llm_mention_tone:("${sourcesArray[i]}")`

        twitterContent = await elasticSearchCount(
          elasticMentionQueryTemplates(twitterContentQuery, greaterThanTime, lessThanTime)
        )
        facebookContent = await elasticSearchCount(
          elasticMentionQueryTemplates(facebookContentQuery, greaterThanTime, lessThanTime)
        )
        instagramContent = await elasticSearchCount(
          elasticMentionQueryTemplates(instagramContentQuery, greaterThanTime, lessThanTime)
        )
        // webContent = await elasticSearchCount(
        //   elasticMentionQueryTemplate(webContentQuery, greaterThanTime, lessThanTime)
        // )

        if (twitterContent?.count > 0 || facebookContent?.count > 0 || instagramContent?.count > 0) {
          ;(responseOutput )[sourcesArray[i]] = {
            twitterContent: twitterContent?.count,
            facebookContent: facebookContent?.count,
            instagramContent: instagramContent?.count
            // webContent: webContent?.count
          }
        }
      }
            return res.status(200).json({ responseOutput});

    }catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'audienceMentions') {
    try {
      const sourcesArray = [
        'Youtube',
        'Twitter',
        'Pinterest',
        'Instagram',
        'Reddit',
        'Tumblr',
        'Facebook',
        'Web',
        'Linkedin',
        'GooglePlayStore',
        'GoogleMyBusiness',
        'AppleAppStore',
        'HuaweiAppGallery',
        'Glassdoor'
      ]

      let responseOutput = {}

      for (let i = 0; i < sourcesArray.length; i++) {
        let _sources
        if (sourcesArray[i] === 'Youtube') {
          _sources = '"Youtube" OR "Vimeo"'
        } else if (sourcesArray[i] === 'Web') {
          _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
        } else {
          _sources = sourcesArray[i]
        }

        //Existing Customer, Potential Customer, Influencer, Partner, General Public

        let ExistingCustomer = 0,
          PotentialCustomer = 0,
          Influencer = 0,
          Partner = 0,
          GeneralPublic = 0

        const ExistingCustomerQuery = `${topicQueryString} AND source:(${_sources}) AND  llm_mention_audience:("Existing Customer")`
        const PotentialCustomerQuery = `${topicQueryString} AND source:(${_sources}) AND  llm_mention_audience:("Potential Customer")`
        const InfluencerQuery = `${topicQueryString} AND source:(${_sources}) AND  llm_mention_audience:("Influencer")`
        const PartnerQuery = `${topicQueryString} AND source:(${_sources}) AND  llm_mention_audience:("Partner")  OR  llm_mention_audience:("Ongoing Issue") `
        const GeneralPublicQuery = `${topicQueryString} AND source:(${_sources}) AND  llm_mention_audience:("General Public" OR "Public")`

        ExistingCustomer = await elasticSearchCount(
          elasticMentionQueryTemplate(ExistingCustomerQuery, greaterThanTime, lessThanTime)
        )
        PotentialCustomer = await elasticSearchCount(
          elasticMentionQueryTemplate(PotentialCustomerQuery, greaterThanTime, lessThanTime)
        )
        Influencer = await elasticSearchCount(
          elasticMentionQueryTemplate(InfluencerQuery, greaterThanTime, lessThanTime)
        )
        Partner = await elasticSearchCount(elasticMentionQueryTemplate(PartnerQuery, greaterThanTime, lessThanTime))
        GeneralPublic = await elasticSearchCount(
          elasticMentionQueryTemplate(GeneralPublicQuery, greaterThanTime, lessThanTime)
        )

        if (
          ExistingCustomer.count > 0 ||
          PotentialCustomer.count > 0 ||
          Influencer.count > 0 ||
          Partner.count > 0 ||
          GeneralPublic.count > 0
        ) {
          ;(responseOutput )[sourcesArray[i]] = {
            ExistingCustomer: ExistingCustomer.count,
            PotentialCustomer: PotentialCustomer.count,
            Influencer: Influencer.count,
            Partner: Partner.count,
            GeneralPublic: GeneralPublic.count
          }
        }
      }

      //console.log('asdasd', responseOutput)

      return res.status(200).json({ responseOutput });

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'actionRequiredMentions') {
    try {
      const sourcesArray = [
        'No Action Needed',
        'None',
        'Immediate Response Needed',
        'Follow-Up Required',
        'No Action Required',
        'Escalation Required',
        'Follow-Up Needed',
        'No Action Required.',
        'Other'
      ]

      let responseOutput = {}

      for (let i = 0; i < sourcesArray.length; i++) {
        // let _sources
        // if (sourcesArray[i] === 'Youtube') {
        //   _sources = '"Youtube" OR "Vimeo"'
        // } else if (sourcesArray[i] === 'Web') {
        //   _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
        // } else {
        //   _sources = sourcesArray[i]
        // }

        let twitterContent = 0,
          facebookContent = 0,
          instagramContent = 0,
          webContent = 0
        let twitterContentQuery, facebookContentQuery, instagramContentQuery, webContentQuery

        twitterContentQuery = `${topicQueryString} AND source:('"Twitter"')  AND llm_mention_action:("${sourcesArray[i]}")`
        facebookContentQuery = `${topicQueryString} AND source:('"Facebook"')  AND llm_mention_action:("${sourcesArray[i]}")`
        instagramContentQuery = `${topicQueryString} AND source:('"Instagram"')  AND llm_mention_action:("${sourcesArray[i]}")`
        //webContentQuery = `${topicQueryString} AND source:('"FakeNews" OR "News" OR "Blogs" OR "Web"')  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND  llm_mention_action:("${sourcesArray[i]}")`

        twitterContent = await elasticSearchCount(
          elasticMentionQueryTemplates(twitterContentQuery, greaterThanTime, lessThanTime)
        )
        facebookContent = await elasticSearchCount(
          elasticMentionQueryTemplates(facebookContentQuery, greaterThanTime, lessThanTime)
        )
        instagramContent = await elasticSearchCount(
          elasticMentionQueryTemplates(instagramContentQuery, greaterThanTime, lessThanTime)
        )
        // webContent = await elasticSearchCount(
        //   elasticMentionQueryTemplate(webContentQuery, greaterThanTime, lessThanTime)
        // )

        if (
          twitterContent.count > 0 ||
          facebookContent.count > 0 ||
          instagramContent.count > 0
          //webContent.count > 0
        ) {
          ;(responseOutput )[sourcesArray[i]] = {
            twitterContent: twitterContent?.count,
            facebookContent: facebookContent?.count,
            instagramContent: instagramContent?.count
            // webContent: webContent?.count
          }
        }
      }

      return res.status(200).json({ responseOutput });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'sentimentSummary') {
    try {
      // const params = (sentValue) => ({
      //   body: {
      //     query: {
      //       bool: {
      //         must: [
      //           { query_string: { query: topicQueryString } },
      //           { match: { predicted_sentiment_value: sentValue } },
      //           { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
      //         ]
      //       }
      //     }
      //   }
      // })

      if (isScadUser == 'true') {
        if (selectedTab === 'GOOGLE') {
          if (topicQueryString == '') {
            topicQueryString = `source:('"GoogleMyBusiness"')`
          } else {
            topicQueryString = topicQueryString + ` AND source:('"GoogleMyBusiness"')`
          }
        } else {
          topicQueryString = topicQueryString + ` AND source:('"Twitter" OR "Facebook" OR "Instagram"')`
        }
      }
      const params = (sentValue) => ({
        body: {
          query: {
            bool: {
              must: [
                {
                  query_string: {
                    query: topicQueryString,
                    analyze_wildcard: true, // Analyze wildcard agar special characters hain
                    default_operator: 'AND'
                  }
                },
                {
                  match: {
                    predicted_sentiment_value: sentValue
                  }
                },
                {
                  range: {
                    p_created_time: {
                      gte: greaterThanTime,
                      lte: lessThanTime
                    }
                  }
                }
              ]
            }
          }
        }
      })
      // const esData2 = await testClientElasticQuery()
      // console.log('dataTesting', esData2?.hits?.hits)
      // console.log("----")
      // console.log(JSON.stringify(params('Positive')))
      // console.log("----")
      // ['predicted_sentiment_value', 'predicted_category', 'llm_mention_type', 'llm_mention_touchpoint', 'llm_mention_urgency', 'llm_mention_audience', 'llm_mention_action', 'llm_product_ref', 'llm_mention_tone', 'llm_mention_recurrence']
      const posSenti = await elasticSearchCounts(params('Positive'))
      const negSenti = await elasticSearchCounts(params('Negative'))
      const neuSenti = await elasticSearchCounts(params('Neutral'))

      const totalSentiments = posSenti?.count + negSenti?.count + neuSenti?.count

      const responseOutput = `Positive,${posSenti?.count}|Negative,${negSenti?.count}|Neutral,${neuSenti?.count}`
      return res.status(200).json({ responseOutput,totalSentiments });

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'influencersCategory') {
    try {
      const queries = [
        { u_followers: { gte: 5000000 } }, // Celebrity
        { u_followers: { gte: 1000000, lte: 5000000 } }, // Mega
        { u_followers: { gte: 500000, lte: 1000000 } }, // Macro
        { u_followers: { gte: 50000, lte: 500000 } }, // Mid-tier
        { u_followers: { gte: 10000, lte: 50000 } }, // Micro
        { u_followers: { gte: 1000, lte: 10000 } } // Nano
      ]

      if (isScadUser == 'true') {
        if (selectedTab === 'GOOGLE') {
          if (topicQueryString == '') {
            topicQueryString = `source:('"GoogleMyBusiness"')`
          } else {
            topicQueryString = topicQueryString + ` AND source:('"GoogleMyBusiness"')`
          }
        } else {
          topicQueryString =
            topicQueryString +
            ` AND source:('"Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Linkedin" OR "Pinterest" OR "Web" OR "Vimeo" OR "News"')`
        }
      } else {
        topicQueryString =
          topicQueryString +
          ` AND source:('"Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Linkedin" OR "Pinterest" OR "Web" OR "Vimeo" OR "News"')`
      }

      // Execute Elasticsearch queries concurrently
      const results = await Promise.all(
        queries.map(params =>
          elasticSearchCounts(elasticQueryTemplateRange(topicQueryString, greaterThanTime, lessThanTime, params))
        )
      )

      // Prepare response object
      const infArray = {}
      results.forEach((item, index) => {
        infArray[['celebrity', 'mega', 'macro', 'midtier', 'micro', 'nano'][index]] = item?.count
      })

      return res.statue(200).json({ infArray })
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'languages') {
    try {
      const esData = await elasticSearchCount(
        elasticMentionQueryTemplate(topicQueryString, greaterThanTime, lessThanTime)
      )
      let totalMentions = (esData )?.count

      const engQueryString = `${topicQueryString} AND lange_detect:("en")`
      const esData1 = await elasticSearchCount(
        elasticMentionQueryTemplate(engQueryString, greaterThanTime, lessThanTime)
      )
      const totalEngMentions = (esData1 )?.count

      const arQueryString = `${topicQueryString} AND lange_detect:("ar")`
      const esData2 = await elasticSearchCount(
        elasticMentionQueryTemplate(arQueryString, greaterThanTime, lessThanTime)
      )
      const totalArabicMentions = (esData2 )?.count

      if (totalMentions === 0) totalMentions = 1

      const mentionsEnglish = ((totalEngMentions / totalMentions) * 100).toFixed(2)
      const mentionsArabic = ((totalArabicMentions / totalMentions) * 100).toFixed(2)
      const otherMentions = (100 - (parseFloat(mentionsEnglish) + parseFloat(mentionsArabic))).toFixed(2)

      const response = `${mentionsArabic},${mentionsEnglish},${otherMentions}`

      return res.statue(200).json({ response })
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'ave') {
    try {
      const aveQueryString = `${topicQueryString} AND source:("khaleej_times" OR "Omanobserver" OR "Time of oman" OR "Blogs" OR "FakeNews" OR "News")`
      const esData = await elasticSearchCount(
        elasticMentionQueryTemplate(aveQueryString, greaterThanTime, lessThanTime)
      )
      const count = (esData )?.count
      const digitalMentions = count * 735.76

      //conventional= printMedia

      const printQueryString = topicQueryString.replace('p_message_text', 'p_message')
      const esData1 = await elasticPrintSearchCount(
        elasticMentionQueryTemplate(printQueryString, greaterThanTime, lessThanTime)
      )
      const count1 = (esData1 )?.count
      const conventionalMentions = count1 * 3276.45

      const formattedDigitalMentions = digitalMentions
      const formattedConventionalMentions = new Intl.NumberFormat().format(conventionalMentions)

            return res.statue(200).json({ formattedDigitalMentions, formattedConventionalMentions })

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'emotions') {
    try {
      const emotions = ['anger', 'fear', 'happy', 'sadness', 'surprise']
      const emotionCounts = {}

      for (const emotion of emotions) {
        const emotionQueryString = `${topicQueryString} AND emotion_detector:("${emotion}")`

        try {
          const esData = await elasticSearchCount(
            elasticMentionQueryTemplate(emotionQueryString, greaterThanTime, lessThanTime)
          )
          emotionCounts[emotion] = (esData )?.count
        } catch (error) {
          console.error(`Error fetching ${emotion} data:`, error)
          emotionCounts[emotion] = 0
        }
      }

      let emoArray, emoCounts
      const totalEmos = Object.values(emotionCounts).reduce((sum, count) => sum + count, 0)
      if (totalEmos == 0) {
        emoArray = ['Anger', 'Fear', 'Happy', 'Sadness', 'Surprise']
        emoCounts = [0, 0, 0, 0, 0]
      } else {
        emoArray = emotions.map(emotion => emotion.charAt(0).toUpperCase() + emotion.slice(1))
        emoCounts = emotions.map(emotion => emotionCounts[emotion])
      }

      const emoData = {
        emos: emoArray,
        counts: emoCounts
      }


                  return res.statue(200).json({ emoData})

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'emotionTouchpointChart') {
    try {
      const responseOutput = {}
      const touchpointsIds = await getAllTouchpoints(Number(subtopicId))

      const emotionsArray = ['Anger', 'Fear', 'Happy', 'Sadness', 'Surprise']

      if (touchpointsIds.length > 0) {
        for (let i = 0; i < touchpointsIds.length; i++) {
          const tpId = touchpointsIds[i].cx_tp_tp_id
          const tpEsQuery = await buildTouchPointQueryString(tpId)

          const emotions = await Promise.all(
            emotionsArray.map(async emotion => {
              const params = {
                body: {
                  query: {
                    bool: {
                      must: [
                        {
                          query_string: {
                            query: `${topicQueryString} AND ${tpEsQuery} AND emotion_detector:("${emotion}")`
                          }
                        },
                        {
                          range: {
                            p_created_time: {
                              gte: greaterThanTime,
                              lte: lessThanTime
                            }
                          }
                        }
                      ]
                    }
                  }
                }
              }
              const result = await elasticSearchCounts(params)
              return { emotion, count: result.count }
            })
          )

          const nonZeroEmotions = emotions.filter(e => e.count > 0)

          if (nonZeroEmotions.length > 0) {
            const tpData = await getTouchpointData(tpId)
            const tpName = tpData[0]?.tp_name

            ;(responseOutput )[tpName] = emotions.reduce((acc, e) => {
              acc[e.emotion] = e.count
              return acc
            }, {})
          }
        }
      }
      
      return res.status(200).json({ responseOutput })
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'influencersCoverage') {
    //elasticQueryTemplateRange
    if (isScadUser == 'true') {
      if (selectedTab === 'GOOGLE') {
        if (topicQueryString == '') {
          topicQueryString = `source:('"GoogleMyBusiness"')`
        } else {
          topicQueryString = topicQueryString + ` AND source:('"GoogleMyBusiness"')`
        }
      } else {
        topicQueryString = topicQueryString + ` AND source:('"Twitter" OR "Facebook" OR "Instagram"')`
      }
    }
    try {
      const normalRange = { u_followers: { gte: 0, lte: 1000 } }
      const resultNormalUser = await elasticSearchCounts(
        elasticQueryTemplateRange(topicQueryString, greaterThanTime, lessThanTime, normalRange)
      )

      const influencerRange = { u_followers: { gte: 1000 } }
      const resultInfluencer = await elasticSearchCounts(
        elasticQueryTemplateRange(topicQueryString, greaterThanTime, lessThanTime, influencerRange)
      )

      const influencersCoverage = [resultNormalUser.count, resultInfluencer.count]
            return res.status(200).json({ influencersCoverage })

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'keywordsChart') {
    try {
      if (subtopicId) {
        const responseArray = []

        let tp_names = []
        let tp_counts = []

        const all_touchpoints = await getAllTouchpoints(Number(subtopicId))

        for (let i = 0; i < all_touchpoints.length; i++) {
          const tp_id = all_touchpoints[i].cx_tp_tp_id

          // Fetch touchpoint data and elastic query
          const tp_data = await getTouchpointData(tp_id)
          const tp_es_query_string = await buildTouchPointQueryString(tp_id)

          if (isScadUser == 'true') {
            if (selectedTab === 'GOOGLE') {
              if (topicQueryString == '') {
                topicQueryString = `source:('"GoogleMyBusiness"')`
              } else {
                topicQueryString = topicQueryString + ` AND source:('"GoogleMyBusiness"')`
              }
            } else {
              topicQueryString = topicQueryString + ` AND source:('"Twitter" OR "Facebook" OR "Instagram"')`
            }
          }

          // Construct Elasticsearch query parameters
          const params = {
            body: {
              query: {
                bool: {
                  must: [
                    {
                      query_string: {
                        query: `${topicQueryString} AND ${tp_es_query_string}`
                      }
                    },
                    {
                      range: {
                        p_created_time: {
                          gte: greaterThanTime,
                          lte: lessThanTime
                        }
                      }
                    }
                  ]
                }
              }
            }
          }

          // Fetch data from Elasticsearch
          const es_data = await elasticSearchCounts(params)

          // Store touchpoint names and counts

          responseArray.push({
            key_count: es_data.count,
            keyword: tp_data[0].tp_name
          })

          responseArray.sort((a, b) => b.key_count - a.key_count)

          // }
          //   tp_names.push(tp_data[0].tp_name);
          //   tp_counts.push(tp_count);
        }

        // Return response as JSON
        return res.status(200).json({ responseArray});

      } else {
        let keyHashArray = []

        const keyHash = await prisma.customer_topics.findUnique({
          select: {
            topic_hash_tags: true,
            topic_keywords: true
          },
          where: { topic_id: topicId }
        })

        if (!keyHash) {
            
          return res.status(400).json({ error: 'keywords not found' })
        }

        const keywords = keyHash?.topic_keywords.split(',')

        if (keywords[0] !== '') {
          for (let i = 0; i < keywords.length; i++) {
            keyHashArray.push(keywords[i].trim())
          }
        }

        const hashTags = keyHash?.topic_hash_tags.split('|')

        if (hashTags[0] !== '') {
          for (let i = 0; i < hashTags.length; i++) {
            keyHashArray.push(hashTags[i].trim())
          }
        }

        const responseArray = []

        if (isScadUser == 'true') {
          if (selectedTab === 'GOOGLE') {
            if (topicQueryString == '') {
              topicQueryString = `source:('"GoogleMyBusiness"')`
            } else {
              topicQueryString = topicQueryString + ` AND source:('"GoogleMyBusiness"')`
            }
          } else {
            topicQueryString = topicQueryString + ` AND source:('"Twitter" OR "Facebook" OR "Instagram"')`
          }
        }
        keyHashArray = keyHashArray.slice(0, 10)

        
    
      
            greaterThanTime = process?.env.GREATER_THEN_TIME_UNDP || ''
            lessThanTime = process?.env.LESS_THEN_TIME_UNDP || ''
            topicQueryString = `${topicQueryString} AND un_keywords:("Yes")`
          
          const params = {
            body: {
              query: {
                bool: {
                  must: [
                    {
                      query_string: {
                        query: `${topicQueryString} AND p_message_text:("${category}")`
                      }
                    },
                    {
                      range: {
                      
                         p_created_time: {
                                            gte: "2023-01-01",
                                            lte: "2023-04-30"
                                        }
                      
                      }
                    }
                  ]
                }
              },
              size:30
            }
          }

          const results = await elasticSearch(params)
                 
  for (let l = 0; l < results?.hits?.hits?.length; l++) {
    let esData = results?.hits?.hits[l];
    let user_data_string = "";
    let profilePic = esData._source.u_profile_photo
      ? esData._source.u_profile_photo
      : `${process?.env?.PUBLIC_IMAGES_PATH}grey.png`;
    let followers =
      esData._source.u_followers > 0 ? `${esData._source.u_followers}` : "";
    let following =
      esData._source.u_following > 0 ? `${esData._source.u_following}` : "";
    let posts = esData._source.u_posts > 0 ? `${esData._source.u_posts}` : "";
    let likes = esData._source.p_likes > 0 ? `${esData._source.p_likes}` : "";
    let llm_emotion = esData._source.llm_emotion || "";
    let commentsUrl =
      esData._source.p_comments_text &&
      esData._source.p_comments_text.trim() !== ""
        ? `${esData._source.p_url.trim().replace("https: // ", "https://")}`
        : "";
    let comments = `${esData._source.p_comments}`;
    let shares =
      esData._source.p_shares > 0 ? `${esData._source.p_shares}` : "";
    let engagements =
      esData._source.p_engagement > 0 ? `${esData._source.p_engagement}` : "";
    let content =
      esData._source.p_content && esData._source.p_content.trim() !== ""
        ? `${esData._source.p_content}`
        : "";
    let imageUrl =
      esData._source.p_picture_url && esData._source.p_picture_url.trim() !== ""
        ? `${esData._source.p_picture_url}`
        : `${process?.env?.PUBLIC_IMAGES_PATH}grey.png`;
    let predicted_sentiment = "";
    let predicted_category = "";

    // Check if the record was manually updated, if yes, use it
    const chk_senti = await prisma.customers_label_data.findMany({
      where: {
        p_id: esData._id,
      },
      orderBy: {
        label_id: "desc",
      },
      take: 1,
    });

    if (chk_senti.length > 0) {
      if (chk_senti[0]?.predicted_sentiment_value_requested)
        predicted_sentiment = `${chk_senti[0]?.predicted_sentiment_value_requested}`;
    } else if (
      esData._source.predicted_sentiment_value &&
      esData._source.predicted_sentiment_value !== ""
    ) {
      predicted_sentiment = `${esData._source.predicted_sentiment_value}`;
    }

    // Category prediction
    if (esData._source.predicted_category) {
      predicted_category = esData._source.predicted_category;
    }
    let youtubeVideoUrl = "";
    let profilePicture2 = "";
    //const token = await getCsrfToken()
    if (esData._source.source === "Youtube") {
      if (
        esData._source.video_embed_url &&
        esData._source.video_embed_url !== ""
      )
        youtubeVideoUrl = `${esData._source.video_embed_url}`;
      else if (esData._source.p_id && esData._source.p_id !== "")
        youtubeVideoUrl = `https://www.youtube.com/embed/${esData._source.p_id}`;
    } else {
      if (esData._source.p_picture) {
        profilePicture2 = `${esData._source.p_picture}`;
      } else {
        profilePicture2 = "";
      }
    }
    // Handle other sources if needed

    let sourceIcon = "";

    const userSource = esData._source.source;
    if (
      userSource == "khaleej_times" ||
      userSource == "Omanobserver" ||
      userSource == "Time of oman" ||
      userSource == "Blogs"
    ) {
      sourceIcon = "Blog";
    } else if (userSource == "Reddit") {
      sourceIcon = "Reddit";
    } else if (userSource == "FakeNews" || userSource == "News") {
      sourceIcon = "News";
    } else if (userSource == "Tumblr") {
      sourceIcon = "Tumblr";
    } else if (userSource == "Vimeo") {
      sourceIcon = "Vimeo";
    } else if (userSource == "Web" || userSource == "DeepWeb") {
      sourceIcon = "Web";
    } else {
      sourceIcon = userSource;
    }

    let message_text = "";

    if (
      esData._source.source === "GoogleMaps" ||
      esData._source.source === "Tripadvisor"
    ) {
      let m_text = esData._source.p_message_text.split("***|||###");
      message_text = m_text[0].replace(/\n/g, "<br>");
    } else {
      message_text = esData._source.p_message_text
        ? esData._source.p_message_text.replace(/<\/?[^>]+(>|$)/g, "")
        : "";
    }

    let cardData = {
      profilePicture: profilePic,
      profilePicture2: profilePicture2,
      userFullname: esData._source.u_fullname,
      user_data_string: user_data_string,
      followers: followers,
      following: following,
      posts: posts,
      likes: likes,
      llm_emotion: llm_emotion,
      commentsUrl: commentsUrl,
      comments: comments,
      shares: shares,
      engagements: engagements,
      content: content,
      image_url: imageUrl,
      predicted_sentiment: predicted_sentiment,
      predicted_category: predicted_category,
      youtube_video_url: youtubeVideoUrl,
      source_icon: `${esData._source.p_url},${sourceIcon}`,
      message_text: message_text,
      source: esData._source.source,
      rating: esData._source.rating,
      comment: esData._source.comment,
      businessResponse: esData._source.business_response,
      uSource: esData._source.u_source,
      googleName: esData._source.name,
      created_at: new Date(esData._source.p_created_time).toLocaleString(),
    };

    responseArray.push(cardData);
  }

  return res.status(200).json({
    success: true,
    responseArray,
    total: responseArray.length || 0
  });
        // }

        // responseArray.sort((a, b) => b.key_count - a.key_count)
        //console.log('dd', responseArray)
        // return res.status(200).json({ responseArray,success:true })
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }  else if (type === 'keywordsSentimentChart') {
    try {
      if (subtopicId) {
        const responseArray = []

        let tp_names = []
        let tp_counts = []

        const all_touchpoints = await getAllTouchpoints(Number(subtopicId))

        for (let i = 0; i < all_touchpoints.length; i++) {
          const tp_id = all_touchpoints[i].cx_tp_tp_id

          // Fetch touchpoint data and elastic query
          const tp_data = await getTouchpointData(tp_id)
          const tp_es_query_string = await buildTouchPointQueryString(tp_id)

          if (isScadUser == 'true') {
            if (selectedTab === 'GOOGLE') {
              if (topicQueryString == '') {
                topicQueryString = `source:('"GoogleMyBusiness"')`
              } else {
                topicQueryString = topicQueryString + ` AND source:('"GoogleMyBusiness"')`
              }
            } else {
              topicQueryString =
                topicQueryString +
                ` AND source:("Twitter" OR "Youtube" OR "Linkedin" OR "FakeNews" OR "News" OR "Pinterest" OR "Reddit" OR "Tumblr" OR "Vimeo" OR "Instagram" OR "Facebook")`
            }
          }

          // Construct Elasticsearch query parameters
          const params = {
            body: {
              query: {
                bool: {
                  must: [
                    {
                      query_string: {
                        query: `${topicQueryString} AND ${tp_es_query_string}`
                      }
                    },
                    {
                      range: {
                        p_created_time: {
                          gte: greaterThanTime,
                          lte: lessThanTime
                        }
                      }
                    }
                  ]
                }
              }
            }
          }

          // Fetch data from Elasticsearch
          const es_data = await elasticSearchCounts(params)

          // Store touchpoint names and counts

          responseArray.push({
            key_count: es_data.count,
            keyword: tp_data[0].tp_name
          })

          responseArray.sort((a, b) => b.key_count - a.key_count)

          // }
          //   tp_names.push(tp_data[0].tp_name);
          //   tp_counts.push(tp_count);
        }

        // Return response as JSON
        return res.status(200).json({ responseArray })
      } else {
        let keyHashArray = []

        const keyHash = await prisma.customer_topics.findUnique({
          select: {
            topic_hash_tags: true,
            topic_keywords: true
          },
          where: { topic_id: topicId }
        })

        if (!keyHash) {
                    return res.status(400).json({ error: 'keywords not found' })

        }

        const keywords = keyHash?.topic_keywords.split(',')

        if (keywords[0] !== '') {
          for (let i = 0; i < keywords.length; i++) {
            keyHashArray.push(keywords[i].trim())
          }
        }

        const hashTags = keyHash?.topic_hash_tags.split('|')

        if (hashTags[0] !== '') {
          for (let i = 0; i < hashTags.length; i++) {
            keyHashArray.push(hashTags[i].trim())
          }
        }

        const keywordSentimentMap = {} // Map to track keyword sentiments
        if (isScadUser == 'true') {
          if (selectedTab === 'GOOGLE') {
            if (topicQueryString == '') {
              topicQueryString = `source:('"GoogleMyBusiness"')`
            } else {
              topicQueryString = topicQueryString + ` AND source:('"GoogleMyBusiness"')`
            }
          } else {
            topicQueryString =
              topicQueryString +
              ` AND source:('"Twitter" OR "Instagram" OR "Facebook" OR "Youtube" OR "LinkedIn" OR "Pinterest" OR "Reddit" OR "Vimeo" OR "News"')`
          }
        }
        keyHashArray = keyHashArray.slice(0, 10)

        for (let i = 0; i < keyHashArray.length; i++) {
          if (unTopic === 'true') {
            greaterThanTime = process?.env.GREATER_THEN_TIME_UNDP || ''
            lessThanTime = process?.env.LESS_THEN_TIME_UNDP || ''
            topicQueryString = `${topicQueryString} AND un_keywords:("Yes")`
          }
          const params = {
            query: {
              bool: {
                must: [
                  {
                    query_string: {
                      query: `${topicQueryString} AND p_message_text:("${keyHashArray[i]}")`
                    }
                  },
                  {
                    range: {
                      p_created_time: {
                        gte: greaterThanTime,
                        lte: lessThanTime
                      }
                    }
                  }
                ]
              }
            },
            aggs: {
              sentiment_group: {
                terms: { field: 'predicted_sentiment_value.keyword' }
              }
            }
          }

          const results = await client(params)
          if (!keywordSentimentMap[keyHashArray[i]]) {
            keywordSentimentMap[keyHashArray[i]] = { Positive: 0, Neutral: 0, Negative: 0 }
          }

          if (results.aggregations?.sentiment_group?.buckets) {
            results.aggregations.sentiment_group.buckets.forEach((bucket) => {
              const sentiment = bucket.key || 'Neutral' // Default to "Neutral" if no sentiment is found
              keywordSentimentMap[keyHashArray[i]][sentiment] = bucket.doc_count // Store count per sentiment
            })
          }
        }

        // Convert to desired output format
        const responseArray = Object.keys(keywordSentimentMap).map(keyword => ({
          keyword_name: keyword,
          sentiment_counts: keywordSentimentMap[keyword]
        }))
        return res.status(200).json({ responseArray })
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'totalMentions') {
    try {
      if (!prisma) {
        throw new Error('Prisma client is not initialized')
      }

      // Calculate timestamps for the last 90 days
      const now = new Date()
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(now.getDate() - 90)

      const { searchParams } = new URL(req.url)
      const userId = searchParams.get('id') ? parseInt(searchParams.get('id'), 10) : null

      // console.log({ userId })

      const greaterThanTime = ninetyDaysAgo.toISOString() // Start time (90 days ago)
      const lessThanTime = now.toISOString() // End time (now)

      // Get all active topics
      const topics = await prisma.customer_topics.findMany({
        where: {
          customer_portal: 'D24',
          topic_is_deleted: {
            not: 'Y'
          },
          topic_user_id: userId
        },
        orderBy: {
          topic_order: 'asc'
        }
      })

      if (!topics || topics.length === 0) {
                return res.status(400).json({  mentions: 0, googleReviews: 0  })

      }

      let mentionsCount = 0
      let googleReviewsCount = 0
      // Process each topic
      await Promise.all(
        topics.map(async topic => {
          try {
            // Build base topic query string
            const topicQuery = await buildQueryForAllKeywordsString(topic.topic_id, isScadUser, selectedTab)

            // Query for social media mentions
            const socialTopicQuery =
              topicQuery +
              ` source:('"Twitter" OR "Instagram" OR "Facebook" OR "Youtube" OR "LinkedIn" OR "Pinterest" OR "Reddit" OR "Vimeo" OR "News"')`
            const socialMentionsData = await elasticSearchCount(
              elasticMentionQueryTemplate(socialTopicQuery, greaterThanTime, lessThanTime)
            )
            mentionsCount += (socialMentionsData )?.count || 0

            // Query for Google My Business mentions
            const googleTopicQuery = topicQuery + ` AND source:('"GoogleMyBusiness"')`
            const googleMentionsData = await elasticSearchCount(
              elasticMentionQueryTemplate(googleTopicQuery, greaterThanTime, lessThanTime)
            )
            googleReviewsCount += (googleMentionsData )?.count || 0
          } catch (err) {
            console.error(`Error processing topic ${topic.topic_id}:`, err)
            // Continue with other topics even if one fails
          }
        })
      )

      return res.statue(200).json(
        {
          mentions: mentionsCount,
          googleReviews: googleReviewsCount
        }
      )
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'all') {
    try {
      const queryString =
        topicQueryString +
        ` AND source:('"Twitter" OR "Instagram" OR "Facebook" OR "Youtube" OR "LinkedIn" OR "Pinterest" OR "Reddit" OR "News"')`
      let aggQuery = elasticMentionQueryTemplate(queryString, greaterThanTime, lessThanTime)
      aggQuery.size = 0
      aggQuery.aggs = {
        source_counts: {
          terms: {
            field: 'source.keyword',
            size: 10
          }
        }
      }

      const count = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX, // Default index for the search query
        body: aggQuery
      })

      const buckets = count.aggregations.source_counts.buckets
      const counts = buckets.reduce((acc, bucket) => {
        acc[bucket.key] = bucket.doc_count
        return acc
      }, {})
      return res.status(200).json(
        {
          counts
        }
      )
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'dashboardsCoRelation') {
    try {
      const startDate = searchParams.get('startDate')
      const endDate = searchParams.get('endDate')

      const queryString =
        topicQueryString +
        ` AND source:('"Twitter" OR "Instagram" OR "Facebook" OR "Youtube" OR "LinkedIn" OR "Pinterest" OR "Reddit" OR "News"')`
      let aggQuery = elasticMentionQueryTemplate(queryString, startDate, endDate)
      aggQuery.size = 0
      aggQuery.aggs = {
        source_counts: {
          terms: {
            field: 'source.keyword',
            size: 10
          }
        }
      }

      const count = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX, // Default index for the search query
        body: aggQuery
      })

      const buckets = count.aggregations.source_counts.buckets
      const counts = buckets.reduce((acc, bucket) => {
        acc[bucket.key] = bucket.doc_count
        return acc
      }, {})
      return res.status(200).json(
        {
          counts
        }
      )
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else {
          return res.status(400).json({ error: "Invalid type parameter" });

  }
}
}
module.exports=undpController;



