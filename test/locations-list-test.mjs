#!/usr/bin/env node

import assert from 'node:assert/strict';
import getLocations from '../lib/locations.js';

const locations = getLocations();

assert.ok(Array.isArray(locations), 'locations should be an array');
assert.ok(!locations.some(location => location.name.includes('Canada')), 'Canada regions should not be present');
assert.ok(!locations.some(location => location.geography === 'Canada'), 'Canada geography should not be present');
assert.ok(!locations.some(location => location.domain === 'speedtestcac18632'), 'Canada Central domain should not be present');
assert.ok(!locations.some(location => location.domain === 'speedtestcae18632'), 'Canada East domain should not be present');

console.log('locations-list-test passed');
