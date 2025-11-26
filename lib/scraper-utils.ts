/**
 * Scraper Utilities for Human-Like Behavior
 * 
 * DISCLAIMER: These utilities help avoid detection, but web scraping
 * Amazon is still against their Terms of Service. Use at your own risk.
 */

import Logger from './logger';

const logger = new Logger('SCRAPER_UTILS');

// User Agent rotation pool - Expanded and realistic
const USER_AGENTS = [
  // Chrome on Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  
  // Chrome on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  
  // Safari on Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  
  // Firefox on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
  
  // Edge on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
];

// Request tracking
interface RequestTracker {
  count: number;
  hourlyCount: number;
  dailyCount: number;
  lastRequest: number;
  hourStart: number;
  dayStart: number;
  errorCount: number;
  totalRequests: number;
  currentUserAgent: string;
  sessionStart: number;
}

const tracker: RequestTracker = {
  count: 0,
  hourlyCount: 0,
  dailyCount: 0,
  lastRequest: 0,
  hourStart: Date.now(),
  dayStart: Date.now(),
  errorCount: 0,
  totalRequests: 0,
  currentUserAgent: USER_AGENTS[0],
  sessionStart: Date.now(),
};

/**
 * Get random delay with normal distribution (human-like timing)
 * Can be customized for different action types
 */
export function getHumanDelay(actionType: 'page_load' | 'search' | 'click' | 'scroll' | 'image' = 'page_load'): number {
  let min: number, max: number;
  
  switch (actionType) {
    case 'page_load':
      // Longer delay between page loads (2-5 seconds)
      min = 2000;
      max = 5000;
      break;
    case 'search':
      // Moderate delay for search actions (1.5-4 seconds)
      min = 1500;
      max = 4000;
      break;
    case 'click':
      // Quick delay for clicks (300-800ms)
      min = 300;
      max = 800;
      break;
    case 'scroll':
      // Natural scrolling pace (500-1500ms)
      min = 500;
      max = 1500;
      break;
    case 'image':
      // Variable delay between image loads (800-2500ms)
      min = 800;
      max = 2500;
      break;
  }
  
  const mean = (min + max) / 2;
  const stdDev = (max - min) / 6;
  
  // Box-Muller transform for normal distribution
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  
  let delay = mean + stdDev * z0;
  delay = Math.max(min, Math.min(max, delay));
  
  return Math.round(delay);
}

/**
 * Get exponential backoff delay
 */
export function getBackoffDelay(attemptNumber: number): number {
  const baseDelay = 1000;
  const maxDelay = 60000; // 1 minute max
  const delay = Math.min(baseDelay * Math.pow(2, attemptNumber), maxDelay);
  
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  
  return Math.round(delay + jitter);
}

/**
 * Check if we should allow this request based on rate limits
 */
export function checkRateLimit(): {
  allowed: boolean;
  reason?: string;
  waitTime?: number;
} {
  const now = Date.now();
  
  // Reset hourly counter
  if (now - tracker.hourStart > 3600000) {
    logger.info('Hourly counter reset', { previousCount: tracker.hourlyCount });
    tracker.hourlyCount = 0;
    tracker.hourStart = now;
  }
  
  // Reset daily counter
  if (now - tracker.dayStart > 86400000) {
    logger.info('Daily counter reset', { previousCount: tracker.dailyCount });
    tracker.dailyCount = 0;
    tracker.dayStart = now;
    tracker.errorCount = 0; // Reset error count daily
  }
  
  // Check hourly limit (10-20 products per hour)
  const hourlyLimit = 15; // Middle of range
  if (tracker.hourlyCount >= hourlyLimit) {
    const waitTime = 3600000 - (now - tracker.hourStart);
    logger.warn('Hourly rate limit reached', { count: tracker.hourlyCount, limit: hourlyLimit });
    return {
      allowed: false,
      reason: 'Hourly rate limit exceeded',
      waitTime: Math.ceil(waitTime / 1000),
    };
  }
  
  // Check error rate (pause if > 10%)
  if (tracker.totalRequests > 0) {
    const errorRate = tracker.errorCount / tracker.totalRequests;
    if (errorRate > 0.1) {
      logger.error('High error rate detected', { errorRate, errorCount: tracker.errorCount });
      return {
        allowed: false,
        reason: 'High error rate - pausing to avoid detection',
        waitTime: 300, // Wait 5 minutes
      };
    }
  }
  
  // Check minimum delay between requests (variable human-like timing)
  // Use different action types to vary the delays
  const actionTypes: Array<'page_load' | 'search'> = ['page_load', 'search'];
  const randomActionType = actionTypes[Math.floor(Math.random() * actionTypes.length)];
  const minDelay = getHumanDelay(randomActionType);
  const timeSinceLastRequest = now - tracker.lastRequest;
  
  if (timeSinceLastRequest < minDelay && tracker.lastRequest > 0) {
    const waitTime = minDelay - timeSinceLastRequest;
    logger.debug('Too soon since last request', { waitTime, actionType: randomActionType });
    return {
      allowed: false,
      reason: 'Minimum delay not met - varying pace like human',
      waitTime: Math.ceil(waitTime / 1000),
    };
  }
  
  return { allowed: true };
}

