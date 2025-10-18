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
 */
export function getHumanDelay(): number {
  // Random delay between 2-5 seconds with normal distribution
  const min = 2000;
  const max = 5000;
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
  
  // Check minimum delay between requests (2-5 seconds with variance)
  const minDelay = getHumanDelay();
  const timeSinceLastRequest = now - tracker.lastRequest;
  
  if (timeSinceLastRequest < minDelay && tracker.lastRequest > 0) {
    const waitTime = minDelay - timeSinceLastRequest;
    logger.debug('Too soon since last request', { waitTime });
    return {
      allowed: false,
      reason: 'Minimum delay not met',
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
 */
export async function addReadingDelay(): Promise<void> {
  // Random delay between 1-3 seconds (reading time)
  const delay = 1000 + Math.random() * 2000;
  await new Promise(resolve => setTimeout(resolve, delay));
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
 */
export async function addRequestJitter(): Promise<void> {
  // Small random delay (100-500ms) to break timing patterns
  const jitter = 100 + Math.random() * 400;
  await new Promise(resolve => setTimeout(resolve, jitter));
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

