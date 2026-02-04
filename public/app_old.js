let allSymbols = [];
let chartInstances = {};

async function fetchSymbols() {
    try {
        const response = await fetch('/api/symbols');
        if (!response.ok) {
            console.error('Failed to fetch symbols');
            return [];
        }
        allSymbols = await response.json();
        return allSymbols;
    } catch (error) {
        console.error('Error fetching symbols:', error);
        return [];
    }
}

function formatNumber(num, decimals = 2) {
    const n = parseFloat(num);
    if (isNaN(n)) return '0.00';
    return n.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatLargeNumber(num) {
    const n = parseFloat(num);
    if (isNaN(n)) return '0';
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(2);
}

function calculateChange(symbol) {
    const priceChangePercent = parseFloat(symbol.price_change_percent || 0);
    return priceChangePercent;
}

function formatChange(change) {
    const sign = change > 0 ? '+' : '';
    let className = 'neutral';
    if (change > 0) {
        className = 'positive';
    } else if (change < 0) {
        className = 'negative';
    }
    return `<span class="${className}">${sign}${change.toFixed(2)}%</span>`;
}

function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const screen = document.getElementById(screenName);
    if (screen) {
        screen.classList.remove('hidden');
    }
    
    if (screenName === 'dashboard') {
        loadDashboard();
    } else if (screenName === 'symbols') {
        loadSymbols();
    }
}

async function loadDashboard() {
    const symbols = await fetchSymbols();
    if (!symbols || symbols.length === 0) {
        document.getElementById('summary').innerHTML = '<p class="error">⚠️ No data available. Please check the API connection.</p>';
        return;
    }

    const totalSymbols = symbols.length;
    const avgVolume = symbols.reduce((sum, s) => sum + parseFloat(s.quote_volume || 0), 0) / totalSymbols;
    const totalTrades = symbols.reduce((sum, s) => sum + parseInt(s.count || 0), 0);
    const positiveChanges = symbols.filter(s => calculateChange(s) > 0).length;
    const negativeChanges = symbols.filter(s => calculateChange(s) < 0).length;

    document.getElementById('summary').innerHTML = `
        <h3>📊 Market Summary</h3>
        <p><strong>Total Symbols:</strong> ${totalSymbols}</p>
        <p><strong>Average 24h Volume:</strong> $${formatLargeNumber(avgVolume)}</p>
        <p><strong>Total Trades (24h):</strong> ${totalTrades.toLocaleString()}</p>
        <p><strong>Gainers:</strong> <span class="positive">${positiveChanges}</span> | 
           <strong>Losers:</strong> <span class="negative">${negativeChanges}</span></p>
        <p><strong>Data Source:</strong> Binance API (Historical data)</p>
    `;
}

