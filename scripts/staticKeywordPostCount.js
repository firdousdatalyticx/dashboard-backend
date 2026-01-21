require('dotenv').config();
const fsPromises = require('fs').promises;
const path = require('path');
const XLSX = require('xlsx');
const { elasticClient } = require('../config/elasticsearch');

/**
 * Static keywords transcribed from the provided sheet image.
 * Counts are computed independently per phrase (no filters: no date range, no sentiment, no sources).
 *
 * Note: Keep these arrays in the exact spelling you want to search for.
 */
const STATIC_KEYWORDS_BY_CATEGORY = {
  core_brand: [
    'e& enterprise',
    'Digital transformation',
    'Digital transformation company',
    'Enterprise technology provider',
    'ICT solutions provider',
    'Technology consulting UAE',
    'AI solutions provider UAE',
    'Cloud service provider UAE',
    'Cybersecurity company UAE',
    'Trusted technology partner',
    'Business transformation',
    'National digital champion',
    'Next-generation technology',
    'Sustainable digital growth',
    'Digital ecosystem builder',
    'Digital Transformation partner',
    'e& enterprise cloud',
    'e& enterprise IoT & AI',
    'Help AG',
    'Bespin Global',
    'Digital solutions'
  ],
  products_platforms: [
    'Cloud solutions',
    'Enterprise cloud services',
    'Sovereign cloud UAE',
    'National sovereign cloud',
    'Secure government cloud',
    'Cloud sovereignty',
    'Data analytics',
    'Data & AI platforms',
    'AI-driven digital transformation',
    'Enterprise AI solutions',
    'AI for government',
    'AI for enterprises',
    'Artificial Intelligence (AI)',
    'Cybersecurity',
    'Enterprise cybersecurity solutions',
    'National cybersecurity platforms',
    'Managed security services',
    'Cyber resilience',
    'Security operations center (SOC) services',
    'Internet of Things (IoT)',
    'IoT platforms',
    'Smart city solutions',
    'Smart infrastructure',
    'Industrial IoT',
    'Smart home',
    'Managed services',
    'Customer experience platforms',
    'Intelligent CX solutions',
    'Digital customer engagement',
    'Omnichannel CX',
    'Digital platforms',
    'Smart solutions',
    'Digital twin solutions',
    'connected workers',
    'smart home services',
    'Secure Home services',
    'Hassantuk For Homes',
    'Smart Surveillance',
    'Digital health',
    'Digital payments',
    'Smart retail services',
    'Fleet management',
    'Chief AI Officer program',
    'AI in a Box',
    'Fintech',
    'Private cloud',
    'Data Centers',
    'Managed security services',
    'Multi-cloud solutions',
    'Trusted digital transformation partner',
    'Engagex campaign manager',
    'Nexsus',
    'CPaaS',
    'CCaaS',
    'e-invoicing',
    'Agentic AI',
    'One Cloud',
    'AI Inference',
    'SLM in a box',
    'IDC Marketspace'
  ],
  leadership: [
    'Khalid Murshed',
    'Mouteih Chaghil',
    'Mariam Minhas',
    'Majd Cousse',
    'Dr Aleksander Valjaravic',
    'Amit Gupta',
    'Yasser Helmy',
    'Haitham Afifi',
    'Saahil Maalik',
    'Alp Bağriaçik',
    'Ahmed Alhammadi',
    'Ahmed Abdi Omer',
    'Enrique Estalayo',
    'Peter Tavener'
  ],
  descriptive_phrases: [
    'Empowering businesses',
    'Driving digital transformation',
    'Secure and scalable',
    'Customer-centric approach',
    'Technology-driven',
    'End-to-end solutions',
    'Trusted partner',
    'Smart government solutions',
    'Smart government UAE',
    'Government digital transformation',
    'Government technology solutions',
    'Public sector digitalization',
    'National digital platforms',
    'Future-ready',
    'Trusted to transform',
    'Customer Success',
    'Zero government bureaucracy',
    'Sovereign AI',
    'Sovereign Cloud',
    'Trusted to serve',
    'Global star rating',
    "UAE's net zero 2050 strategy"
  ],
  hashtags: [
    '#eAndenterprise',
    '#eAndTeam',
    '#DigitalTransformation',
    '#Innovation',
    '#SmartSolutions',
    '#BusinessGrowth',
    '#FutureReady',
    '#Cybersecurity',
    '#CloudComputing',
    '#SovereignCloud',
    '#TechForGood',
    '#GoForMore',
    '#AI',
    '#ArtificialIntelligence',
    '#IoT',
    '#SmartCity',
    '#EnterpriseSolutions',
    '#CustomerExperience',
    '#CX',
    '#DataAnalytics',
    '#ManagedServices',
    '#SovereignCloud',
    '#CloudSovereignty',
    '#Security',
    '#Resilience',
    '#DigitalCustomerEngagement',
    '#IntelligentCX',
    '#SmartGovernment',
    '#PublicSector',
    '#DigitalPlatforms',
    '#SmartInfrastructure',
    '#IndustrialIoT',
    '#SmartHome',
    '#Leadership',
    '#Digitalization',
    '#DigitalFuture',
    '#GovernmentSolutions',
    '#NationalPlatforms',
    '#Emiratisation',
    '#HelpAG',
    '#BespinGlobal',
    '#Beehive',
    '#GlassHouse',
    '#Fintech',
    '#OneTeam',
    '#PeopleMatter',
    '#TeamSpirit',
    '#CustomerObsessed',
    '#UniteAsOne',
    '#UAEInnovation',
    '#SaudiVision2030',
    '#Vision2030',
    '#TransformationAtScale',
    '#UAE2031Vision'
  ],
  campaigns: [
    'eBooks Promotion Plan (Full year 2025 Jan - Dec)',
    'Help AG Emiratization (Q4 2025 - Q1 2026) - 3 months',
    'AWS sovereign launchpad (Q4 2025 - Q1 2026) - 3 months',
    'Dubai AI Seal (Q1 2026) - 3 months',
    'Maturity Assessment Sustainability (Q1-Q2 2026) - 6 months',
    'e-invoicing (Q1-Q2 2026) - 6 months',
    'Trusted To Transform (Full year 2026 Jan - Dec)'
  ]
};

