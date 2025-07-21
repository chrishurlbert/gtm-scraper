import express from 'express';
import axios from 'axios';
import cheerio from 'cheerio';
import OpenAI from 'openai';

const app = express();
app.use(express.json());
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Health check
app.get('/', (_req, res) => {
  res.send('GTM Scraper is healthy 🚀');
});

async function scrapeDuckDuckGo(query) {
  const { data } = await axios.get('https://duckduckgo.com/html/', {
    params: { q: query },
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const $ = cheerio.load(data);
  const link = $('.result__title a').first();
  let url = link.attr('href') || '';
  const match = url.match(/uddg=(.*)/);
  if (match) url = decodeURIComponent(match[1]);
  return { title: link.text().trim(), url };
}

async function fetchPageText(url) {
  const { data } = await axios.get(url, { timeout: 15000 });
  const $ = cheerio.load(data);
  return $('p').map((i, el) => $(el).text()).get().join('\n\n');
}

async function analyzeContent(title, url, content, query) {
  const prompt = `
I searched for "${query}" and found this page:

Title: ${title}
URL: ${url}

Content (first 15k chars):
${content.slice(0, 15000)}

Please provide:
1. A 2–3 sentence summary.
2. Three key takeaways.
3. Any recent developments.
`;
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 500,
  });
  return resp.choices[0].message.content;
}

app.post('/analyze', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) throw new Error('No query provided');
    const top = await scrapeDuckDuckGo(query);
    if (!top.url) throw new Error('No search results');
    const text = await fetchPageText(top.url);
    const analysis = await analyzeContent(top.title, top.url, text, query);
    res.json({ title: top.title, url: top.url, analysis });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on port ${port}`));
