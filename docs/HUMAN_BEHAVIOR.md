# Human-Like Behavior in Amazon Scraper

This document describes the comprehensive human-like behavior patterns implemented in the Amazon scraper to avoid detection.

## Overview

The scraper now simulates realistic human interaction patterns including:
- Variable timing for all actions
- Random delays that follow normal distribution
- Natural scrolling and reading behavior
- Gradual image loading
- Mouse movement simulation
- Typing delays for searches

## Timing Categories

### 1. Page Load Delays (2-5 seconds)
- Used between full page requests
- Follows normal distribution for natural variance
- Applied when navigating to product pages or search results

### 2. Search Actions (1.5-4 seconds)
- Applied when submitting search queries
- Includes typing simulation
- Natural pause before hitting "enter"

### 3. Click Actions (300-800ms)
- Quick response time for clicking elements
- Applied before clicking search results
- Simulates user decision-making time

### 4. Scroll Delays (500-1500ms)
- Realistic scrolling pace between sections
- Random pauses during scrolling (30% chance)
- Simulates users reading content while scrolling

### 5. Image Loading (800-2500ms)
- Staggered image downloads (not simultaneous)
- First image loads faster (already visible)
- Later images have scroll penalty (need to scroll to view)

## Behavioral Patterns

### Search Flow
```
1. Typing simulation (200-300ms per character, max 3s)
2. Mouse movement to "Search" button (50-200ms)
3. Brief reading of search results (500-1500ms)
4. Scrolling through results (2 sections)
5. Mouse movement to first result (50-200ms)
6. Click delay before selecting (300-800ms)
```

### Product Page Interaction
```
1. Initial page scan (500-1500ms)
2. Scrolling to view content (4 sections, 400-1200ms each)
3. Reading product bullets (1-3 seconds)
4. Scrolling to product details (500-1500ms)
5. Image viewing with hover simulation
```

### Image Loading Behavior
```
- First image: 200-500ms (immediately visible)
- Images 2-3: 800-2500ms (standard lazy load)
- Images 4+: 800-3500ms (scroll penalty added)
- Each image has mouse hover simulation (50-200ms)
```

## Anti-Pattern Detection

### Request Jitter
- **Normal**: 100-800ms random delay
- **Occasional**: 1500-3500ms (15% chance, simulates distraction)
- Breaks timing pattern detection

### Variable Rate Limiting
- Inter-request delays vary between "page_load" and "search" timings
- Prevents consistent timing signatures
- Makes scraper behavior less predictable

### Scrolling Simulation
- Multiple scroll events per page (2-4 sections)
- Random pauses during scrolling (30% chance)
- Pause duration: 800-2300ms
- Simulates reading content

### Reading Delays
Three types based on content:
- **Brief** (500-1500ms): Quick scans, search results
- **Normal** (1-3s): Standard reading, product bullets
- **Detailed** (2-5s): Careful reading, product descriptions

## Implementation Details

### Core Functions

#### `getHumanDelay(actionType)`
Returns random delay using Box-Muller transform for normal distribution.
- Ensures realistic timing that varies naturally
- Different ranges for different action types

#### `addReadingDelay(contentType)`
Simulates time spent reading content.
- Varies based on content complexity
- Adds realism to page interactions

#### `simulateScrolling(sections)`
Generates multiple scroll events with pauses.
- 30% chance of longer pause (reading)
- Variable timing between scrolls

#### `simulateMouseMovement()`
Adds micro-delays for mouse positioning.
- 50-200ms range
- Applied before clicks and hovers

#### `addTypingDelay(textLength)`
Simulates human typing speed.
- Based on 40-60 WPM typing speed
- 200-300ms per character
- Capped at 3 seconds maximum

#### `addImageLoadDelay(imageIndex, totalImages)`
Staggers image downloads naturally.
- First image loads quickly
- Subsequent images have increasing delays
- Simulates lazy loading and scrolling

### Advanced Features

#### Request Jitter with Distraction
```typescript
if (Math.random() > 0.85) {
  // 15% chance: 1.5-3.5 second pause (distraction)
} else {
  // 85% chance: 100-800ms normal jitter
}
```

#### Scrolling with Reading Pauses
```typescript
for each scroll section:
  - Scroll delay: 400-1200ms
  - 30% chance: Additional pause (800-2300ms)
```

## Statistics & Monitoring

All timing behaviors are logged for monitoring:
- Action type and duration
- Image load patterns
- Scroll simulation counts
- Mouse movement timing

Check logs with `logger.debug` entries for detailed timing information.

## Best Practices

1. **Don't disable delays**: Each delay serves an anti-detection purpose
2. **Monitor error rates**: High error rates trigger automatic pausing
3. **Respect rate limits**: Hourly limits prevent bulk detection
4. **Session consistency**: User-Agent and headers stay consistent per session
5. **Natural variance**: No two requests have identical timing

## Configuration

Most timing parameters are hardcoded for optimal human-like behavior, but can be adjusted in `scraper-utils.ts`:

- `USER_AGENTS`: Pool of realistic browser user agents
- `getHumanDelay()`: Timing ranges for each action type
- `addRequestJitter()`: Jitter ranges and distraction probability
- `simulateScrolling()`: Scroll count and pause probability

## Performance Impact

The human-like behavior adds significant time per request:

**Estimated Time per Product:**
- Initial delays: 2-5 seconds
- Search (if needed): +4-8 seconds
- Product page: +3-7 seconds
- Images (6 avg): +8-15 seconds
- **Total: 17-35 seconds per product**

This is intentional and necessary for avoiding detection. Faster scraping would trigger rate limiting.

## Compliance Note

⚠️ **IMPORTANT**: These anti-detection measures do not make web scraping Amazon legal or compliant with their Terms of Service. They only reduce the likelihood of technical detection. 

For legitimate use, consider:
- Amazon Product Advertising API
- Amazon Seller API
- Official data partnerships

