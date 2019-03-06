const getLocations = require('./locations')
const blockList = new Set()
let queue = []
const callbacks = []
const callRecords = {}
let counter = 0

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

  if (item.cdn) {
    var url = 'http://az207485.vo.msecnd.net/cb.json'
  } else {
    var url = 'https://' + item.domain + '.blob.core.windows.net/cb.json'
  }

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
      delete callRecords[item.domain]
      setTimeout(process, 1)
    }
  }, 5000) // call back in 5 seconds
}

global.call = data => {
  var end = new Date().getTime()
  var callRecord = callRecords[data]
  if (!callRecord) {
    console.log(`no record of call from ${data}`)
    return setTimeout(process, 1)
  }
  delete callRecords[data]

  var duration = end - callRecord.start
  callbacks.forEach(x =>
    x({ source: data, duration: duration, start: callRecord.start })
  )
  setTimeout(process, 1)
}

// automatically start it off
var concurrency = 4
for (var i = 0; i < concurrency; i++) process()

module.exports.on = cb => {
  callbacks.push(cb)
}