async function loadSymbols() {
    const symbols = await fetchSymbols();
    const tbody = document.querySelector('#symbolTable tbody');
    if (!tbody) {
        console.error('Symbol table body not found');
        return;
    }

    tbody.innerHTML = '';
    
    if (!symbols || symbols.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No symbols available</td></tr>';
        return;
    }

    symbols.forEach((symbol, index) => {
        const row = document.createElement('tr');
        const change = calculateChange(symbol);
        
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${symbol.symbol}</strong></td>
            <td>$${formatNumber(symbol.close)}</td>
            <td>${formatChange(change)}</td>
            <td>$${formatLargeNumber(symbol.quote_volume)}</td>
            <td>${parseInt(symbol.count || 0).toLocaleString()}</td>
            <td>
                <button onclick="analyzeSymbol('${symbol.symbol}')" class="analyze-btn">
                    📈 Analyze
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function analyzeSymbol(symbol) {
    showScreen('analysis');
    document.getElementById('analysisSymbol').textContent = symbol;
    
    const analysisContent = document.getElementById('analysisContent');
    analysisContent.innerHTML = '<p>Loading analysis...</p>';
    
    try {
        // Fetch complete analysis
        const response = await fetch(`/api/analysis/complete/${symbol}`);
        const data = await response.json();
        
        if (response.ok) {
            displayAnalysis(data);
        } else {
            throw new Error(data.error || 'Analysis failed');
        }
    } catch (error) {
        console.error('Error fetching analysis:', error);
        analysisContent.innerHTML = `<p class="error">❌ Error: ${error.message}</p>`;
    }
}

function displayAnalysis(data) {
    const analysisContent = document.getElementById('analysisContent');
    
    let html = '<div class="analysis-grid">';
    
    // Technical Analysis
    if (data.technical_analysis && !data.technical_analysis.error) {
        html += `
            <div class="analysis-section">
                <h3>📊 Technical Analysis</h3>
                <div class="indicators">
                    ${displayTechnicalAnalysis(data.technical_analysis)}
                </div>
            </div>
        `;
    }
    
    // LSTM Prediction
    if (data.lstm_prediction && !data.lstm_prediction.error) {
        html += `
            <div class="analysis-section">
                <h3>🤖 LSTM Prediction</h3>
                <div class="prediction-info">
                    <p><strong>Current Price:</strong> $${formatNumber(data.lstm_prediction.current_price)}</p>
                    <p><strong>Confidence:</strong> ${(data.lstm_prediction.confidence * 100).toFixed(1)}%</p>
                    <p><strong>Forecast (7 days):</strong></p>
                    <div class="forecast">
                        ${data.lstm_prediction.forecast.map((price, i) => 
                            `<div class="forecast-day">Day ${i+1}: $${formatNumber(price)}</div>`
                        ).join('')}
                    </div>
                </div>
            </div>
        `;
    }
    
    // Sentiment Analysis
    if (data.sentiment_analysis && !data.sentiment_analysis.error) {
        html += `
            <div class="analysis-section">
                <h3>💭 Sentiment Analysis</h3>
                <div class="sentiment-info">
                    <p><strong>Overall Score:</strong> ${data.sentiment_analysis.combined_score.toFixed(2)}</p>
                    <p><strong>Signal:</strong> <span class="sentiment-${data.sentiment_analysis.combined_signal.toLowerCase()}">${data.sentiment_analysis.combined_signal}</span></p>
                    <p><strong>News Count:</strong> ${data.sentiment_analysis.sentiment_analysis.news_count}</p>
                </div>
            </div>
        `;
    }
    
    // Final Recommendation
    html += `
        <div class="analysis-section">
            <h3>🎯 Final Recommendation</h3>
            <div class="recommendation">
                <p class="recommendation-${data.final_recommendation.toLowerCase()}">
                    <strong>${data.final_recommendation.toUpperCase()}</strong>
                </p>
            </div>
        </div>
    `;
    
    html += '</div>';
    analysisContent.innerHTML = html;
}

function displayTechnicalAnalysis(technical) {
    if (!technical) return '<p>No technical analysis available</p>';
    
    let html = '';
    
    // Display overall signal and summary
    if (technical.overall_signal) {
        html += `
            <div class="indicator">
                <strong>Overall Signal:</strong>
                <span class="signal-${technical.overall_signal.toLowerCase()}">${technical.overall_signal}</span>
            </div>
        `;
    }
    
    if (technical.summary) {
        html += `
            <div class="indicator">
                <strong>Signal Summary:</strong>
                <pre>Buy: ${technical.summary.buy_signals}, Sell: ${technical.summary.sell_signals}, Hold: ${technical.summary.hold_signals}</pre>
            </div>
        `;
    }
    
    // Display analysis for each timeframe
    ['1d', '1w', '1m'].forEach(timeframe => {
        if (technical[timeframe]) {
            const tf = technical[timeframe];
            html += `
                <div class="timeframe-section">
                    <h4>${timeframe.toUpperCase()} Analysis</h4>
                    <p><em>${tf.period_info}</em></p>
            `;
            
            // Display oscillators
            if (tf.oscillators) {
                html += '<div class="indicator-group"><strong>Oscillators:</strong><ul>';
                Object.entries(tf.oscillators).forEach(([key, value]) => {
                    html += `<li><strong>${key}:</strong> ${typeof value === 'number' ? value.toFixed(4) : value}</li>`;
                });
                html += '</ul></div>';
            }
            
            // Display moving averages
            if (tf.moving_averages) {
                html += '<div class="indicator-group"><strong>Moving Averages:</strong><ul>';
                Object.entries(tf.moving_averages).forEach(([key, value]) => {
                    html += `<li><strong>${key}:</strong> ${typeof value === 'number' ? value.toFixed(2) : value}</li>`;
                });
                html += '</ul></div>';
            }
            
            // Display signals
            if (tf.signals) {
                html += '<div class="indicator-group"><strong>Signals:</strong><ul>';
                Object.entries(tf.signals).forEach(([key, value]) => {
                    const signalClass = value.toLowerCase().includes('buy') ? 'buy' : value.toLowerCase().includes('sell') ? 'sell' : 'hold';
                    html += `<li><strong>${key}:</strong> <span class="signal-${signalClass}">${value}</span></li>`;
                });
                html += '</ul></div>';
            }
            
            html += '</div>';
        }
    });
    
    return html;
}

function displayIndicators(technical) {
    if (!technical.indicators) return '<p>No indicators available</p>';
    
    let html = '';
    for (const [key, indicator] of Object.entries(technical.indicators)) {
        if (key === 'timestamp') continue;
        
        html += `
            <div class="indicator">
                <strong>${key.toUpperCase()}:</strong>
                <pre>${JSON.stringify(indicator, null, 2)}</pre>
            </div>
        `;
    }
    return html;
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    showScreen('dashboard');
});
