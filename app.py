from flask import Flask, jsonify, send_from_directory, request
import requests
import json
from datetime import datetime
from datetime import timedelta
import os
import sys
import logging

import numpy as np
import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import MACD, SMAIndicator, EMAIndicator
from ta.volatility import BollingerBands

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='public', static_url_path='/static')

# Global cache for data
data_cache = {}
cache_timestamp = {}
CACHE_DURATION = 300  # 5 minutes

def get_cached_data(key, fetch_func, *args, **kwargs):
    """Get data from cache or fetch fresh data"""
    current_time = datetime.now().timestamp()
    
    # Check if cache is valid
    if key in data_cache and key in cache_timestamp:
        if current_time - cache_timestamp[key] < CACHE_DURATION:
            logger.info(f"Returning cached data for {key}")
            return data_cache[key]
    
    # Fetch fresh data
    try:
        logger.info(f"Fetching fresh data for {key}")
        data = fetch_func(*args, **kwargs)
        data_cache[key] = data
        cache_timestamp[key] = current_time
        return data
    except Exception as e:
        logger.error(f"Error fetching data for {key}: {e}")
        # Return cached data if available, even if expired
        if key in data_cache:
            logger.info(f"Returning expired cached data for {key}")
            return data_cache[key]
        return None

def fetch_binance_data():
    """Fetch data from Binance API with fallback"""
    try:
        # Try main Binance API
        response = requests.get('https://api.binance.com/api/v3/ticker/24hr', timeout=10)
        if response.status_code == 200:
            tickers = response.json()
            logger.info(f"Successfully fetched {len(tickers)} tickers from Binance")
            return tickers
    except Exception as e:
        logger.error(f"Error fetching from main Binance API: {e}")
    
    try:
        # Try backup Binance API
        response = requests.get('https://api1.binance.com/api/v3/ticker/24hr', timeout=10)
        if response.status_code == 200:
            tickers = response.json()
            logger.info(f"Successfully fetched {len(tickers)} tickers from backup Binance API")
            return tickers
    except Exception as e:
        logger.error(f"Error fetching from backup Binance API: {e}")
    
    # Return mock data as last resort
    logger.warning("Using mock data as fallback")
    return get_mock_tickers()

def get_mock_tickers():
    """Generate mock ticker data"""
    mock_data = [
        {'symbol': 'BTCUSDT', 'lastPrice': '50000.00', 'openPrice': '49000.00', 'highPrice': '51000.00', 'lowPrice': '48000.00', 'volume': '1000.00', 'quoteVolume': '50000000.00', 'count': '50000', 'priceChangePercent': '2.04'},
        {'symbol': 'ETHUSDT', 'lastPrice': '3000.00', 'openPrice': '2900.00', 'highPrice': '3100.00', 'lowPrice': '2800.00', 'volume': '5000.00', 'quoteVolume': '15000000.00', 'count': '30000', 'priceChangePercent': '3.45'},
        {'symbol': 'SOLUSDT', 'lastPrice': '150.00', 'openPrice': '145.00', 'highPrice': '155.00', 'lowPrice': '140.00', 'volume': '10000.00', 'quoteVolume': '1500000.00', 'count': '25000', 'priceChangePercent': '3.45'},
        {'symbol': 'XRPUSDT', 'lastPrice': '0.60', 'openPrice': '0.58', 'highPrice': '0.62', 'lowPrice': '0.56', 'volume': '50000.00', 'quoteVolume': '30000.00', 'count': '40000', 'priceChangePercent': '3.45'},
        {'symbol': 'BNBUSDT', 'lastPrice': '400.00', 'openPrice': '390.00', 'highPrice': '410.00', 'lowPrice': '380.00', 'volume': '2000.00', 'quoteVolume': '800000.00', 'count': '20000', 'priceChangePercent': '2.56'},
        {'symbol': 'DOGEUSDT', 'lastPrice': '0.15', 'openPrice': '0.14', 'highPrice': '0.16', 'lowPrice': '0.13', 'volume': '100000.00', 'quoteVolume': '15000.00', 'count': '60000', 'priceChangePercent': '7.14'},
        {'symbol': 'LINKUSDT', 'lastPrice': '20.00', 'openPrice': '19.50', 'highPrice': '20.50', 'lowPrice': '19.00', 'volume': '3000.00', 'quoteVolume': '60000.00', 'count': '15000', 'priceChangePercent': '2.56'},
        {'symbol': 'ADAUSDT', 'lastPrice': '0.50', 'openPrice': '0.48', 'highPrice': '0.52', 'lowPrice': '0.46', 'volume': '40000.00', 'quoteVolume': '20000.00', 'count': '35000', 'priceChangePercent': '4.17'},
        {'symbol': 'LTCUSDT', 'lastPrice': '100.00', 'openPrice': '95.00', 'highPrice': '105.00', 'lowPrice': '90.00', 'volume': '1500.00', 'quoteVolume': '150000.00', 'count': '12000', 'priceChangePercent': '5.26'},
        {'symbol': 'AVAXUSDT', 'lastPrice': '40.00', 'openPrice': '38.00', 'highPrice': '42.00', 'lowPrice': '36.00', 'volume': '2500.00', 'quoteVolume': '100000.00', 'count': '18000', 'priceChangePercent': '5.26'}
    ]
    return mock_data

