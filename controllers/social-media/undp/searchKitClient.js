


const { elasticClient } = require("../../../config/elasticsearch");

const prisma = require("../../../config/database");
const http= require('http');
const https= require('https');
const { URL }= require('url');

const mentionsChartController = {

 elasticSearchCount : async (params) => {
  try {
    // Elasticsearch `_count` API call
    const response = await elasticClient.count({
      index: process.env.ELASTICSEARCH_DEFAULTINDEX, // Specify the default index here
      body: params.body // Query body
    })
    return response
  } catch (error) {
    console.error('Elasticsearch count error:', error)
    throw error
  }
},

buildQueryString : async (topicId, isScadUser, selectedTab) => {
  const topicData = await prisma.customer_topics.findUnique({
    where: { topic_id: topicId }
  })

  if (!topicData) return ''

  let inVal = ''
  let tpkUrls = ''
  let searchStr = ''

  // Process hashtags
  const htags = topicData?.topic_hash_tags
    ?.split('|')
    .map(tag => tag.trim())
    .filter(tag => tag !== '')
  htags?.forEach(tag => {
    inVal += `'${tag}',`
  })

  // Process keywords
  const keywords = topicData?.topic_keywords
    ?.split(',')
    .map(keyword => keyword.trim())
    .filter(keyword => keyword !== '')
  keywords?.forEach(keyword => {
    inVal += `'${keyword}',`
  })

  // Process URLs
  if (topicData.topic_urls) {
    const tUrls = topicData.topic_urls
      .split('|')
      .map(url => url.trim())
      .filter(url => url !== '')
    tUrls.forEach(url => {

      if (selectedTab == "GOOGLE") {
        if (url.includes("google")) {
          inVal += `'${url}',`
          tpkUrls += `"${url}" OR `
        }
      } else {
        if (!url.includes("google")) {
          inVal += `'${url}',`
          tpkUrls += `"${url}" OR `
        }
        
      }
      
    })
  }

  searchStr = inVal.slice(0, -1).replace(/'/g, '')
  let strArray = searchStr.split(',')
  if (isScadUser == "true") {
    if (selectedTab === "GOOGLE") {
      strArray = strArray.filter(tag => tag.toLowerCase().includes("google"));
    } else {
      strArray = strArray.filter(tag => !tag.toLowerCase().includes("google"));
    }
  }  
  let strToSearch = ''
  strArray.forEach(str => {
    strToSearch += `"${str}" OR `
  })

  if (tpkUrls !== '') {
    strToSearch = `(p_message_text:(${strToSearch.slice(0, -4)}) OR u_fullname:(${strToSearch.slice(
      0,
      -4
    )}) OR u_source:(${tpkUrls.slice(0, -4)}) OR p_url:(${tpkUrls.slice(0, -4)}))`
  } else {
    if (topicData.topic_gmaps_url && topicData.topic_gmaps_url !== null) {
      strToSearch = `(p_message_text:(${strToSearch.slice(0, -4)}) OR place_url:("${topicData.topic_gmaps_url}"))`
    } else {
      strToSearch = `p_message_text:(${strToSearch.slice(0, -4)})`
    }
  }

  // Handle exclusion filters
  if (topicData.topic_exclude_words) {
    const tempStr = topicData.topic_exclude_words
      .split(',')
      .map(word => word.trim())
      .filter(word => word !== '')
    let tempExcludeStr = ''
    tempStr.forEach(word => {
      tempExcludeStr += `"${word}" OR `
    })
    strToSearch += ` AND NOT p_message_text:(${tempExcludeStr.slice(0, -4)})`
  }

  if (topicData.topic_exclude_accounts) {
    const tempStr = topicData.topic_exclude_accounts
      .split(',')
      .map(account => account.trim())
      .filter(account => account !== '')
    let tempExcludeStr = ''
    tempStr.forEach(account => {
      tempExcludeStr += `"${account}" OR `
    })
    strToSearch += ` AND NOT u_username:(${tempExcludeStr.slice(0, -4)}) AND NOT u_source:(${tempExcludeStr.slice(
      0,
      -4
    )})`
  }

  if (topicData.topic_data_source) {
    const tempStr = topicData.topic_data_source
      .split(',')
      .map(source => source.trim())
      .filter(source => source !== '')
    let tempSourceStr = ''
    tempStr.forEach(source => {
      tempSourceStr += `"${source}" OR `
    })
    strToSearch += ` AND source:(${tempSourceStr.slice(0, -4)})`
  }

  if (topicData.topic_data_location) {
    const tempStr = topicData.topic_data_location
      .split(',')
      .map(location => location.trim())
      .filter(location => location !== '')
    let tempLocationStr = ''
    tempStr.forEach(location => {
      tempLocationStr += `"${location}" OR `
    })
    strToSearch += ` AND u_location:(${tempLocationStr.slice(0, -4)})`
  }

  if (topicData.topic_data_lang) {
    const tempStr = topicData.topic_data_lang
      .split(',')
      .map(lang => lang.trim())
      .filter(lang => lang !== '')
    let tempLangStr = ''
    tempStr.forEach(lang => {
      tempLangStr += `"${lang}" OR `
    })
    strToSearch += ` AND lange_detect:(${tempLangStr.slice(0, -4)})`
  }

  // Additional filters
  strToSearch += ` AND NOT source:("DM") AND NOT manual_entry_type:("review")`

  return strToSearch
},
 buildsubTopicQueryString : async (topicId) => {
  const expData = await prisma.customer_experience.findUnique({
    where: { exp_id: topicId }
  })

  if (!expData) return ''

  const keywords = expData.exp_keywords
    .split(',')
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword)
  let keyStr = keywords.map((keyword) => `"${keyword.replace(/"/g, '')}"`).join(' OR ')

  let exKeyStr = ''
  if (expData.exp_exclude_keywords) {
    const expKeyExclude = expData.exp_exclude_keywords
      .split(',')
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword)
    exKeyStr = expKeyExclude.map((keyword) => `"${keyword}"`).join(' OR ')
  }

  let expExcludeAccounts = ''
  if (expData.exp_exclude_accounts) {
    const tempArray = expData.exp_exclude_accounts
      .split(',')
      .map((account) => account.trim())
      .filter((account) => account)
    const tempStr = tempArray.map((account) => `"${account}"`).join(' OR ')
    expExcludeAccounts = ` AND NOT u_username:(${tempStr}) AND NOT u_source:(${tempStr}) AND NOT u_profile_photo:(${tempStr})`
  }

  let searchStr = exKeyStr
    ? `(p_message_text:(${keyStr}) OR u_source:(${keyStr}) OR u_fullname:(${keyStr})) AND NOT p_message_text:(${exKeyStr})`
    : `(p_message_text:(${keyStr}) OR u_source:(${keyStr}) OR u_fullname:(${keyStr}))`

  let expSourcesStr = ''
  if (expData.exp_source) {
    const expSources = expData.exp_source
      .split(',')
      .map((source) => source.trim())
      .filter((source) => source)
    expSourcesStr = expSources.map((source) => `"${source}"`).join(' OR ')
  }

  if (expData.exp_type === 'cx_monitoring' || expData.exp_type === 'campaign_monitoring') {
    searchStr += expSourcesStr
      ? ` AND source:(${expSourcesStr})`
      : ` AND source:("Twitter" OR "Youtube" OR "Linkedin" OR "Pinterest" OR "Reddit" OR "Tumblr" OR "Vimeo" OR "Instagram" OR "Facebook")`
  } else if (expData.exp_type === 'media_monitoring') {
    searchStr += expSourcesStr
      ? ` AND source:(${expSourcesStr})`
      : ` AND source:("khaleej_times" OR "Omanobserver" OR "Time of oman" OR "Blogs" OR "FakeNews" OR "News" OR "Web")`
  }

  if (expExcludeAccounts) {
    searchStr += expExcludeAccounts
  }

  return searchStr
},

