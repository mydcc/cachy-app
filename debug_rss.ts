
async function testRss() {
    console.log("Testing RSS API...");

    const urls = [
        "https://nitter.net/elonmusk/rss",
        "invalid-url",
        "",
        "https://feeds.feedburner.com/CoinDesk", // Valid
        "https://nitter.net/search/rss?q=%23BTC"
    ];

    for (const url of urls) {
        console.log(`\nTesting URL: '${url}'`);
        try {
            const res = await fetch("http://localhost:5173/api/rss-fetch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url })
            });
            console.log(`Status: ${res.status}`);
            if (!res.ok) {
                const txt = await res.text();
                console.log(`Error body: ${txt}`);
            } else {
                const data = await res.json();
                console.log(`Success. Items: ${data.items?.length}`);
            }
        } catch (e) {
            console.error("Fetch failed:", e.message);
        }
    }
}

testRss();
