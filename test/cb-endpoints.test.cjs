#!/usr/bin/env node

/**
 * Azure Speed Test - cb.json Endpoint Test
 * 
 * This test verifies that all storage accounts have accessible cb.json files
 * that return the correct JSONP callback format: call('storage_account_name')
 * 
 * Usage:
 *   node test/cb-endpoints.test.cjs
 *   npm test (if configured in package.json)
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Import locations configuration
const getLocations = require('../lib/locations');

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
 * Constructs the cb.json URL for a location entry
 * Uses explicit URL if provided, otherwise constructs default blob storage URL
 */
function constructCbUrl(location) {
    if (location.url) {
        return location.url;
    }
    // Default construction: https://domain.blob.core.windows.net/cb.json
    return `https://${location.domain}.blob.core.windows.net/cb.json`;
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
 * Tests a single cb.json endpoint
 */
async function testEndpoint(location) {
    const url = constructCbUrl(location);
    const expectedContent = `call('${location.domain}')`;
    
    const result = {
        domain: location.domain,
        name: location.name,
        url: url,
        success: false,
        statusCode: null,
        responseBody: null,
        contentMatches: false,
        error: null,
        responseTime: null
    };

    const startTime = Date.now();

    try {
        const response = await makeRequest(url);
        result.responseTime = Date.now() - startTime;
        result.statusCode = response.statusCode;
        result.responseBody = response.body;

        if (response.statusCode === 200) {
            result.success = true;
            result.contentMatches = response.body === expectedContent;
            
            if (!result.contentMatches) {
                result.error = `Content mismatch. Expected: "${expectedContent}", Got: "${response.body}"`;
            }
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
    const successful = results.filter(r => r.success && r.contentMatches);
    const accessible = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const contentMismatches = results.filter(r => r.success && !r.contentMatches);
    
    log('\n=== TEST REPORT ===', 'cyan');
    log(`Total endpoints tested: ${results.length}`);
    log(`✓ Fully working (accessible + correct content): ${successful.length}`, 'green');
    log(`⚠ Accessible but wrong content: ${contentMismatches.length}`, 'yellow');
    log(`✗ Failed/inaccessible: ${failed.length}`, 'red');
    
    if (successful.length > 0) {
        log('\n--- WORKING ENDPOINTS ---', 'green');
        successful.forEach(result => {
            log(`✓ ${result.domain} (${result.name}) - ${result.responseTime}ms`, 'green');
            log(`  URL: ${result.url}`);
        });
    }
    
    if (contentMismatches.length > 0) {
        log('\n--- CONTENT MISMATCHES ---', 'yellow');
        contentMismatches.forEach(result => {
            log(`⚠ ${result.domain} (${result.name})`, 'yellow');
            log(`  URL: ${result.url}`);
            log(`  Error: ${result.error}`);
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
        successful: successful.length,
        accessible: accessible.length,
        failed: failed.length,
        contentMismatches: contentMismatches.length
    };
}

/**
 * Main test function
 */
async function main() {
    log('Azure Speed Test - cb.json Endpoint Verification', 'cyan');
    log('=================================================', 'cyan');
    
    // Get all locations
    const locations = getLocations();
    log(`Found ${locations.length} locations to test\n`, 'blue');
    
    // Show what we're testing
    log('Testing strategy:', 'blue');
    log('- Use explicit URL if location.url is defined');
    log('- Otherwise construct: https://{domain}.blob.core.windows.net/cb.json');
    log('- Expect response: call(\'{domain}\')');
    log(`- Timeout: ${TEST_TIMEOUT}ms per request\n`);
    
    // Run tests
    const startTime = Date.now();
    const results = await runTestsBatched(locations);
    const totalTime = Date.now() - startTime;
    
    // Generate report
    const summary = generateReport(results);
    
    log(`\nTotal test time: ${Math.round(totalTime/1000)}s`, 'cyan');
    
    // Return appropriate exit code
    const hasFailures = summary.failed > 0 || summary.contentMismatches > 0;
    
    if (hasFailures) {
        log('\n❌ Some endpoints failed or have incorrect content', 'red');
        if (process.env.CI) {
            log('This may be expected in CI if storage accounts are still deploying', 'yellow');
        }
        return 1;
    } else {
        log('\n✅ All endpoints are working correctly!', 'green');
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
    constructCbUrl,
    generateReport,
    main
};