dateDifference :(date1, date2) => {
  // Ensure the inputs are Date objects
  const d1 = new Date(date1)
  const d2 = new Date(date2)

  // Calculate the absolute difference in time (in milliseconds)
  const diffTime = Math.abs(d1.getTime() - d2.getTime())

  // Convert the difference from milliseconds to days and return the rounded value
  return Math.round(diffTime / (1000 * 60 * 60 * 24))
},

 buildTouchPointQueryString : async (touchId) => {
  const keywrd = await prisma.touch_points.findMany({
    where: {
      tp_id: touchId
    },
    select: {
      tp_keywords: true
    }
  })

  const keywordsArray = keywrd[0]?.tp_keywords.split(',')

  let keyStr = ''

  for (let i = 0; i < keywordsArray.length; i++) {
    if (keywordsArray[i].trim() !== '') {
      keyStr += `"${keywordsArray[i].trim()}" OR `
    }
  }

  keyStr = keyStr.slice(0, -4) // Remove the last ' OR '

  return `p_message_text:(${keyStr})`
},

elasticQueryTemplate : (topicQueryString, gte, lte, aggs) => ({
  size: 0,
  query: {
    bool: {
      must: [
        {
          query_string: {
            query: topicQueryString
          }
        },
        {
          range: {
            p_created_time: {
              gte: gte,
              lte: lte
            }
          }
        }
      ]
    }
  },
  aggs: aggs
}),