/**
 * Record a successful request
 */
export function recordRequest(): void {
  tracker.count++;
  tracker.hourlyCount++;
  tracker.dailyCount++;
  tracker.totalRequests++;
  tracker.lastRequest = Date.now();
  
  logger.debug('Request recorded', {
    hourly: tracker.hourlyCount,
    daily: tracker.dailyCount,
    total: tracker.totalRequests,
  });
}

/**
 * Record a failed request
 */
export function recordError(statusCode?: number): void {
  tracker.errorCount++;
  tracker.totalRequests++;
  
  logger.warn('Error recorded', {
    statusCode,
    errorCount: tracker.errorCount,
    errorRate: (tracker.errorCount / tracker.totalRequests).toFixed(2),
  });
  
  // Special handling for rate limit responses
  if (statusCode === 429 || statusCode === 503) {
    logger.error('Rate limit or service unavailable detected', { statusCode });
  }
}

/**
 * Get a random User-Agent (rotate periodically)
 */
export function getUserAgent(): string {
  const now = Date.now();
  const sessionDuration = 1800000; // 30 minutes
  
  // Rotate User-Agent every 30 minutes
  if (now - tracker.sessionStart > sessionDuration) {
    tracker.currentUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    tracker.sessionStart = now;
    logger.info('User-Agent rotated', { userAgent: tracker.currentUserAgent.substring(0, 50) });
  }
  
  return tracker.currentUserAgent;
}

/**
 * Get randomized viewport size (prevents fingerprinting)
 */
function getRandomViewport(): { width: number; height: number } {
  const commonSizes = [
    { width: 1920, height: 1080 }, // Full HD
    { width: 1366, height: 768 },  // HD
    { width: 1536, height: 864 },  // HD+
    { width: 1440, height: 900 },  // Mac
    { width: 2560, height: 1440 }, // 2K
  ];
  
  return commonSizes[Math.floor(Math.random() * commonSizes.length)];
}

/**
 * Get randomized Accept-Language (privacy protection)
 */
function getRandomLanguage(): string {
  const languages = [
    'en-US,en;q=0.9',
    'en-US,en;q=0.9,es;q=0.8',
    'en-GB,en;q=0.9',
    'en-US,en;q=0.9,fr;q=0.8',
  ];
  
  return languages[Math.floor(Math.random() * languages.length)];
}

/**
 * Get randomized DNT header
 */
function getRandomDNT(): string {
  // 50% chance of including DNT header
  return Math.random() > 0.5 ? '1' : '0';
}

/**
 * Get headers that match the User-Agent with randomization
 */
