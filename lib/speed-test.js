
var getLocations = require('./locations');

var queue = [];
var callbacks = []
var item;
var start;

function process(){
    if (queue.length == 0){
        queue = getLocations();
    }
    item = queue.pop();
    
    if (item.cdn){
        var url = "http://az207485.vo.msecnd.net/cb.json"
    } else {
        var url = "https://" + item.domain + ".blob.core.windows.net/cb.json"
    }

    start = new Date().getTime();

    $.ajax({
        url: url,
        dataType: "jsonp",
        cache: false
    });
}

global.call = data => {
    var end = new Date().getTime();
    var duration = end - start;
    callbacks.forEach(x => x({ source: data, duration: duration, start: start }));
    setTimeout(process, 1);
}

// automatically start it off
process();

module.exports.on = cb => {
    callbacks.push(cb);
}