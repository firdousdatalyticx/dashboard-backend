# Field Counts API

This API provides endpoints to fetch counts and posts for the 4 main analysis fields: sector, trust_dimensions, themes_sentiments, and touchpoints.

## Endpoints

### 1. Get Field Counts
**POST** `/social-media/field-counts`

Fetches counts for all 4 fields in a single request.

#### Request Body
```json
{
  "source": "All",
  "category": "all",
  "topicId": null,
  "greaterThanTime": "2024-01-01",
  "lessThanTime": "2024-12-31",
  "sentiment": "All"
}
```

#### Response
```json
{
  "success": true,
  "fieldCounts": {
    "sector": {
      "total": 1500,
      "items": [
        { "name": "Education", "count": 500 },
        { "name": "Healthcare", "count": 300 },
        { "name": "Technology", "count": 200 }
      ]
    },
    "trust_dimensions": {
      "total": 1200,
      "items": [
        { "name": "government", "count": 400 },
        { "name": "media", "count": 300 },
        { "name": "business", "count": 200 }
      ]
    },
    "themes_sentiments": {
      "total": 1800,
      "items": [
        { "name": "climate change", "count": 600 },
        { "name": "economic growth", "count": 400 },
        { "name": "social justice", "count": 300 }
      ]
    },
    "touchpoints": {
      "total": 900,
      "items": [
        { "name": "customer service", "count": 300 },
        { "name": "online platform", "count": 250 },
        { "name": "mobile app", "count": 200 }
      ]
    }
  },
  "dateRange": {
    "from": "2024-01-01",
    "to": "2024-12-31"
  }
}
```

### 2. Get Field Posts
**POST** `/social-media/field-counts/posts`

Fetches posts for a specific field and value.

#### Request Body
```json
{
  "source": "All",
  "category": "all",
  "topicId": null,
  "greaterThanTime": "2024-01-01",
  "lessThanTime": "2024-12-31",
  "sentiment": "All",
  "fieldName": "touchpoints",
  "fieldValue": "customer service",
  "page": 1,
  "limit": 50
}
```

#### Response
```json
{
  "success": true,
  "posts": [
    {
      "profilePicture": "https://example.com/profile.jpg",
      "userFullname": "John Doe",
      "message_text": "Great customer service experience!",
      "source": "Twitter",
      "predicted_sentiment": "Positive",
      "created_at": "2024-01-15 10:30:00"
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 50,
  "fieldName": "touchpoints",
  "fieldValue": "customer service"
}
```

## Field Names

The `fieldName` parameter accepts one of these values:
- `sector` - Business sectors
- `trust_dimensions` - Trust dimension categories
- `themes_sentiments` - Theme sentiment analysis
- `touchpoints` - Customer touchpoints

## Features

- **Category Filtering**: Uses the same category middleware as other social media endpoints
- **Source Filtering**: Supports filtering by social media source
- **Date Range**: Defaults to last 90 days if not specified
- **Sentiment Filtering**: Optional sentiment filtering
- **Pagination**: For posts endpoint with configurable page size
- **Special Topic Support**: Handles special topic ID 2600 with Facebook/Twitter only filtering
- **DM Source Exclusion**: Automatically excludes DM source from results

## Usage Examples

### Get counts for all fields
```bash
curl -X POST http://localhost:3131/social-media/field-counts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "source": "Facebook",
    "category": "all",
    "sentiment": "Positive"
  }'
```

### Get posts for specific sector
```bash
curl -X POST http://localhost:3131/social-media/field-counts/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "fieldName": "sector",
    "fieldValue": "Education",
    "page": 1,
    "limit": 20
  }'
```

### Get posts for specific trust dimension
```bash
curl -X POST http://localhost:3131/social-media/field-counts/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "fieldName": "trust_dimensions",
    "fieldValue": "government",
    "page": 1,
    "limit": 30
  }'
```

## Notes

- The API automatically handles array fields like `themes_sentiments` and `trust_dimensions` using script queries
- Empty sector values are automatically merged into "Education" category
- Results are sorted by count in descending order
- The API respects the same authentication and category transformation middleware as other social media endpoints 