async function countForPhrase(phrase) {
  const q = String(phrase || '').trim();
  if (!q) return 0;

  const response = await elasticClient.search({
    index: process.env.ELASTICSEARCH_DEFAULTINDEX,
    body: {
      size: 0,
      query: {
        bool: {
          must: [
            {
              bool: {
                should: [
                  {
                    multi_match: {
                      query: q,
                      fields: [
                        'p_message_text',
                        'p_message',
                        'keywords',
                        'title',
                        'hashtags',
                        'u_source',
                        'p_url'
                      ],
                      type: 'phrase'
                    }
                  }
                ],
                minimum_should_match: 1
              }
            },
            {
              bool: {
                should: [
                  { match_phrase: { source: 'LinkedIn' } },
                  { match_phrase: { source: 'Linkedin' } }
                ],
                minimum_should_match: 1
              }
            }
          ]
        }
      }
    }
  });

  return response?.hits?.total?.value ?? 0;
}

async function main() {
  if (!process.env.ELASTICSEARCH_DEFAULTINDEX) {
    throw new Error('Missing ELASTICSEARCH_DEFAULTINDEX');
  }

  const outputDir = path.join(__dirname, '..', 'category_data');
  await fsPromises.mkdir(outputDir, { recursive: true });

  const result = {
    generatedAt: new Date().toISOString(),
    index: process.env.ELASTICSEARCH_DEFAULTINDEX,
    categories: {},
    totals: {
      totalPhrases: 0
    }
  };

  for (const [category, phrases] of Object.entries(STATIC_KEYWORDS_BY_CATEGORY)) {
    const uniquePhrases = [...new Set((phrases || []).map(p => String(p).trim()).filter(Boolean))];
    result.categories[category] = {
      totalPhrases: uniquePhrases.length,
      counts: {}
    };

    for (const phrase of uniquePhrases) {
      // one-by-one counts (sequential)
      const count = await countForPhrase(phrase);
      result.categories[category].counts[phrase] = count;
      result.totals.totalPhrases += 1;
      // minimal progress log
      // eslint-disable-next-line no-console
      console.log(`[${category}] "${phrase}" -> ${count}`);
    }
  }

  // Write JSON file
  const jsonFilePath = path.join(outputDir, 'static_keyword_post_counts.json');
  await fsPromises.writeFile(jsonFilePath, JSON.stringify(result, null, 2));
  // eslint-disable-next-line no-console
  console.log(`\nSaved JSON: ${jsonFilePath}`);

  // Generate and write Excel file
  const excelFilePath = path.join(outputDir, 'static_keyword_post_counts.xlsx');
  await generateExcel(result, excelFilePath);
  // eslint-disable-next-line no-console
  console.log(`Saved Excel: ${excelFilePath}`);
}

/**
 * Generate Excel file from the result object
 * @param {Object} result - The result object with categories and counts
 * @param {string} filePath - Path where the Excel file should be saved
 */
async function generateExcel(result, filePath) {
  const workbook = XLSX.utils.book_new();
  
  // Create main data sheet
  const mainData = [];
  
  // Header row
  mainData.push(['Category', 'Keyword/Phrase', 'Post Count']);
  
  // Add data rows
  for (const [category, categoryData] of Object.entries(result.categories)) {
    const categoryName = category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    for (const [phrase, count] of Object.entries(categoryData.counts)) {
      mainData.push([categoryName, phrase, count]);
    }
  }
  
  const mainSheet = XLSX.utils.aoa_to_sheet(mainData);
  
  // Set column widths
  mainSheet['!cols'] = [
    { wch: 25 }, // Category
    { wch: 50 }, // Keyword/Phrase
    { wch: 12 }  // Post Count
  ];
  
  XLSX.utils.book_append_sheet(workbook, mainSheet, 'Keyword Counts');
  
  // Create summary sheet
  const summaryData = [];
  
  // Header row
  summaryData.push(['Category', 'Total Phrases', 'Total Posts']);
  
  // Add summary rows
  for (const [category, categoryData] of Object.entries(result.categories)) {
    const categoryName = category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const totalPosts = Object.values(categoryData.counts).reduce((sum, count) => sum + count, 0);
    
    summaryData.push([categoryName, categoryData.totalPhrases, totalPosts]);
  }
  
  // Add grand total
  summaryData.push([]); // Empty row
  summaryData.push(['Grand Total', '', '']);
  const grandTotalPhrases = result.totals.totalPhrases;
  const grandTotalPosts = Object.values(result.categories).reduce((sum, cat) => {
    return sum + Object.values(cat.counts).reduce((s, c) => s + c, 0);
  }, 0);
  summaryData.push(['Total Phrases', grandTotalPhrases, '']);
  summaryData.push(['Total Posts', '', grandTotalPosts]);
  
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  
  // Set column widths
  summarySheet['!cols'] = [
    { wch: 25 }, // Category
    { wch: 15 }, // Total Phrases
    { wch: 15 }  // Total Posts
  ];
  
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
  
  // Write the file
  XLSX.writeFile(workbook, filePath);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Script failed:', err);
  process.exit(1);
});

