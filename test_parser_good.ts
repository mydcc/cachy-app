
import Parser from "rss-parser";

const parser = new Parser();

async function test() {
    console.log("Testing rss-parser with CoinDesk...");
    try {
        await parser.parseURL("https://feeds.feedburner.com/CoinDesk");
        console.log("Success with CoinDesk!");
    } catch (e) {
        console.log("Caught error:", e);
    }
}

test();
