# Dashboard Functionality

## Overview
The dashboard functionality is built on top of the existing `customer_topics` model, where each topic represents a dashboard. This simplified approach adds minimal additional tables while providing all the required functionality.

## Database Schema

### Extended `customer_topics` Model
Added dashboard configuration fields to the existing model:
- `dashboard_enabled` - Enable/disable dashboard for this topic
- `dashboard_date_range` - Date range setting (e.g., 'last_30_days', 'last_90_days', 'custom')
- `dashboard_start_date` / `dashboard_end_date` - Custom date range for data collection
- `dashboard_archive_enabled` - Enable access to historical/archive data
- `dashboard_layout` - Layout preference ('tabs' or 'grid')
- `dashboard_theme` - UI theme ('light' or 'dark')
- `dashboard_auto_refresh` - Auto-refresh setting

### Additional Tables

#### `available_graphs`
Stores graph definitions with metadata:
- Graph name, display name, description
- Sample image URL for preview
- Category (overview, sentiment, engagement, google, industry_specific)
- Supported data sources (handled on frontend)
- API endpoint for data fetching

#### `topic_enabled_graphs`
Junction table tracking which graphs are enabled for each topic:
- Links topics to enabled graphs
- Stores position order and custom titles

## Data Sources
Data sources (Facebook, Twitter, Instagram, YouTube, LinkedIn, TikTok, Reddit, Pinterest, Google Reviews, Google Maps, TripAdvisor, News & Web) are handled entirely on the frontend. No backend storage or API endpoints are needed for data source management.

## API Endpoints

### Get Available Graphs
```
GET /api/dashboard/graphs/:topicId?
```
Returns available graphs grouped by category, with enabled status if topicId provided.

### Get Dashboard Configuration
```
GET /api/dashboard/config/:topicId
```
Returns complete dashboard configuration for a topic including enabled graphs.

### Update Dashboard Configuration
```
PUT /api/dashboard/config/:topicId
```
Updates dashboard settings like date range, layout, theme, etc.

### Update Enabled Graphs
```
PUT /api/dashboard/graphs/:topicId
```
Enable/disable graphs for a topic.

## Dashboard Creation Flow

1. **Create Topic** - Use existing topic creation process
2. **Select Data Sources** - Customer selects from frontend dropdown (no backend call needed)
3. **Choose Date Range** - Customer selects date range (including archive data option)
4. **Select Graphs** - Customer enables/disables graphs from categorized list
5. **Configure Layout** - Customer chooses layout and theme preferences

## Graph Categories

### Overview
- Total Mentions
- Mentions Over Time  
- Source Distribution

### Sentiment Analysis
- Sentiment Overview
- Sentiment Trend
- Emotion Analysis

### Engagement
- Engagement Metrics
- Top Influencers

### Google Analytics
- Google Ratings Distribution
- Reviews by Location

### Industry Specific
- UNDP Keyword Analysis
- Earthquake monitoring (for specialized clients)

### Trends & Patterns
- Word Cloud
- Themes Over Time

## Data Flow

1. **Dashboard Configuration** - Stored in `customer_topics` table
2. **Graph Selection** - Stored in `topic_enabled_graphs` junction table
3. **Data Fetching** - Graph data comes from Elasticsearch using existing API endpoints
4. **Frontend Display** - Graphs organized in tabs or grid layout based on user preference

## Sample Images

Each graph has a `sample_image_url` field that should contain preview images showing what the graph looks like. These images help customers understand what each graph provides before enabling it.

## Setup Instructions

1. Run Prisma migration to add new fields and tables
2. Run the seed script to populate available graphs:
   ```bash
   node scripts/seedDashboardData.js
   ```
3. Add sample graph images to `/public/sample-graphs/` directory
4. Update routes to include dashboard routes in main router

## Usage Example

```javascript
// Get available graphs for topic
const response = await fetch('/api/dashboard/graphs/123');
const { data } = await response.json();

// Enable specific graphs
await fetch('/api/dashboard/graphs/123', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    enabledGraphs: [1, 2, 3, 5, 8] // Graph IDs to enable
  })
});
```

This simplified approach provides all the required functionality while maintaining the existing architecture and keeping complexity minimal. 