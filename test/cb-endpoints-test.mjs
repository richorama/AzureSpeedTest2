#!/usr/bin/env node

/**
 * Azure Speed Test - Endpoint Latency Test
 * 
 * This test verifies that all storage accounts are accessible for latency testing.
 * Any HTTP response (including 404, 500, etc.) is considered successful since we're
 * only measuring response times, not content validity.
 * 
 * Usage:
 *   node test/cb-endpoints-test.mjs
 *   npm run test:endpoints
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read and parse locations.js as text since it's CommonJS
const locationsPath = join(__dirname, '../lib/locations.js');
const locationsContent = readFileSync(locationsPath, 'utf8');

// Use eval to execute the module.exports function in a safe context
// Extract just the function part
const funcMatch = locationsContent.match(/module\.exports = (\(\) => \[[\s\S]*?\]);/);
if (!funcMatch) {
    throw new Error('Could not parse locations.js');
}

// Evaluate the function and call it to get the array
const getLocationsFunc = eval(funcMatch[1]);
const getLocations = getLocationsFunc;

// Test configuration
const TEST_TIMEOUT = 10000; // 10 seconds
const MAX_CONCURRENT_TESTS = 5;

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Constructs the test URL for a location entry
 * Uses explicit URL if provided, otherwise constructs default blob storage URL
 */
function constructTestUrl(location) {
    if (location.url) {
        return location.url + '/speed-test';
    }
    // Default construction for latency testing
    return `https://${location.domain}.blob.core.windows.net/speed-test`;
}

/**
 * Tests a single endpoint for latency (any HTTP response is considered valid)
 */
async function testEndpoint(location) {
    const url = constructTestUrl(location);
    
    const result = {
        domain: location.domain,
        name: location.name,
        url: url,
        success: false,
        statusCode: null,
        error: null,
        responseTime: null
    };

    const startTime = Date.now();

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TEST_TIMEOUT);
        
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        result.responseTime = Date.now() - startTime;
        result.statusCode = response.status;
        result.success = true; // Any response (including 404, 500, etc.) is considered successful for latency testing
        
    } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
            result.responseTime = Date.now() - startTime;
            result.error = 'Request timeout';
        } else if (error.name === 'TypeError' && error.message.includes('CORS')) {
            // Try with no-cors mode if CORS fails
            try {
                const startTime2 = Date.now();
                const controller2 = new AbortController();
                const timeoutId2 = setTimeout(() => controller2.abort(), TEST_TIMEOUT);
                
                await fetch(url, {
                    method: 'GET',
                    mode: 'no-cors',
                    cache: 'no-cache',
                    signal: controller2.signal
                });
                
                clearTimeout(timeoutId2);
                result.responseTime = Date.now() - startTime2;
                result.statusCode = 'opaque';
                result.success = true;
                
            } catch (noCorsError) {
                result.responseTime = Date.now() - startTime;
                if (noCorsError.name === 'AbortError') {
                    result.error = 'Request timeout (no-cors)';
                } else {
                    result.error = `Network error: ${noCorsError.message}`;
                }
            }
        } else {
            result.responseTime = Date.now() - startTime;
            result.error = error.message;
        }
    }

    return result;
}

/**
 * Runs tests in batches to limit concurrent requests
 */
async function runTestsBatched(locations, batchSize = MAX_CONCURRENT_TESTS) {
    const results = [];
    
    for (let i = 0; i < locations.length; i += batchSize) {
        const batch = locations.slice(i, i + batchSize);
        log(`Testing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(locations.length/batchSize)} (${batch.length} endpoints)...`, 'blue');
        
        const batchPromises = batch.map(location => testEndpoint(location));
        const batchResults = await Promise.all(batchPromises);
        
        results.push(...batchResults);
        
        // Show immediate results for this batch
        batchResults.forEach(result => {
            const status = result.success ? '✓' : '✗';
            const statusColor = result.success ? 'green' : 'red';
            const responseInfo = result.responseTime ? `${result.responseTime}ms` : 'timeout';
            const statusCode = result.statusCode ? `HTTP ${result.statusCode}` : '';
            const errorInfo = result.error ? ` Error: ${result.error}` : '';
            
            log(`  ${status} ${result.domain} (${result.name}) ${responseInfo} ${statusCode}${errorInfo}`, statusColor);
        });
        
        // Small delay between batches to be respectful
        if (i + batchSize < locations.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    return results;
}

/**
 * Generates a summary report of test results
 */
function generateReport(results) {
    const total = results.length;
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const timeouts = results.filter(r => r.error && r.error.includes('timeout')).length;
    const corsErrors = results.filter(r => r.error && r.error.includes('CORS')).length;
    
    // Calculate statistics for successful tests
    const successfulTests = results.filter(r => r.success && r.responseTime);
    const responseTimes = successfulTests.map(r => r.responseTime);
    
    let avgTime = 0;
    let minTime = 0;
    let maxTime = 0;
    
    if (responseTimes.length > 0) {
        avgTime = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
        minTime = Math.min(...responseTimes);
        maxTime = Math.max(...responseTimes);
    }

    const summary = {
        total,
        successful,
        failed,
        timeouts,
        corsErrors,
        avgTime,
        minTime,
        maxTime
    };

    // Print detailed report
    log('\n' + '='.repeat(60), 'cyan');
    log('ENDPOINT LATENCY TEST SUMMARY', 'cyan');
    log('='.repeat(60), 'cyan');
    log(`Total endpoints tested: ${total}`, 'blue');
    log(`Successful tests: ${successful}`, successful === total ? 'green' : 'yellow');
    log(`Failed tests: ${failed}`, failed > 0 ? 'red' : 'green');
    
    if (timeouts > 0) {
        log(`Timeouts: ${timeouts}`, 'yellow');
    }
    
    if (corsErrors > 0) {
        log(`CORS errors: ${corsErrors}`, 'yellow');
    }
    
    if (responseTimes.length > 0) {
        log(`Average response time: ${avgTime}ms`, 'blue');
        log(`Fastest response: ${minTime}ms`, 'green');
        log(`Slowest response: ${maxTime}ms`, 'yellow');
    }
    
    // Show failed endpoints
    if (failed > 0) {
        log('\nFAILED ENDPOINTS:', 'red');
        results.filter(r => !r.success).forEach(result => {
            log(`  ✗ ${result.domain} (${result.name}) - ${result.error}`, 'red');
        });
    }
    
    return summary;
}

/**
 * Main test function
 */
async function main() {
    log('Starting Azure Speed Test endpoint latency tests...', 'cyan');
    log('Note: Any HTTP response (including 404s) is considered successful for latency testing\n', 'yellow');
    
    const locations = getLocations();
    log(`Found ${locations.length} locations to test\n`, 'blue');
    
    const results = await runTestsBatched(locations);
    const summary = generateReport(results);
    
    // Return appropriate exit code
    const hasFailures = summary.failed > 0;
    
    if (hasFailures) {
        log('\n❌ Some endpoints failed (timeouts or network errors)', 'red');
        if (process.env.CI) {
            log('This may be expected in CI if storage accounts are still deploying', 'yellow');
        }
        return 1;
    } else {
        log('\n✅ All endpoints responded successfully for latency testing!', 'green');
        return 0;
    }
}

// Run the test if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main()
        .then(exitCode => {
            process.exit(exitCode);
        })
        .catch(error => {
            log(`\nUnhandled error: ${error.message}`, 'red');
            console.error(error);
            process.exit(1);
        });
}

export {
    testEndpoint,
    constructTestUrl,
    generateReport,
    main
};