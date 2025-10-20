const React = require('react')
const { createRoot } = require('react-dom/client')
const speedtest = require('./lib/speed-test')
const history = require('./lib/history')
const sl = require('react-sparklines')
const { Sparklines, SparklinesLine } = sl

// Constants
const ICON_LOCATION = "https://cdn.statically.io/gh/hampusborgos/country-flags/main/svg/"
const RENDER_THROTTLE_MS = 100

// Global state
let globalBlockList = []
let lastRenderTime = 0
let progressState = {
  phase: 'warmup',
  completed: 0,
  total: 0,
  percentage: 0,
  isVisible: true
}

// Record history
speedtest.on(history.record)

// Throttled rendering to prevent excessive DOM updates
speedtest.on(() => {
  // Don't render main table during warm-up phase
  if (progressState.isVisible) {
    return
  }
  
  const now = Date.now()
  if (now - lastRenderTime < RENDER_THROTTLE_MS) {
    return // Skip this render to avoid excessive updates
  }
  lastRenderTime = now
  
  const scrollPosition = window.scrollY
  render(<Table history={history.read()} blockList={globalBlockList} />)
  
  // Preserve scroll position after render
  if (Math.abs(window.scrollY - scrollPosition) > 5) {
    window.scrollTo(0, scrollPosition)
  }
})

// Update blocklist
speedtest.onBlocklistUpdate(blockList => {
  globalBlockList = blockList
})

// Track progress during warm-up phase
speedtest.onProgress(progress => {
  progressState = { ...progress, isVisible: progress.phase === 'warmup' }
  
  if (progress.phase === 'warmup') {
    // Show progress during warm-up
    const container = document.getElementById('content')
    if (container) {
      render(<ProgressIndicator progress={progressState} />)
    }
  } else if (progress.phase === 'testing') {
    // Switch to main table when warm-up is complete
    setTimeout(() => {
      progressState.isVisible = false
      render(<Table history={history.read()} blockList={globalBlockList} />)
    }, 500) // Small delay to show completion
  }
})/**
 * Render JSX to the content container
 * @param {React.Element} jsx - The JSX element to render
 */
function render(jsx) {
  try {
    const container = document.getElementById('content')
    if (!container) {
      console.error('Content container not found')
      return
    }
    
    if (!container._root) {
      container.innerHTML = ''
      container._root = createRoot(container)
    }
    
    container._root.render(jsx)
  } catch (error) {
    console.error('Render error:', error)
    // Fallback to simple text if React rendering fails
    const container = document.getElementById('content')
    if (container) {
      container.innerHTML = '<p>Error loading speed test. Please refresh the page.</p>'
    }
  }
}

/**
 * Progress indicator component for warm-up phase
 * @param {Object} props - Component props
 * @param {Object} props.progress - Progress state object
 * @returns {React.Element} Progress indicator
 */
const ProgressIndicator = ({ progress }) => {
  const { completed, total, percentage, phase } = progress
  
  return (
    <div className="text-center mt-5">
      <div className="mb-4">
        <div className="spinner-border text-primary mb-3" role="status">
          <span className="sr-only">Loading...</span>
        </div>
        <h4>Initializing Azure Speed Test</h4>
        <p className="text-muted">
          {phase === 'warmup' ? 
            'Warming up connections to all Azure regions...' : 
            'Starting latency measurements...'
          }
        </p>
      </div>
      
      <div className="progress mx-auto" style={{ maxWidth: '400px', height: '8px' }}>
        <div 
          className="progress-bar progress-bar-striped progress-bar-animated" 
          role="progressbar" 
          style={{ width: `${percentage}%` }}
          aria-valuenow={percentage}
          aria-valuemin="0" 
          aria-valuemax="100"
        ></div>
      </div>
      
      <div className="mt-2">
        <small className="text-muted">
          {completed} of {total} regions initialized ({percentage}%)
        </small>
      </div>
      
      {phase === 'warmup' && (
        <div className="mt-3">
          <small className="text-info">
            <i className="fas fa-info-circle"></i> First ping to each region includes DNS lookup and is discarded for accuracy
          </small>
        </div>
      )}
    </div>
  )
}

/**
 * Render flag icon for a location
 * @param {Object} item - Location item with icon property
 * @returns {React.Element|string} Flag image or empty string
 */
const renderFlag = (item) => {
  if (!item.icon) return ''
  return (
    <img 
      src={ICON_LOCATION + item.icon} 
      className="icon" 
      alt={`${item.name} flag`}
      loading="lazy"
    />
  )
}

/**
 * Render a data row for active locations
 * @param {Object} item - Location data with latency information
 * @returns {React.Element} Table row element
 */
