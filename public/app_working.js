// Chart instances for cleanup
let chartInstances = {};

// ============ CORE FUNCTIONS ============

/**
 * Navigation - Switch between screens
 */
function showScreen(screenName) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    
    // Show selected screen
    document.getElementById(screenName).classList.remove('hidden');
    
    // Load data based on screen
    if (screenName === 'dashboard') {
        loadDashboard();
    } else if (screenName === 'symbols') {
        fetchSymbols();
    }
    
    // Cleanup charts when switching screens
    cleanupCharts();
}

/**
 * Load Dashboard with previous version style
 */
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

/**
 * Calculate price change (for dashboard)
 */
function calculateChange(symbol) {
    if (!symbol.open || !symbol.close) return 0;
    return ((symbol.close - symbol.open) / symbol.open) * 100;
}

/**
 * Fetch all symbols from API
 */
async function fetchSymbols() {
    try {
        const response = await fetch('/api/symbols');
        const symbols = await response.json();
        
        if (symbols && symbols.length > 0) {
            displaySymbols(symbols);
        } else {
            document.getElementById('symbolTable').querySelector('tbody').innerHTML = 
                '<tr><td colspan="7">No symbols available</td></tr>';
        }
    } catch (error) {
        console.error('Error fetching symbols:', error);
        document.getElementById('symbolTable').querySelector('tbody').innerHTML = 
            '<tr><td colspan="7" style="color: #e74c3c;">Error loading symbols</td></tr>';
    }
}

/**
 * Display symbols in table
 */