def fetch_binance_klines(symbol: str, interval: str = '1d', limit: int = 90) -> pd.DataFrame:
    """Fetch OHLCV klines from Binance and return a normalized DataFrame."""
    url = 'https://api.binance.com/api/v3/klines'
    params = {
        'symbol': symbol,
        'interval': interval,
        'limit': limit,
    }
    response = requests.get(url, params=params, timeout=10)
    response.raise_for_status()
    klines = response.json()

    rows = []
    for k in klines:
        open_time_ms = int(k[0])
        rows.append({
            'timestamp': open_time_ms,
            'date': datetime.utcfromtimestamp(open_time_ms / 1000).strftime('%Y-%m-%d'),
            'open': float(k[1]),
            'high': float(k[2]),
            'low': float(k[3]),
            'close': float(k[4]),
            'volume': float(k[5]),
        })

    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df['date'] = pd.to_datetime(df['date'])
    return df.sort_values('date')

def compute_technical_analysis(df: pd.DataFrame) -> dict:
    def compute_for_window(df_window: pd.DataFrame) -> dict:
        close = df_window['close']

        rsi_series = RSIIndicator(close=close, window=14).rsi()
        macd_obj = MACD(close=close)
        macd_series = macd_obj.macd()
        macd_signal_series = macd_obj.macd_signal()

        sma_20_series = SMAIndicator(close=close, window=20).sma_indicator()
        sma_50_series = SMAIndicator(close=close, window=50).sma_indicator()
        ema_12_series = EMAIndicator(close=close, window=12).ema_indicator()
        ema_26_series = EMAIndicator(close=close, window=26).ema_indicator()

        bb = BollingerBands(close=close, window=20, window_dev=2)
        bb_upper = bb.bollinger_hband()
        bb_middle = bb.bollinger_mavg()
        bb_lower = bb.bollinger_lband()

        rsi_last = float(rsi_series.iloc[-1]) if not rsi_series.empty and not pd.isna(rsi_series.iloc[-1]) else 50.0
        macd_last = float(macd_series.iloc[-1]) if not macd_series.empty and not pd.isna(macd_series.iloc[-1]) else 0.0
        macd_signal_last = float(macd_signal_series.iloc[-1]) if not macd_signal_series.empty and not pd.isna(macd_signal_series.iloc[-1]) else 0.0
        macd_hist_last = macd_last - macd_signal_last

        sma_20_last = float(sma_20_series.iloc[-1]) if not sma_20_series.empty and not pd.isna(sma_20_series.iloc[-1]) else float(close.iloc[-1])
        sma_50_last = float(sma_50_series.iloc[-1]) if not sma_50_series.empty and not pd.isna(sma_50_series.iloc[-1]) else float(close.iloc[-1])
        ema_12_last = float(ema_12_series.iloc[-1]) if not ema_12_series.empty and not pd.isna(ema_12_series.iloc[-1]) else float(close.iloc[-1])
        ema_26_last = float(ema_26_series.iloc[-1]) if not ema_26_series.empty and not pd.isna(ema_26_series.iloc[-1]) else float(close.iloc[-1])

        rsi_signal = 'BUY' if rsi_last < 30 else 'SELL' if rsi_last > 70 else 'HOLD'
        macd_signal = 'BUY' if macd_hist_last > 0 else 'SELL' if macd_hist_last < 0 else 'HOLD'
        ma_signal = 'BUY' if sma_20_last > sma_50_last else 'SELL' if sma_20_last < sma_50_last else 'HOLD'

        signals = [rsi_signal, macd_signal, ma_signal]
        buy = sum(1 for s in signals if s == 'BUY')
        sell = sum(1 for s in signals if s == 'SELL')
        hold = sum(1 for s in signals if s == 'HOLD')

        if buy > sell and buy >= hold:
            overall_signal = 'BUY'
        elif sell > buy and sell >= hold:
            overall_signal = 'SELL'
        else:
            overall_signal = 'HOLD'

        return {
            'oscillators': {
                'rsi': {'value': rsi_last, 'signal': rsi_signal},
                'macd': {'value': macd_last, 'signal': macd_signal},
            },
            'moving_averages': {
                'sma_20': {'value': sma_20_last, 'signal': 'BUY' if close.iloc[-1] > sma_20_last else 'SELL'},
                'sma_50': {'value': sma_50_last, 'signal': ma_signal},
                'ema_12': {'value': ema_12_last, 'signal': 'BUY' if ema_12_last > ema_26_last else 'SELL'},
                'ema_26': {'value': ema_26_last, 'signal': 'BUY' if ema_12_last > ema_26_last else 'SELL'},
            },
            'signals': {
                'overall_signal': overall_signal,
                'summary': {'buy': buy, 'sell': sell, 'hold': hold},
                'details': {'rsi': rsi_signal, 'macd': macd_signal, 'moving_averages': ma_signal},
            },
            'series': {
                'rsi': rsi_series.ffill().bfill().fillna(50).tail(90).tolist(),
                'macd': macd_series.ffill().bfill().fillna(0).tail(90).tolist(),
                'macd_signal': macd_signal_series.ffill().bfill().fillna(0).tail(90).tolist(),
                'sma_20': sma_20_series.ffill().bfill().fillna(close).tail(90).tolist(),
                'sma_50': sma_50_series.ffill().bfill().fillna(close).tail(90).tolist(),
                'bb_upper': bb_upper.ffill().bfill().fillna(close).tail(90).tolist(),
                'bb_middle': bb_middle.ffill().bfill().fillna(close).tail(90).tolist(),
                'bb_lower': bb_lower.ffill().bfill().fillna(close).tail(90).tolist(),
            },
        }

    tf_1d = compute_for_window(df.tail(90).copy())
    tf_1w = compute_for_window(df.tail(30).copy())
    tf_1m = compute_for_window(df.tail(90).copy())

    signals = [
        tf_1d['signals']['overall_signal'],
        tf_1w['signals']['overall_signal'],
        tf_1m['signals']['overall_signal'],
    ]
    buy = sum(1 for s in signals if s == 'BUY')
    sell = sum(1 for s in signals if s == 'SELL')
    hold = sum(1 for s in signals if s == 'HOLD')

    if buy > sell and buy >= hold:
        overall_signal = 'BUY'
    elif sell > buy and sell >= hold:
        overall_signal = 'SELL'
    else:
        overall_signal = 'HOLD'

    return {
        'overall_signal': overall_signal,
        '1d': tf_1d,
        '1w': tf_1w,
        '1m': tf_1m,
    }

