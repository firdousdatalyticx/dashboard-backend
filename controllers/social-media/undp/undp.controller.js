// src/app/api/apps/getElasticMentions/route.ts
const { parse, format } = require('date-fns');
const  {
  buildQueryString,
  elasticMentionQueryTemplate,
  elasticMentionQueryTemplatess,
  buildsubTopicQueryString,
  buildTouchPointQueryString,
  elasticMentionScoreQuery,
  elasticMentionChurnProbQuery
} =require("./searchKitClient")
require('dotenv').config()

const { elasticClient } = require("../../../config/elasticsearch");

const prisma = require("../../../config/database");

const elasticSearchCount = async (params) => {
  try {
    const response = await elasticClient.count({
      index: process.env.ELASTICSEARCH_DEFAULTINDEX,
      body: params
    })
    // console.log(response)
    return response
  } catch (error) {
    console.error('Elasticsearch count error:', error)
    throw error
  }
}
const elasticSearch = async (params) => {
  try {
    const response = await elasticClient.search({
      index: process.env.ELASTICSEARCH_DEFAULTINDEX,
      body: params
    })
    // console.log(response)
    return response
  } catch (error) {
    console.error('Elasticsearch count error:', error)
    throw error
  }
}

const testClientElasticQuery = async (params) => {
  try {
    const response = await elasticClient.search({
      index: process.env.ELASTICSEARCH_DEFAULTINDEX,
      body: params
    })
    return response
  } catch (error) {
    console.error('Elasticsearch test client search error:', error)
    throw error
  }
}

const client = async (params) => {
  try {
    const response = await elasticClient.search({
      index: process.env.ELASTICSEARCH_DEFAULTINDEX,
      body: params
    })
    return response
  } catch (error) {
    console.error('Elasticsearch client search error:', error)
    throw error
  }
}
const clientsentiment = async (params) => {
  try {
    const response = await elasticClient.count({
      index: process.env.ELASTICSEARCH_DEFAULTINDEX,
      body: params
    })

    return response
  } catch (error) {
    console.error('Elasticsearch client search error:', error)
    throw error
  }
}

const elasticPrintSearchCount = async (params) => {
  try {
    const response = await elasticClient.count({
      index: process.env.PRINTMEDIA_ELASTIC_INDEX, // Index for counting documents
      body: params.body
    })
    return response
  } catch (error) {
    console.error('Elasticsearch print search count error:', error)
    throw error
  }
}