elasticMentionQueryTemplate : (topicQueryString, gte, lte) => ({
  query: {
    bool: {
      must: [
        { query_string: { query: topicQueryString } },
        {
          range: {
            p_created_time: { gte: gte, lte: lte }
          }
        },
       {
        range: {
            created_at: { gte: gte, lte: lte }
              }
        }
      ]
    }
  }
}),

elasticMentionQueryTemplatess : (topicQueryString, gte, lte) => ({
  query: {
    bool: {
      must: [
        { query_string: { query: topicQueryString } },
        {
          range: {
            p_created_time: { gte: gte, lte: lte }
          }
        }
        ,
       {
        range: {
            created_at: { gte: gte, lte: lte }
              }
        }
      ]
    }
  },
  size:30
}),
 elasticGoogleReviewsTemplate :(topicQueryString, gte, lte) => ({
  size: 1000,
  query: {
    bool: {
      must: [
        { query_string: { query: topicQueryString } },
        {
          range: {
            p_created_time: { gte: gte, lte: lte }
          }
        },
        
       {
        range: {
            created_at: { gte: gte, lte: lte }
              }
        }
      ]
    }
  },
  aggs: {
    rating_counts: {
      terms: {
        field: "rating", // The field storing the rating values
        size: 6 // Cover ratings 1-5; Elasticsearch automatically handles exact values
      },
      aggs: {
        missing_rating: {
          missing: {
            field: "rating" // Handle null or undefined values
          }
        }
      }
    }
  }
}),



elasticEmotionsTemplate : (topicQueryString, gte, lte) => ({
  size: 0,
  query: {
    bool: {
      must: [
        { query_string: { query: topicQueryString } },
        {
          range: {
            p_created_time: { gte: gte, lte: lte }
          }
        }
        ,
       {
        range: {
            created_at: { gte: gte, lte: lte }
              }
        }
      ]
    }
  }
}),


elasticMentionQueryTemplates: (topicQueryString, gte, lte) => ({
  query: {
    bool: {
      filter: [
        { query_string: { query: topicQueryString } },
        {
          range: {
            p_created_time: { gte: gte, lte: lte }
          }
        },
       {
        range: {
            created_at: { gte: gte, lte: lte }
              }
        }
      ]
    }
  }
}),

elasticMentionScoreQuery: (topicQueryString, gte, lte, gs, ls) => ({
  query: {
    bool: {
      must: [
        { query_string: { query: topicQueryString } },
        {
          range: {
            p_created_time: { gte: gte, lte: lte }
          }
        },
        
       {
        range: {
            created_at: { gte: gte, lte: lte }
              }
        },
        {
          range: {
            satisfaction_score: { gte: gs, lte: ls }
          }
        }
      ]
    }
  }
}),

