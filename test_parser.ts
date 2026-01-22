
import Parser from "rss-parser";

const parser = new Parser();

async function test() {
    console.log("Testing rss-parser...");
    try {
        await parser.parseURL("https://nitter.net/elonmusk/rss");
        console.log("Success!");
    } catch (e) {
        console.log("Caught error:", e);
        console.log("Type:", typeof e);
        console.log("Keys:", Object.keys(e));
        console.log("Message:", e.message);
        console.log("Code:", e.code);
    }
}

test();
