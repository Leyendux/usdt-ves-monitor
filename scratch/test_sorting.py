import json
import urllib.request

def test_sorting():
    url = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search"
    payload = {
        "asset": "USDT",
        "fiat": "VES",
        "tradeType": "BUY",
        "merchantCheck": False,
        "page": 1,
        "rows": 20,
        "payTypes": []
    }
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url, data=data,
        headers={
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    )
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode('utf-8'))
            if res.get("success") and res.get("data"):
                ads = res["data"]
                # Extract prices and sort them descending (highest price first)
                prices = [float(ad["adv"]["price"]) for ad in ads]
                prices_sorted = sorted(prices, reverse=True)
                
                print("Prices returned by API in original order:")
                for idx, p in enumerate(prices[:10]):
                    print(f"  #{idx+1}: {p} VES")
                    
                print("\nPrices sorted descending (Best rates for selling USDT):")
                for idx, p in enumerate(prices_sorted[:10]):
                    print(f"  #{idx+1}: {p} VES")
                    
                top_3_avg = sum(prices_sorted[:3]) / 3
                print(f"\nAverage of top 3 highest prices: {top_3_avg:.4f} VES")
            else:
                print("No data")
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    test_sorting()
