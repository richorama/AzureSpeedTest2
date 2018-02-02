var React = require('react');
var ReactDom = require('react-dom');
var speedtest = require('./lib/speed-test');
var history = require('./lib/history');
var sl = require('react-sparklines');
var Sparklines = sl.Sparklines;
var SparklinesLine = sl.SparklinesCurve;

var latestValues = {};

// record history
speedtest.on(history.record);

speedtest.on(data => {
    render(<Table history={history.read()} />);
});

function render(jsx){
    ReactDom.render(jsx, document.getElementById("content"));
}

var Table = React.createClass({
    renderButton:function(){
        var item = this.props.history[0];

        if (!item) return "";
        if (item.cdn || false) item = this.props.history[1];
        if (!item) return "";

        return <a href={"https://twitter.com/intent/tweet?button_hashtag=AzureSpeedTest&text=My%20nearest%20%23Azure%20Data%20Center%20is%20" + item.name + "%20(" + Math.round(item.average) + "ms).%20Find%20out%20yours%20http%3A%2F%2Fazurespeedtest.azurewebsites.net%20#AzureSpeedTest"} className="btn btn-primary btn-large" data-size="large" data-related="two10degrees" data-dnt="true">Tweet your results</a>
    },
    renderFlag:function(item){
        if (!item.icon) return "";
        return <img src={item.icon} className="icon" />
    },
    renderRow:function(item){
        var rowStyle = {
            backgroundImage : "linear-gradient(to right, #e9ecef " + Math.round(item.percent) + "%, #ffffff " + Math.round(item.percent) + "%)",
        };

        return <tr key={item.name} style={rowStyle}>
                <td>{this.renderFlag(item)}{item.name}</td>
                <td>{Math.round(item.average)}ms</td>
                <td><Sparklines data={item.values || []} width={100} height={8} limit={100} ><SparklinesLine /></Sparklines></td>
            </tr>
      
    },
    render:function(){
        return <div>
            <table className="table results-table">
                <thead>
                    <tr>
                        <th>Data Center</th>
                        <th>Average Latency</th>
                        <th>History</th>
                    </tr>
                </thead>
                <tbody>
                    {this.props.history.map(this.renderRow)}
                </tbody>
            </table>
            <p>Share your results with other people on twitter {this.renderButton()}</p>
            <p>Compare your speed with others by watching the <a href="https://twitter.com/search?q=%23AzureSpeedTest&src=hash&mode=realtime">#AzureSpeedTest</a> hashtag.</p>
            <p><a href="https://github.com/richorama/AzureSpeedTest2">Fork</a> on GitHub.</p>
            <p>Created by <a href="https://www.twitter.com/richorama/">@richorama</a> at <a href="https://www.twitter.com/two10degrees/">@two10degrees</a>. Thanks to <a href="https://twitter.com/mickba">Mick Badran</a> for the storage accounts in Australia. Thanks to <a href="https://github.com/ncareau">NMC</a> for the storage accounts in Canada.</p>
            <p><small>The latency times are indicative only, and do not represent the maxium performance achievable from Microsoft Azure. Use this website purely as a tool to gauge which Azure Data Center could be the best for your location.</small></p>
        </div>
    }
})