def compute_lstm_like_prediction(df: pd.DataFrame, days: int = 7) -> dict:
    close = df['close'].astype(float)
    recent = close.tail(60)
    y = recent.values
    x = np.arange(len(y))

    if len(y) < 10:
        preds = [float(close.iloc[-1])] * days
        rmse = 0.0
        mape = 0.0
        r2 = 0.0
    else:
        coeffs = np.polyfit(x, y, 1)
        y_hat = np.polyval(coeffs, x)
        residual = y - y_hat
        rmse = float(np.sqrt(np.mean(residual ** 2)))
        mape = float(np.mean(np.abs((y - y_hat) / np.maximum(y, 1e-9))) * 100)
        ss_res = float(np.sum((y - y_hat) ** 2))
        ss_tot = float(np.sum((y - np.mean(y)) ** 2))
        r2 = float(1 - (ss_res / ss_tot)) if ss_tot > 0 else 0.0

        future_x = np.arange(len(y), len(y) + days)
        preds = [float(p) for p in np.polyval(coeffs, future_x)]

    last_date = df['date'].iloc[-1]
    future_dates = pd.date_range(start=last_date + timedelta(days=1), periods=days, freq='D')

    return {
        'model_performance': {'RMSE': rmse, 'MAPE': mape, 'R2': r2},
        'future_predictions': {
            'dates': [d.strftime('%Y-%m-%d') for d in future_dates],
            'predictions': preds,
            'current_price': float(close.iloc[-1]),
        },
        'model_trained': True,
    }

