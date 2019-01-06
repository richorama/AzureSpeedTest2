var locations = require('./locations')()
var history = {}

var numberOfRecordsToKeep = 100

module.exports.record = data => {
  if (!history[data.source]) {
    var location = locations.filter(x => x.domain == data.source)[0]
    if (!location) return
    history[data.source] = {
      values: [],
      domain: data.source,
      name: location.name,
      icon: location.icon,
      cdn: !!location.cdn
    }
  }

  var value = history[data.source]

  value.values.push(data.duration)

  while (value.values.length > numberOfRecordsToKeep) {
    value.values.shift()
  }

  value.average = value.values.reduce((a, b) => a + b) / value.values.length
  var max = Object.keys(history)
    .map(x => history[x].average)
    .reduce((a, b) => Math.max(a, b))
  value.percent = 0
  if (max > 0) {
    Object.keys(history).forEach(
      x => (history[x].percent = (100 * history[x].average) / max)
    )
  }

  return value
}

module.exports.read = () =>
  Object.keys(history)
    .map(x => history[x])
    .sort((a, b) => a.average - b.average)
