import express from 'express';
import { chromium } from 'playwright';
import OpenAI from 'openai';

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function scrapeDuckDuckGo(q) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(q)}`);
  await page.waitForSelector('.result__a', { timeout: 10000 });
  const [first] = await page.$$eval('.result__a', els =>
    els.slice(0,1).map(a => ({ title: a.textContent, url: a.href }))
  );
  await browser.close();
  return first;
}

async function fetchPageText(url) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(url, { timeout: 15000 });
  const text = await page.$$eval('p', ps => ps.map(p => p.innerText).join('\\n\\n'));
  await browser.close();
  return text;
}

async function analyze(title, url, content, query) {
  const prompt = \`