const undpController = {
  UNDP: async (req, res) => {

  let { greaterThanTime, lessThanTime, subtopicId, topicId:id, sentimentType,type,aidType,filters,filterData,touchId,parentAccountId} = req.body;

  



  const decodedFilterData =filterData ? decodeURIComponent(filterData):null;
  const filtersDat =decodedFilterData && JSON.parse(decodedFilterData)

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

  topicQueryString = await buildQueryString(topicId)

  if (filtersDat && filters === 'true') {
    if (filtersDat?.timeSlot && filtersDat?.timeSlot === 'Custom Dates') {
      if (filtersDat?.startDate && filtersDat?.startDate !== '') {
        let greaterThanDate = new Date(filtersDat?.startDate)
        greaterThanTime = format(greaterThanDate, 'yyyy-MM-dd')
      } else {
        greaterThanTime = format(new Date(new Date().setDate(new Date().getDate() - 90)), 'yyyy-MM-dd')
      }

      if (filtersDat?.endDate && filtersDat?.endDate !== '') {
        let lessThanDate = new Date(filtersDat?.endDate)
        lessThanTime = format(lessThanDate, 'yyyy-MM-dd')
      } else {
        lessThanTime = format(new Date(), 'yyyy-MM-dd')
      }
    } else {
      if (filtersDat?.timeSlot !== '') {
        switch (filtersDat?.timeSlot) {
          case 'today':
            greaterThanTime = format(new Date(), 'yyyy-MM-dd')
            lessThanTime = format(new Date(), 'yyyy-MM-dd')
            break
          case '24h':
            greaterThanTime = format(new Date(new Date().setHours(new Date().getHours() - 24)), 'yyyy-MM-dd')
            lessThanTime = format(new Date(), 'yyyy-MM-dd')
            break
          default:
            greaterThanTime = format(
              new Date(new Date().setDate(new Date().getDate() - parseInt(filtersDat?.timeSlot))),
              'yyyy-MM-dd'
            )
            lessThanTime = format(new Date(), 'yyyy-MM-dd')
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
        topicQueryString = `(p_message_text:(${topicKeyHash} OR ${topicUrls}) OR u_username:(${topicKeyHash}) OR u_fullname:(${topicKeyHash}) OR u_source:(${topicUrls}))`
      } else if (topicKeyHash && !topicUrls) {
        topicQueryString = `(p_message_text:(${topicKeyHash}) OR u_fullname:(${topicKeyHash}))`
      } else if (!topicKeyHash && topicUrls) {
        topicQueryString = `u_source:(${topicUrls})`
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
      const esData = await elasticSearchCount(
        elasticMentionQueryTemplate(topicQueryString, greaterThanTime, lessThanTime)
      )
      const count = (esData )?.count

      return res.status(200).json({ count });

    }catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'TouchpointMentionsAreaGraph') {
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
    
      const filteredSourcesArray = []

      for (let i = 0; i < sourcesArray.length; i++) {
        const query = `${topicQueryString} source:('"Twitter" OR "Facebook" OR "Instagram"')  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
        // console.log(query, 'TouchpointMentionsAreaGraph')

        const filterContent = await elasticSearchCount(
          elasticMentionQueryTemplate(query, greaterThanTime, lessThanTime)
        )

        if (filterContent?.count > 0) {
          filteredSourcesArray.push(sourcesArray[i])
        }
      }

      const cxQuery = `${topicQueryString} source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`
      const params = {
        // size: 0,

        docvalue_fields: [{ field: 'p_created_time', format: 'date_time' }],
        query: {
          bool: {
            must: [
              { query_string: { query: cxQuery } },
              { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
            ]
          }
        },
        aggs: {
          '2': {
            date_histogram: {
              field: 'p_created_time',
              fixed_interval: '1d',
              // calendar_interval: '1d', // Use `calendar_interval` as it's preferred over `fixed_interval` for natural time intervals.

              min_doc_count: 0
            },
            aggs: {
              '3': {
                terms: { field: 'llm_mention_touchpoint.keyword', size: 10 }
              }
            }
          }
        }
      }

      const es_data = await client(params)

      let touchpointData = {}

      filteredSourcesArray.forEach((touchpoint) => {
        touchpointData[touchpoint] = ''
      })

      es_data?.aggregations['2'].buckets.forEach((bucket) => {
        filteredSourcesArray.forEach((touchpoint) => {
          let count = 0
          bucket['3'].buckets.forEach((subBucket) => {
            if (subBucket.key === touchpoint) count = subBucket.doc_count
          })

          const date = new Date(bucket.key_as_string).toISOString().split('T')[0]
          touchpointData[touchpoint] += `${date}~${count}|`
        })
      })

      const touchpointArray = Object.keys(touchpointData).map((touchpoint) => {
        return {
          [touchpoint]: touchpointData[touchpoint].slice(0, -1)
        }
      })

   
      
      return res.status(200).json({touchpointArray });

    } catch (error) {
      console.error('Error fetching results:', error)
            return res.status(400).json({ error: 'Internal server error' });

    }
  } else if (type === 'sentimentAreaGraphUn') {
    try {
      greaterThanTime = '2023-01-01'
      lessThanTime = '2023-04-30'
      const cxQuery = `${topicQueryString} AND Keywords:("Yes") `

      const params = {
        docvalue_fields: [{ field: 'p_created_time', format: 'date_time' }],
        query: {
          bool: {
            must: [
              { query_string: { query: cxQuery } },
              { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
            ]
          }
        },
        aggs: {
          '2': {
            date_histogram: {
              field: 'p_created_time',
              fixed_interval: '1d',
              min_doc_count: 0
            },
            aggs: {
              '3': {
                terms: { field: 'predicted_sentiment_value.keyword' }
              }
            }
          }
        }
      }

      const es_data = await clientsentiment(params)

      let p_str = ''
      let n_str = ''
      let neu_str = ''

      es_data?.aggregations['2'].buckets.forEach((bucket) => {
        let pos_count = 0
        let neg_count = 0
        let neu_count = 0
        bucket['3'].buckets.forEach((subBucket) => {
          if (subBucket.key === 'Positive') pos_count = subBucket.doc_count
          if (subBucket.key === 'Negative') neg_count = subBucket.doc_count
          if (subBucket.key === 'Neutral') neu_count = subBucket.doc_count
        })

        const date = new Date(bucket.key_as_string).toISOString().split('T')[0]
        p_str += `${date}~${pos_count}|`
        n_str += `${date}~${neg_count}|`
        neu_str += `${date}~${neu_count}|`
      })

      const dates_array = {
        positive_data: p_str.slice(0, -1),
        negative_data: n_str.slice(0, -1),
        neutral_data: neu_str.slice(0, -1)
      }

      return res.status(200).json(
        {
          dates_array
        }
        
      )
      
      
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'sentimentAreaGraph') {
    try {
      const cxQuery = `${topicQueryString} source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`
      const params = {
        docvalue_fields: [{ field: 'p_created_time', format: 'date_time' }],
        query: {
          bool: {
            must: [
              { query_string: { query: cxQuery } },
              { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
            ]
          }
        },
        aggs: {
          '2': {
            date_histogram: {
              field: 'p_created_time',
              fixed_interval: '5d',
              min_doc_count: 0
            },
            aggs: {
              '3': {
                terms: { field: 'predicted_sentiment_value.keyword', size: 10 }
              }
            }
          }
        }
      }

      const es_data = await client(params)
      let p_str = ''
      let n_str = ''
      let neu_str = ''

      es_data?.aggregations['2'].buckets.forEach((bucket) => {
        let pos_count = 0
        let neg_count = 0
        let neu_count = 0
        bucket['3'].buckets.forEach((subBucket) => {
          if (subBucket.key === 'Positive') pos_count = subBucket.doc_count
          if (subBucket.key === 'Negative') neg_count = subBucket.doc_count
          if (subBucket.key === 'Neutral') neu_count = subBucket.doc_count
        })

        const date = new Date(bucket.key_as_string).toISOString().split('T')[0]
        p_str += `${date}~${pos_count}|`
        n_str += `${date}~${neg_count}|`
        neu_str += `${date}~${neu_count}|`
      })

      const dates_array = {
        positive_data: p_str.slice(0, -1),
        negative_data: n_str.slice(0, -1),
        neutral_data: neu_str.slice(0, -1)
      }

       return res.status(200).json(
        {
          dates_array
        }
        
      )
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'complaintTouchpoints') {
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
     

      let responseOutput = {}

     
      for (let i = 0; i < sourcesArray.length; i++) {
       

        let complaintContent = 0
        let query = ''

        query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"')  AND llm_mention_type:("Customer Complaint") AND llm_mention_touchpoint:("${sourcesArray[i]}")`
        complaintContent = await elasticSearchCount(elasticMentionQueryTemplate(query, greaterThanTime, lessThanTime))
        if (complaintContent?.count > 0) {
          ;(responseOutput )[
            sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
          ] = complaintContent?.count
        }
      }

        return res.status(200).json(
        {
          responseOutput
        }
        
      )

     
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'UNDPtouchpoints') {
    try {
      const sourcesArray = [
        'Infrastructure Rebuilding',
        'Emergency Medical Aid',
        'Humanitarian Aid',
        'International Cooperation',
        'Disaster Relief Coordination',
        'Aid Effectiveness',
        'Recovery Progress',
        'Crisis Communications'
      ]


      let responseOutput = {}

    
      for (let i = 0; i < sourcesArray.length; i++) {
      

        let content = 0
        let query = ''
        let greatertime = '2023-01-01'
        let lesstime = '2023-04-30'

        
        query = `${topicQueryString} AND Keywords:("Yes")  AND llm_mention_touchpoint:("${sourcesArray[i]}")`
        content = await elasticSearchCount(elasticMentionQueryTemplate(query, '2023-01-01', '2023-04-30'))

        if (content?.count > 0) {
          ;(responseOutput )[
            sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
          ] = content?.count
        }
      }


        return res.status(200).json(
        {
          responseOutput
        }
        
      )
      
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'UNDPAnnoucement') {
    try {
      const sourcesArray = [
        'Missing Persons',
        'Humanitarian Aid Distribution',
        'Emergency Response Coordination',
        'Damage Reports',
        'Relief Measures',
        'Special Appeals',
        'Safety Tips',
        'Public Health Advisor',
        'Emergency Response Coordination',
        'International Cooperation',
        'Impact Reports',
        'Infrastructure Reports'
      ]
    

      let responseOutput = {}

      for (let i = 0; i < sourcesArray.length; i++) {
      

        let content = 0
        let query = ''

        query = `${topicQueryString} AND un_keywords:("Yes") AND announcement:("${sourcesArray[i]}")`

        content = await elasticSearchCount(elasticMentionQueryTemplate(query, '2023-01-01', '2023-04-30'))

        if (content?.count > 0) {
          ;(responseOutput )[
            sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
          ] = content?.count
        }
      }

    
        return res.status(200).json(
        {
          responseOutput
        }
        
      )
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'touchpointsIdentification') {
    try {
      const sourcesArray = [
        'Infrastructure Rebuilding',
        'Emergency Medical Aid',
        'Humanitarian Aid',
        'International Cooperation',
        'Disaster Relief Coordination',
        'Aid Effectiveness',
        'Recovery Progress',
        'Crisis Communications'
      ]
    

      let responseOutput = {}

    
      for (let i = 0; i < sourcesArray.length; i++) {


        let content = 0
        let query = ''

        query = `${topicQueryString} AND touchpoint_un:("${sourcesArray[i]}")`

        content = await elasticSearchCount(elasticMentionQueryTemplate(query, '2023-01-01', '2023-04-30'))

        if (content?.count > 0) {
          ;(responseOutput )[
            sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
          ] = content?.count
        }
      }


      
        return res.status(200).json(
        {
          responseOutput
        }
        
      )
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'touchpointSentimentsChartUNtopic') {
    try {
      const sourcesArray = [
        'Infrastructure Rebuilding',
        'Emergency Medical Aid',
        'Humanitarian Aid',
        'International Cooperation',
        'Disaster Relief Coordination',
        'Aid Effectiveness',
        'Recovery Progress',
        'Crisis Communications'
      ]


      let responseOutput = {}

    
      for (let i = 0; i < sourcesArray.length; i++) {


        let positiveContent = 0,
          negativeContent = 0,
          neutralContent = 0,
          webContent = 0
        let positiveContentQuery, negativeContentQuery, neutralContentQuery, webContentQuery

       

        positiveContentQuery = `${topicQueryString} AND un_keywords:("Yes") AND touchpoint_un:("${sourcesArray[i]}") AND predicted_sentiment_value:("Positive")`
        negativeContentQuery = `${topicQueryString} AND un_keywords:("Yes") AND touchpoint_un:("${sourcesArray[i]}") AND predicted_sentiment_value:("Negative")`
        neutralContentQuery = `${topicQueryString} AND un_keywords:("Yes") AND touchpoint_un:("${sourcesArray[i]}") AND predicted_sentiment_value:("Neutral")`

        positiveContent = await elasticSearchCount(
          elasticMentionQueryTemplate(positiveContentQuery, '2023-02-05', '2023-02-21')
        )
        negativeContent = await elasticSearchCount(
          elasticMentionQueryTemplate(negativeContentQuery, '2023-02-05', '2023-02-21')
        )
        neutralContent = await elasticSearchCount(
          elasticMentionQueryTemplate(neutralContentQuery, '2023-02-05', '2023-02-21')
        )

        if (positiveContent.count > 0 || negativeContent.count > 0 || neutralContent.count > 0) {
          ;(responseOutput )[
            sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
          ] = {
            positiveContent: positiveContent?.count,
            negativeContent: negativeContent?.count,
            neutralContent: neutralContent?.count
          }
        }
      }

      // console.log('data', responseOutput)

     
        return res.status(200).json(
        {
          responseOutput
        }
        
      )
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'IGOEntities') {
    try {
      const sourcesArray = [
        'United Nations Development Programme (UNDP)',
        "United Nations Children's Fund (UNICEF)",
        'World Health Organization (WHO)',
        'United Nations High Commissioner for Refugees (UNHCR)',
        'World Food Programme (WFP)',
        'International Labour Organization (ILO)',
        'United Nations Educational, Scientific and Cultural Organization (UNESCO)',
        'United Nations Population Fund (UNFPA)',
        'United Nations Office on Drugs and Crime (UNODC)',
        'International Criminal Court (ICC)',
        'International Maritime Organization (IMO)',
        'International Telecommunication Union (ITU)',
        'United Nations Environment Programme (UNEP)',
        'United Nations Office for the Coordination of Humanitarian Affairs (OCHA)',
        'United Nations Institute for Training and Research (UNITAR)',
        'United Nations Conference on Trade and Development (UNCTAD)',
        'United Nations Human Settlements Programme (UN-Habitat)',
        'World Intellectual Property Organization (WIPO)',
        'United Nations Framework Convention on Climate Change (UNFCCC)'
      ]

      let responseOutput = {}

      for (let i = 0; i < sourcesArray.length; i++) {
       
        let content = 0
        let query = ''

        query = `${topicQueryString}  AND igo_entities:("${sourcesArray[i]}")`

        content = await elasticSearchCount(elasticMentionQueryTemplate(query, '2023-01-01', '2024-12-03'))

        if (content?.count > 0) {
          ;(responseOutput )[
            sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
          ] = content?.count
        }
      }



   
        return res.status(200).json(
        {
          responseOutput
        }
        
      )
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'IGOSentimentsChartUNtopic') {
    try {
      const sourcesArray = [
        'United Nations Development Programme (UNDP)',
        "United Nations Children's Fund (UNICEF)",
        'World Health Organization (WHO)',
        'United Nations High Commissioner for Refugees (UNHCR)',
        'World Food Programme (WFP)',
        'International Labour Organization (ILO)',
        'United Nations Educational, Scientific and Cultural Organization (UNESCO)',
        'United Nations Population Fund (UNFPA)',
        'United Nations Office on Drugs and Crime (UNODC)',
        'International Criminal Court (ICC)',
        'International Maritime Organization (IMO)',
        'International Telecommunication Union (ITU)',
        'United Nations Environment Programme (UNEP)',
        'United Nations Office for the Coordination of Humanitarian Affairs (OCHA)',
        'United Nations Institute for Training and Research (UNITAR)',
        'United Nations Conference on Trade and Development (UNCTAD)',
        'United Nations Human Settlements Programme (UN-Habitat)',
        'World Intellectual Property Organization (WIPO)',
        'United Nations Framework Convention on Climate Change (UNFCCC)'
      ]

      let responseOutput = {}

     
      for (let i = 0; i < sourcesArray.length; i++) {
       

        let positiveContent = 0,
          negativeContent = 0,
          neutralContent = 0,
          webContent = 0
        let positiveContentQuery, negativeContentQuery, neutralContentQuery, webContentQuery

       

        positiveContentQuery = `${topicQueryString}   AND igo_entities:("${sourcesArray[i]}") AND predicted_sentiment_value:("Positive")`
        negativeContentQuery = `${topicQueryString}   AND igo_entities:("${sourcesArray[i]}") AND predicted_sentiment_value:("Negative")`
        neutralContentQuery = `${topicQueryString}  AND igo_entities:("${sourcesArray[i]}") AND predicted_sentiment_value:("Neutral")`

        positiveContent = await elasticSearchCount(
          elasticMentionQueryTemplate(positiveContentQuery, '2023-01-01', '2024-12-03')
        )

        negativeContent = await elasticSearchCount(
          elasticMentionQueryTemplate(negativeContentQuery, '2023-01-01', '2024-12-03')
        )
        neutralContent = await elasticSearchCount(
          elasticMentionQueryTemplate(neutralContentQuery, '2023-01-01', '2024-12-03')
        )

        if (positiveContent.count > 0 || negativeContent.count > 0 || neutralContent.count > 0) {
          ;(responseOutput )[
            sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
          ] = {
            positiveContent: positiveContent?.count,
            negativeContent: negativeContent?.count,
            neutralContent: neutralContent?.count
          }
        }
      }


      
        return res.status(200).json(
        {
          responseOutput
        }
        
      )
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'unAidsChart') {

    try {
      let dataArray = []
      if (aidType === 'Aid Requested/Aid Recieved') {
        const query1 = `${topicQueryString}  AND aid_requests_received:("receipt of aid")`
        const query2 = `${topicQueryString} AND aid_requests_received:("request for aid")`

        const aidRec = await elasticSearchCount(elasticMentionQueryTemplate(query1, '2023-01-01', '2023-04-30'))
        const aidReq = await elasticSearchCount(elasticMentionQueryTemplate(query2, '2023-01-01', '2023-04-30'))

        dataArray = [aidReq.count, aidRec.count]
      } else if (aidType === 'Aid Type') {
        const query1 = `${topicQueryString}  AND aid_type:("Local Aid")`
        const query2 = `${topicQueryString}  AND aid_type:("International Aid")`

        const local = await elasticSearchCount(elasticMentionQueryTemplate(query1, '2023-01-01', '2023-04-30'))
        const inter = await elasticSearchCount(elasticMentionQueryTemplate(query2, '2023-01-01', '2023-04-30'))
        dataArray = [local.count, inter.count]
      } else if (aidType === 'Mental Health and Trauma') {
        const query1 = `${topicQueryString}  AND Aid Type:("Local Aid")`
        const query2 = `${topicQueryString}  AND Aid Type:("International Aid")`

        const local = await elasticSearchCount(elasticMentionQueryTemplate(query1, '2023-01-01', '2023-04-30'))
        const inter = await elasticSearchCount(elasticMentionQueryTemplate(query2, '2023-01-01', '2023-04-30'))
        dataArray = [local.count, inter.count]
      } else if (aidType === 'Political or Social Criticism') {
        const query1 = `${topicQueryString} AND Aid Type:("Local Aid")`
        const query2 = `${topicQueryString} AND Aid Type:("International Aid")`

        const local = await elasticSearchCount(elasticMentionQueryTemplate(query1, '2023-01-01', '2023-04-30'))
        const inter = await elasticSearchCount(elasticMentionQueryTemplate(query2, '2023-01-01', '2023-04-30'))
        dataArray = [local.count, inter.count]
      } else if (aidType === 'Environmental Hazards') {
        const query1 = `${topicQueryString}  AND Aid Type:("Local Aid")`
        const query2 = `${topicQueryString}  AND Aid Type:("International Aid")`

        const local = await elasticSearchCount(elasticMentionQueryTemplate(query1, '2023-01-01', '2023-04-30'))
        const inter = await elasticSearchCount(elasticMentionQueryTemplate(query2, '2023-01-01', '2023-04-30'))
        dataArray = [local.count, inter.count]
      }

        return res.status(200).json(
        {
          dataArray
        }
        
      )
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'touchpointIndustry') {
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

      let responseOutput = {}

      
      for (let i = 0; i < sourcesArray.length; i++) {
       

        let twitterContent = 0,
          facebookContent = 0,
          instagramContent = 0,
          webContent = 0
        let twitterContentQuery, facebookContentQuery, instagramContentQuery, webContentQuery

        twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
        facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
        instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`

        twitterContent = await elasticSearchCount(
          elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
        )
        facebookContent = await elasticSearchCount(
          elasticMentionQueryTemplate(facebookContentQuery, greaterThanTime, lessThanTime)
        )
        instagramContent = await elasticSearchCount(
          elasticMentionQueryTemplate(instagramContentQuery, greaterThanTime, lessThanTime)
        )
       

        if (twitterContent.count > 0 || facebookContent.count > 0 || instagramContent.count > 0) {
          ;(responseOutput )[
            sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
          ] = {
            twitterContent: twitterContent?.count,
            facebookContent: facebookContent?.count,
            instagramContent: instagramContent?.count
          }
        }
      }

        return res.status(200).json(
        {
          responseOutput
        }
        
      )

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'touchpointSentimentsChart') {
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


      let responseOutput = {}

 
      for (let i = 0; i < sourcesArray.length; i++) {
       

        let positiveContent = 0,
          negativeContent = 0,
          neutralContent = 0,
          webContent = 0
        let positiveContentQuery, negativeContentQuery, neutralContentQuery, webContentQuery

        positiveContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Positive") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
        negativeContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Negative") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
        neutralContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Neutral") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
        positiveContent = await elasticSearchCount(
          elasticMentionQueryTemplate(positiveContentQuery, greaterThanTime, lessThanTime)
        )
        negativeContent = await elasticSearchCount(
          elasticMentionQueryTemplate(negativeContentQuery, greaterThanTime, lessThanTime)
        )
        neutralContent = await elasticSearchCount(
          elasticMentionQueryTemplate(neutralContentQuery, greaterThanTime, lessThanTime)
        )

        if (positiveContent.count > 0 || negativeContent.count > 0 || neutralContent.count > 0) {
          ;(responseOutput )[
            sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
          ] = {
            positiveContent: positiveContent?.count,
            negativeContent: negativeContent?.count,
            neutralContent: neutralContent?.count
          }
        }
      }

       return res.status(200).json(
        {
          responseOutput
        }
        
      )

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'customerJourneyChart') {
    try {

      const sourcesArray = [
        'Awareness',
        'Advocacy',
        'Consideration',
        'Application',
        'Onboarding',
        'Usage',
        'Support',
        'Retention',
        'Booking',
        'Pre-flight',
        'In-flight',
        'Engagement',
        'Post-flight',
        'Acquisition',
        'Loyalty',
        'Purchase',
        'Activation',
        'Processing',
        'Service Delivery',
        'Feedback',
        'Renewal',
        'Subscription',
        'Billing',
        'Support',
        'Post-Purchase Support',
        'Churn',
        'Other'
      ]

      //const twitterContentQuery = `${topicQueryString} AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND product_ref_ind:("Baggage Services")`

      let responseOutput = {}


      for (let i = 0; i < sourcesArray.length; i++) {


        let twitterContent = 0,
          facebookContent = 0,
          instagramContent = 0,
          webContent = 0
        let twitterContentQuery, facebookContentQuery, instagramContentQuery, webContentQuery

        twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND customer_journey:("${sourcesArray[i]}")`
        facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND customer_journey:("${sourcesArray[i]}")`
        instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND customer_journey:("${sourcesArray[i]}")`
        // webContentQuery = `${topicQueryString} AND source:('"FakeNews" OR "News" OR "Blogs" OR "Web"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND customer_journey:("${sourcesArray[i]}")`
        // console.log(twitterContentQuery, 'customerJourneyChart')
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
          instagramContent.count > 0 ||
          webContent.count > 0
        ) {
          ;(responseOutput )[sourcesArray[i]] = {
            twitterContent: twitterContent?.count,
            facebookContent: facebookContent?.count,
            instagramContent: instagramContent?.count
            // webContent: webContent?.count
          }
        }
      }

   return res.status(200).json(
        {
          responseOutput
        }
        
      )

    }catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'customerJourneySentimentsChart') {
    try {
      const sourcesArray = [
        'Awareness',
        'Consideration',
        'Application',
        'Onboarding',
        'Usage',
        'Support',
        'Retention',
        'Booking',
        'Pre-flight',
        'In-flight',
        'Post-flight',
        'Loyalty',
        'Purchase',
        'Activation',
        'Processing',
        'Service Delivery',
        'Feedback',
        'Renewal',
        'Subscription',
        'Billing',
        'Support',
        'Post-Purchase Support',
        'Churn',
        'Other'
      ]

      //const twitterContentQuery = `${topicQueryString} AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND product_ref_ind:("Baggage Services")`

      let responseOutput = {}

      // const dat = await elasticSearchCount(
      //   elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
      // )
      // console.log('data', dat)

      // const dat = await testClientElasticQuery()
      // console.log('dataasds', dat?.hits?.hits)
      for (let i = 0; i < sourcesArray.length; i++) {
        // let _sources
        // if (sourcesArray[i] === 'Youtube') {
        //   _sources = '"Youtube" OR "Vimeo"'
        // } else if (sourcesArray[i] === 'Web') {
        //   _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
        // } else {
        //   _sources = sourcesArray[i]
        // }

        let positiveContent = 0,
          negativeContent = 0,
          neutralContent = 0,
          webContent = 0
        let positiveContentQuery, negativeContentQuery, neutralContentQuery, webContentQuery

        positiveContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Positive") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND customer_journey:("${sourcesArray[i]}")`
        negativeContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Negative") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND customer_journey:("${sourcesArray[i]}")`
        //neutralContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram" OR "FakeNews" OR "News" OR "Blogs" OR "Web"') AND predicted_sentiment_value:("neutral") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND customer_journey:("${sourcesArray[i]}")`
        // console.log(positiveContentQuery, 'Customer Journey Sentiments')
        positiveContent = await elasticSearchCount(
          elasticMentionQueryTemplate(positiveContentQuery, greaterThanTime, lessThanTime)
        )
        negativeContent = await elasticSearchCount(
          elasticMentionQueryTemplate(negativeContentQuery, greaterThanTime, lessThanTime)
        )
        // neutralContent = await elasticSearchCount(
        //   elasticMentionQueryTemplate(neutralContentQuery, greaterThanTime, lessThanTime)
        // )

        if (positiveContent.count > 0 || negativeContent.count > 0 || neutralContent.count > 0) {
          ;(responseOutput )[sourcesArray[i]] = {
            negativeContent: negativeContent?.count * -1,
            positiveContent: positiveContent?.count

            //neutralContent: neutralContent?.count
          }
        }
      }

      //console.log('data', responseOutput)

         return res.status(200).json(
        {
          responseOutput
        }
        
      )
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'productReferenceChart') {
    try {
      const sourcesArray = [
        'Retail Banking Services',
        'Lending Solutions',
        'Card Services',
        'Investment Products',
        'Insurance Offerings',
        'Digital Banking Platforms',
        'Wealth Management',
        'Payment Services',
        'Other'
      ]
      // const sourcesArray = [
      //   'Checking Account',
      //   'Savings Account',
      //   'Credit Card',
      //   'Personal Loan',
      //   'Retail Banking Services',
      //   'Lending Solutions',
      //   'Investment Products',
      //   'Digital Banking Platforms',
      //   'Payment Services',
      //   'Mortgage',
      //   'Insurance Offerings',
      //   'Investment Account',
      //   'Business Banking',
      //   'Wealth Management',
      //   'Online Banking',
      //   'Mobile Banking App',
      //   'ATM Services',
      //   'Fraud Protection',
      //   'Foreign Exchange',
      //   'Mobile Phone Plan',
      //   'Internet Plan',
      //   'TV Service',
      //   'SIM Card',
      //   'Roaming Services',
      //   'Device Purchase',
      //   'Network Coverage',
      //   'Data Plan',
      //   'Installation Services',
      //   'Customer Support',
      //   'Flight Ticket',
      //   'Seat Selection',
      //   'Baggage Services',
      //   'In-flight Meals',
      //   'In-flight Entertainment',
      //   'Loyalty Program',
      //   'Airport Lounge Access',
      //   'Boarding Pass',
      //   'Flight Change/Cancelation',
      //   'Special Assistance Services',
      //   'Cargo Services',
      //   'Online Check-in',
      //   'Other'
      // ]

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

        twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND product_ref_ind:("${sourcesArray[i]}")`
        facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND product_ref_ind:("${sourcesArray[i]}")`
        instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND product_ref_ind:("${sourcesArray[i]}")`
        //webContentQuery = `${topicQueryString} AND source:('"FakeNews" OR "News" OR "Blogs" OR "Web"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND product_ref_ind:("${sourcesArray[i]}")`
        // console.log(twitterContentQuery, 'twitterContentQueryproductReferenceChart')
        twitterContent = await elasticSearchCount(
          elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
        )
        facebookContent = await elasticSearchCount(
          elasticMentionQueryTemplate(facebookContentQuery, greaterThanTime, lessThanTime)
        )
        instagramContent = await elasticSearchCount(
          elasticMentionQueryTemplate(instagramContentQuery, greaterThanTime, lessThanTime)
        )
        // webContent = await elasticSearchCount(
        //   elasticMentionQueryTemplate(webContentQuery, greaterThanTime, lessThanTime)
        // )

        if (twitterContent.count > 0 || facebookContent.count > 0 || instagramContent.count > 0) {
          ;(responseOutput )[sourcesArray[i]] = {
            twitterContent: twitterContent?.count,
            facebookContent: facebookContent?.count,
            instagramContent: instagramContent?.count
            // webContent: webContent?.count
          }
        }
      }

      //console.log('data', responseOutput)

   return res.status(200).json(
        {
          responseOutput
        }
        
      )    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'productReferenceSentimentChart') {
    try {
      // const sourcesArray = [
      //   'Checking Account',
      //   'Savings Account',
      //   'Credit Card',
      //   'Personal Loan',
      //   'Mortgage',
      //   'Investment Account',
      //   'Business Banking',
      //   'Wealth Management',
      //   'Online Banking',
      //   'Mobile Banking App',
      //   'ATM Services',
      //   'Fraud Protection',
      //   'Foreign Exchange',
      //   'Mobile Phone Plan',
      //   'Internet Plan',
      //   'TV Service',
      //   'SIM Card',
      //   'Roaming Services',
      //   'Device Purchase',
      //   'Network Coverage',
      //   'Data Plan',
      //   'Installation Services',
      //   'Customer Support',
      //   'Flight Ticket',
      //   'Seat Selection',
      //   'Baggage Services',
      //   'In-flight Meals',
      //   'In-flight Entertainment',
      //   'Loyalty Program',
      //   'Airport Lounge Access',
      //   'Boarding Pass',
      //   'Flight Change/Cancelation',
      //   'Special Assistance Services',
      //   'Cargo Services',
      //   'Online Check-in',
      //   'Other'
      // ]

      const sourcesArray = [
        'Retail Banking Services',
        'Lending Solutions',
        'Card Services',
        'Investment Products',
        'Insurance Offerings',
        'Digital Banking Platforms',
        'Wealth Management',
        'Payment Services',
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

        let positiveContent = 0,
          negativeContent = 0,
          neutralContent = 0,
          webContent = 0
        let positiveContentQuery, negativeContentQuery, neutralContentQuery, webContentQuery

        positiveContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Positive") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND product_ref_ind:("${sourcesArray[i]}")`
        negativeContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Negative") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND product_ref_ind:("${sourcesArray[i]}")`
        neutralContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Neutral") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND product_ref_ind:("${sourcesArray[i]}")`
        // console.log(positiveContentQuery, 'productReferenceSentimentChart')
        positiveContent = await elasticSearchCount(
          elasticMentionQueryTemplate(positiveContentQuery, greaterThanTime, lessThanTime)
        )
        negativeContent = await elasticSearchCount(
          elasticMentionQueryTemplate(negativeContentQuery, greaterThanTime, lessThanTime)
        )
        neutralContent = await elasticSearchCount(
          elasticMentionQueryTemplate(neutralContentQuery, greaterThanTime, lessThanTime)
        )

        if (positiveContent.count > 0 || negativeContent.count > 0 || neutralContent.count > 0) {
          ;(responseOutput )[sourcesArray[i]] = {
            positiveContent: positiveContent?.count,
            negativeContent: negativeContent?.count,
            neutralContent: neutralContent?.count
          }
        }
      }

      //console.log('data', responseOutput)

   return res.status(200).json(
        {
          responseOutput
        }
        
      )    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'customerSatisfactoryScore') {
    try {
      // const twitterContentQuery = `${topicQueryString} AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`

      // const dat = await elasticSearchCount(
      //   elasticMentionScoreQuery(twitterContentQuery, greaterThanTime, lessThanTime, 0.01, 0.20)
      // )

      // console.log('yt', dat)

      const sourcesArray2 = [
        {
          name: '0 to 20 %',
          gval: 0.0000001,
          lval: 0.2
        },
        {
          name: '20 to 40 %',
          gval: 0.2,
          lval: 0.4
        },
        {
          name: '40 to 60 %',
          gval: 0.4,
          lval: 0.6
        },
        {
          name: '60 to 80 %',
          gval: 0.6,
          lval: 0.8
        },
        {
          name: '80 to 100 %',
          gval: 0.8,
          lval: 0.99
        }
      ]

      const sourcesArray = ['Twitter', 'Instagram', 'Facebook']

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
        let twitterContent = 0,
          facebookContent = 0,
          instagramContent = 0,
          webContent = 0
        let twitterContentQuery, facebookContentQuery, instagramContentQuery, webContentQuery

        let twentyFiveScore = 0,
          fiftyPercentScore = 0,
          seventyPercentScore = 0,
          hundredPercentScore = 0
        let query

        query = `${topicQueryString} AND source:(${_sources}) AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') `

        twentyFiveScore = await elasticSearchCount(
          elasticMentionScoreQuery(query, greaterThanTime, lessThanTime, 0.0, 0.25)
        )
        fiftyPercentScore = await elasticSearchCount(
          elasticMentionScoreQuery(query, greaterThanTime, lessThanTime, 0.25, 0.5)
        )

        seventyPercentScore = await elasticSearchCount(
          elasticMentionScoreQuery(query, greaterThanTime, lessThanTime, 0.5, 0.75)
        )
        // console.log(seventyPercentScore, 'seventyPercentScore')

        hundredPercentScore = await elasticSearchCount(
          elasticMentionScoreQuery(query, greaterThanTime, lessThanTime, 0.75, 0.99)
        )
        // console.log(hundredPercentScore, 'hundredPercentScore')
        ;(responseOutput )[sourcesArray[i]] = {
          twentyFiveScore: twentyFiveScore?.count,
          fiftyPercentScore: fiftyPercentScore?.count,
          seventyPercentScore: seventyPercentScore?.count,
          hundredPercentScore: hundredPercentScore?.count
        }
      }

      //console.log('data', responseOutput)

   return res.status(200).json(
        {
          responseOutput
        }
        
      )    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'ProductChurnProbabilityChart') {
    try {
      // const twitterContentQuery = `${topicQueryString} AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`

      // const dat = await testClientElasticQuery(
      //   elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
      // )

      // console.log('yt', dat?.hits?.hits)
      // const sourcesArray = [
      //   'Checking Account',
      //   'Savings Account',
      //   'Credit Card',
      //   'Personal Loan',
      //   'Mortgage',
      //   'Investment Account',
      //   'Business Banking',
      //   'Wealth Management',
      //   'Online Banking',
      //   'Mobile Banking App',
      //   'ATM Services',
      //   'Fraud Protection',
      //   'Foreign Exchange',
      //   'Mobile Phone Plan',
      //   'Internet Plan',
      //   'TV Service',
      //   'SIM Card',
      //   'Roaming Services',
      //   'Device Purchase',
      //   'Network Coverage',
      //   'Data Plan',
      //   'Installation Services',
      //   'Customer Support',
      //   'Flight Ticket',
      //   'Seat Selection',
      //   'Baggage Services',
      //   'In-flight Meals',
      //   'In-flight Entertainment',
      //   'Loyalty Program',
      //   'Airport Lounge Access',
      //   'Boarding Pass',
      //   'Flight Change/Cancelation',
      //   'Special Assistance Services',
      //   'Cargo Services',
      //   'Online Check-in',
      //   'Other'
      // ]
      const sourcesArray = [
        'Retail Banking Services',
        'Lending Solutions',
        'Card Services',
        'Investment Products',
        'Insurance Offerings',
        'Digital Banking Platforms',
        'Wealth Management',
        'Payment Services',
        'Other'
      ]

      let responseOutput = {}

      for (let i = 0; i < sourcesArray.length; i++) {
        // let twentyFiveScore = 0,
        //   fiftyPercentScore = 0,
        //   seventyPercentScore = 0,
        //   hundredPercentScore = 0

        let highScore = 0,
          lowScore = 0,
          mediumScore = 0
        let query

        query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')  AND product_ref_ind:("${sourcesArray[i]}")`

        lowScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 0.000001, 40)
        )
        mediumScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 40, 70)
        )
        highScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 70, 100)
        )
        if (highScore.count > 0 || mediumScore.count > 0 || lowScore.count > 0) {
          ;(responseOutput )[sourcesArray[i]] = {
            highScore: highScore?.count,
            mediumScore: mediumScore?.count,
            lowScore: lowScore?.count
          }
        }
      }
      //console.log('data', responseOutput)

   return res.status(200).json(
        {
          responseOutput
        }
        
      )    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'churnProbabilityChart') {
    try {
      // const twitterContentQuery = `${topicQueryString} AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`

      // const dat = await testClientElasticQuery(
      //   elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
      // )

      // console.log('yt', dat?.hits?.hits)

      // const sourcesArray2 = [
      //   {
      //     name: '0 to 20 %',
      //     gval: 0.0000001,
      //     lval: 0.2
      //   },
      //   {
      //     name: '20 to 40 %',
      //     gval: 0.2,
      //     lval: 0.4
      //   },
      //   {
      //     name: '40 to 60 %',
      //     gval: 0.4,
      //     lval: 0.6
      //   },
      //   {
      //     name: '60 to 80 %',
      //     gval: 0.6,
      //     lval: 0.8
      //   },
      //   {
      //     name: '80 to 100 %',
      //     gval: 0.8,
      //     lval: 0.99
      //   }
      // ]

      const sourcesArray = ['Twitter', 'Instagram', 'Facebook']

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
        // let twitterContent = 0,
        //   facebookContent = 0,
        //   instagramContent = 0,
        //   webContent = 0
        // let twitterContentQuery, facebookContentQuery, instagramContentQuery, webContentQuery

        let twentyFiveScore = 0,
          fiftyPercentScore = 0,
          seventyPercentScore = 0,
          hundredPercentScore = 0
        let query

        query = `${topicQueryString} AND source:(${_sources}) AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') `

        twentyFiveScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 0.000001, 25)
        )
        fiftyPercentScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 25, 50)
        )
        seventyPercentScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 50, 75)
        )
        hundredPercentScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 75, 100)
        )
        ;(responseOutput )[sourcesArray[i]] = {
          twentyFiveScore: twentyFiveScore?.count,
          fiftyPercentScore: fiftyPercentScore?.count,
          seventyPercentScore: seventyPercentScore?.count,
          hundredPercentScore: hundredPercentScore?.count
        }
      }

      // console.log('data', responseOutput)

   return res.status(200).json(
        {
          responseOutput
        }
        
      )    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'churnProbabilitySentimentChart') {
    try {
      // const twitterContentQuery = `${topicQueryString} AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`

      // const dat = await testClientElasticQuery(
      //   elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
      // )

      // console.log('yt', dat?.hits?.hits)

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
      // const sourcesArray = [
      //   'Mobile Banking App',
      //   'Mobile App',
      //   'Website',
      //   'ATM',
      //   'Physical Branch',
      //   'Social Media',
      //   'Online Banking Platform',
      //   'Customer Service (Phone, Email, or Live Chat)',
      //   'IVR System',
      //   'Call Center',
      //   'Bill Payment Platform',
      //   'Loan Application Process',
      //   'Service Connection/Disconnection',
      //   'Physical Office',
      //   'Installation/Technical Support',
      //   'Network Coverage',
      //   'Billing System',
      //   'Data Roaming',
      //   'Plan Upgrades',
      //   'Device Purchases/Repairs',
      //   'Wi-Fi Services',
      //   'Home Internet Services',
      //   'Meter Reading',
      //   'Outage Reporting System',
      //   'Mortgage Services',
      //   'Credit Card Services',
      //   'Fraud Detection/Resolution',
      //   'Wealth Management',
      //   'Transaction Alerts',
      //   'Airport Check-in Counter',
      //   'Self-service Kiosk',
      //   'In-flight Experience',
      //   'Boarding Process',
      //   'Baggage Handling',
      //   'Loyalty Program',
      //   'Government Website/Portal',
      //   'Public Service Office',
      //   'Document Submission Process',
      //   'Permit/License Application',
      //   'In-person Appointment',
      //   'Physical Store',
      //   'Digital Channels',
      //   'Customer Support',
      //   'Physical Channels',
      //   'Social and Engagement Channels',
      //   'Messaging and Alerts',
      //   'Loyalty and Rewards',
      //   'Other'
      // ]

      let responseOutput = {}

      for (let i = 0; i < sourcesArray.length; i++) {
        // let twentyFiveScore = 0,
        //   fiftyPercentScore = 0,
        //   seventyPercentScore = 0,
        //   hundredPercentScore = 0

        let highScore = 0,
          lowScore = 0,
          mediumScore = 0
        let query

        query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`

        lowScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 0.000001, 40)
        )
        mediumScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 40, 70)
        )
        highScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 70, 100)
        )
        if (highScore.count > 0 || mediumScore.count > 0 || lowScore.count > 0) {
          ;(responseOutput )[sourcesArray[i]] = {
            highScore: highScore?.count,
            mediumScore: mediumScore?.count,
            lowScore: lowScore?.count
          }
        }
      }
      //console.log('data', responseOutput)

   return res.status(200).json(
        {
          responseOutput
        }
        
      )
        } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'satisfactionSentimentSummary') {
    try {
      const query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') `

      // const esData2 = await testClientElasticQuery()
      // console.log('dataTesting', esData2?.hits?.hits)

      // ['predicted_sentiment_value', 'predicted_category', 'llm_mention_type', 'llm_mention_touchpoint', 'llm_mention_urgency', 'llm_mention_audience', 'llm_mention_action', 'llm_product_ref', 'llm_mention_tone', 'llm_mention_recurrence']
      const lowSenti = await elasticSearchCount(
        elasticMentionScoreQuery(query, greaterThanTime, lessThanTime, 0.000001, 0.4)
      )
      const mediumSenti = await elasticSearchCount(
        elasticMentionScoreQuery(query, greaterThanTime, lessThanTime, 0.4, 0.7)
      )
      const highSenti = await elasticSearchCount(
        elasticMentionScoreQuery(query, greaterThanTime, lessThanTime, 0.7, 0.99)
      )

      const totalSentiments = highSenti?.count + lowSenti?.count + mediumSenti?.count

      const responseOutput = `High(70-100%),${highSenti?.count}|Medium(40-70%),${mediumSenti?.count}|Low(0-40%),${lowSenti?.count}`

         return res.status(200).json(
        {
          responseOutput,
          totalSentiments
        }
        
      )
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'churnSentimentSummary') {
    try {
      const query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') `

      // const esData2 = await testClientElasticQuery()
      // console.log('dataTesting', esData2?.hits?.hits)

      // ['predicted_sentiment_value', 'predicted_category', 'llm_mention_type', 'llm_mention_touchpoint', 'llm_mention_urgency', 'llm_mention_audience', 'llm_mention_action', 'llm_product_ref', 'llm_mention_tone', 'llm_mention_recurrence']
      const lowSenti = await elasticSearchCount(
        elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 0.000001, 40)
      )
      const mediumSenti = await elasticSearchCount(
        elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 40, 70)
      )
      const highSenti = await elasticSearchCount(
        elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 70, 100)
      )

      const totalSentiments = highSenti?.count + lowSenti?.count + mediumSenti?.count

      const responseOutput = `High(70-100%),${highSenti?.count}|Low(0-40%),${lowSenti?.count}|Medium(40-70%),${mediumSenti?.count}`

     return res.status(200).json(
        {
          responseOutput,
          totalSentiments
        }
        
      )    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'ComplaintClouds') {
    try {
      let result

      result = await prisma.wordcloud_cx_data.findMany({
        where: {
          wc_time: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // last 7 days
          },
          wc_tid: topicId
        }
      })

      let wc_to_array
      let shuffeled2
      if (result?.length !== 0 && typeof result[0]?.wc_str_sorted === 'string') {
        try {
          wc_to_array = result[0]?.wc_str_sorted // Assuming wc_str_sorted is already an array
        } catch (error) {
          throw new Error('Failed to retrieve wc_str_sorted from result')
        }

        function parseShuffeled(shuffeled) {
          if (typeof shuffeled === 'string') {
            try {
              shuffeled = JSON.parse(shuffeled)
            } catch (error) {
              console.error('Invalid JSON string:', error)
              return null
            }
          }
          return shuffeled
        }

        shuffeled2 = parseShuffeled(wc_to_array)
      } else if (result?.length !== 0) {
        shuffeled2 = result[0]?.wc_str_sorted
      }

      if (result?.length === 0 || shuffeled2?.length === 0 || filters === 'true') {
        const elasticMentionQueryTemplate = (topicQueryString, gte, lte) => ({
          from: 0,
          size: 1000,
          query: {
            bool: {
              must: [
                { query_string: { query: topicQueryString } },
                {
                  range: {
                    p_created_time: { gte: gte, lte: lte }
                  }
                }
              ]
            }
          }
        })

        let complaintContent
        let query = ''

        query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"')  AND llm_mention_type:("Customer Complaint") AND llm_mention_touchpoint:('"Mobile Banking App" OR
        "Mobile App" OR
        "Website" OR
        "ATM" OR
        "Physical Branch" OR
        "Social Media" OR
        "Online Banking Platform" OR
        "Customer Service (Phone OR  Email OR  or Live Chat)" OR
        "IVR System" OR
        "Call Center" OR
        "Bill Payment Platform" OR
        "Loan Application Process" OR
        "Service Connection/Disconnection" OR
        "Physical Office" OR
        "Installation/Technical Support" OR
        "Network Coverage" OR
        "Billing System" OR
        "Data Roaming" OR
        "Plan Upgrades" OR
        "Device Purchases/Repairs" OR
        "Wi-Fi Services" OR
        "Home Internet Services" OR
        "Meter Reading" OR
        "Outage Reporting System" OR
        "Mortgage Services" OR
        "Credit Card Services" OR
        "Fraud Detection/Resolution" OR
        "Wealth Management" OR
        "Transaction Alerts" OR
        "Airport Check-in Counter" OR
        "Self-service Kiosk" OR
        "In-flight Experience" OR
        "Boarding Process" OR
        "Baggage Handling" OR
        "Loyalty Program" OR
        "Government Website/Portal" OR
        "Public Service Office" OR
        "Document Submission Process" OR
        "Permit/License Application" OR
        "In-person Appointment" OR
        "Physical Store" OR
         "Digital Channels" OR
        "Physical Channels" OR
        "Customer Support" OR
        "Social and Engagement Channels" OR
        "Messaging and Alerts" OR
        "Loyalty and Rewards" OR
        "Other"')`
        // console.log(query, 'ComplaintClouds is here')
        complaintContent = await testClientElasticQuery(
          elasticMentionQueryTemplate(query, greaterThanTime, lessThanTime)
        )

        const pIds = complaintContent?.hits?.hits.map((hit) => hit._source.p_id)
        const params = {
          query: {
            bool: {
              filter: [
                { ids: { values: pIds } },
                { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
              ]
            }
          },
          aggs: {
            tagcloud: {
              terms: { field: 'p_message', size: 60 }
            }
          }
        }
        const results = await testClientElasticQuery(params)
        const tagCloud = results
        const omitWords = await prisma.omit_words.findMany()
        const omitWordsArray = omitWords.map((word) => word.word)

        const wordstagArray = []

        function isNumeric(value) {
          // Use parseFloat or parseInt to convert the value to a number
          // and then check if it's a valid number and not NaN (Not-a-Number)
          return !isNaN(parseFloat(value)) && isFinite(value)
        }

        for (let i = 0; i < results?.aggregations?.tagcloud?.buckets?.length; i++) {
          const key = results?.aggregations?.tagcloud?.buckets[i].key
          const doc_count = results?.aggregations?.tagcloud?.buckets[i].doc_count

          if (key && !isNumeric(key) && !omitWordsArray.includes(key) && key.length >= 4) {
            wordstagArray?.push({ tag: key.replace("'", ''), count: doc_count })
          }
        }

        const sortedArr = wordstagArray?.sort((a, b) => b.count - a.count) // Sort by count descending

        let fsize = 0
        let top_count = 0
        let top_count_name = ''
        let finalTagsArray = []
        let tagStr = ''

        for (let j = 0; j < sortedArr?.length; j++) {
          const word = sortedArr[j]?.tag
          const word_count = sortedArr[j]?.count

          if (j === 0) {
            top_count = word_count
            top_count_name = word
          }

          finalTagsArray?.push({ tag: word.replace("'", ''), count: word_count })
          tagStr += `${word} `

          if (fsize <= 38) {
            fsize += 2
          }

          if (j >= 60) {
            // This check should be equal to how many tags to show
            break
          }
        }

        // Shuffle finalTagsArray (Fisher-Yates shuffle)
        for (let i = finalTagsArray?.length - 1; i > 0; i--) {
          const j = Math?.floor(Math.random() * (i + 1))
          ;[finalTagsArray[i], finalTagsArray[j]] = [finalTagsArray[j], finalTagsArray[i]]
        }

        const finalTagsArraySorted = finalTagsArray.sort((a, b) => b.count - a.count)

        let chk
        chk = await prisma.wordcloud_cx_data.findMany({
          where: {
            wc_tid: topicId
          }
        })

        if (chk.length > 0) {
          // Update existing record

          await prisma.wordcloud_cx_data.update({
            where: {
              wc_tid: topicId,
              wc_id: chk[0].wc_id
            },
            data: {
              wc_time: new Date()
            }
          })
        } else {
          // Insert new record

          await prisma.wordcloud_cx_data.create({
            data: {
              wc_tid: topicId,
              wc_str: JSON.stringify(finalTagsArray),
              wc_str_sorted: JSON.stringify(finalTagsArraySorted),
              wc_time: new Date()
            }
          })
        }

        // Prepare wc_array for response
        const wc_array = {
          sorted: finalTagsArraySorted,
          shuffeled: finalTagsArraySorted,
          list_view: finalTagsArraySorted.map(tag => `${tag.tag}, ${tag.count}`).join(', ')
        }

             return res.status(200).json(
        {
         wc_array
        }
        
      )
        // Return JSON response
        //let wc_array=['dubai']
        
      } else {
        let wc_to_array
        try {
          wc_to_array = result[0]?.wc_str_sorted // Assuming wc_str_sorted is already an array
        } catch (error) {
          throw new Error('Failed to retrieve wc_str_sorted from result')
        }

        function parseShuffeled(shuffeled) {
          if (typeof shuffeled === 'string') {
            try {
              shuffeled = JSON.parse(shuffeled)
            } catch (error) {
              console.error('Invalid JSON string:', error)
              return null
            }
          }
          return shuffeled
        }

        let shuffeled2 = parseShuffeled(wc_to_array)

        const wc_array = {
          shuffeled: shuffeled2
        }

        wc_array?.shuffeled?.sort((a, b) => b.count - a.count)

        
        return res.status(200).json(
          {
            wc_array
          }
        )
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'PositiveSentimentsClouds') {
    try {
      let result
      if (subtopicId) {
        result = await prisma.wordcloud_data.findMany({
          where: {
            wc_time: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // last 7 days
            },
            wc_stid: Number(subtopicId)
          }
        })
      } else {
        result = await prisma.wordcloud_cx_data.findMany({
          where: {
            wc_time: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // last 7 days
            },
            wc_tid: topicId
          }
        })
      }
      //console.log('asdasdasd', result[0]?.wc_str)

      if (result?.length === 0 || result[0]?.wc_str === null || filters === 'true') {
        // console.log('again')
        greaterThanTime = '2023-02-05'
        lessThanTime = '2023-02-21'
        topicQueryString = `${topicQueryString} AND un_keywords:("Yes") AND predicted_sentiment_value:("Positive")`

        const params = {
          body: {
            query: {
              bool: {
                must: [
                  { query_string: { query: topicQueryString } },
                  { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
                ]
              }
            },
            aggs: {
              tagcloud: {
                terms: { field: 'p_message', size: 60 }
              }
            }
          }
        }

        const results = await client(params)

        const omitWords = await prisma.omit_words.findMany()
        const omitWordsArray = omitWords.map((word) => word.word)

        const wordstagArray = []

        function isNumeric(value) {
          // Use parseFloat or parseInt to convert the value to a number
          // and then check if it's a valid number and not NaN (Not-a-Number)
          return !isNaN(parseFloat(value)) && isFinite(value)
        }

        for (let i = 0; i < results?.aggregations?.tagcloud?.buckets?.length; i++) {
          const key = results?.aggregations?.tagcloud?.buckets[i].key
          const doc_count = results?.aggregations?.tagcloud?.buckets[i].doc_count

          if (key && !isNumeric(key) && !omitWordsArray.includes(key) && key.length >= 4) {
            wordstagArray?.push({ tag: key.replace("'", ''), count: doc_count })
          }
        }

        const sortedArr = wordstagArray?.sort((a, b) => b.count - a.count) // Sort by count descending

        let fsize = 0
        let top_count = 0
        let top_count_name = ''
        let finalTagsArray = []
        let tagStr = ''

        for (let j = 0; j < sortedArr?.length; j++) {
          const word = sortedArr[j]?.tag
          const word_count = sortedArr[j]?.count

          if (j === 0) {
            top_count = word_count
            top_count_name = word
          }

          finalTagsArray?.push({ tag: word.replace("'", ''), count: word_count })
          tagStr += `${word} `

          if (fsize <= 38) {
            fsize += 2
          }

          if (j >= 60) {
            // This check should be equal to how many tags to show
            break
          }
        }

        // Shuffle finalTagsArray (Fisher-Yates shuffle)
        for (let i = finalTagsArray?.length - 1; i > 0; i--) {
          const j = Math?.floor(Math.random() * (i + 1))
          ;[finalTagsArray[i], finalTagsArray[j]] = [finalTagsArray[j], finalTagsArray[i]]
        }

        const finalTagsArraySorted = finalTagsArray.sort((a, b) => b.count - a.count)
        //console.log('positve,', finalTagsArraySorted)
        let chk
        if (subtopicId) {
          chk = await prisma.wordcloud_data.findMany({
            where: {
              wc_stid: Number(subtopicId)
            }
          })
        } else {
          chk = await prisma.wordcloud_cx_data.findMany({
            where: {
              wc_tid: topicId
            }
          })
        }

        if (chk.length > 0) {
          // Update existing record
          if (subtopicId) {
            await prisma.wordcloud_data.update({
              where: {
                wc_stid: Number(subtopicId),
                wc_id: chk[0].wc_id
              },
              data: {
                wc_time: new Date()
              }
            })
          } else {
            await prisma.wordcloud_cx_data.update({
              where: {
                wc_tid: topicId,
                wc_id: chk[0].wc_id
              },
              data: {
                wc_time: new Date()
              }
            })
          }
        } else {
          // Insert new record
          if (subtopicId) {
            await prisma.wordcloud_data.create({
              data: {
                wc_stid: Number(subtopicId),
                wc_str: JSON.stringify(finalTagsArray),
                wc_str_sorted: JSON.stringify(finalTagsArraySorted),
                wc_time: new Date()
              }
            })
          } else {
            await prisma.wordcloud_cx_data.create({
              data: {
                wc_tid: topicId,
                wc_str: JSON.stringify(finalTagsArraySorted),
                wc_time: new Date()
              }
            })
          }
        }

        // Prepare wc_array for response
        const wc_array = {
          sorted: finalTagsArraySorted,
          shuffeled: finalTagsArraySorted,
          list_view: finalTagsArraySorted.map(tag => `${tag.tag}, ${tag.count}`).join(', ')
        }

        // Return JSON response

         return res.status(200).json(
          {
            wc_array
          }
        )
      } else {
        let wc_to_array
        try {
          wc_to_array = result[0]?.wc_str // Assuming wc_str_sorted is already an array
        } catch (error) {
          throw new Error('Failed to retrieve wc_str_sorted from result')
        }

        function parseShuffeled(shuffeled) {
          if (typeof shuffeled === 'string') {
            try {
              shuffeled = JSON.parse(shuffeled)
            } catch (error) {
              console.error('Invalid JSON string:', error)
              return null
            }
          }
          return shuffeled
        }

        let shuffeled2 = parseShuffeled(wc_to_array)

        const wc_array = {
          shuffeled: shuffeled2
        }

        wc_array?.shuffeled?.sort((a, b) => b.count - a.count)

       return res.status(200).json(
          {
            wc_array
          }
        )
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'NegativeSentimentsClouds') {
    try {
      let result
      if (subtopicId) {
        result = await prisma.wordcloud_data.findMany({
          where: {
            wc_time: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // last 7 days
            },
            wc_stid: Number(subtopicId)
          }
        })
      } else {
        result = await prisma.wordcloud_cx_data.findMany({
          where: {
            wc_time: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // last 7 days
            },
            wc_tid: topicId
          }
        })
      }
      //
      //console.log('kk', result)

      if (result?.length === 0 || result[0]?.wc_str_sorted === null || filters === 'true') {
        greaterThanTime = '2023-02-05'
        lessThanTime = '2023-02-21'
        topicQueryString = `${topicQueryString} AND un_keywords:("Yes") AND predicted_sentiment_value:("Negative")`

        const params = {
          body: {
            query: {
              bool: {
                must: [
                  { query_string: { query: topicQueryString } },
                  { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
                ]
              }
            },
            aggs: {
              tagcloud: {
                terms: { field: 'p_message', size: 60 }
              }
            }
          }
        }

        const results = await client(params)

        const omitWords = await prisma.omit_words.findMany()
        const omitWordsArray = omitWords.map((word) => word.word)

        const wordstagArray = []

        function isNumeric(value) {
          // Use parseFloat or parseInt to convert the value to a number
          // and then check if it's a valid number and not NaN (Not-a-Number)
          return !isNaN(parseFloat(value)) && isFinite(value)
        }

        for (let i = 0; i < results?.aggregations?.tagcloud?.buckets?.length; i++) {
          const key = results?.aggregations?.tagcloud?.buckets[i].key
          const doc_count = results?.aggregations?.tagcloud?.buckets[i].doc_count

          if (key && !isNumeric(key) && !omitWordsArray.includes(key) && key.length >= 4) {
            wordstagArray?.push({ tag: key.replace("'", ''), count: doc_count })
          }
        }

        const sortedArr = wordstagArray?.sort((a, b) => b.count - a.count) // Sort by count descending

        let fsize = 0
        let top_count = 0
        let top_count_name = ''
        let finalTagsArray = []
        let tagStr = ''

        for (let j = 0; j < sortedArr?.length; j++) {
          const word = sortedArr[j]?.tag
          const word_count = sortedArr[j]?.count

          if (j === 0) {
            top_count = word_count
            top_count_name = word
          }

          finalTagsArray?.push({ tag: word.replace("'", ''), count: word_count })
          tagStr += `${word} `

          if (fsize <= 38) {
            fsize += 2
          }

          if (j >= 60) {
            // This check should be equal to how many tags to show
            break
          }
        }

        // Shuffle finalTagsArray (Fisher-Yates shuffle)
        for (let i = finalTagsArray?.length - 1; i > 0; i--) {
          const j = Math?.floor(Math.random() * (i + 1))
          ;[finalTagsArray[i], finalTagsArray[j]] = [finalTagsArray[j], finalTagsArray[i]]
        }

        const finalTagsArraySorted = finalTagsArray.sort((a, b) => b.count - a.count)
        //console.log('negative,', finalTagsArraySorted)

        let chk
        if (subtopicId) {
          chk = await prisma.wordcloud_data.findMany({
            where: {
              wc_stid: Number(subtopicId)
            }
          })
        } else {
          chk = await prisma.wordcloud_cx_data.findMany({
            where: {
              wc_tid: topicId
            }
          })
        }

        if (chk.length > 0) {
          // Update existing record
          if (subtopicId) {
            await prisma.wordcloud_data.update({
              where: {
                wc_stid: Number(subtopicId),
                wc_id: chk[0].wc_id
              },
              data: {
                wc_time: new Date()
              }
            })
          } else {
            await prisma.wordcloud_cx_data.update({
              where: {
                wc_tid: topicId,
                wc_id: chk[0].wc_id
              },
              data: {
                wc_time: new Date()
              }
            })
          }
        } else {
          // Insert new record
          if (subtopicId) {
            await prisma.wordcloud_data.create({
              data: {
                wc_stid: Number(subtopicId),
                wc_str: JSON.stringify(finalTagsArray),
                wc_str_sorted: JSON.stringify(finalTagsArraySorted),
                wc_time: new Date()
              }
            })
          } else {
            await prisma.wordcloud_cx_data.create({
              data: {
                wc_tid: topicId,
                wc_str_sorted: JSON.stringify(finalTagsArraySorted),
                wc_time: new Date()
              }
            })
          }
        }

        // Prepare wc_array for response
        const wc_array = {
          sorted: finalTagsArraySorted,
          shuffeled: finalTagsArraySorted,
          list_view: finalTagsArraySorted.map(tag => `${tag.tag}, ${tag.count}`).join(', ')
        }

        // Return JSON response

         return res.status(200).json(
          {
            wc_array
          }
        )
      } else {
        let wc_to_array
        try {
          wc_to_array = result[0]?.wc_str_sorted // Assuming wc_str_sorted is already an array
        } catch (error) {
          throw new Error('Failed to retrieve wc_str_sorted from result')
        }

        function parseShuffeled(shuffeled) {
          if (typeof shuffeled === 'string') {
            try {
              shuffeled = JSON.parse(shuffeled)
            } catch (error) {
              console.error('Invalid JSON string:', error)
              return null
            }
          }
          return shuffeled
        }

        let shuffeled2 = parseShuffeled(wc_to_array)

        const wc_array = {
          shuffeled: shuffeled2
        }

        wc_array?.shuffeled?.sort((a, b) => b.count - a.count)

      
         return res.status(200).json({ wc_array });
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
},
  UNDP_Post: async (req, res) => {

  let { greaterThanTime, lessThanTime, subtopicId, topicId:id, sentiment,type,aidType,filters,filterData,touchId,parentAccountId,category} = req.query;

  



  const decodedFilterData =filterData ? decodeURIComponent(filterData):null;
  const filtersDat =decodedFilterData && JSON.parse(decodedFilterData)

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

  topicQueryString = await buildQueryString(topicId)

  if (filtersDat && filters === 'true') {
    if (filtersDat?.timeSlot && filtersDat?.timeSlot === 'Custom Dates') {
      if (filtersDat?.startDate && filtersDat?.startDate !== '') {
        let greaterThanDate = new Date(filtersDat?.startDate)
        greaterThanTime = format(greaterThanDate, 'yyyy-MM-dd')
      } else {
        greaterThanTime = format(new Date(new Date().setDate(new Date().getDate() - 90)), 'yyyy-MM-dd')
      }

      if (filtersDat?.endDate && filtersDat?.endDate !== '') {
        let lessThanDate = new Date(filtersDat?.endDate)
        lessThanTime = format(lessThanDate, 'yyyy-MM-dd')
      } else {
        lessThanTime = format(new Date(), 'yyyy-MM-dd')
      }
    } else {
      if (filtersDat?.timeSlot !== '') {
        switch (filtersDat?.timeSlot) {
          case 'today':
            greaterThanTime = format(new Date(), 'yyyy-MM-dd')
            lessThanTime = format(new Date(), 'yyyy-MM-dd')
            break
          case '24h':
            greaterThanTime = format(new Date(new Date().setHours(new Date().getHours() - 24)), 'yyyy-MM-dd')
            lessThanTime = format(new Date(), 'yyyy-MM-dd')
            break
          default:
            greaterThanTime = format(
              new Date(new Date().setDate(new Date().getDate() - parseInt(filtersDat?.timeSlot))),
              'yyyy-MM-dd'
            )
            lessThanTime = format(new Date(), 'yyyy-MM-dd')
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
        topicQueryString = `(p_message_text:(${topicKeyHash} OR ${topicUrls}) OR u_username:(${topicKeyHash}) OR u_fullname:(${topicKeyHash}) OR u_source:(${topicUrls}))`
      } else if (topicKeyHash && !topicUrls) {
        topicQueryString = `(p_message_text:(${topicKeyHash}) OR u_fullname:(${topicKeyHash}))`
      } else if (!topicKeyHash && topicUrls) {
        topicQueryString = `u_source:(${topicUrls})`
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
      const esData = await elasticSearchCount(
        elasticMentionQueryTemplate(topicQueryString, greaterThanTime, lessThanTime)
      )
      const count = (esData )?.count

      return res.status(200).json({ count });

    }catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'TouchpointMentionsAreaGraph') {
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
    
      const filteredSourcesArray = []

      for (let i = 0; i < sourcesArray.length; i++) {
        const query = `${topicQueryString} source:('"Twitter" OR "Facebook" OR "Instagram"')  AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
        // console.log(query, 'TouchpointMentionsAreaGraph')

        const filterContent = await elasticSearchCount(
          elasticMentionQueryTemplate(query, greaterThanTime, lessThanTime)
        )

        if (filterContent?.count > 0) {
          filteredSourcesArray.push(sourcesArray[i])
        }
      }

      const cxQuery = `${topicQueryString} source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`
      const params = {
        // size: 0,

        docvalue_fields: [{ field: 'p_created_time', format: 'date_time' }],
        query: {
          bool: {
            must: [
              { query_string: { query: cxQuery } },
              { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
            ]
          }
        },
        aggs: {
          '2': {
            date_histogram: {
              field: 'p_created_time',
              fixed_interval: '1d',
              // calendar_interval: '1d', // Use `calendar_interval` as it's preferred over `fixed_interval` for natural time intervals.

              min_doc_count: 0
            },
            aggs: {
              '3': {
                terms: { field: 'llm_mention_touchpoint.keyword', size: 10 }
              }
            }
          }
        }
      }

      const es_data = await client(params)

      let touchpointData = {}

      filteredSourcesArray.forEach((touchpoint) => {
        touchpointData[touchpoint] = ''
      })

      es_data?.aggregations['2'].buckets.forEach((bucket) => {
        filteredSourcesArray.forEach((touchpoint) => {
          let count = 0
          bucket['3'].buckets.forEach((subBucket) => {
            if (subBucket.key === touchpoint) count = subBucket.doc_count
          })

          const date = new Date(bucket.key_as_string).toISOString().split('T')[0]
          touchpointData[touchpoint] += `${date}~${count}|`
        })
      })

      const touchpointArray = Object.keys(touchpointData).map((touchpoint) => {
        return {
          [touchpoint]: touchpointData[touchpoint].slice(0, -1)
        }
      })

   
      
      return res.status(200).json({touchpointArray });

    } catch (error) {
      console.error('Error fetching results:', error)
            return res.status(400).json({ error: 'Internal server error' });

    }
  } else if (type === 'sentimentAreaGraphUn') {
    try {
      greaterThanTime = '2023-01-01'
      lessThanTime = '2023-04-30'
      const cxQuery = `${topicQueryString} AND Keywords:("Yes") `

      const params = {
        docvalue_fields: [{ field: 'p_created_time', format: 'date_time' }],
        query: {
          bool: {
            must: [
              { query_string: { query: cxQuery } },
              { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
            ]
          }
        },
        aggs: {
          '2': {
            date_histogram: {
              field: 'p_created_time',
              fixed_interval: '1d',
              min_doc_count: 0
            },
            aggs: {
              '3': {
                terms: { field: 'predicted_sentiment_value.keyword' }
              }
            }
          }
        }
      }

      const es_data = await clientsentiment(params)

      let p_str = ''
      let n_str = ''
      let neu_str = ''

      es_data?.aggregations['2'].buckets.forEach((bucket) => {
        let pos_count = 0
        let neg_count = 0
        let neu_count = 0
        bucket['3'].buckets.forEach((subBucket) => {
          if (subBucket.key === 'Positive') pos_count = subBucket.doc_count
          if (subBucket.key === 'Negative') neg_count = subBucket.doc_count
          if (subBucket.key === 'Neutral') neu_count = subBucket.doc_count
        })

        const date = new Date(bucket.key_as_string).toISOString().split('T')[0]
        p_str += `${date}~${pos_count}|`
        n_str += `${date}~${neg_count}|`
        neu_str += `${date}~${neu_count}|`
      })

      const dates_array = {
        positive_data: p_str.slice(0, -1),
        negative_data: n_str.slice(0, -1),
        neutral_data: neu_str.slice(0, -1)
      }

      return res.status(200).json(
        {
          dates_array
        }
        
      )
      
      
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'sentimentAreaGraph') {
    try {
      const cxQuery = `${topicQueryString} source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`
      const params = {
        docvalue_fields: [{ field: 'p_created_time', format: 'date_time' }],
        query: {
          bool: {
            must: [
              { query_string: { query: cxQuery } },
              { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
            ]
          }
        },
        aggs: {
          '2': {
            date_histogram: {
              field: 'p_created_time',
              fixed_interval: '5d',
              min_doc_count: 0
            },
            aggs: {
              '3': {
                terms: { field: 'predicted_sentiment_value.keyword', size: 10 }
              }
            }
          }
        }
      }

      const es_data = await client(params)
      let p_str = ''
      let n_str = ''
      let neu_str = ''

      es_data?.aggregations['2'].buckets.forEach((bucket) => {
        let pos_count = 0
        let neg_count = 0
        let neu_count = 0
        bucket['3'].buckets.forEach((subBucket) => {
          if (subBucket.key === 'Positive') pos_count = subBucket.doc_count
          if (subBucket.key === 'Negative') neg_count = subBucket.doc_count
          if (subBucket.key === 'Neutral') neu_count = subBucket.doc_count
        })

        const date = new Date(bucket.key_as_string).toISOString().split('T')[0]
        p_str += `${date}~${pos_count}|`
        n_str += `${date}~${neg_count}|`
        neu_str += `${date}~${neu_count}|`
      })

      const dates_array = {
        positive_data: p_str.slice(0, -1),
        negative_data: n_str.slice(0, -1),
        neutral_data: neu_str.slice(0, -1)
      }

       return res.status(200).json(
        {
          dates_array
        }
        
      )
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'complaintTouchpoints') {
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
     

      let responseOutput = {}

     
      for (let i = 0; i < sourcesArray.length; i++) {
       

        let complaintContent = 0
        let query = ''

        query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"')  AND llm_mention_type:("Customer Complaint") AND llm_mention_touchpoint:("${sourcesArray[i]}")`
        complaintContent = await elasticSearchCount(elasticMentionQueryTemplate(query, greaterThanTime, lessThanTime))
        if (complaintContent?.count > 0) {
          ;(responseOutput )[
            sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
          ] = complaintContent?.count
        }
      }

        return res.status(200).json(
        {
          responseOutput
        }
        
      )

     
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'UNDPtouchpoints') {
    try {
      const sourcesArray = [
        'Infrastructure Rebuilding',
        'Emergency Medical Aid',
        'Humanitarian Aid',
        'International Cooperation',
        'Disaster Relief Coordination',
        'Aid Effectiveness',
        'Recovery Progress',
        'Crisis Communications'
      ]


   
      const index = sourcesArray.indexOf(category); // Find its index

      let responseOutput = {};
     
        let query = ''
        let greatertime = '2023-01-01'
        let lesstime = '2023-04-30'

        
        query = `${topicQueryString} AND Keywords:("Yes")  AND llm_mention_touchpoint:("${sourcesArray[index]}")`
      const  results = await elasticSearch(elasticMentionQueryTemplatess(query, '2023-01-01', '2023-04-30'))

       const responseArray = [];
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
    total: responseArray.length || 0,
 query:elasticMentionQueryTemplatess(query, '2023-01-01', '2023-04-30')
  });
      
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'UNDPAnnoucement') {
    try {
      const sourcesArray = [
        'Missing Persons',
        'Humanitarian Aid Distribution',
        'Emergency Response Coordination',
        'Damage Reports',
        'Relief Measures',
        'Special Appeals',
        'Safety Tips',
        'Public Health Advisor',
        'Emergency Response Coordination',
        'International Cooperation',
        'Impact Reports',
        'Infrastructure Reports'
      ]
    

      let responseOutput = {}

    
  

        let content = 0
        let query = ''

        query = `${topicQueryString} AND un_keywords:("Yes") AND announcement:("${category}")`

        const results = await elasticSearch(elasticMentionQueryTemplatess(query, '2023-01-01', '2023-04-30'))

       const responseArray = [];
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
    total: responseArray.length || 0,
    query:elasticMentionQueryTemplatess(query, '2023-01-01', '2023-04-30')
 
  });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'touchpointsIdentification') {
    try {
      const sourcesArray = [
        'Infrastructure Rebuilding',
        'Emergency Medical Aid',
        'Humanitarian Aid',
        'International Cooperation',
        'Disaster Relief Coordination',
        'Aid Effectiveness',
        'Recovery Progress',
        'Crisis Communications'
      ]
    

      let responseOutput = {}

    
      for (let i = 0; i < sourcesArray.length; i++) {


        let content = 0
        let query = ''

        query = `${topicQueryString} AND touchpoint_un:("${sourcesArray[i]}")`

        content = await elasticSearchCount(elasticMentionQueryTemplate(query, '2023-01-01', '2023-04-30'))

        if (content?.count > 0) {
          ;(responseOutput )[
            sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
          ] = content?.count
        }
      }


      
        return res.status(200).json(
        {
          responseOutput
        }
        
      )
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'touchpointSentimentsChartUNtopic') {
    try {
      const sourcesArray = [
        'Infrastructure Rebuilding',
        'Emergency Medical Aid',
        'Humanitarian Aid',
        'International Cooperation',
        'Disaster Relief Coordination',
        'Aid Effectiveness',
        'Recovery Progress',
        'Crisis Communications'
      ]


      let responseOutput = {}

    
 


        let positiveContent = 0,
          negativeContent = 0,
          neutralContent = 0,
          webContent = 0
        let positiveContentQuery, negativeContentQuery, neutralContentQuery, webContentQuery

       

        
        const query = `${topicQueryString} AND un_keywords:("Yes") AND touchpoint_un:("${category}") AND predicted_sentiment_value:(${sentiment})`
        
       
        const results = await elasticSearch(
          elasticMentionQueryTemplatess(query, '2023-02-05', '2023-02-21')
        )
          const responseArray = [];
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
    total: responseArray.length || 0,
 query:elasticMentionQueryTemplatess(query, '2023-01-01', '2023-04-30')
  });
       
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'IGOEntities') {
    try {
      const sourcesArray = [
        'United Nations Development Programme (UNDP)',
        "United Nations Children's Fund (UNICEF)",
        'World Health Organization (WHO)',
        'United Nations High Commissioner for Refugees (UNHCR)',
        'World Food Programme (WFP)',
        'International Labour Organization (ILO)',
        'United Nations Educational, Scientific and Cultural Organization (UNESCO)',
        'United Nations Population Fund (UNFPA)',
        'United Nations Office on Drugs and Crime (UNODC)',
        'International Criminal Court (ICC)',
        'International Maritime Organization (IMO)',
        'International Telecommunication Union (ITU)',
        'United Nations Environment Programme (UNEP)',
        'United Nations Office for the Coordination of Humanitarian Affairs (OCHA)',
        'United Nations Institute for Training and Research (UNITAR)',
        'United Nations Conference on Trade and Development (UNCTAD)',
        'United Nations Human Settlements Programme (UN-Habitat)',
        'World Intellectual Property Organization (WIPO)',
        'United Nations Framework Convention on Climate Change (UNFCCC)'
      ]

      let responseOutput = {}

     
       
         

        const query = `${topicQueryString}  AND igo_entities:("${category}")`

        const results = await elasticSearch(elasticMentionQueryTemplatess(query, '2023-01-01', '2024-12-03'))
        const responseArray = [];
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
    total: responseArray.length || 0,
 query:elasticMentionQueryTemplatess(query, '2023-01-01', '2023-04-30')
  });
     
        
      
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'IGOSentimentsChartUNtopic') {
    try {
      const sourcesArray = [
        'United Nations Development Programme (UNDP)',
        "United Nations Children's Fund (UNICEF)",
        'World Health Organization (WHO)',
        'United Nations High Commissioner for Refugees (UNHCR)',
        'World Food Programme (WFP)',
        'International Labour Organization (ILO)',
        'United Nations Educational, Scientific and Cultural Organization (UNESCO)',
        'United Nations Population Fund (UNFPA)',
        'United Nations Office on Drugs and Crime (UNODC)',
        'International Criminal Court (ICC)',
        'International Maritime Organization (IMO)',
        'International Telecommunication Union (ITU)',
        'United Nations Environment Programme (UNEP)',
        'United Nations Office for the Coordination of Humanitarian Affairs (OCHA)',
        'United Nations Institute for Training and Research (UNITAR)',
        'United Nations Conference on Trade and Development (UNCTAD)',
        'United Nations Human Settlements Programme (UN-Habitat)',
        'World Intellectual Property Organization (WIPO)',
        'United Nations Framework Convention on Climate Change (UNFCCC)'
      ]

      let responseOutput = {}

     
  
       

        let positiveContent = 0,
          negativeContent = 0,
          neutralContent = 0,
          webContent = 0
        let positiveContentQuery, negativeContentQuery, neutralContentQuery, webContentQuery

       

        let query = `${topicQueryString}   AND igo_entities:("${category}") AND predicted_sentiment_value:(${sentiment})`

        const results = await elasticSearch(
          elasticMentionQueryTemplatess(query, '2023-01-01', '2024-12-03')
        )
 const responseArray = [];
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
    total: responseArray.length || 0,
    query:elasticMentionQueryTemplatess(query, '2023-01-01', '2023-04-30')
  });
      

      
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'unAidsChart') {


    try {
      aidType=sentiment && sentiment?.trim();
      category=category && category?.trim();
      let dataArray = []
      let query 
     

      if (aidType === 'Aid Requested/Aid Recieved' &&  category=="Aid Recieved") {
         query = `${topicQueryString}  AND aid_requests_received:("receipt of aid")`
      }else if (aidType === 'Aid Requested/Aid Recieved' &&  category=="Aid Requested") {
         query = `${topicQueryString} AND aid_requests_received:("request for aid")` 
      }
      else if(aidType === 'Aid Type' &&  category=="local Aid") {
        query = `${topicQueryString}  AND aid_type:("Local Aid")`
 
      }
      else if(aidType === 'Aid Type' &&  category=="International Aid") {
        query = `${topicQueryString}  AND aid_type:("International Aid")`
      
      } 
      else if(aidType === 'Mental Health and Trauma' &&  category=="Local Aid") {
        query = `${topicQueryString}  AND Aid Type:("Local Aid")`
 
      }
      else if(aidType === 'Mental Health and Trauma' &&  category=="International Aid") {
        query = `${topicQueryString}  AND Aid Type:("International Aid")`
      
      }

       else if(aidType === 'Political or Social Criticism' &&  category=="Local Aid") {
        query = `${topicQueryString}  AND Aid Type:("Local Aid")`
 
      }
      else if(aidType === 'Political or Social Criticism' &&  category=="International Aid") {
        query = `${topicQueryString}  AND Aid Type:("International Aid")`
      
      }

         else if(aidType === 'Environmental Hazards' ) {
        query = `${topicQueryString}  AND Aid Type:(${category})`
 
      }


       const results = await elasticSearch(elasticMentionQueryTemplatess(query, '2023-01-01', '2023-04-30'))
        const responseArray = [];
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
    total: responseArray.length || 0,
 query:elasticMentionQueryTemplatess(query, '2023-01-01', '2023-04-30')
  });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'touchpointIndustry') {
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

      let responseOutput = {}

      
      for (let i = 0; i < sourcesArray.length; i++) {
       

        let twitterContent = 0,
          facebookContent = 0,
          instagramContent = 0,
          webContent = 0
        let twitterContentQuery, facebookContentQuery, instagramContentQuery, webContentQuery

        twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
        facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
        instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`

        twitterContent = await elasticSearchCount(
          elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
        )
        facebookContent = await elasticSearchCount(
          elasticMentionQueryTemplate(facebookContentQuery, greaterThanTime, lessThanTime)
        )
        instagramContent = await elasticSearchCount(
          elasticMentionQueryTemplate(instagramContentQuery, greaterThanTime, lessThanTime)
        )
       

        if (twitterContent.count > 0 || facebookContent.count > 0 || instagramContent.count > 0) {
          ;(responseOutput )[
            sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
          ] = {
            twitterContent: twitterContent?.count,
            facebookContent: facebookContent?.count,
            instagramContent: instagramContent?.count
          }
        }
      }

        return res.status(200).json(
        {
          responseOutput
        }
        
      )

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'touchpointSentimentsChart') {
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


      let responseOutput = {}

 
      for (let i = 0; i < sourcesArray.length; i++) {
       

        let positiveContent = 0,
          negativeContent = 0,
          neutralContent = 0,
          webContent = 0
        let positiveContentQuery, negativeContentQuery, neutralContentQuery, webContentQuery

        positiveContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Positive") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
        negativeContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Negative") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
        neutralContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Neutral") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`
        positiveContent = await elasticSearchCount(
          elasticMentionQueryTemplate(positiveContentQuery, greaterThanTime, lessThanTime)
        )
        negativeContent = await elasticSearchCount(
          elasticMentionQueryTemplate(negativeContentQuery, greaterThanTime, lessThanTime)
        )
        neutralContent = await elasticSearchCount(
          elasticMentionQueryTemplate(neutralContentQuery, greaterThanTime, lessThanTime)
        )

        if (positiveContent.count > 0 || negativeContent.count > 0 || neutralContent.count > 0) {
          ;(responseOutput )[
            sourcesArray[i] === 'Customer Service (Phone, Email, or Live Chat)' ? 'Customer Service' : sourcesArray[i]
          ] = {
            positiveContent: positiveContent?.count,
            negativeContent: negativeContent?.count,
            neutralContent: neutralContent?.count
          }
        }
      }

       return res.status(200).json(
        {
          responseOutput
        }
        
      )

    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'customerJourneyChart') {
    try {

      const sourcesArray = [
        'Awareness',
        'Advocacy',
        'Consideration',
        'Application',
        'Onboarding',
        'Usage',
        'Support',
        'Retention',
        'Booking',
        'Pre-flight',
        'In-flight',
        'Engagement',
        'Post-flight',
        'Acquisition',
        'Loyalty',
        'Purchase',
        'Activation',
        'Processing',
        'Service Delivery',
        'Feedback',
        'Renewal',
        'Subscription',
        'Billing',
        'Support',
        'Post-Purchase Support',
        'Churn',
        'Other'
      ]

      //const twitterContentQuery = `${topicQueryString} AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND product_ref_ind:("Baggage Services")`

      let responseOutput = {}


      for (let i = 0; i < sourcesArray.length; i++) {


        let twitterContent = 0,
          facebookContent = 0,
          instagramContent = 0,
          webContent = 0
        let twitterContentQuery, facebookContentQuery, instagramContentQuery, webContentQuery

        twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND customer_journey:("${sourcesArray[i]}")`
        facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND customer_journey:("${sourcesArray[i]}")`
        instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND customer_journey:("${sourcesArray[i]}")`
        // webContentQuery = `${topicQueryString} AND source:('"FakeNews" OR "News" OR "Blogs" OR "Web"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND customer_journey:("${sourcesArray[i]}")`
        // console.log(twitterContentQuery, 'customerJourneyChart')
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
          instagramContent.count > 0 ||
          webContent.count > 0
        ) {
          ;(responseOutput )[sourcesArray[i]] = {
            twitterContent: twitterContent?.count,
            facebookContent: facebookContent?.count,
            instagramContent: instagramContent?.count
            // webContent: webContent?.count
          }
        }
      }

   return res.status(200).json(
        {
          responseOutput
        }
        
      )

    }catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'customerJourneySentimentsChart') {
    try {
      const sourcesArray = [
        'Awareness',
        'Consideration',
        'Application',
        'Onboarding',
        'Usage',
        'Support',
        'Retention',
        'Booking',
        'Pre-flight',
        'In-flight',
        'Post-flight',
        'Loyalty',
        'Purchase',
        'Activation',
        'Processing',
        'Service Delivery',
        'Feedback',
        'Renewal',
        'Subscription',
        'Billing',
        'Support',
        'Post-Purchase Support',
        'Churn',
        'Other'
      ]

      //const twitterContentQuery = `${topicQueryString} AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND product_ref_ind:("Baggage Services")`

      let responseOutput = {}

      // const dat = await elasticSearchCount(
      //   elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
      // )
      // console.log('data', dat)

      // const dat = await testClientElasticQuery()
      // console.log('dataasds', dat?.hits?.hits)
      for (let i = 0; i < sourcesArray.length; i++) {
        // let _sources
        // if (sourcesArray[i] === 'Youtube') {
        //   _sources = '"Youtube" OR "Vimeo"'
        // } else if (sourcesArray[i] === 'Web') {
        //   _sources = '"FakeNews" OR "News" OR "Blogs" OR "Web"'
        // } else {
        //   _sources = sourcesArray[i]
        // }

        let positiveContent = 0,
          negativeContent = 0,
          neutralContent = 0,
          webContent = 0
        let positiveContentQuery, negativeContentQuery, neutralContentQuery, webContentQuery

        positiveContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Positive") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND customer_journey:("${sourcesArray[i]}")`
        negativeContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Negative") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND customer_journey:("${sourcesArray[i]}")`
        //neutralContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram" OR "FakeNews" OR "News" OR "Blogs" OR "Web"') AND predicted_sentiment_value:("neutral") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND customer_journey:("${sourcesArray[i]}")`
        // console.log(positiveContentQuery, 'Customer Journey Sentiments')
        positiveContent = await elasticSearchCount(
          elasticMentionQueryTemplate(positiveContentQuery, greaterThanTime, lessThanTime)
        )
        negativeContent = await elasticSearchCount(
          elasticMentionQueryTemplate(negativeContentQuery, greaterThanTime, lessThanTime)
        )
        // neutralContent = await elasticSearchCount(
        //   elasticMentionQueryTemplate(neutralContentQuery, greaterThanTime, lessThanTime)
        // )

        if (positiveContent.count > 0 || negativeContent.count > 0 || neutralContent.count > 0) {
          ;(responseOutput )[sourcesArray[i]] = {
            negativeContent: negativeContent?.count * -1,
            positiveContent: positiveContent?.count

            //neutralContent: neutralContent?.count
          }
        }
      }

      //console.log('data', responseOutput)

         return res.status(200).json(
        {
          responseOutput
        }
        
      )
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'productReferenceChart') {
    try {
      const sourcesArray = [
        'Retail Banking Services',
        'Lending Solutions',
        'Card Services',
        'Investment Products',
        'Insurance Offerings',
        'Digital Banking Platforms',
        'Wealth Management',
        'Payment Services',
        'Other'
      ]
      // const sourcesArray = [
      //   'Checking Account',
      //   'Savings Account',
      //   'Credit Card',
      //   'Personal Loan',
      //   'Retail Banking Services',
      //   'Lending Solutions',
      //   'Investment Products',
      //   'Digital Banking Platforms',
      //   'Payment Services',
      //   'Mortgage',
      //   'Insurance Offerings',
      //   'Investment Account',
      //   'Business Banking',
      //   'Wealth Management',
      //   'Online Banking',
      //   'Mobile Banking App',
      //   'ATM Services',
      //   'Fraud Protection',
      //   'Foreign Exchange',
      //   'Mobile Phone Plan',
      //   'Internet Plan',
      //   'TV Service',
      //   'SIM Card',
      //   'Roaming Services',
      //   'Device Purchase',
      //   'Network Coverage',
      //   'Data Plan',
      //   'Installation Services',
      //   'Customer Support',
      //   'Flight Ticket',
      //   'Seat Selection',
      //   'Baggage Services',
      //   'In-flight Meals',
      //   'In-flight Entertainment',
      //   'Loyalty Program',
      //   'Airport Lounge Access',
      //   'Boarding Pass',
      //   'Flight Change/Cancelation',
      //   'Special Assistance Services',
      //   'Cargo Services',
      //   'Online Check-in',
      //   'Other'
      // ]

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

        twitterContentQuery = `${topicQueryString} AND source:("Twitter") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND product_ref_ind:("${sourcesArray[i]}")`
        facebookContentQuery = `${topicQueryString} AND source:("Facebook") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND product_ref_ind:("${sourcesArray[i]}")`
        instagramContentQuery = `${topicQueryString} AND source:("Instagram") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND product_ref_ind:("${sourcesArray[i]}")`
        //webContentQuery = `${topicQueryString} AND source:('"FakeNews" OR "News" OR "Blogs" OR "Web"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND product_ref_ind:("${sourcesArray[i]}")`
        // console.log(twitterContentQuery, 'twitterContentQueryproductReferenceChart')
        twitterContent = await elasticSearchCount(
          elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
        )
        facebookContent = await elasticSearchCount(
          elasticMentionQueryTemplate(facebookContentQuery, greaterThanTime, lessThanTime)
        )
        instagramContent = await elasticSearchCount(
          elasticMentionQueryTemplate(instagramContentQuery, greaterThanTime, lessThanTime)
        )
        // webContent = await elasticSearchCount(
        //   elasticMentionQueryTemplate(webContentQuery, greaterThanTime, lessThanTime)
        // )

        if (twitterContent.count > 0 || facebookContent.count > 0 || instagramContent.count > 0) {
          ;(responseOutput )[sourcesArray[i]] = {
            twitterContent: twitterContent?.count,
            facebookContent: facebookContent?.count,
            instagramContent: instagramContent?.count
            // webContent: webContent?.count
          }
        }
      }

      //console.log('data', responseOutput)

   return res.status(200).json(
        {
          responseOutput
        }
        
      )    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'productReferenceSentimentChart') {
    try {
      // const sourcesArray = [
      //   'Checking Account',
      //   'Savings Account',
      //   'Credit Card',
      //   'Personal Loan',
      //   'Mortgage',
      //   'Investment Account',
      //   'Business Banking',
      //   'Wealth Management',
      //   'Online Banking',
      //   'Mobile Banking App',
      //   'ATM Services',
      //   'Fraud Protection',
      //   'Foreign Exchange',
      //   'Mobile Phone Plan',
      //   'Internet Plan',
      //   'TV Service',
      //   'SIM Card',
      //   'Roaming Services',
      //   'Device Purchase',
      //   'Network Coverage',
      //   'Data Plan',
      //   'Installation Services',
      //   'Customer Support',
      //   'Flight Ticket',
      //   'Seat Selection',
      //   'Baggage Services',
      //   'In-flight Meals',
      //   'In-flight Entertainment',
      //   'Loyalty Program',
      //   'Airport Lounge Access',
      //   'Boarding Pass',
      //   'Flight Change/Cancelation',
      //   'Special Assistance Services',
      //   'Cargo Services',
      //   'Online Check-in',
      //   'Other'
      // ]

      const sourcesArray = [
        'Retail Banking Services',
        'Lending Solutions',
        'Card Services',
        'Investment Products',
        'Insurance Offerings',
        'Digital Banking Platforms',
        'Wealth Management',
        'Payment Services',
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

        let positiveContent = 0,
          negativeContent = 0,
          neutralContent = 0,
          webContent = 0
        let positiveContentQuery, negativeContentQuery, neutralContentQuery, webContentQuery

        positiveContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Positive") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND product_ref_ind:("${sourcesArray[i]}")`
        negativeContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Negative") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND product_ref_ind:("${sourcesArray[i]}")`
        neutralContentQuery = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND predicted_sentiment_value:("Neutral") AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND product_ref_ind:("${sourcesArray[i]}")`
        // console.log(positiveContentQuery, 'productReferenceSentimentChart')
        positiveContent = await elasticSearchCount(
          elasticMentionQueryTemplate(positiveContentQuery, greaterThanTime, lessThanTime)
        )
        negativeContent = await elasticSearchCount(
          elasticMentionQueryTemplate(negativeContentQuery, greaterThanTime, lessThanTime)
        )
        neutralContent = await elasticSearchCount(
          elasticMentionQueryTemplate(neutralContentQuery, greaterThanTime, lessThanTime)
        )

        if (positiveContent.count > 0 || negativeContent.count > 0 || neutralContent.count > 0) {
          ;(responseOutput )[sourcesArray[i]] = {
            positiveContent: positiveContent?.count,
            negativeContent: negativeContent?.count,
            neutralContent: neutralContent?.count
          }
        }
      }

      //console.log('data', responseOutput)

   return res.status(200).json(
        {
          responseOutput
        }
        
      )    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'customerSatisfactoryScore') {
    try {
      // const twitterContentQuery = `${topicQueryString} AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`

      // const dat = await elasticSearchCount(
      //   elasticMentionScoreQuery(twitterContentQuery, greaterThanTime, lessThanTime, 0.01, 0.20)
      // )

      // console.log('yt', dat)

      const sourcesArray2 = [
        {
          name: '0 to 20 %',
          gval: 0.0000001,
          lval: 0.2
        },
        {
          name: '20 to 40 %',
          gval: 0.2,
          lval: 0.4
        },
        {
          name: '40 to 60 %',
          gval: 0.4,
          lval: 0.6
        },
        {
          name: '60 to 80 %',
          gval: 0.6,
          lval: 0.8
        },
        {
          name: '80 to 100 %',
          gval: 0.8,
          lval: 0.99
        }
      ]

      const sourcesArray = ['Twitter', 'Instagram', 'Facebook']

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
        let twitterContent = 0,
          facebookContent = 0,
          instagramContent = 0,
          webContent = 0
        let twitterContentQuery, facebookContentQuery, instagramContentQuery, webContentQuery

        let twentyFiveScore = 0,
          fiftyPercentScore = 0,
          seventyPercentScore = 0,
          hundredPercentScore = 0
        let query

        query = `${topicQueryString} AND source:(${_sources}) AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') `

        twentyFiveScore = await elasticSearchCount(
          elasticMentionScoreQuery(query, greaterThanTime, lessThanTime, 0.0, 0.25)
        )
        fiftyPercentScore = await elasticSearchCount(
          elasticMentionScoreQuery(query, greaterThanTime, lessThanTime, 0.25, 0.5)
        )

        seventyPercentScore = await elasticSearchCount(
          elasticMentionScoreQuery(query, greaterThanTime, lessThanTime, 0.5, 0.75)
        )
        // console.log(seventyPercentScore, 'seventyPercentScore')

        hundredPercentScore = await elasticSearchCount(
          elasticMentionScoreQuery(query, greaterThanTime, lessThanTime, 0.75, 0.99)
        )
        // console.log(hundredPercentScore, 'hundredPercentScore')
        ;(responseOutput )[sourcesArray[i]] = {
          twentyFiveScore: twentyFiveScore?.count,
          fiftyPercentScore: fiftyPercentScore?.count,
          seventyPercentScore: seventyPercentScore?.count,
          hundredPercentScore: hundredPercentScore?.count
        }
      }

      //console.log('data', responseOutput)

   return res.status(200).json(
        {
          responseOutput
        }
        
      )    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'ProductChurnProbabilityChart') {
    try {
      // const twitterContentQuery = `${topicQueryString} AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`

      // const dat = await testClientElasticQuery(
      //   elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
      // )

      // console.log('yt', dat?.hits?.hits)
      // const sourcesArray = [
      //   'Checking Account',
      //   'Savings Account',
      //   'Credit Card',
      //   'Personal Loan',
      //   'Mortgage',
      //   'Investment Account',
      //   'Business Banking',
      //   'Wealth Management',
      //   'Online Banking',
      //   'Mobile Banking App',
      //   'ATM Services',
      //   'Fraud Protection',
      //   'Foreign Exchange',
      //   'Mobile Phone Plan',
      //   'Internet Plan',
      //   'TV Service',
      //   'SIM Card',
      //   'Roaming Services',
      //   'Device Purchase',
      //   'Network Coverage',
      //   'Data Plan',
      //   'Installation Services',
      //   'Customer Support',
      //   'Flight Ticket',
      //   'Seat Selection',
      //   'Baggage Services',
      //   'In-flight Meals',
      //   'In-flight Entertainment',
      //   'Loyalty Program',
      //   'Airport Lounge Access',
      //   'Boarding Pass',
      //   'Flight Change/Cancelation',
      //   'Special Assistance Services',
      //   'Cargo Services',
      //   'Online Check-in',
      //   'Other'
      // ]
      const sourcesArray = [
        'Retail Banking Services',
        'Lending Solutions',
        'Card Services',
        'Investment Products',
        'Insurance Offerings',
        'Digital Banking Platforms',
        'Wealth Management',
        'Payment Services',
        'Other'
      ]

      let responseOutput = {}

      for (let i = 0; i < sourcesArray.length; i++) {
        // let twentyFiveScore = 0,
        //   fiftyPercentScore = 0,
        //   seventyPercentScore = 0,
        //   hundredPercentScore = 0

        let highScore = 0,
          lowScore = 0,
          mediumScore = 0
        let query

        query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')  AND product_ref_ind:("${sourcesArray[i]}")`

        lowScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 0.000001, 40)
        )
        mediumScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 40, 70)
        )
        highScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 70, 100)
        )
        if (highScore.count > 0 || mediumScore.count > 0 || lowScore.count > 0) {
          ;(responseOutput )[sourcesArray[i]] = {
            highScore: highScore?.count,
            mediumScore: mediumScore?.count,
            lowScore: lowScore?.count
          }
        }
      }
      //console.log('data', responseOutput)

   return res.status(200).json(
        {
          responseOutput
        }
        
      )    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'churnProbabilityChart') {
    try {
      // const twitterContentQuery = `${topicQueryString} AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`

      // const dat = await testClientElasticQuery(
      //   elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
      // )

      // console.log('yt', dat?.hits?.hits)

      // const sourcesArray2 = [
      //   {
      //     name: '0 to 20 %',
      //     gval: 0.0000001,
      //     lval: 0.2
      //   },
      //   {
      //     name: '20 to 40 %',
      //     gval: 0.2,
      //     lval: 0.4
      //   },
      //   {
      //     name: '40 to 60 %',
      //     gval: 0.4,
      //     lval: 0.6
      //   },
      //   {
      //     name: '60 to 80 %',
      //     gval: 0.6,
      //     lval: 0.8
      //   },
      //   {
      //     name: '80 to 100 %',
      //     gval: 0.8,
      //     lval: 0.99
      //   }
      // ]

      const sourcesArray = ['Twitter', 'Instagram', 'Facebook']

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
        // let twitterContent = 0,
        //   facebookContent = 0,
        //   instagramContent = 0,
        //   webContent = 0
        // let twitterContentQuery, facebookContentQuery, instagramContentQuery, webContentQuery

        let twentyFiveScore = 0,
          fiftyPercentScore = 0,
          seventyPercentScore = 0,
          hundredPercentScore = 0
        let query

        query = `${topicQueryString} AND source:(${_sources}) AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') `

        twentyFiveScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 0.000001, 25)
        )
        fiftyPercentScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 25, 50)
        )
        seventyPercentScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 50, 75)
        )
        hundredPercentScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 75, 100)
        )
        ;(responseOutput )[sourcesArray[i]] = {
          twentyFiveScore: twentyFiveScore?.count,
          fiftyPercentScore: fiftyPercentScore?.count,
          seventyPercentScore: seventyPercentScore?.count,
          hundredPercentScore: hundredPercentScore?.count
        }
      }

      // console.log('data', responseOutput)

   return res.status(200).json(
        {
          responseOutput
        }
        
      )    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'churnProbabilitySentimentChart') {
    try {
      // const twitterContentQuery = `${topicQueryString} AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"')`

      // const dat = await testClientElasticQuery(
      //   elasticMentionQueryTemplate(twitterContentQuery, greaterThanTime, lessThanTime)
      // )

      // console.log('yt', dat?.hits?.hits)

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
      // const sourcesArray = [
      //   'Mobile Banking App',
      //   'Mobile App',
      //   'Website',
      //   'ATM',
      //   'Physical Branch',
      //   'Social Media',
      //   'Online Banking Platform',
      //   'Customer Service (Phone, Email, or Live Chat)',
      //   'IVR System',
      //   'Call Center',
      //   'Bill Payment Platform',
      //   'Loan Application Process',
      //   'Service Connection/Disconnection',
      //   'Physical Office',
      //   'Installation/Technical Support',
      //   'Network Coverage',
      //   'Billing System',
      //   'Data Roaming',
      //   'Plan Upgrades',
      //   'Device Purchases/Repairs',
      //   'Wi-Fi Services',
      //   'Home Internet Services',
      //   'Meter Reading',
      //   'Outage Reporting System',
      //   'Mortgage Services',
      //   'Credit Card Services',
      //   'Fraud Detection/Resolution',
      //   'Wealth Management',
      //   'Transaction Alerts',
      //   'Airport Check-in Counter',
      //   'Self-service Kiosk',
      //   'In-flight Experience',
      //   'Boarding Process',
      //   'Baggage Handling',
      //   'Loyalty Program',
      //   'Government Website/Portal',
      //   'Public Service Office',
      //   'Document Submission Process',
      //   'Permit/License Application',
      //   'In-person Appointment',
      //   'Physical Store',
      //   'Digital Channels',
      //   'Customer Support',
      //   'Physical Channels',
      //   'Social and Engagement Channels',
      //   'Messaging and Alerts',
      //   'Loyalty and Rewards',
      //   'Other'
      // ]

      let responseOutput = {}

      for (let i = 0; i < sourcesArray.length; i++) {
        // let twentyFiveScore = 0,
        //   fiftyPercentScore = 0,
        //   seventyPercentScore = 0,
        //   hundredPercentScore = 0

        let highScore = 0,
          lowScore = 0,
          mediumScore = 0
        let query

        query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') AND llm_mention_touchpoint:("${sourcesArray[i]}")`

        lowScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 0.000001, 40)
        )
        mediumScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 40, 70)
        )
        highScore = await elasticSearchCount(
          elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 70, 100)
        )
        if (highScore.count > 0 || mediumScore.count > 0 || lowScore.count > 0) {
          ;(responseOutput )[sourcesArray[i]] = {
            highScore: highScore?.count,
            mediumScore: mediumScore?.count,
            lowScore: lowScore?.count
          }
        }
      }
      //console.log('data', responseOutput)

   return res.status(200).json(
        {
          responseOutput
        }
        
      )
        } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'satisfactionSentimentSummary') {
    try {
      const query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') `

      // const esData2 = await testClientElasticQuery()
      // console.log('dataTesting', esData2?.hits?.hits)

      // ['predicted_sentiment_value', 'predicted_category', 'llm_mention_type', 'llm_mention_touchpoint', 'llm_mention_urgency', 'llm_mention_audience', 'llm_mention_action', 'llm_product_ref', 'llm_mention_tone', 'llm_mention_recurrence']
      const lowSenti = await elasticSearchCount(
        elasticMentionScoreQuery(query, greaterThanTime, lessThanTime, 0.000001, 0.4)
      )
      const mediumSenti = await elasticSearchCount(
        elasticMentionScoreQuery(query, greaterThanTime, lessThanTime, 0.4, 0.7)
      )
      const highSenti = await elasticSearchCount(
        elasticMentionScoreQuery(query, greaterThanTime, lessThanTime, 0.7, 0.99)
      )

      const totalSentiments = highSenti?.count + lowSenti?.count + mediumSenti?.count

      const responseOutput = `High(70-100%),${highSenti?.count}|Medium(40-70%),${mediumSenti?.count}|Low(0-40%),${lowSenti?.count}`

         return res.status(200).json(
        {
          responseOutput,
          totalSentiments
        }
        
      )
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'churnSentimentSummary') {
    try {
      const query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"') AND llm_mention_type:('"Customer Complaint" OR "Inquiry" OR "Praise" OR "Suggestion" OR "Product Feedback"') `

      // const esData2 = await testClientElasticQuery()
      // console.log('dataTesting', esData2?.hits?.hits)

      // ['predicted_sentiment_value', 'predicted_category', 'llm_mention_type', 'llm_mention_touchpoint', 'llm_mention_urgency', 'llm_mention_audience', 'llm_mention_action', 'llm_product_ref', 'llm_mention_tone', 'llm_mention_recurrence']
      const lowSenti = await elasticSearchCount(
        elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 0.000001, 40)
      )
      const mediumSenti = await elasticSearchCount(
        elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 40, 70)
      )
      const highSenti = await elasticSearchCount(
        elasticMentionChurnProbQuery(query, greaterThanTime, lessThanTime, 70, 100)
      )

      const totalSentiments = highSenti?.count + lowSenti?.count + mediumSenti?.count

      const responseOutput = `High(70-100%),${highSenti?.count}|Low(0-40%),${lowSenti?.count}|Medium(40-70%),${mediumSenti?.count}`

     return res.status(200).json(
        {
          responseOutput,
          totalSentiments
        }
        
      )    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'ComplaintClouds') {
    try {
      let result

      result = await prisma.wordcloud_cx_data.findMany({
        where: {
          wc_time: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // last 7 days
          },
          wc_tid: topicId
        }
      })

      let wc_to_array
      let shuffeled2
      if (result?.length !== 0 && typeof result[0]?.wc_str_sorted === 'string') {
        try {
          wc_to_array = result[0]?.wc_str_sorted // Assuming wc_str_sorted is already an array
        } catch (error) {
          throw new Error('Failed to retrieve wc_str_sorted from result')
        }

        function parseShuffeled(shuffeled) {
          if (typeof shuffeled === 'string') {
            try {
              shuffeled = JSON.parse(shuffeled)
            } catch (error) {
              console.error('Invalid JSON string:', error)
              return null
            }
          }
          return shuffeled
        }

        shuffeled2 = parseShuffeled(wc_to_array)
      } else if (result?.length !== 0) {
        shuffeled2 = result[0]?.wc_str_sorted
      }

      if (result?.length === 0 || shuffeled2?.length === 0 || filters === 'true') {
        const elasticMentionQueryTemplate = (topicQueryString, gte, lte) => ({
          from: 0,
          size: 1000,
          query: {
            bool: {
              must: [
                { query_string: { query: topicQueryString } },
                {
                  range: {
                    p_created_time: { gte: gte, lte: lte }
                  }
                }
              ]
            }
          }
        })

        let complaintContent
        let query = ''

        query = `${topicQueryString} AND source:('"Twitter" OR "Facebook" OR "Instagram"')  AND llm_mention_type:("Customer Complaint") AND llm_mention_touchpoint:('"Mobile Banking App" OR
        "Mobile App" OR
        "Website" OR
        "ATM" OR
        "Physical Branch" OR
        "Social Media" OR
        "Online Banking Platform" OR
        "Customer Service (Phone OR  Email OR  or Live Chat)" OR
        "IVR System" OR
        "Call Center" OR
        "Bill Payment Platform" OR
        "Loan Application Process" OR
        "Service Connection/Disconnection" OR
        "Physical Office" OR
        "Installation/Technical Support" OR
        "Network Coverage" OR
        "Billing System" OR
        "Data Roaming" OR
        "Plan Upgrades" OR
        "Device Purchases/Repairs" OR
        "Wi-Fi Services" OR
        "Home Internet Services" OR
        "Meter Reading" OR
        "Outage Reporting System" OR
        "Mortgage Services" OR
        "Credit Card Services" OR
        "Fraud Detection/Resolution" OR
        "Wealth Management" OR
        "Transaction Alerts" OR
        "Airport Check-in Counter" OR
        "Self-service Kiosk" OR
        "In-flight Experience" OR
        "Boarding Process" OR
        "Baggage Handling" OR
        "Loyalty Program" OR
        "Government Website/Portal" OR
        "Public Service Office" OR
        "Document Submission Process" OR
        "Permit/License Application" OR
        "In-person Appointment" OR
        "Physical Store" OR
         "Digital Channels" OR
        "Physical Channels" OR
        "Customer Support" OR
        "Social and Engagement Channels" OR
        "Messaging and Alerts" OR
        "Loyalty and Rewards" OR
        "Other"')`
        // console.log(query, 'ComplaintClouds is here')
        complaintContent = await testClientElasticQuery(
          elasticMentionQueryTemplate(query, greaterThanTime, lessThanTime)
        )

        const pIds = complaintContent?.hits?.hits.map((hit) => hit._source.p_id)
        const params = {
          query: {
            bool: {
              filter: [
                { ids: { values: pIds } },
                { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
              ]
            }
          },
          aggs: {
            tagcloud: {
              terms: { field: 'p_message', size: 60 }
            }
          }
        }
        const results = await testClientElasticQuery(params)
        const tagCloud = results
        const omitWords = await prisma.omit_words.findMany()
        const omitWordsArray = omitWords.map((word) => word.word)

        const wordstagArray = []

        function isNumeric(value) {
          // Use parseFloat or parseInt to convert the value to a number
          // and then check if it's a valid number and not NaN (Not-a-Number)
          return !isNaN(parseFloat(value)) && isFinite(value)
        }

        for (let i = 0; i < results?.aggregations?.tagcloud?.buckets?.length; i++) {
          const key = results?.aggregations?.tagcloud?.buckets[i].key
          const doc_count = results?.aggregations?.tagcloud?.buckets[i].doc_count

          if (key && !isNumeric(key) && !omitWordsArray.includes(key) && key.length >= 4) {
            wordstagArray?.push({ tag: key.replace("'", ''), count: doc_count })
          }
        }

        const sortedArr = wordstagArray?.sort((a, b) => b.count - a.count) // Sort by count descending

        let fsize = 0
        let top_count = 0
        let top_count_name = ''
        let finalTagsArray = []
        let tagStr = ''

        for (let j = 0; j < sortedArr?.length; j++) {
          const word = sortedArr[j]?.tag
          const word_count = sortedArr[j]?.count

          if (j === 0) {
            top_count = word_count
            top_count_name = word
          }

          finalTagsArray?.push({ tag: word.replace("'", ''), count: word_count })
          tagStr += `${word} `

          if (fsize <= 38) {
            fsize += 2
          }

          if (j >= 60) {
            // This check should be equal to how many tags to show
            break
          }
        }

        // Shuffle finalTagsArray (Fisher-Yates shuffle)
        for (let i = finalTagsArray?.length - 1; i > 0; i--) {
          const j = Math?.floor(Math.random() * (i + 1))
          ;[finalTagsArray[i], finalTagsArray[j]] = [finalTagsArray[j], finalTagsArray[i]]
        }

        const finalTagsArraySorted = finalTagsArray.sort((a, b) => b.count - a.count)

        let chk
        chk = await prisma.wordcloud_cx_data.findMany({
          where: {
            wc_tid: topicId
          }
        })

        if (chk.length > 0) {
          // Update existing record

          await prisma.wordcloud_cx_data.update({
            where: {
              wc_tid: topicId,
              wc_id: chk[0].wc_id
            },
            data: {
              wc_time: new Date()
            }
          })
        } else {
          // Insert new record

          await prisma.wordcloud_cx_data.create({
            data: {
              wc_tid: topicId,
              wc_str: JSON.stringify(finalTagsArray),
              wc_str_sorted: JSON.stringify(finalTagsArraySorted),
              wc_time: new Date()
            }
          })
        }

        // Prepare wc_array for response
        const wc_array = {
          sorted: finalTagsArraySorted,
          shuffeled: finalTagsArraySorted,
          list_view: finalTagsArraySorted.map(tag => `${tag.tag}, ${tag.count}`).join(', ')
        }

             return res.status(200).json(
        {
         wc_array
        }
        
      )
        // Return JSON response
        //let wc_array=['dubai']
        
      } else {
        let wc_to_array
        try {
          wc_to_array = result[0]?.wc_str_sorted // Assuming wc_str_sorted is already an array
        } catch (error) {
          throw new Error('Failed to retrieve wc_str_sorted from result')
        }

        function parseShuffeled(shuffeled) {
          if (typeof shuffeled === 'string') {
            try {
              shuffeled = JSON.parse(shuffeled)
            } catch (error) {
              console.error('Invalid JSON string:', error)
              return null
            }
          }
          return shuffeled
        }

        let shuffeled2 = parseShuffeled(wc_to_array)

        const wc_array = {
          shuffeled: shuffeled2
        }

        wc_array?.shuffeled?.sort((a, b) => b.count - a.count)

        
        return res.status(200).json(
          {
            wc_array
          }
        )
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'PositiveSentimentsClouds') {
    try {
      let result
      if (subtopicId) {
        result = await prisma.wordcloud_data.findMany({
          where: {
            wc_time: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // last 7 days
            },
            wc_stid: Number(subtopicId)
          }
        })
      } else {
        result = await prisma.wordcloud_cx_data.findMany({
          where: {
            wc_time: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // last 7 days
            },
            wc_tid: topicId
          }
        })
      }
      //console.log('asdasdasd', result[0]?.wc_str)

      if (result?.length === 0 || result[0]?.wc_str === null || filters === 'true') {
        // console.log('again')
        greaterThanTime = '2023-02-05'
        lessThanTime = '2023-02-21'
        topicQueryString = `${topicQueryString} AND un_keywords:("Yes") AND predicted_sentiment_value:("Positive")`

        const params = {
          body: {
            query: {
              bool: {
                must: [
                  { query_string: { query: topicQueryString } },
                  { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
                ]
              }
            },
            aggs: {
              tagcloud: {
                terms: { field: 'p_message', size: 60 }
              }
            }
          }
        }

        const results = await client(params)

        const omitWords = await prisma.omit_words.findMany()
        const omitWordsArray = omitWords.map((word) => word.word)

        const wordstagArray = []

        function isNumeric(value) {
          // Use parseFloat or parseInt to convert the value to a number
          // and then check if it's a valid number and not NaN (Not-a-Number)
          return !isNaN(parseFloat(value)) && isFinite(value)
        }

        for (let i = 0; i < results?.aggregations?.tagcloud?.buckets?.length; i++) {
          const key = results?.aggregations?.tagcloud?.buckets[i].key
          const doc_count = results?.aggregations?.tagcloud?.buckets[i].doc_count

          if (key && !isNumeric(key) && !omitWordsArray.includes(key) && key.length >= 4) {
            wordstagArray?.push({ tag: key.replace("'", ''), count: doc_count })
          }
        }

        const sortedArr = wordstagArray?.sort((a, b) => b.count - a.count) // Sort by count descending

        let fsize = 0
        let top_count = 0
        let top_count_name = ''
        let finalTagsArray = []
        let tagStr = ''

        for (let j = 0; j < sortedArr?.length; j++) {
          const word = sortedArr[j]?.tag
          const word_count = sortedArr[j]?.count

          if (j === 0) {
            top_count = word_count
            top_count_name = word
          }

          finalTagsArray?.push({ tag: word.replace("'", ''), count: word_count })
          tagStr += `${word} `

          if (fsize <= 38) {
            fsize += 2
          }

          if (j >= 60) {
            // This check should be equal to how many tags to show
            break
          }
        }

        // Shuffle finalTagsArray (Fisher-Yates shuffle)
        for (let i = finalTagsArray?.length - 1; i > 0; i--) {
          const j = Math?.floor(Math.random() * (i + 1))
          ;[finalTagsArray[i], finalTagsArray[j]] = [finalTagsArray[j], finalTagsArray[i]]
        }

        const finalTagsArraySorted = finalTagsArray.sort((a, b) => b.count - a.count)
        //console.log('positve,', finalTagsArraySorted)
        let chk
        if (subtopicId) {
          chk = await prisma.wordcloud_data.findMany({
            where: {
              wc_stid: Number(subtopicId)
            }
          })
        } else {
          chk = await prisma.wordcloud_cx_data.findMany({
            where: {
              wc_tid: topicId
            }
          })
        }

        if (chk.length > 0) {
          // Update existing record
          if (subtopicId) {
            await prisma.wordcloud_data.update({
              where: {
                wc_stid: Number(subtopicId),
                wc_id: chk[0].wc_id
              },
              data: {
                wc_time: new Date()
              }
            })
          } else {
            await prisma.wordcloud_cx_data.update({
              where: {
                wc_tid: topicId,
                wc_id: chk[0].wc_id
              },
              data: {
                wc_time: new Date()
              }
            })
          }
        } else {
          // Insert new record
          if (subtopicId) {
            await prisma.wordcloud_data.create({
              data: {
                wc_stid: Number(subtopicId),
                wc_str: JSON.stringify(finalTagsArray),
                wc_str_sorted: JSON.stringify(finalTagsArraySorted),
                wc_time: new Date()
              }
            })
          } else {
            await prisma.wordcloud_cx_data.create({
              data: {
                wc_tid: topicId,
                wc_str: JSON.stringify(finalTagsArraySorted),
                wc_time: new Date()
              }
            })
          }
        }

        // Prepare wc_array for response
        const wc_array = {
          sorted: finalTagsArraySorted,
          shuffeled: finalTagsArraySorted,
          list_view: finalTagsArraySorted.map(tag => `${tag.tag}, ${tag.count}`).join(', ')
        }

        // Return JSON response

         return res.status(200).json(
          {
            wc_array
          }
        )
      } else {
        let wc_to_array
        try {
          wc_to_array = result[0]?.wc_str // Assuming wc_str_sorted is already an array
        } catch (error) {
          throw new Error('Failed to retrieve wc_str_sorted from result')
        }

        function parseShuffeled(shuffeled) {
          if (typeof shuffeled === 'string') {
            try {
              shuffeled = JSON.parse(shuffeled)
            } catch (error) {
              console.error('Invalid JSON string:', error)
              return null
            }
          }
          return shuffeled
        }

        let shuffeled2 = parseShuffeled(wc_to_array)

        const wc_array = {
          shuffeled: shuffeled2
        }

        wc_array?.shuffeled?.sort((a, b) => b.count - a.count)

       return res.status(200).json(
          {
            wc_array
          }
        )
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (type === 'NegativeSentimentsClouds') {
    try {
      let result
      if (subtopicId) {
        result = await prisma.wordcloud_data.findMany({
          where: {
            wc_time: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // last 7 days
            },
            wc_stid: Number(subtopicId)
          }
        })
      } else {
        result = await prisma.wordcloud_cx_data.findMany({
          where: {
            wc_time: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // last 7 days
            },
            wc_tid: topicId
          }
        })
      }
      //
      //console.log('kk', result)

      if (result?.length === 0 || result[0]?.wc_str_sorted === null || filters === 'true') {
        greaterThanTime = '2023-02-05'
        lessThanTime = '2023-02-21'
        topicQueryString = `${topicQueryString} AND un_keywords:("Yes") AND predicted_sentiment_value:("Negative")`

        const params = {
          body: {
            query: {
              bool: {
                must: [
                  { query_string: { query: topicQueryString } },
                  { range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } } }
                ]
              }
            },
            aggs: {
              tagcloud: {
                terms: { field: 'p_message', size: 60 }
              }
            }
          }
        }

        const results = await client(params)

        const omitWords = await prisma.omit_words.findMany()
        const omitWordsArray = omitWords.map((word) => word.word)

        const wordstagArray = []

        function isNumeric(value) {
          // Use parseFloat or parseInt to convert the value to a number
          // and then check if it's a valid number and not NaN (Not-a-Number)
          return !isNaN(parseFloat(value)) && isFinite(value)
        }

        for (let i = 0; i < results?.aggregations?.tagcloud?.buckets?.length; i++) {
          const key = results?.aggregations?.tagcloud?.buckets[i].key
          const doc_count = results?.aggregations?.tagcloud?.buckets[i].doc_count

          if (key && !isNumeric(key) && !omitWordsArray.includes(key) && key.length >= 4) {
            wordstagArray?.push({ tag: key.replace("'", ''), count: doc_count })
          }
        }

        const sortedArr = wordstagArray?.sort((a, b) => b.count - a.count) // Sort by count descending

        let fsize = 0
        let top_count = 0
        let top_count_name = ''
        let finalTagsArray = []
        let tagStr = ''

        for (let j = 0; j < sortedArr?.length; j++) {
          const word = sortedArr[j]?.tag
          const word_count = sortedArr[j]?.count

          if (j === 0) {
            top_count = word_count
            top_count_name = word
          }

          finalTagsArray?.push({ tag: word.replace("'", ''), count: word_count })
          tagStr += `${word} `

          if (fsize <= 38) {
            fsize += 2
          }

          if (j >= 60) {
            // This check should be equal to how many tags to show
            break
          }
        }

        // Shuffle finalTagsArray (Fisher-Yates shuffle)
        for (let i = finalTagsArray?.length - 1; i > 0; i--) {
          const j = Math?.floor(Math.random() * (i + 1))
          ;[finalTagsArray[i], finalTagsArray[j]] = [finalTagsArray[j], finalTagsArray[i]]
        }

        const finalTagsArraySorted = finalTagsArray.sort((a, b) => b.count - a.count)
        //console.log('negative,', finalTagsArraySorted)

        let chk
        if (subtopicId) {
          chk = await prisma.wordcloud_data.findMany({
            where: {
              wc_stid: Number(subtopicId)
            }
          })
        } else {
          chk = await prisma.wordcloud_cx_data.findMany({
            where: {
              wc_tid: topicId
            }
          })
        }

        if (chk.length > 0) {
          // Update existing record
          if (subtopicId) {
            await prisma.wordcloud_data.update({
              where: {
                wc_stid: Number(subtopicId),
                wc_id: chk[0].wc_id
              },
              data: {
                wc_time: new Date()
              }
            })
          } else {
            await prisma.wordcloud_cx_data.update({
              where: {
                wc_tid: topicId,
                wc_id: chk[0].wc_id
              },
              data: {
                wc_time: new Date()
              }
            })
          }
        } else {
          // Insert new record
          if (subtopicId) {
            await prisma.wordcloud_data.create({
              data: {
                wc_stid: Number(subtopicId),
                wc_str: JSON.stringify(finalTagsArray),
                wc_str_sorted: JSON.stringify(finalTagsArraySorted),
                wc_time: new Date()
              }
            })
          } else {
            await prisma.wordcloud_cx_data.create({
              data: {
                wc_tid: topicId,
                wc_str_sorted: JSON.stringify(finalTagsArraySorted),
                wc_time: new Date()
              }
            })
          }
        }

        // Prepare wc_array for response
        const wc_array = {
          sorted: finalTagsArraySorted,
          shuffeled: finalTagsArraySorted,
          list_view: finalTagsArraySorted.map(tag => `${tag.tag}, ${tag.count}`).join(', ')
        }

        // Return JSON response

         return res.status(200).json(
          {
            wc_array
          }
        )
      } else {
        let wc_to_array
        try {
          wc_to_array = result[0]?.wc_str_sorted // Assuming wc_str_sorted is already an array
        } catch (error) {
          throw new Error('Failed to retrieve wc_str_sorted from result')
        }

        function parseShuffeled(shuffeled) {
          if (typeof shuffeled === 'string') {
            try {
              shuffeled = JSON.parse(shuffeled)
            } catch (error) {
              console.error('Invalid JSON string:', error)
              return null
            }
          }
          return shuffeled
        }

        let shuffeled2 = parseShuffeled(wc_to_array)

        const wc_array = {
          shuffeled: shuffeled2
        }

        wc_array?.shuffeled?.sort((a, b) => b.count - a.count)

      
         return res.status(200).json({ wc_array });
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}
}
module.exports = undpController;