def compute_sentiment(symbol: str, price_change_percent: float, technical: dict, trade_count_24h: int, quote_volume_24h: float, mvrv: float) -> dict:
    rsi_val = float(technical.get('1d', {}).get('oscillators', {}).get('rsi', {}).get('value', 50.0))
    score = (price_change_percent / 100.0) + ((50.0 - rsi_val) / 100.0)
    combined_score = float(max(-1.0, min(1.0, score)))

    if combined_score > 0.15:
        combined_signal = 'BUY'
        sentiment_class = 'POSITIVE'
        sentiment = 'BULLISH'
    elif combined_score < -0.15:
        combined_signal = 'SELL'
        sentiment_class = 'NEGATIVE'
        sentiment = 'BEARISH'
    else:
        combined_signal = 'HOLD'
        sentiment_class = 'NEUTRAL'
        sentiment = 'NEUTRAL'

    tx_count = int(trade_count_24h or 0)
    active_addresses = int(max(0, tx_count // 120))
    nvt_ratio = round(float(quote_volume_24h) / max(tx_count, 1), 6) if quote_volume_24h is not None else 'N/A'

    return {
        'symbol': symbol,
        'combined_score': combined_score,
        'combined_signal': combined_signal,
        'sentiment': sentiment,
        'sentiment_analysis': {
            'sentiment_class': sentiment_class,
            'news_count': 0,
        },
        'onchain_metrics': {
            'active_addresses': active_addresses,
            'transaction_count': tx_count,
            'nvt_ratio': nvt_ratio,
            'mvrv': mvrv,
        },
    }

def build_charts(df: pd.DataFrame, technical: dict, lstm_prediction: dict) -> dict:
    labels = df['date'].dt.strftime('%Y-%m-%d').tolist()
    close = df['close'].astype(float).tolist()

    tech_series = technical.get('1d', {}).get('series', {})
    sma_20 = tech_series.get('sma_20', [])
    sma_50 = tech_series.get('sma_50', [])
    bb_upper = tech_series.get('bb_upper', [])
    bb_lower = tech_series.get('bb_lower', [])

    price_chart = {
        'labels': labels,
        'datasets': [
            {'label': 'Close', 'data': close, 'borderColor': '#667eea', 'backgroundColor': 'rgba(102, 126, 234, 0.15)', 'fill': True, 'tension': 0.25},
        ],
    }

    technical_chart = {
        'labels': labels[-len(sma_20):] if sma_20 else labels,
        'datasets': [
            {'label': 'Close', 'data': close[-len(sma_20):] if sma_20 else close, 'borderColor': '#2d3436', 'tension': 0.25},
            {'label': 'SMA 20', 'data': sma_20, 'borderColor': '#27ae60', 'tension': 0.25},
            {'label': 'SMA 50', 'data': sma_50, 'borderColor': '#e67e22', 'tension': 0.25},
            {'label': 'BB Upper', 'data': bb_upper, 'borderColor': '#0984e3', 'borderDash': [6, 6], 'tension': 0.25},
            {'label': 'BB Lower', 'data': bb_lower, 'borderColor': '#0984e3', 'borderDash': [6, 6], 'tension': 0.25},
        ],
    }

    fp = lstm_prediction.get('future_predictions', {})
    hist_prices = close[-30:] if len(close) > 30 else close
    hist_labels = labels[-30:] if len(labels) > 30 else labels
    lstm_chart = {
        'labels': hist_labels + fp.get('dates', []),
        'datasets': [
            {'label': 'Historical', 'data': hist_prices + ([None] * len(fp.get('dates', []))), 'borderColor': '#2d3436', 'tension': 0.25},
            {'label': 'Forecast', 'data': ([None] * len(hist_labels)) + fp.get('predictions', []), 'borderColor': '#9b59b6', 'tension': 0.25},
        ],
    }

    signals_summary = technical.get('1d', {}).get('signals', {}).get('summary', {'buy': 0, 'sell': 0, 'hold': 0})
    signals_distribution = {
        'labels': ['Buy', 'Sell', 'Hold'],
        'datasets': [{
            'data': [signals_summary.get('buy', 0), signals_summary.get('sell', 0), signals_summary.get('hold', 0)],
            'backgroundColor': ['#27ae60', '#e74c3c', '#f39c12'],
        }],
    }

    return {
        'price': price_chart,
        'technical': technical_chart,
        'lstm': lstm_chart,
        'signals_distribution': signals_distribution,
    }

@app.route('/')
def index():
    try:
        return send_from_directory('static', 'index.html')
    except Exception as e:
        logger.error(f"Error serving index: {e}")
        return jsonify({'error': 'Page not found'}), 404

@app.route('/static/<path:filename>')
def static_files(filename):
    try:
        return send_from_directory('static', filename)
    except Exception as e:
        logger.error(f"Error serving static file {filename}: {e}")
        return jsonify({'error': 'File not found'}), 404

@app.route('/api/health')
def health():
    try:
        return jsonify({
            'service': 'CryptoVault Analytics - Azure Production',
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'version': 'enhanced-azure-production',
            'cache_status': f"{len(data_cache)} cached items"
        })
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/symbols')
def get_symbols():
    try:
        # Get data from cache or fetch fresh
        tickers = get_cached_data('binance_tickers', fetch_binance_data)
        
        if not tickers:
            logger.error("No ticker data available")
            return jsonify({'error': 'Unable to fetch market data'}), 500
        
        # Process and return top symbols (USDT only), sorted by quote volume
        usdt_tickers = [t for t in tickers if str(t.get('symbol', '')).endswith('USDT')]
        top_tickers = sorted(usdt_tickers, key=lambda x: float(x.get('quoteVolume', 0)), reverse=True)[:15]
        
        symbols = []
        for ticker in top_tickers:
            try:
                symbols.append({
                    'symbol': ticker['symbol'],
                    'close': float(ticker.get('lastPrice', 0)),
                    'open': float(ticker.get('openPrice', 0)),
                    'high': float(ticker.get('highPrice', 0)),
                    'low': float(ticker.get('lowPrice', 0)),
                    'volume': float(ticker.get('volume', 0)),
                    'quote_volume': float(ticker.get('quoteVolume', 0)),
                    'count': int(ticker.get('count', 0)),
                    'number_of_trades': int(ticker.get('count', 0)),
                    'price_change_percent': ticker.get('priceChangePercent', '0.00'),
                    'date': datetime.now().strftime('%Y-%m-%d'),
                    'timestamp': int(datetime.now().timestamp())
                })
            except (ValueError, TypeError) as e:
                logger.error(f"Error processing ticker {ticker.get('symbol')}: {e}")
                continue
        
        logger.info(f"Returning {len(symbols)} symbols")
        return jsonify(symbols)
        
    except Exception as e:
        logger.error(f"Error in get_symbols: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/analysis/complete/<symbol>')
def get_analysis(symbol):
    try:
        period = (request.args.get('period') or '90d').lower()
        period_to_limit = {'7d': 7, '30d': 30, '90d': 90}
        limit = period_to_limit.get(period, 90)
        
        tickers = get_cached_data('binance_tickers', fetch_binance_data) or []
        ticker = next((t for t in tickers if t.get('symbol') == symbol), None)
        current_price = float(ticker.get('lastPrice')) if ticker and ticker.get('lastPrice') else None
        price_change_percent = float(ticker.get('priceChangePercent')) if ticker and ticker.get('priceChangePercent') else 0.0
        volume_24h = float(ticker.get('volume')) if ticker and ticker.get('volume') else 0.0
        quote_volume_24h = float(ticker.get('quoteVolume')) if ticker and ticker.get('quoteVolume') else 0.0
        
        df = get_cached_data(f'klines_{symbol}_1d_90', fetch_binance_klines, symbol, '1d', 90)
        if df is None or df.empty:
            return jsonify({'error': 'Unable to fetch historical data for analysis'}), 500
        
        df_period = df.tail(limit).copy()
        if current_price is None:
            current_price = float(df_period['close'].iloc[-1])
        
        technical = compute_technical_analysis(df_period)
        lstm_prediction = compute_lstm_like_prediction(df_period, days=7)
        trade_count_24h = int(ticker.get('count', 0)) if ticker and ticker.get('count') else 0
        avg_close = float(df_period['close'].mean()) if not df_period.empty else float(current_price)
        mvrv = round(float(current_price) / max(avg_close, 1e-12), 6)
        sentiment = compute_sentiment(symbol, price_change_percent, technical, trade_count_24h, quote_volume_24h, mvrv)
        
        final_signal = technical.get('overall_signal', 'HOLD')
        confidence = int(min(95, max(55, 70 + (technical['1d']['signals']['summary']['buy'] - technical['1d']['signals']['summary']['sell']) * 10)))
        
        analysis_data = {
            'symbol': symbol,
            'timestamp': datetime.now().isoformat(),
            'current_price': float(current_price),
            'price_change_percent': float(price_change_percent),
            'volume_24h': float(volume_24h),
            'quote_volume_24h': float(quote_volume_24h),
            'technical_analysis': technical,
            'lstm_prediction': lstm_prediction,
            'sentiment_analysis': sentiment,
            'final_recommendation': {
                'signal': final_signal,
                'confidence': confidence,
                'reasoning': f"Overall signal {final_signal} based on RSI/MACD/MA convergence on {period.upper()} data.",
            },
        }
        
        analysis_data['charts'] = build_charts(df_period, technical, lstm_prediction)
        
        logger.info(f"Generated analysis for {symbol}")
        return jsonify(analysis_data)
        
    except Exception as e:
        logger.error(f"Error in get_analysis for {symbol}: {e}")
        return jsonify({'error': str(e)}), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    logger.info("Starting CryptoVault Analytics for Azure deployment")
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
VERSION = '1770203322'