function displaySymbols(symbols) {
    const tbody = document.getElementById('symbolTable').querySelector('tbody');
    tbody.innerHTML = '';
    
    symbols.forEach((symbol, index) => {
        const row = document.createElement('tr');
        
        const changeClass = parseFloat(symbol.price_change_percent) > 0 ? 'positive' : 
                           parseFloat(symbol.price_change_percent) < 0 ? 'negative' : 'neutral';
        
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${symbol.symbol}</strong></td>
            <td>${formatNumber(symbol.close, 6)}</td>
            <td class="${changeClass}">${formatChange(symbol.price_change_percent)}</td>
            <td>${formatLargeNumber(symbol.quote_volume)}</td>
            <td>${formatLargeNumber(symbol.count)}</td>
            <td>
                <button onclick="showAnalysis('${symbol.symbol}')" class="analyze-btn">
                    Analyze
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

/**
 * Show comprehensive analysis for a symbol
 */
async function showAnalysis(symbol) {
    // Update symbol in header
    document.getElementById('analysisSymbol').textContent = symbol;
    
    // Switch to analysis screen
    showScreen('analysis');
    
    try {
        const response = await fetch(`/api/analysis/complete/${symbol}`);
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        displayCompleteAnalysis(data);
        
        // Render charts with slight delay for DOM to update
        setTimeout(() => {
            renderCharts(data);
        }, 100);
        
    } catch (error) {
        console.error('Error loading analysis:', error);
        document.getElementById('analysisContent').innerHTML = 
            `<div class="error-message">Error loading analysis: ${error.message}</div>`;
    }
}

/**
 * Display complete analysis with exact layout from breakdown
 */
function displayCompleteAnalysis(data) {
    const analysisContent = document.getElementById('analysisContent');
    
    let html = '<div class="analysis-grid">';
    
    // Price Chart Section
    html += `
        <div class="analysis-section">
            <h3>📈 Price Chart (Last 90 Days)</h3>
            <div class="chart-container">
                <canvas id="priceChart"></canvas>
            </div>
        </div>
    `;
    
    // Technical Analysis Section
    html += `
        <div class="analysis-section">
            <h3>📊 Technical Analysis</h3>
            <p><strong>Overall Signal:</strong> <span class="signal-${data.technical_analysis?.overall_signal?.toLowerCase() || 'hold'}">${data.technical_analysis?.overall_signal || 'HOLD'}</span></p>
            
            <div class="chart-row">
                <div class="chart-container-half">
                    <h4>Signals Distribution</h4>
                    <div class="chart-container">
                        <canvas id="signalsChart"></canvas>
                    </div>
                </div>
                <div class="chart-container-half">
                    <h4>Technical Indicators (Last 30 Days)</h4>
                    <div class="chart-container">
                        <canvas id="technicalChart"></canvas>
                    </div>
                </div>
            </div>
            
            ${formatIndicators(data.technical_analysis)}
        </div>
    `;
    
    // LSTM Prediction Section
    html += `
        <div class="analysis-section">
            <h3>🤖 LSTM Price Prediction</h3>
            <p><strong>Model Performance:</strong></p>
            <ul>
                <li>RMSE: ${data.lstm_prediction?.model_performance?.RMSE || 'N/A'}</li>
                <li>MAPE: ${data.lstm_prediction?.model_performance?.MAPE || 'N/A'}%</li>
                <li>R²: ${data.lstm_prediction?.model_performance?.R2 || 'N/A'}</li>
            </ul>
            
            <h4>7-Day Price Forecast</h4>
            <div class="chart-container">
                <canvas id="lstmChart"></canvas>
            </div>
            
            ${formatPredictionTable(data.lstm_prediction)}
        </div>
    `;
    
    // Sentiment Analysis Section
    html += `
        <div class="analysis-section">
            <h3>💬 Sentiment & On-Chain Analysis</h3>
            <p><strong>Combined Signal:</strong> <span class="signal-${data.sentiment_analysis?.combined_signal?.toLowerCase() || 'hold'}">${data.sentiment_analysis?.combined_signal || 'HOLD'}</span></p>
            
            <div class="chart-container-gauge">
                <h4>Sentiment Score</h4>
                <div class="gauge-container">
                    <div class="gauge-value" style="color: ${getSentimentColor(data.sentiment_analysis?.combined_score || 0.5)}">${data.sentiment_analysis?.combined_score || 0.5}</div>
                    <div class="gauge-label" style="color: ${getSentimentColor(data.sentiment_analysis?.combined_score || 0.5)}">${data.sentiment_analysis?.sentiment_analysis?.sentiment_class || 'NEUTRAL'}</div>
                </div>
            </div>
            
            <h4>News Sentiment</h4>
            <p>Sentiment: ${data.sentiment_analysis?.sentiment_analysis?.sentiment_class || 'NEUTRAL'}</p>
            <p>Score: ${data.sentiment_analysis?.sentiment_analysis?.average_sentiment || 'N/A'}</p>
            <p>News analyzed: ${data.sentiment_analysis?.sentiment_analysis?.news_count || 'N/A'}</p>
            
            <h4>On-Chain Metrics</h4>
            <ul>
                <li>Active Addresses: ${formatLargeNumber(data.sentiment_analysis?.onchain_metrics?.active_addresses || 0)}</li>
                <li>Transactions: ${formatLargeNumber(data.sentiment_analysis?.onchain_metrics?.transaction_count || 0)}</li>
                <li>NVT Ratio: ${data.sentiment_analysis?.onchain_metrics?.nvt_ratio || 'N/A'}</li>
                <li>MVRV Ratio: ${data.sentiment_analysis?.onchain_metrics?.mvrv || 'N/A'}</li>
            </ul>
        </div>
    `;
    
    // Final Recommendation Section
    html += `
        <div class="analysis-section final-recommendation">
            <h3>🎯 Final Recommendation</h3>
            <p>${data.final_recommendation || 'HOLD'}</p>
        </div>
    `;
    
    html += '</div>';
    analysisContent.innerHTML = html;
}

/**
 * Format indicators display
 */
function formatIndicators(technical) {
    if (!technical) return '<p>No technical analysis available</p>';
    
    let html = '';
    
    // Display analysis for each timeframe
    ['1d', '1w', '1m'].forEach(timeframe => {
        if (technical[timeframe]) {
            const tf = technical[timeframe];
            html += `
                <h4>Last ${timeframe === '1d' ? '1 Day' : timeframe === '1w' ? '7 Days' : '30 Days'} Analysis</h4>
                <div class="indicators">
                    <div class="indicator-grid">
                        <div class="indicator-category">
                            <h5>Oscillators</h5>
                            <ul>
                                ${formatIndicatorList(tf.oscillators)}
                            </ul>
                        </div>
                        <div class="indicator-category">
                            <h5>Moving Averages</h5>
                            <ul>
                                ${formatIndicatorList(tf.moving_averages)}
                            </ul>
                        </div>
                        <div class="indicator-category">
                            <h5>Signals</h5>
                            <ul>
                                ${formatSignalList(tf.signals)}
                            </ul>
                        </div>
                    </div>
                </div>
            `;
        }
    });
    
    return html;
}

/**
 * Format indicator list
 */
function formatIndicatorList(indicators) {
    if (!indicators) return '<li>No data available</li>';
    
    return Object.entries(indicators).map(([key, value]) => 
        `<li><strong>${key}:</strong> ${typeof value === 'number' ? value.toFixed(4) : value}</li>`
    ).join('');
}

/**
 * Format signal list with color coding
 */
function formatSignalList(signals) {
    if (!signals) return '<li>No signals available</li>';
    
    return Object.entries(signals).map(([key, value]) => {
        const signalClass = value.toLowerCase().includes('buy') ? 'buy' : 
                           value.toLowerCase().includes('sell') ? 'sell' : 'hold';
        return `<li><strong>${key}:</strong> <span class="signal-${signalClass}">${value}</span></li>`;
    }).join('');
}

/**
 * Format prediction table
 */
function formatPredictionTable(lstm) {
    if (!lstm?.future_predictions) return '<p>No prediction data available</p>';
    
    const { dates, predictions } = lstm.future_predictions;
    
    let html = '<table class="prediction-table"><thead><tr><th>Date</th><th>Predicted Price</th></tr></thead><tbody>';
    
    for (let i = 0; i < dates.length && i < predictions.length; i++) {
        html += `<tr><td>${dates[i]}</td><td>$${formatNumber(predictions[i], 2)}</td></tr>`;
    }
    
    html += '</tbody></table>';
    return html;
}

/**
 * Get sentiment color based on score
 */
function getSentimentColor(score) {
    if (score > 0.6) return '#27ae60';  // Green for positive
    if (score < 0.4) return '#e74c3c';  // Red for negative
    return '#f39c12';  // Orange for neutral
}

// ============ CHART RENDERING ============

/**
 * Render all charts
 */
function renderCharts(data) {
    if (data.charts) {
        // Price Chart
        if (data.charts.price) {
            renderPriceChart(data.charts.price);
        }
        
        // Technical Chart
        if (data.charts.technical) {
            renderTechnicalChart(data.charts.technical);
        }
        
        // LSTM Chart
        if (data.charts.lstm) {
            renderLSTMChart(data.charts.lstm);
        }
        
        // Signals Chart
        if (data.charts.signals_distribution) {
            renderSignalsChart(data.charts.signals_distribution);
        }
    }
}

/**
 * Render price chart (Line chart with purple gradient)
 */
function renderPriceChart(chartData) {
    const ctx = document.getElementById('priceChart');
    if (!ctx) return;
    
    // Destroy existing chart
    if (chartInstances.priceChart) {
        chartInstances.priceChart.destroy();
    }
    
    chartInstances.priceChart = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            return '$' + formatNumber(value, 2);
                        }
                    }
                }
            }
        }
    });
}