export function getConsistentHeaders(): Record<string, string> {
  const userAgent = getUserAgent();
  
  // Extract browser info from User-Agent
  const isChrome = userAgent.includes('Chrome') && !userAgent.includes('Edg');
  const isEdge = userAgent.includes('Edg');
  const isFirefox = userAgent.includes('Firefox');
  const isSafari = userAgent.includes('Safari') && !userAgent.includes('Chrome');
  const isWindows = userAgent.includes('Windows');
  const isMac = userAgent.includes('Macintosh');
  
  const viewport = getRandomViewport();
  const language = getRandomLanguage();
  const dnt = getRandomDNT();
  
  const baseHeaders: Record<string, string> = {
    'User-Agent': userAgent,
    'Accept-Language': language,
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
    'DNT': dnt,
  };
  
  // Add Sec-Fetch headers (Chromium-based browsers)
  if (isChrome || isEdge) {
    baseHeaders['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8';
    baseHeaders['Sec-Fetch-Dest'] = 'document';
    baseHeaders['Sec-Fetch-Mode'] = 'navigate';
    baseHeaders['Sec-Fetch-Site'] = 'none';
    baseHeaders['Sec-Fetch-User'] = '?1';
    
    // Chrome-specific client hints
    const chromeVersion = userAgent.match(/Chrome\/(\d+)/)?.[1] || '120';
    baseHeaders['sec-ch-ua'] = `"Not_A Brand";v="8", "Chromium";v="${chromeVersion}", "Google Chrome";v="${chromeVersion}"`;
    baseHeaders['sec-ch-ua-mobile'] = '?0';
    baseHeaders['sec-ch-ua-platform'] = isWindows ? '"Windows"' : isMac ? '"macOS"' : '"Linux"';
    
    // Randomize viewport hint
    if (Math.random() > 0.5) {
      baseHeaders['sec-ch-viewport-width'] = viewport.width.toString();
    }
  } else if (isFirefox) {
    baseHeaders['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
    baseHeaders['TE'] = 'trailers'; // Firefox-specific
  } else if (isSafari) {
    baseHeaders['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
  }
  
  return baseHeaders;
}

/**
 * Add a "reading" delay (simulate user reading content)
 * Varies based on content type
 */
export async function addReadingDelay(contentType: 'brief' | 'normal' | 'detailed' = 'normal'): Promise<void> {
  let min: number, max: number;
  
  switch (contentType) {
    case 'brief':
      // Quick scan (500ms-1.5s)
      min = 500;
      max = 1500;
      break;
    case 'normal':
      // Normal reading (1-3 seconds)
      min = 1000;
      max = 3000;
      break;
    case 'detailed':
      // Careful reading (2-5 seconds)
      min = 2000;
      max = 5000;
      break;
  }
  
  const delay = min + Math.random() * (max - min);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Simulate scrolling behavior - humans don't load everything at once
 */
export async function simulateScrolling(sections: number = 3): Promise<void> {
  logger.debug('Simulating scroll behavior', { sections });
  
  for (let i = 0; i < sections; i++) {
    // Random scroll delay (400-1200ms between scrolls)
    const scrollDelay = 400 + Math.random() * 800;
    await new Promise(resolve => setTimeout(resolve, scrollDelay));
    
    // Occasionally pause longer (like reading something)
    if (Math.random() > 0.7) {
      const pauseDelay = 800 + Math.random() * 1500;
      await new Promise(resolve => setTimeout(resolve, pauseDelay));
    }
  }
}

/**
 * Simulate mouse movement patterns - random micro-pauses
 */
export async function simulateMouseMovement(): Promise<void> {
  // Tiny delay to simulate moving mouse to element (50-200ms)
  const delay = 50 + Math.random() * 150;
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Add human-like typing delay (for search queries)
 */
export async function addTypingDelay(textLength: number): Promise<void> {
  // Humans type at ~40-60 WPM (characters per minute)
  // That's roughly 200-300ms per character
  const baseDelay = 200 + Math.random() * 100; // 200-300ms per char
  const totalDelay = baseDelay * textLength;
  
  // Cap at reasonable maximum
  const finalDelay = Math.min(totalDelay, 3000);
  
  logger.debug('Simulating typing', { textLength, delay: finalDelay });
  await new Promise(resolve => setTimeout(resolve, finalDelay));
}

/**
 * Get current stats
 */
export function getStats() {
  const errorRate = tracker.totalRequests > 0 
    ? (tracker.errorCount / tracker.totalRequests * 100).toFixed(1)
    : '0.0';
    
  return {
    hourlyCount: tracker.hourlyCount,
    dailyCount: tracker.dailyCount,
    totalRequests: tracker.totalRequests,
    errorCount: tracker.errorCount,
    errorRate: `${errorRate}%`,
    currentUserAgent: tracker.currentUserAgent.substring(0, 50) + '...',
  };
}

/**
 * Reset all counters (for testing)
 */
export function resetTracking(): void {
  tracker.count = 0;
  tracker.hourlyCount = 0;
  tracker.dailyCount = 0;
  tracker.errorCount = 0;
  tracker.totalRequests = 0;
  logger.info('Tracking counters reset');
}

/**
 * Generate random order ID (prevents fingerprinting via consistent patterns)
 */
export function generateRandomOrderId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${random}`;
}

/**
 * Add request jitter (prevents timing pattern detection)
 * Now with more variability
 */
export async function addRequestJitter(): Promise<void> {
  // Variable random delay (100-800ms) with occasional longer pauses
  let jitter: number;
  
  if (Math.random() > 0.85) {
    // 15% chance of longer pause (like user got distracted)
    jitter = 1500 + Math.random() * 2000; // 1.5-3.5 seconds
  } else {
    // Normal jitter
    jitter = 100 + Math.random() * 700; // 100-800ms
  }
  
  await new Promise(resolve => setTimeout(resolve, jitter));
}

/**
 * Add delay between image loads (humans don't download all images simultaneously)
 */
export async function addImageLoadDelay(imageIndex: number, totalImages: number): Promise<void> {
  // First image loads quickly (already visible)
  if (imageIndex === 0) {
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
    return;
  }
  
  // Subsequent images take longer (scrolling, lazy loading)
  const baseDelay = getHumanDelay('image');
  
  // Later images sometimes take even longer (need to scroll more)
  const scrollPenalty = imageIndex > 3 ? Math.random() * 1000 : 0;
  
  const totalDelay = baseDelay + scrollPenalty;
  
  logger.debug('Image load delay', { imageIndex, totalImages, delay: totalDelay });
  await new Promise(resolve => setTimeout(resolve, totalDelay));
}

/**
 * Rotate through different query parameters to avoid cache
 */
export function addCacheBuster(url: string): string {
  const urlObj = new URL(url);
  
  // Randomly add cache busting parameters that look natural
  const busters = [
    { key: 'ref', value: `sr_pg_${Math.floor(Math.random() * 10)}` },
    { key: 'pf_rd_r', value: Math.random().toString(36).substring(2, 15).toUpperCase() },
    { key: 'pf_rd_p', value: Math.random().toString(36).substring(2, 15) },
    { key: 'qid', value: Date.now().toString() },
  ];
  
  // Add 1-2 random parameters
  const numParams = Math.random() > 0.5 ? 1 : 2;
  const selectedBusters = busters.sort(() => Math.random() - 0.5).slice(0, numParams);
  
  selectedBusters.forEach(buster => {
    urlObj.searchParams.set(buster.key, buster.value);
  });
  
  return urlObj.toString();
}

