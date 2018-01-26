var locations = require('./locations')();
var history = {};

var numberOfRecordsToKeep = 100;

module.exports.record = data => {
    if (!history[data.source]){
        var location = locations.filter(x => x.domain == data.source)[0];
        if (!location) return;
        history[data.source] = { values: [], domain : data.source, name : location.name};
    }

    var value = history[data.source];

    value.values.push(data.duration)

    while (value.values.length  > numberOfRecordsToKeep){
        value.values.shift();
    }

    value.average = value.values.reduce((a, b) => a + b) / value.values.length;

    return value;
}

module.exports.read = () => Object.keys(history).map(x => history[x]).sort((a,b) => a.average - b.average );