const renderRow = (item) => {
  const percentage = Math.min(Math.round(item.percent || 0), 100)
  const rowStyle = {
    backgroundImage: `linear-gradient(to right, #e9ecef ${percentage}%, #ffffff ${percentage}%)`
  }

  return (
    <tr key={item.name} style={rowStyle}>
      <td>
        {renderFlag(item)}
        {item.name}
      </td>
      <td>
        {Math.round(item.average)}ms
      </td>
      <td style={{ padding: 0 }} className="no-mobile">
        {item.values && item.values.length > 0 && (
          <Sparklines
            data={item.values}
            width={200}
            height={48}
            limit={100}
            margin={2}
          >
            <SparklinesLine
              color="#B8BABC"
              style={{ strokeWidth: 2 }}
            />
          </Sparklines>
        )}
      </td>
    </tr>
  )
}

/**
 * Render error row for blocked locations
 * @param {Object} item - Blocked location data
 * @returns {React.Element} Error table row
 */
const renderError = (item) => {
  const handleRetry = (e) => {
    e.preventDefault()
    try {
      speedtest.retry(item.domain)
    } catch (error) {
      console.error('Retry failed:', error)
    }
  }

  return (
    <tr key={item.name}>
      <td>
        {renderFlag(item)}
        {item.name}
      </td>
      <td>
        <span className="badge badge-danger">NO RESPONSE</span>
      </td>
      <td className="no-mobile">
        <button 
          type="button"
          className="btn btn-sm btn-outline-primary"
          onClick={handleRetry}
          title={`Retry ${item.name}`}
        >
          Retry
        </button>
      </td>
    </tr>
  )
}

/**
 * Main table component displaying latency results
 * @param {Object} props - Component props
 * @param {Array} props.history - Array of location latency data
 * @param {Array} props.blockList - Array of blocked/failed locations
 * @returns {React.Element} Complete results table
 */
const Table = ({ history = [], blockList = [] }) => {
  // Sort history by average latency for better UX
  const sortedHistory = [...history].sort((a, b) => (a.average || Infinity) - (b.average || Infinity))
  
  return (
    <div>
      <div className="mb-3">
        <small className="text-muted">
          Testing {history.length + blockList.length} Azure regions • 
          {history.length} responding • 
          {blockList.length} blocked
        </small>
      </div>
      
      <table className="table results-table table-hover">
        <thead className="thead-light">
          <tr>
            <th scope="col">Data Center</th>
            <th scope="col">Average Latency</th>
            <th scope="col" className="no-mobile">History</th>
          </tr>
        </thead>
        <tbody>
          {sortedHistory.map(renderRow)}
          {blockList.map(renderError)}
        </tbody>
      </table>
      
      <footer className="mt-5">
        <div className="row">
          <div className="col-md-6">
            <h6>About</h6>
            <p>
              <a href="https://github.com/richorama/AzureSpeedTest2" target="_blank" rel="noopener noreferrer">
                Fork on GitHub
              </a>
            </p>
            <p>
              Created by <a href="https://www.twitter.com/richorama/" target="_blank" rel="noopener noreferrer">@richorama</a>
            </p>
          </div>
          
          <div className="col-md-6">
            <h6>Contributors</h6>
            <ul className="list-unstyled">
              <li><a href="https://github.com/TimNilimaa" target="_blank" rel="noopener noreferrer">Tim Nilimaa</a> - Regional contributions and code improvements</li>
              <li><a href="https://github.com/ncareau" target="_blank" rel="noopener noreferrer">NMC</a> - Canada storage accounts</li>
              <li><a href="https://github.com/jurajsucik" target="_blank" rel="noopener noreferrer">Juraj Sucik</a> - Switzerland and Germany accounts</li>
              <li><a href="https://github.com/wi5nia" target="_blank" rel="noopener noreferrer">Tomasz Wisniewski</a> - Poland Central account</li>
            </ul>
          </div>
        </div>
        
        <hr />
        
        <div className="row">
          <div className="col-12">
            <h6>Resources</h6>
            <p>
              Visit the <a href="https://azure.microsoft.com/en-us/regions/" target="_blank" rel="noopener noreferrer">Azure regions page</a> for
              a map of all data centers and the <a href="https://azure.microsoft.com/en-us/regions/services/" target="_blank" rel="noopener noreferrer">feature matrix</a>.
            </p>
            <p>
              Missing a data center? See <a href="https://github.com/richorama/AzureSpeedTest2/issues/12" target="_blank" rel="noopener noreferrer">this issue</a> for more information.
            </p>
            
            <div className="alert alert-info" role="alert">
              <small>
                <strong>Disclaimer:</strong> The latency times are indicative only and do not represent 
                the maximum performance achievable from Microsoft Azure. Use this website purely as a tool 
                to gauge which Azure Data Center could be the best for your location.
              </small>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