elasticMentionChurnProbQuery :(topicQueryString, gte, lte, gs, ls) => ({
  query: {
    bool: {
      must: [
        { query_string: { query: topicQueryString } },
        {
          range: {
            p_created_time: { gte: gte, lte: lte }
          }
        },
        ,
       {
        range: {
            created_at: { gte: gte, lte: lte }
              }
        },
        {
          range: {
            churn_prob: { gte: gs, lte: ls }
          }
        }
      ]
    }
  }
}),

elasticQueryTemplateRange : (topicQueryString, gte, lte, range) => ({
  body: {
    query: {
      bool: {
        must: [
          { query_string: { query: topicQueryString } },
          {
            range: {
              p_created_time: { gte: gte, lte: lte }
            }
          },
          ,
       {
        range: {
            created_at: { gte: gte, lte: lte }
              }
        },
          { range: range }
        ]
      }
    }
  }
}),

customerReviewElasticId:async(parentAccid)=> {
  if (!parentAccid || parentAccid === null) {
    console.log('parentAccountId is required')
    return
  }
  const parentAccountId = Number(parentAccid)
  if (isNaN(parentAccountId)) {
    console.log('Invalid ID')
    return
  }
  try {
    const customer = await prisma.customers.findUnique({
      where: {
        customer_id: Number(parentAccountId)
      },
      select: {
        customer_reviews_key: true
      }
    })

    if (!customer) {
      console.log('Customer not found')
      return
    }

    const customer_reviews_key = customer.customer_reviews_key
    return customer_reviews_key
  } catch (error) {
    console.error('error fetching result', error)
    return error
  }
},
 getCountryCode:async(cname)=>{
  if (!cname) {
    return 'blank.png'
  }

  let countryName = cname

  if (countryName === 'USA' || countryName === 'United States of America') {
    countryName = 'United States'
  } else if (countryName === 'UK') {
    countryName = 'United Kingdom'
  }

  try {
    const result = await prisma.countries_list.findFirst({
      where: { country_name: countryName }
    })

    if (result) {
      return `${result.country_code}`
    } else {
      return 'blank.png'
    }
  } catch (error) {
    console.error(error)
    return error
  }
},

getAllTouchpoints:async(subTopicId)=>{
  const touchPointsIds = []

  const touchPoints = await prisma.cx_touch_points.findMany({
    where: {
      cx_tp_cx_id: subTopicId
    },
    select: {
      cx_tp_tp_id: true
    }
  })
  if (touchPoints.length > 0) {
    return touchPoints
  } else {
    return touchPointsIds
  }
},

