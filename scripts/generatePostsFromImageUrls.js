require('dotenv').config();

const fsPromises = require('fs').promises;
const path = require('path');
const { elasticClient } = require('../config/elasticsearch');

async function scrollSearch(query) {
  try {
    const firstResponse = await elasticClient.search({
      index: process.env.ELASTICSEARCH_DEFAULTINDEX,
      scroll: '1m',
      size: 10000,
      body: query,
    });

    let scrollId = firstResponse._scroll_id;
    const total = firstResponse.hits.total.value;
    let allResults = [];
    let currentBatch = firstResponse.hits.hits;
    let fetched = currentBatch.length;

    allResults.push(...currentBatch.map((hit) => hit._source));

    console.log(`Total documents to fetch: ${total}`);
    console.log(`Fetched first batch: ${fetched}`);

    while (fetched < total && scrollId) {
      const scrollResponse = await elasticClient.scroll({
        scroll_id: scrollId,
        scroll: '1m',
      });

      if (!scrollResponse.hits.hits.length) break;

      currentBatch = scrollResponse.hits.hits;
      allResults.push(...currentBatch.map((hit) => hit._source));

      scrollId = scrollResponse._scroll_id;
      fetched += currentBatch.length;
      console.log(`Fetched so far: ${fetched}`);
    }

    if (scrollId) {
      try {
        await elasticClient.clearScroll({ scroll_id: scrollId });
      } catch (e) {
        console.log('Error clearing scroll (non-critical):', e.message);
      }
    }

    console.log(`Total results fetched: ${allResults.length}`);
    return { total: allResults.length, results: allResults };
  } catch (error) {
    console.error('Error in scroll search:', error);
    throw error;
  }
}

function normalizeUrl(url) {
  if (!url) return '';
  return url.trim().replace(/\s+/g, '');
}

function platformForUrl(url) {
  const u = url.toLowerCase();
  if (u.includes('instagram.com')) return 'Instagram';
  if (u.includes('facebook.com')) return 'Facebook';
  if (u.includes('x.com') || u.includes('twitter.com')) return 'Twitter';
  return 'Other';
}

function buildUrlFilters(urls) {
  const filters = [];
  for (const raw of urls) {
    const url = normalizeUrl(raw);
    if (!url) continue;

    // Some documents store these URLs without trailing slashes (or vice-versa).
    // Include both variants to reduce missed matches.
    const variants = new Set([url]);
    if (url.endsWith('/')) variants.add(url.slice(0, -1));

    for (const v of variants) {
      filters.push({ match_phrase: { u_source: v } });
      filters.push({ match_phrase: { p_url: v } });
    }
  }
  return filters;
}

