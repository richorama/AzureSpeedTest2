import getLocations from './locations.js';

// Configuration constants
const CONFIG = {
  TIMEOUT_MS: 5000,
  CONCURRENCY: 4,
  RETRY_DELAY_MS: 1,
  WARM_UP_REQUESTS: 1 // Number of requests to discard per domain for accuracy
}

// State management
const state = {
  blockList: new Set(),
  queue: [],
  callbacks: [],
  callRecords: {},
  errorCallbacks: [],
  progressCallbacks: [],
  counter: 0,
  firstResultDiscarded: new Set(),
  warmupProgress: {
    total: 0,
    completed: 0,
    isWarmupPhase: true
  }
}

// Extract destructured state for cleaner code
const { blockList, queue, callbacks, callRecords, errorCallbacks, firstResultDiscarded, progressCallbacks } = state

// Generate a test URL for a location
function getTestUrl(item) {
  if (item.url) {
    return item.url + '/cb.json'
  }
  throw new Error('No URL defined for location: ' + item.domain)
}

/**
 * Test latency to a specific URL
 * @param {string} url - The URL to test
 * @param {string} domain - The domain name for logging
 * @returns {Promise<{success: boolean, duration: number, status?: number, error?: string}>}
 */
async function testLatency(url) {
  const start = performance.now()
  let timeoutId
  
  try {
    const controller = new AbortController()
    timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS)
    
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors', // Use CORS since we have it configured
      cache: 'no-cache',
      signal: controller.signal,
      // Add timeout headers for better debugging
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })
    
    clearTimeout(timeoutId)
    const end = performance.now()
    const duration = Math.round(end - start)
    
    // Any HTTP response is considered successful for latency testing
    return { 
      success: true, 
      duration, 
      status: response.status,
      statusText: response.statusText
    }
    
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId)
    
    const end = performance.now()
    const duration = Math.round(end - start)
    
    if (error.name === 'AbortError') {
      return { success: false, duration, error: 'timeout' }
    }
    
    // Log network errors for debugging but don't fail the test
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return { success: false, duration, error: 'network_error' }
    }
    
    return { success: false, duration, error: error.message }
  }
}

/**
 * Process the next latency test in the queue
 */
function process() {
  state.counter += 1
  
  // Refill queue if empty
  if (queue.length === 0) {
    queue.push(...getLocations().filter(x => !blockList.has(x.domain)))
  }
  
  if (queue.length === 0) {
    // All domains are blocked, wait and retry
    return setTimeout(process, 1000)
  }
  
  const item = queue.pop()
  
  // Skip if request already in flight
  if (callRecords[item.domain]) {
    return setTimeout(process, CONFIG.RETRY_DELAY_MS)
  }

  const url = getTestUrl(item)
  
  callRecords[item.domain] = {
    start: Date.now(),
    counter: state.counter
  }

  // Test latency with proper error handling
  testLatency(url)
    .then(result => handleTestResult(item, result))
    .catch(error => handleTestError(item, error))
}

/**
 * Handle successful test result
 */
function handleTestResult(item, result) {
  const callRecord = callRecords[item.domain]
  if (!callRecord) {
    return setTimeout(process, CONFIG.RETRY_DELAY_MS)
  }
  
  delete callRecords[item.domain]

  if (result.success) {
    // Discard the first result per domain for more accurate measurements
    if (!firstResultDiscarded.has(item.domain)) {
      firstResultDiscarded.add(item.domain)
      
      // Update warm-up progress
      if (state.warmupProgress.isWarmupPhase) {
        state.warmupProgress.completed++
        const percentage = Math.round((state.warmupProgress.completed / state.warmupProgress.total) * 100)
        
        progressCallbacks.forEach(callback => {
          try {
            callback({
              phase: 'warmup',
              completed: state.warmupProgress.completed,
              total: state.warmupProgress.total,
              percentage: percentage
            })
          } catch (err) {
            console.error('Progress callback error:', err)
          }
        })
        
        // Check if warm-up is complete
        if (state.warmupProgress.completed >= state.warmupProgress.total) {
          state.warmupProgress.isWarmupPhase = false
          progressCallbacks.forEach(callback => {
            try {
              callback({
                phase: 'testing',
                completed: state.warmupProgress.total,
                total: state.warmupProgress.total,
                percentage: 100
              })
            } catch (err) {
              console.error('Progress callback error:', err)
            }
          })
        }
      }
      
      return setTimeout(process, CONFIG.RETRY_DELAY_MS)
    }

    // Notify all callbacks with the result
    callbacks.forEach(callback => {
      try {
        callback({ 
          source: item.domain, 
          duration: result.duration, 
          start: callRecord.start,
          status: result.status || 'unknown'
        })
      } catch (err) {
        console.error(`Callback error for ${item.domain}:`, err)
      }
    })
  } else {
    handleFailedResult(item, result, callRecord)
  }
  
  setTimeout(process, CONFIG.RETRY_DELAY_MS)
}