getTouchpointData:async(touchId)=> {
  const data = await prisma.touch_points.findMany({
    where: {
      tp_id: touchId
    }
  })

  return data
},
 checkCustomerModuleAccess:async(mode, customerId) =>{
  try {
    const sourceHandles = await prisma.source_handles.findMany({
      where: {
        sh_type: mode,
        sh_cid: parseInt(customerId)
      },
      select: {
        sh_id: true
      }
    })

    if (sourceHandles.length > 0) {
      return 'true'
    } else {
      return 'false'
    }
  } catch (error) {
    console.error('Error checking module access:', error)
    throw new Error('Internal server error')
  }
},
request : async (url, options) => {
  const parsedUrl = new URL(url)
  const isHttps = parsedUrl.protocol === 'https:'
  const lib = isHttps ? https : http

  return new Promise((resolve, reject) => {
    const req = lib.request(parsedUrl, options, res => {
      let data = ''

      res.on('data', chunk => {
        data += chunk
      })

      res.on('end', () => {
        resolve(JSON.parse(data))
      })
    })

    req.on('error', error => {
      reject(error)
    })

    if (options.body) {
      req.write(JSON.stringify(options.body))
    }

    req.end()
  })
},
buildQueryForAllKeywordsString : async (topicId, isScadUser, selectedTab) => {
  const topicData = await prisma.customer_topics.findUnique({
    where: { topic_id: topicId }
  })

  if (!topicData) return ''

  let inVal = ''
  let tpkUrls = ''
  let searchStr = ''

  // Process hashtags
  const htags = topicData?.topic_hash_tags
    ?.split('|')
    .map(tag => tag.trim())
    .filter(tag => tag !== '')
  htags?.forEach(tag => {
    inVal += `'${tag}',`
  })

  // Process keywords
  const keywords = topicData?.topic_keywords
    ?.split(',')
    .map(keyword => keyword.trim())
    .filter(keyword => keyword !== '')
  keywords?.forEach(keyword => {
    inVal += `'${keyword}',`
  })

  // Process URLs
  if (topicData.topic_urls) {
    const tUrls = topicData.topic_urls
      .split('|')
      .map(url => url.trim())
      .filter(url => url !== '')
    tUrls.forEach(url => {

        inVal += `'${url}',`;
        tpkUrls += `"${url}" OR `;
      
    })
  }

  searchStr = inVal.slice(0, -1).replace(/'/g, '')
  let strArray = searchStr.split(',')
  if (isScadUser == "true") {
    if (selectedTab === "GOOGLE") {
      strArray = strArray.filter(tag => tag.toLowerCase().includes("google"));
    } else {
      strArray = strArray.filter(tag => !tag.toLowerCase().includes("google"));
    }
  }  
  let strToSearch = ''
  strArray.forEach(str => {
    strToSearch += `"${str}" OR `
  })

  if (tpkUrls !== '') {
    strToSearch = `(p_message_text:(${strToSearch.slice(0, -4)}) OR u_fullname:(${strToSearch.slice(
      0,
      -4
    )}) OR u_source:(${tpkUrls.slice(0, -4)}) OR p_url:(${tpkUrls.slice(0, -4)}))`
  } else {
    if (topicData.topic_gmaps_url && topicData.topic_gmaps_url !== null) {
      strToSearch = `(p_message_text:(${strToSearch.slice(0, -4)}) OR place_url:("${topicData.topic_gmaps_url}"))`
    } else {
      strToSearch = `p_message_text:(${strToSearch.slice(0, -4)})`
    }
  }

  // Handle exclusion filters
  if (topicData.topic_exclude_words) {
    const tempStr = topicData.topic_exclude_words
      .split(',')
      .map(word => word.trim())
      .filter(word => word !== '')
    let tempExcludeStr = ''
    tempStr.forEach(word => {
      tempExcludeStr += `"${word}" OR `
    })
    strToSearch += ` AND NOT p_message_text:(${tempExcludeStr.slice(0, -4)})`
  }

  if (topicData.topic_exclude_accounts) {
    const tempStr = topicData.topic_exclude_accounts
      .split(',')
      .map(account => account.trim())
      .filter(account => account !== '')
    let tempExcludeStr = ''
    tempStr.forEach(account => {
      tempExcludeStr += `"${account}" OR `
    })
    strToSearch += ` AND NOT u_username:(${tempExcludeStr.slice(0, -4)}) AND NOT u_source:(${tempExcludeStr.slice(
      0,
      -4
    )})`
  }

  if (topicData.topic_data_source) {
    const tempStr = topicData.topic_data_source
      .split(',')
      .map(source => source.trim())
      .filter(source => source !== '')
    let tempSourceStr = ''
    tempStr.forEach(source => {
      tempSourceStr += `"${source}" OR `
    })
    strToSearch += ` AND source:(${tempSourceStr.slice(0, -4)})`
  }

  if (topicData.topic_data_location) {
    const tempStr = topicData.topic_data_location
      .split(',')
      .map(location => location.trim())
      .filter(location => location !== '')
    let tempLocationStr = ''
    tempStr.forEach(location => {
      tempLocationStr += `"${location}" OR `
    })
    strToSearch += ` AND u_location:(${tempLocationStr.slice(0, -4)})`
  }

  if (topicData.topic_data_lang) {
    const tempStr = topicData.topic_data_lang
      .split(',')
      .map(lang => lang.trim())
      .filter(lang => lang !== '')
    let tempLangStr = ''
    tempStr.forEach(lang => {
      tempLangStr += `"${lang}" OR `
    })
    strToSearch += ` AND lange_detect:(${tempLangStr.slice(0, -4)})`
  }

  // Additional filters
  strToSearch += ` AND NOT source:("DM") AND NOT manual_entry_type:("review")`

  return strToSearch
}
}


module.exports = mentionsChartController