/**
 * Render technical indicators chart (Multi-line with SMA/EMA)
 */
function renderTechnicalChart(chartData) {
    const ctx = document.getElementById('technicalChart');
    if (!ctx) return;
    
    // Destroy existing chart
    if (chartInstances.technicalChart) {
        chartInstances.technicalChart.destroy();
    }
    
    chartInstances.technicalChart = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            return '$' + formatNumber(value, 2);
                        }
                    }
                }
            }
        }
    });
}

/**
 * Render LSTM prediction chart (Historical + Predicted)
 */
function renderLSTMChart(chartData) {
    const ctx = document.getElementById('lstmChart');
    if (!ctx) return;
    
    // Destroy existing chart
    if (chartInstances.lstmChart) {
        chartInstances.lstmChart.destroy();
    }
    
    chartInstances.lstmChart = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            return '$' + formatNumber(value, 2);
                        }
                    }
                }
            }
        }
    });
}

/**
 * Render signals distribution chart (Doughnut)
 */
function renderSignalsChart(chartData) {
    const ctx = document.getElementById('signalsChart');
    if (!ctx) return;
    
    // Destroy existing chart
    if (chartInstances.signalsChart) {
        chartInstances.signalsChart.destroy();
    }
    
    chartInstances.signalsChart = new Chart(ctx, {
        type: 'doughnut',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Cleanup all chart instances
 */
function cleanupCharts() {
    Object.values(chartInstances).forEach(chart => {
        if (chart) chart.destroy();
    });
    chartInstances = {};
}

// ============ FORMATTING FUNCTIONS ============

/**
 * Format number with locale and decimals
 */
function formatNumber(num, decimals = 2) {
    if (num === null || num === undefined) return 'N/A';
    return parseFloat(num).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * Format large numbers with K/M/B/T suffixes
 */
function formatLargeNumber(num) {
    if (num === null || num === undefined) return 'N/A';
    
    if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return formatNumber(num, 0);
}

/**
 * Format percentage change with color
 */
function formatChange(change) {
    if (change === null || change === undefined) return 'N/A';
    
    const numChange = parseFloat(change);
    const sign = numChange >= 0 ? '+' : '';
    return `${sign}${numChange.toFixed(2)}%`;
}

/**
 * Calculate price change (for dashboard)
 */
function calculateChange(symbol) {
    if (!symbol.open || !symbol.close) return 0;
    return ((symbol.close - symbol.open) / symbol.open) * 100;
}

// ============ INITIALIZATION ============

/**
 * Initialize the application
 */
document.addEventListener('DOMContentLoaded', () => {
    // Show dashboard by default
    showScreen('dashboard');
});
