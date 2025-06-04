const getLocations = require('./locations')
const blockList = new Set()
let queue = []
const callbacks = []
const callRecords = {}
const errorCallbacks = []
let counter = 0
const firstResultDiscarded = new Set()

function process() {
  counter += 1
  if (queue.length == 0) {
    queue = getLocations().filter(x => !blockList.has(x.domain))
  }
  const item = queue.pop()

  if (callRecords[item.domain]) {
    // there's a request already in flight, so ignore
    return setTimeout(process, 1)
  }

  const url = item.url || 'https://' + item.domain + '.blob.core.windows.net/cb.json'

  callRecords[item.domain] = {
    start: new Date().getTime(),
    counter
  }

  $.ajax({
    url: url,
    dataType: 'jsonp',
    cache: false
  })

  const counterValueAtTimeOfCall = counter

  setTimeout(() => {
    if (
      callRecords[item.domain] &&
      callRecords[item.domain].counter === counterValueAtTimeOfCall
    ) {
      // no response in 5 seconds
      console.log(`No response from ${item.domain}. Removing from the test`)
      blockList.add(item.domain)
      const blockedRecords = getLocations().filter(x => blockList.has(x.domain))
      errorCallbacks.forEach(x => x(blockedRecords))
      delete callRecords[item.domain]
      setTimeout(process, 1)
    }
  }, 5000) // call back in 5 seconds
}

global.call = data => {
  const end = new Date().getTime()
  const callRecord = callRecords[data]
  if (!callRecord) {
    console.log(`no record of call from ${data}`)
    return setTimeout(process, 1)
  }
  delete callRecords[data]

  // Discard the first result per domain
  if (!firstResultDiscarded.has(data)) {
    firstResultDiscarded.add(data)
    // Immediately schedule another test for this domain
    return setTimeout(process, 1)
  }

  const duration = end - callRecord.start
  callbacks.forEach(x => x({ source: data, duration, start: callRecord.start }))
  setTimeout(process, 1)
}

// automatically start it off
const concurrency = 4
for (let i = 0; i < concurrency; i++) process()

module.exports.on = cb => {
  callbacks.push(cb)
}

module.exports.onBlocklistUpdate = cb => {
  errorCallbacks.push(cb)
}

module.exports.retry = domain => {
  blockList.delete(domain)
  const blockedRecords = getLocations().filter(x => blockList.has(x.domain))
  errorCallbacks.forEach(x => x(blockedRecords))
}