async function generatePostsFromImageUrls({ outputFileName }) {
  if (!process.env.ELASTICSEARCH_HOST) throw new Error('ELASTICSEARCH_HOST environment variable is not set');
  if (!process.env.ELASTICSEARCH_USER) throw new Error('ELASTICSEARCH_USER environment variable is not set');
  if (!process.env.ELASTICSEARCH_PASS) throw new Error('ELASTICSEARCH_PASS environment variable is not set');
  if (!process.env.ELASTICSEARCH_DEFAULTINDEX)
    throw new Error('ELASTICSEARCH_DEFAULTINDEX environment variable is not set');

  const outputDir = path.join(__dirname, '..', 'image_url_posts');
  await fsPromises.mkdir(outputDir, { recursive: true });

  // URLs extracted from the provided screenshot
  const IMAGE_URLS = [
    // X / Twitter
    'https://x.com/UAEmediaoffice',
    'https://x.com/DXBMediaOffice',
    'https://x.com/ADMediaOffice',
    'https://x.com/AbuDhabiMedia',
    'https://x.com/sharjahmedia',
    'https://x.com/RAKmediaoffice',
    'https://x.com/AjmanMedia',
    'https://x.com/FJMediaoffice',
    'https://x.com/uaemediacouncil',
    'https://x.com/mofuaae',
    'https://x.com/moiuae',
    'https://x.com/NCEMAUAE',

    // Instagram
    'https://www.instagram.com/uaegov/',
    'https://www.instagram.com/dubaimediaoffice/',
    'https://www.instagram.com/admediaoffice/',
    'https://www.instagram.com/abudhabi_media/',
    'https://www.instagram.com/sharjahmedia/',
    'https://www.instagram.com/rakmediaoffice/',
    'https://www.instagram.com/ajmanmedia/',
    'https://www.instagram.com/fujairah_media_office/',
    'https://www.instagram.com/uaemediacouncil/',
    'https://www.instagram.com/mofuaae/',
    'https://www.instagram.com/moiuae/',
    'https://www.instagram.com/ncemauae/',

    // Facebook
    'https://www.facebook.com/UAEGov/',
    'https://www.facebook.com/DXBMediaOffice/',
    'https://www.facebook.com/ADMediaoffice/',
    'https://www.facebook.com/abudhabimedia/',
    'https://www.facebook.com/Sharjahmedia/',
    'https://www.facebook.com/RAKMediaOffice/',
    'https://www.facebook.com/ajmanmedia/',
    'https://www.facebook.com/fujairahmediagroup/',
    'https://www.facebook.com/uaemediacouncil/',
    'https://www.facebook.com/Mofuaae/',
    'https://www.facebook.com/MOIUAE/',
    'https://www.facebook.com/NCEMAUAE/',

    // Additional URLs from remaining screenshots
    // X / Twitter
    'https://x.com/wammeews',
    'https://x.com/WAMNEWS_ENG',
    'https://x.com/AlArabiya',
    'https://x.com/AlArabiya_Brk',
    'https://x.com/AlHadhath',
    'https://x.com/AlHadhath_Brk',
    'https://x.com/skynewsarabia',
    'https://x.com/SkyNewsArabia_B',
    'https://x.com/abudhabiTV',
    'https://x.com/emaratv',
    'https://x.com/dubaitv',
    'https://x.com/alaantv',
    'https://x.com/MBCGroup',
    'https://x.com/AlArabiya_Eng',
    'https://x.com/aletihadae',
    'https://x.com/alkhaleej',
    'https://x.com/AlByaranNews',
    'https://x.com/Emaratalyoum',
    'https://x.com/sharjah24',
    'https://x.com/20fourMedia',
    'https://x.com/gulf_news',
    'https://x.com/khalleejtimes',
    'https://x.com/TheNationalNews',
    'https://x.com/gulftoday',
    'https://x.com/ArabianBusiness',
    'https://x.com/Emirates247',
    'https://x.com/TimeOutDubai',
    'https://x.com/TimeOutDubai',
    'https://x.com/WhatsOnDubai',
    'https://x.com/AlethiaDEn',
    'https://x.com/meed_media',
    'https://x.com/med_media',
    'https://x.com/DubaiEye1038FM',
    'https://x.com/VirginRadioDXB',
    'https://x.com/Emaratfm',
    'https://x.com/noorddubairadio',
    'https://x.com/AbuDhabiRadio',

    // Instagram
    'https://www.instagram.com/wammeews/',
    'https://www.instagram.com/wamnews/',
    'https://www.instagram.com/alarabiya/',
    'https://www.instagram.com/alhadhath/',
    'https://www.instagram.com/skynewsarabia/',
    'https://www.instagram.com/abudhabitv/',
    'https://www.instagram.com/emaratv/',
    'https://www.instagram.com/EmaratTVradio/',
    'https://www.instagram.com/sharjahtv/',
    'https://www.instagram.com/mbcgroup/',
    'https://www.instagram.com/alarabiya_eng/',
    'https://www.instagram.com/aletihadae/',
    'https://www.instagram.com/alkhaleej.ae/',
    'https://www.instagram.com/albayannews/',
    'https://www.instagram.com/emaratlyoum/',
    'https://www.instagram.com/sharjah24/',
    'https://www.instagram.com/20fourmedia/',
    'https://www.instagram.com/gulfnews/',
    'https://www.instagram.com/khaleeetimes/',
    'https://www.instagram.com/thenationalnews.com/',
    'https://www.instagram.com/gulftoday/',
    'https://www.instagram.com/arabianbusiness/',
    'https://www.instagram.com/emirates_247/',
    'https://www.instagram.com/timeoutdubai/',
    'https://www.instagram.com/whatsondubai/',
    'https://www.instagram.com/aletihaden/',
    'https://www.instagram.com/meed.media/',
    'https://www.instagram.com/medd.media/',
    'https://www.instagram.com/dubaeye1038fm/',
    'https://www.instagram.com/virginradiodxb/',
    'https://www.instagram.com/emaratfmradio/',
    'https://www.instagram.com/noorddubaairadio/',
    'https://www.instagram.com/noorddubairadio/',

    // Facebook
    'https://www.facebook.com/WAMNewsEN/',
    'https://www.facebook.com/AlArabiya/',
    'https://www.facebook.com/AlHadhath/',
    'https://www.facebook.com/SkyNewsArabia/',
    'https://www.facebook.com/abudhabiTV/',
    'https://www.facebook.com/EmaratTV/',
    'https://www.facebook.com/EmaratFM/',
    'https://www.facebook.com/DubaiTV/',
    'https://www.facebook.com/Sharjahtv/',
    'https://www.facebook.com/sharjahtv/',
    'https://www.facebook.com/MBCGroup/',
    'https://www.facebook.com/alarabiya.english/',
    'https://www.facebook.com/alittihadae/',
    'https://www.facebook.com/alkhaleej/',
    'https://www.facebook.com/AlBayanNews/',
    'https://www.facebook.com/EmaratAIYoum/',
    'https://www.facebook.com/EmaratAlYoum/',
    'https://www.facebook.com/sharjah24.ae/',
    'https://www.facebook.com/GulfNews.UAE/',
    'https://www.facebook.com/khaleeetimes/',
    'https://www.facebook.com/TheNationalNews/',
    'https://www.facebook.com/gulftoday/',
    'https://www.facebook.com/ArabianBusiness/',
    'https://www.facebook.com/Emirates247/',
    'https://www.facebook.com/TimeOutDubai/',
    'https://www.facebook.com/WhatsOnDubai/',
    'https://www.facebook.com/DubaiEye103.8/',
    'https://www.facebook.com/VirginRadioDXB/',
    'https://www.facebook.com/EmaratFM/',
  ];

  const urls = Array.from(new Set(IMAGE_URLS.map(normalizeUrl))).filter(Boolean);

  const sourceFilter = {
    bool: {
      should: [
        { match_phrase: { source: 'Facebook' } },
        { match_phrase: { source: 'Twitter' } },
        { match_phrase: { source: 'X' } },
        { match_phrase: { source: 'Instagram' } },
      ],
      minimum_should_match: 1,
    },
  };

  const urlFilters = buildUrlFilters(urls);
  if (urlFilters.length === 0) throw new Error('No valid URLs found to search for');

  const query = {
    query: {
      bool: {
        must: [
          sourceFilter,
          {
            bool: {
              should: urlFilters,
              minimum_should_match: 1,
            },
          },
        ],
      },
    },
  };

  const { total, results: posts } = await scrollSearch(query);
  console.log(`Found ${total} total results (fetched ${posts.length})`);

  let predictedSentimentCount = 0;
  let llmEmotionCount = 0;
  let llmEmotionArabicCount = 0;
  let llmSubtopicCount = 0;
  let validTimestampCount = 0;
  let uCountryCount = 0;

  const platformCounts = { Facebook: 0, Instagram: 0, Twitter: 0, Other: 0 };
  posts.forEach((post) => {
    if (post?.predicted_sentiment_value && String(post.predicted_sentiment_value).trim() !== '') predictedSentimentCount++;
    if (post?.llm_emotion && String(post.llm_emotion).trim() !== '') llmEmotionCount++;
    if (post?.llm_emotion_arabic && String(post.llm_emotion_arabic).trim() !== '') llmEmotionArabicCount++;
    if (post?.llm_subtopic && String(post.llm_subtopic).trim() !== '') llmSubtopicCount++;
    if (post?.u_country && String(post.u_country).trim() !== '') uCountryCount++;

    if (post?.p_created_time) {
      const timestamp = String(post.p_created_time);
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(\+|\-)\d{2}:\d{2}$/;
      if (isoRegex.test(timestamp)) validTimestampCount++;
    }

    const candidateUrl = normalizeUrl(post?.u_source || post?.p_url || '');
    const platform = platformForUrl(candidateUrl || String(post?.source || ''));
    platformCounts[platform] = (platformCounts[platform] || 0) + 1;
  });

  const outPath = path.join(outputDir, outputFileName);
  const json = {
    generatedAt: new Date().toISOString(),
    totalSize: posts.length,
    urlsUsed: urls,
    platformCounts,
    fieldCounts: {
      predictedSentimentValue: predictedSentimentCount,
      llmEmotion: llmEmotionCount,
      llmEmotionArabic: llmEmotionArabicCount,
      llmSubtopic: llmSubtopicCount,
      validIsoTimestamps: validTimestampCount,
      uCountry: uCountryCount,
    },
    posts,
  };

  await fsPromises.writeFile(outPath, JSON.stringify(json, null, 2));
  console.log(`Generated JSON: ${outPath}`);
  console.log(`File size: ${(await fsPromises.stat(outPath)).size} bytes`);
}

async function main() {
  const outputFileName = process.argv[2] || 'posts_by_image_urls.json';
  console.log(`Starting image-URL posts generation -> ${outputFileName}`);

  try {
    await generatePostsFromImageUrls({ outputFileName });
    console.log('Script completed successfully');
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

main();

