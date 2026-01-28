/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */


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