/**
 * Handle failed test result
 */
function handleFailedResult(item, result, callRecord) {
  if (result.error === 'timeout') {
    console.log(`Timeout from ${item.domain}. Removing from test queue`)
    blockList.add(item.domain)
    
    const blockedRecords = getLocations().filter(x => blockList.has(x.domain))
    errorCallbacks.forEach(callback => {
      try {
        callback(blockedRecords)
      } catch (err) {
        console.error(`Error callback failed:`, err)
      }
    })
  } else {
    // Network errors still provide latency info, discard first result
    if (!firstResultDiscarded.has(item.domain)) {
      firstResultDiscarded.add(item.domain)
      
      // Update warm-up progress for failed requests too
      if (state.warmupProgress.isWarmupPhase) {
        state.warmupProgress.completed++
        const percentage = Math.round((state.warmupProgress.completed / state.warmupProgress.total) * 100)
        
        progressCallbacks.forEach(callback => {
          try {
            callback({
              phase: 'warmup',
              completed: state.warmupProgress.completed,
              total: state.warmupProgress.total,
              percentage: percentage
            })
          } catch (err) {
            console.error('Progress callback error:', err)
          }
        })
        
        // Check if warm-up is complete
        if (state.warmupProgress.completed >= state.warmupProgress.total) {
          state.warmupProgress.isWarmupPhase = false
          progressCallbacks.forEach(callback => {
            try {
              callback({
                phase: 'testing',
                completed: state.warmupProgress.total,
                total: state.warmupProgress.total,
                percentage: 100
              })
            } catch (err) {
              console.error('Progress callback error:', err)
            }
          })
        }
      }
      
      return setTimeout(process, CONFIG.RETRY_DELAY_MS)
    }

    callbacks.forEach(callback => {
      try {
        callback({ 
          source: item.domain, 
          duration: result.duration, 
          start: callRecord.start,
          status: 'error'
        })
      } catch (err) {
        console.error(`Callback error for ${item.domain}:`, err)
      }
    })
  }
}

/**
 * Handle unexpected test errors
 */
function handleTestError(item, error) {
  console.error(`Unexpected error testing ${item.domain}:`, error)
  delete callRecords[item.domain]
  setTimeout(process, CONFIG.RETRY_DELAY_MS)
}

// Initialize warm-up progress tracking
function initializeProgress() {
  const locations = getLocations()
  state.warmupProgress.total = locations.length
  state.warmupProgress.completed = 0
  state.warmupProgress.isWarmupPhase = true
  
  // Notify progress callbacks
  progressCallbacks.forEach(callback => {
    try {
      callback({
        phase: 'warmup',
        completed: 0,
        total: locations.length,
        percentage: 0
      })
    } catch (err) {
      console.error('Progress callback error:', err)
    }
  })
}

// Initialize progress and start workers
initializeProgress()
for (let i = 0; i < CONFIG.CONCURRENCY; i++) {
  setTimeout(process, i * 100) // Stagger startup to avoid thundering herd
}

/**
 * Register a callback for successful latency measurements
 * @param {Function} callback - Called with {source, duration, start, status}
 */
export const on = (callback) => {
  if (typeof callback !== 'function') {
    throw new Error('Callback must be a function')
  }
  callbacks.push(callback)
}

/**
 * Register a callback for blocklist updates
 * @param {Function} callback - Called with array of blocked domains
 */
export const onBlocklistUpdate = (callback) => {
  if (typeof callback !== 'function') {
    throw new Error('Callback must be a function')
  }
  errorCallbacks.push(callback)
}

/**
 * Register a callback for progress updates during warm-up phase
 * @param {Function} callback - Called with {phase, completed, total, percentage}
 */
export const onProgress = (callback) => {
  if (typeof callback !== 'function') {
    throw new Error('Callback must be a function')
  }
  progressCallbacks.push(callback)
}

/**
 * Retry a previously blocked domain
 * @param {string} domain - Domain to retry
 */
export const retry = (domain) => {
  if (typeof domain !== 'string') {
    throw new Error('Domain must be a string')
  }
  
  blockList.delete(domain)
  firstResultDiscarded.delete(domain) // Reset the warmup for this domain
  
  const blockedRecords = getLocations().filter(x => blockList.has(x.domain))
  errorCallbacks.forEach(callback => {
    try {
      callback(blockedRecords)
    } catch (err) {
      console.error('Error callback failed:', err)
    }
  })
}

/**
 * Get current statistics
 */
export const getStats = () => ({
  totalDomains: getLocations().length,
  blockedDomains: blockList.size,
  activeDomains: getLocations().length - blockList.size,
  queueLength: queue.length,
  activeRequests: Object.keys(callRecords).length
})
