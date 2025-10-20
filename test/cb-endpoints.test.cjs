#!/usr/bin/env node

/**
 * Azure Speed Test - Endpoint Accessibility Test
 * 
 * This test verifies that all storage account endpoints are accessible
 * and return valid HTTP responses (200, 404, etc are all acceptable)
 * 
 * Usage:
 *   node test/cb-endpoints.test.cjs
 *   npm test (if configured in package.json)
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Import locations configuration using createRequire for mixed module types
const { createRequire } = require('module');
const require_ = createRequire(__filename);

// Use dynamic import for ES modules
let getLocations;
async function loadLocations() {
    try {
        const locationsModule = await import('../lib/locations.js');
        getLocations = locationsModule.default;
    } catch (err) {
        console.error('Error loading locations:', err);
        process.exit(1);
    }
}

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
 * Constructs the endpoint URL for a location entry
 * Tests the base URL for accessibility
 */
function constructEndpointUrl(location) {
    return location.url;
}

/**
 * Makes an HTTP request and returns a promise
 */
function makeRequest(url) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            timeout: TEST_TIMEOUT,
            headers: {
                'User-Agent': 'AzureSpeedTest-CB-Test/1.0'
            }
        };

        const req = client.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data.trim()
                });
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.end();
    });
}

/**
 * Tests a single endpoint for basic accessibility
 */
async function testEndpoint(location) {
    const url = constructEndpointUrl(location);
    
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
        const response = await makeRequest(url);
        result.responseTime = Date.now() - startTime;
        result.statusCode = response.statusCode;

        // Consider 200, 404, 403 as successful (endpoint is accessible)
        if (response.statusCode >= 200 && response.statusCode < 500) {
            result.success = true;
        } else {
            result.error = `HTTP ${response.statusCode}`;
        }
    } catch (error) {
        result.responseTime = Date.now() - startTime;
        result.error = error.message;
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
        
        // Small delay between batches
        if (i + batchSize < locations.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    return results;
}

/**
 * Generates a detailed test report
 */
function generateReport(results) {
    const accessible = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    log('\n=== TEST REPORT ===', 'cyan');
    log(`Total endpoints tested: ${results.length}`);
    log(`✓ Accessible endpoints: ${accessible.length}`, 'green');
    log(`✗ Failed/inaccessible: ${failed.length}`, 'red');
    
    if (accessible.length > 0) {
        log('\n--- ACCESSIBLE ENDPOINTS ---', 'green');
        accessible.forEach(result => {
            log(`✓ ${result.domain} (${result.name}) - HTTP ${result.statusCode} - ${result.responseTime}ms`, 'green');
            log(`  URL: ${result.url}`);
        });
    }
    
    if (failed.length > 0) {
        log('\n--- FAILED ENDPOINTS ---', 'red');
        failed.forEach(result => {
            log(`✗ ${result.domain} (${result.name})`, 'red');
            log(`  URL: ${result.url}`);
            log(`  Error: ${result.error || 'Unknown error'}`);
        });
    }

    // Performance summary
    const responseTimes = results.filter(r => r.responseTime !== null).map(r => r.responseTime);
    if (responseTimes.length > 0) {
        const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        const maxResponseTime = Math.max(...responseTimes);
        log(`\n--- PERFORMANCE ---`, 'cyan');
        log(`Average response time: ${Math.round(avgResponseTime)}ms`);
        log(`Maximum response time: ${maxResponseTime}ms`);
    }
    
    return {
        total: results.length,
        accessible: accessible.length,
        failed: failed.length
    };
}

/**
 * Main test function
 */
async function main() {
    log('Azure Speed Test - Endpoint Accessibility Verification', 'cyan');
    log('=====================================================', 'cyan');
    
    // Load locations module
    await loadLocations();
    
    // Get all locations
    const locations = getLocations();
    log(`Found ${locations.length} locations to test\n`, 'blue');
    
    // Show what we're testing
    log('Testing strategy:', 'blue');
    log('- Test endpoint URLs for basic accessibility');
    log('- HTTP 200, 404, 403 responses are considered successful');
    log('- Network errors or 5xx responses are failures');
    log(`- Timeout: ${TEST_TIMEOUT}ms per request\n`);
    
    // Run tests
    const startTime = Date.now();
    const results = await runTestsBatched(locations);
    const totalTime = Date.now() - startTime;
    
    // Generate report
    const summary = generateReport(results);
    
    log(`\nTotal test time: ${Math.round(totalTime/1000)}s`, 'cyan');
    
    // Return appropriate exit code
    const hasFailures = summary.failed > 0;
    
    if (hasFailures) {
        log('\n❌ Some endpoints are not accessible', 'red');
        if (process.env.CI) {
            log('This may be expected in CI if storage accounts are still deploying', 'yellow');
        }
        return 1;
    } else {
        log('\n✅ All endpoints are accessible!', 'green');
        return 0;
    }
}

// Run the test if this script is executed directly
if (require.main === module) {
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

module.exports = {
    testEndpoint,
    constructEndpointUrl,
    generateReport,
    main
};