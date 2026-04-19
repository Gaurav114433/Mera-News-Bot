const axios = require('axios');
const RSSParser = require('rss-parser');
const fs = require('fs');
const cheerio = require('cheerio');

const parser = new RSSParser();
const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const HISTORY_FILE = 'history.json';

const feeds = [
    { name: 'Aaj Tak', url: 'https://feed.aajtak.in/rss/aajtak/nation' },
    { name: 'Zee News', url: 'https://zeenews.india.com/hindi/india.xml' },
    { name: 'News18', url: 'https://hindi.news18.com/rss/khabar/nation/nation.xml' },
    { name: 'NDTV India', url: 'https://ndtv.in/feeds/india-news' },
    { name: 'ABP News', url: 'https://www.abplive.com/home/feed' }
];

function isDuplicate(newTitle, historyData) {
    const clean = (str) => str.replace(/[^\u0900-\u097F\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    const newWords = clean(newTitle);
    for (let old of historyData) {
        let oldTitle = typeof old === 'string' ? old : (old.title || "");
        let oldWords = clean(oldTitle);
        let match = newWords.filter(word => oldWords.includes(word)).length;
        if (match > 0 && (match / Math.min(newWords.length, oldWords.length)) >= 0.4) return true;
    }
    return false;
}

async function run() {
    try {
        let history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) : [];
        let finalSelection = [];

        for (const source of feeds) {
            try {
                const feed = await parser.parseURL(source.url);
                let countFromThisSource = 0;

                for (const item of feed.items) {
                    if (countFromThisSource >= 2) break;

                    const isLinkSent = history.some(h => (h.link === item.link));
                    const isTitleDuplicate = isDuplicate(item.title, history);

                    if (!isLinkSent && !isTitleDuplicate) {
                        finalSelection.push({ ...item, sourceName: source.name });
                        countFromThisSource++;
                    }
                }
            } catch (err) { console.log(`${source.name} लोड नहीं हो पाया:`, err.message); }
        }

        for (const item of finalSelection) {
            try {
                const res = await axios.get(item.link, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                const $ = cheerio.load(res.data);
                
                let img = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content');
                let desc = $('meta[property="og:description"]').attr('content') || "विस्तार से पढ़ने के लिए लिंक पर क्लिक करें।";

                const msg = `<b>📌 ${item.sourceName} | बड़ी खबर</b>\n\n<b>${item.title}</b>\n\n📝 ${desc.slice(0, 180)}...\n\n🔗 <a href="${item.link}">पूरा लेख पढ़ें</a>`;

                if (img && img.startsWith('http')) {
                    await axios.post(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, { chat_id: CHAT_ID, photo: img, caption: msg, parse_mode: 'HTML' });
                } else {
                    await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { chat_id: CHAT_ID, text: msg, parse_mode: 'HTML' });
                }

                history.push({ link: item.link, title: item.title });
                await new Promise(r => setTimeout(r, 3000));
            } catch (e) { console.log("स्किप की गई खबर:", item.title); }
        }
        
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(-100), null, 2));

    } catch (e) { console.error("Error:", e.message); }
}

run();
