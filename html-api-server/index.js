

import express from 'express';
import { load } from 'cheerio';

const app = express();
const PORT = process.env.PORT || 3000;


app.use(express.json());


app.post('/process-html', async (req, res) => {
  const entries = req.body;
  if (!Array.isArray(entries)) {
    return res.status(400).json({ error: 'Expected an array of entries' });
  }

  function normalizeAnchor(str) {
    if (!str) return '';
    return str
      .replace(/\u00a0/g, ' ')
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/—/g, '-')
      .replace(/–/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  const results = entries.map((entry) => {
    const { html = '', link, anchor, finalLink, row_number, source, id } = entry;
    if (!html || !link || !anchor || !finalLink) {
      return {
        row_number,
        source,
        id,
        updatedHtml: html,
        status: 'failed',
        reason: 'Missing required fields'
      };
    }

    const $ = load(html);
    let updatedHtml = html;
    let matchCount = 0;

    $('a').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const anchorText = $el.text();

      const hrefMatches = href === link;
      const anchorMatches = normalizeAnchor(anchorText) === normalizeAnchor(anchor);

      if (hrefMatches && anchorMatches) {
        const candidateTags = [...updatedHtml.matchAll(/<a\b[^>]*>[^]*?<\/a>/gi)];
        for (const match of candidateTags) {
          const fullATag = match[0];
          const tagEl = load(fullATag)('a');
          const tagHref = tagEl.attr('href') || '';
          const tagText = normalizeAnchor(tagEl.text());

          if (tagHref === link && tagText === normalizeAnchor(anchor)) {
            const replaced = fullATag.replace(
              new RegExp(`href=["']${escapeRegex(link)}["']`, 'i'),
              `href="${finalLink}"`
            );
            if (fullATag !== replaced) {
              updatedHtml = updatedHtml.replace(fullATag, replaced);
              matchCount++;
              break; 
            }
          }
        }
      }
    });

    return {
      row_number,
      source,
      id,
      updatedHtml,
      status: matchCount > 0 ? 'success' : 'failed',
    };
  });

  res.status(200).json({ results });
});


app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('Bad JSON request received:', err.message);
    return res.status(400).json({
      status: 'error',
      message: 'The request body is not valid JSON.'
    });
  }
  next(err);
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

