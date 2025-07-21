import express from 'express';
import { chromium } from 'playwright';
import OpenAI from 'openai';

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 1. Scrape DuckDuckGo for the top result
async function scrapeDuckDuckGo(q) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(q)}`);
  await page.waitForSelector('.result__a', { timeout: 10000 });

  const [first] = await page.$$eval('.result__a', els =>
    els.slice(0, 1).map(a => ({ title: a.textContent, url: a.href }))
  );

  await browser.close();
  return first;
}

// 2. Fetch the page’s paragraph text
async function fetchPageText(url) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(url, { timeout: 15000 });
  const text = await page.$$eval('p', ps => ps.map(p => p.innerText).join('\n\n'));
  await browser.close();
  return text;
}

// 3. Ask OpenAI to summarize & extract takeaways
async function analyze(title, url, content, query) {
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
    max_tokens: 500
  });
  return resp.choices[0].message.content;
}

// 4. Main endpoint
app.post('/analyze', async (req, res) => {
  try {
    const { query } = req.body;
    const top = await scrapeDuckDuckGo(query);
    if (!top) throw new Error('No results found');
    const text = await fetchPageText(top.url);
    const analysis = await analyze(top.title, top.url, text, query);
    res.json({ title: top.title, url: top.url, analysis });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on port ${port}`));
