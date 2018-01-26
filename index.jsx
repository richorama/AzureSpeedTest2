var React = require('react');
var ReactDom = require('react-dom');

var speedtest = require('./lib/speed-test');
var history = require('./lib/history');

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
    renderRow:function(item){
        return <tr>
            <td>{item.name}</td>
            <td>{Math.round(item.average)}ms</td>
        </tr>
    },
    render:function(){
        return <table className="table">
            <tbody>
                <tr>
                    <th>Data Center</th>
                    <th>Average Latency</th>
                </tr>
                {this.props.history.map(this.renderRow)}
            </tbody>
        </table>
    }
})
