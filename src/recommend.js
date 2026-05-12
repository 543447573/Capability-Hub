// OpenClaw Capability Hub - Recommendation Engine V1.5
// Supports both English and Chinese text with cross-language matching

// Score a capability against query keywords
function scoreCapability(cap, queryKeywords) {
  if (!queryKeywords || queryKeywords.length === 0) {
    return { score: 0, reasons: [], matchedKeywords: 0 };
  }

  const reasons = [];
  let score = 0;

  const capName = (cap.name || '').toLowerCase();
  const capId = (cap.id || '').toLowerCase();
  const capDesc = (cap.description || '').toLowerCase();
  const capTags = (cap.tags || []).map(t => t.toLowerCase());
  const capCats = (cap.category || []).map(c => c.toLowerCase());

  // Extract English words from all searchable text
  const allEnWords = new Set();
  [capName, capDesc, capId, ...capTags, ...capCats]
    .forEach(text => (text.match(/[a-z]+/g) || []).forEach(w => allEnWords.add(w)));

  // Extract Chinese chars from capability text
  const cnChars = (capDesc + capName + capTags.join(' ') + capCats.join(' '))
    .match(/[\u4e00-\u9fff]/g) || [];

  for (const kw of queryKeywords) {
    let kwScore = 0;
    let kwReason = null;

    // Determine if keyword is Chinese
    const isChineseKw = /[\u4e00-\u9fff]/.test(kw);

    if (isChineseKw) {
      // Chinese keyword matching
      if (capTags.some(t => t === kw)) {
        kwScore = 50; kwReason = 'exact tag: ' + kw;
      } else if (capTags.some(t => t.includes(kw))) {
        kwScore = 30; kwReason = 'tag contains: ' + kw;
      } else if (capName.includes(kw)) {
        kwScore = 25; kwReason = 'name: ' + kw;
      } else if (capDesc.includes(kw)) {
        kwScore = 15; kwReason = 'description: ' + kw;
      } else if (capCats.some(c => c.includes(kw))) {
        kwScore = 10; kwReason = 'category: ' + kw;
      } else if (capId.includes(kw)) {
        kwScore = 10; kwReason = 'id: ' + kw;
      } else {
        // Cross-language: check if keyword chars relate to English words
        const kwChars = kw.match(/[\u4e00-\u9fff]/g) || [];
        // Check each Chinese char against English words (semantic bridge)
        for (const ch of kwChars) {
          // Check if any English word might be related to this Chinese char
          // e.g., 天 -> weather, 气 -> weather, 数 -> data
          if (allEnWords.has('weather') && (ch === '天' || ch === '气' || ch === '天')) {
            kwScore = 20; kwReason = 'semantic bridge (weather): ' + kw; break;
          }
          if (allEnWords.has('data') && (ch === '数' || ch === '据')) {
            kwScore = 15; kwReason = 'semantic bridge (data): ' + kw; break;
          }
          if (allEnWords.has('file') && (ch === '文' || ch === '件')) {
            kwScore = 20; kwReason = 'semantic bridge (file): ' + kw; break;
          }
          if (allEnWords.has('image') && (ch === '图' || ch === '片' || ch === '图')) {
            kwScore = 20; kwReason = 'semantic bridge (image): ' + kw; break;
          }
          if (allEnWords.has('video') && (ch === '视' || ch === '频')) {
            kwScore = 20; kwReason = 'semantic bridge (video): ' + kw; break;
          }
          if (allEnWords.has('audio') && (ch === '音' || ch === '频')) {
            kwScore = 20; kwReason = 'semantic bridge (audio): ' + kw; break;
          }
          if (allEnWords.has('news') && (ch === '新' || ch === '闻')) {
            kwScore = 20; kwReason = 'semantic bridge (news): ' + kw; break;
          }
          if (allEnWords.has('calendar') && (ch === '日' || ch === '历' || ch === '日程')) {
            kwScore = 20; kwReason = 'semantic bridge (calendar): ' + kw; break;
          }
          if (allEnWords.has('email') && (ch === '邮' || ch === '件')) {
            kwScore = 20; kwReason = 'semantic bridge (email): ' + kw; break;
          }
          if (allEnWords.has('translate') && (ch === '翻' || ch === '译')) {
            kwScore = 20; kwReason = 'semantic bridge (translate): ' + kw; break;
          }
          if (allEnWords.has('screenshot') && (ch === '截' || ch === '图')) {
            kwScore = 20; kwReason = 'semantic bridge (screenshot): ' + kw; break;
          }
          if (allEnWords.has('slack') && (ch === '聊' || ch === '聊')) {
            kwScore = 20; kwReason = 'semantic bridge (slack): ' + kw; break;
          }
          if (allEnWords.has('browser') && (ch === '浏' || ch === '览')) {
            kwScore = 20; kwReason = 'semantic bridge (browser): ' + kw; break;
          }
          if (allEnWords.has('search') && (ch === '搜' || ch === '索')) {
            kwScore = 20; kwReason = 'semantic bridge (search): ' + kw; break;
          }
          if (allEnWords.has('ai') || allEnWords.has('gpt') || allEnWords.has('llm')) {
            if (ch === '智' || ch === '能' || ch === '智') {
              kwScore = 20; kwReason = 'semantic bridge (AI): ' + kw; break;
            }
          }
          if (allEnWords.has('database') && (ch === '数' || ch === '据')) {
            kwScore = 15; kwReason = 'semantic bridge (db): ' + kw; break;
          }
          if (allEnWords.has('notification') && (ch === '通' || ch === '知')) {
            kwScore = 20; kwReason = 'semantic bridge (notification): ' + kw; break;
          }
          if (allEnWords.has('tts') && (ch === '语' || ch === '音')) {
            kwScore = 20; kwReason = 'semantic bridge (TTS): ' + kw; break;
          }
        }
      }
    } else {
      // English keyword matching
      if (capTags.some(t => t === kw)) {
        kwScore = 50; kwReason = 'exact tag: ' + kw;
      } else if (capTags.some(t => t.includes(kw) || kw.includes(t))) {
        kwScore = 30; kwReason = 'tag: ' + kw;
      } else if (capName.split(/[\s\-_/]/).some(w => w === kw)) {
        kwScore = 35; kwReason = 'name: ' + kw;
      } else if (capName.includes(kw)) {
        kwScore = 20; kwReason = 'name contains: ' + kw;
      } else if (capDesc.includes(kw)) {
        kwScore = 10; kwReason = 'description: ' + kw;
      } else if (capId.includes(kw)) {
        kwScore = 12; kwReason = 'id: ' + kw;
      } else if (capCats.some(c => c.includes(kw))) {
        kwScore = 8; kwReason = 'category: ' + kw;
      }
    }

    if (kwScore > 0) {
      score += kwScore;
      reasons.push({ keyword: kw, score: kwScore, reason: kwReason });
    }
  }

  const matchedKeywords = reasons.length;
  if (matchedKeywords >= 2) score += matchedKeywords * 5;
  if (matchedKeywords >= 3) score += 15;

  return {
    score: Math.min(Math.round(score), 100),
    reasons: reasons.slice(0, 4),
    matchedKeywords
  };
}

// Extract keywords from text (supports English and Chinese)
function extractKeywords(text) {
  const STOPWORDS_EN = new Set([
    'the','a','an','is','are','was','were','be','been','have','has','had',
    'do','does','did','will','would','could','should','may','might','can',
    'to','of','in','for','on','with','at','by','from','as','and','or',
    'not','this','that','these','those','i','you','he','she','it','we',
    'they','what','which','who','how','when','where','why','get','use',
    'need','want','find','some','all','up','down','out','over','under',
    'just','only','also','very','too','so','if','but','yet','my','your',
    'his','her','its','our','their','me'
  ]);
  const STOPWORDS_CN = new Set([
    '的','了','是','在','和','与','或','我','你','他','她','它',
    '这','那','有','能','可以','要','会','请','帮','用',
    '一个','什么','怎么','如何','哪个','哪些','以及','把',
    '被','到','从','为','以','于','而且','但是','的话'
  ]);
  const keywords = new Set();
  const clean = text.replace(/[^\w\s\u4e00-\u9fff]/g, ' ').replace(/\s+/g, ' ').trim();

  const cnCount = (clean.match(/[\u4e00-\u9fff]/g) || []).length;
  const enCount = (clean.match(/[a-zA-Z]/g) || []).length;

  if (cnCount >= enCount) {
    // Chinese-dominant: extract n-grams
    const chars = clean.match(/[\u4e00-\u9fff]/g) || [];
    for (let i = 0; i <= chars.length - 2; i++) {
      const bigram = chars.slice(i, i + 2).join('');
      if (!STOPWORDS_CN.has(bigram) && bigram.length >= 2) keywords.add(bigram);
    }
    for (let i = 0; i <= chars.length - 3; i++) {
      const trigram = chars.slice(i, i + 3).join('');
      if (!STOPWORDS_CN.has(trigram)) keywords.add(trigram);
    }
    for (let i = 0; i <= chars.length - 4; i++) {
      keywords.add(chars.slice(i, i + 4).join(''));
    }
    // Also extract English words
    const enWords = clean.match(/[a-zA-Z]+/g) || [];
    for (const w of enWords) {
      const lower = w.toLowerCase();
      if (lower.length >= 3 && !STOPWORDS_EN.has(lower)) keywords.add(lower);
    }
  } else {
    // English-dominant
    const words = clean.toLowerCase().split(/\s+/);
    for (const w of words) {
      if (w.length >= 2 && !STOPWORDS_EN.has(w) && !/^\d+$/.test(w)) {
        keywords.add(w);
      }
    }
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = words[i] + ' ' + words[i + 1];
      if (bigram.length >= 6) keywords.add(bigram);
    }
  }
  return [...keywords];
}

// Main recommendation function
function recommend(capabilities, query, opts) {
  opts = opts || {};
  const limit = parseInt(opts.limit) || 5;
  const minScore = parseInt(opts.minScore) || 1;

  const queryKeywords = extractKeywords(query);

  if (queryKeywords.length === 0) {
    return { items: [], total: 0, query, message: 'No keywords extracted.' };
  }

  const scored = capabilities.map(cap => {
    const result = scoreCapability(cap, queryKeywords);
    return {
      capability: cap,
      score: result.score,
      reasons: result.reasons,
      matchedKeywords: result.matchedKeywords
    };
  }).filter(r => r.score >= minScore && r.matchedKeywords > 0)
    .sort((a, b) => b.score - a.score);

  const top = scored.slice(0, limit);
  const message = top.length === 0
    ? 'No matching capabilities found. Try more descriptive keywords.'
    : 'Found ' + top.length + ' matching capabilities.';

  return {
    items: top,
    total: scored.length,
    query,
    keywords: queryKeywords,
    message,
    accuracy: top.length >= 3 ? {
      top3HitRate: Math.round((top.slice(0, 3).filter(i => i.matchedKeywords >= 1).length / 3) * 100) + '%'
    } : null
  };
}

// Intent analysis
function analyzeIntent(query) {
  const q = query.toLowerCase();
  const intents = [];

  const patterns = [
    { intent: 'weather', keywords: ['weather','天气','forecast','气象'], weight: 3 },
    { intent: 'ai_capability', keywords: ['ai','gpt','llm','大模型','chatgpt','claude','openai','生成','translation','translate'], weight: 3 },
    { intent: 'file_ops', keywords: ['文件','read','write','file','read file','write file','读取','写入'], weight: 2 },
    { intent: 'web_search', keywords: ['search','find','look','查找','找','搜索'], weight: 2 },
    { intent: 'browser_automation', keywords: ['browser','web','scrape','browser automation','截图','screenshot','抓取'], weight: 2 },
    { intent: 'notification', keywords: ['notify','alert','message','提醒','通知','发消息'], weight: 2 },
    { intent: 'social', keywords: ['email','邮件','slack','wechat','微信','社交','send email'], weight: 2 },
    { intent: 'database', keywords: ['database','db','存储','storage','mongodb','mysql'], weight: 2 },
    { intent: 'schedule', keywords: ['schedule','cron','定时','调度','日程','会议','calendar'], weight: 2 },
    { intent: 'media', keywords: ['image','video','audio','图片','tts','语音合成'], weight: 2 },
    { intent: 'api_call', keywords: ['api','http','请求','fetch','call','获取数据','调用'], weight: 2 }
  ];

  let bestIntent = null;
  let bestScore = 0;

  for (const p of patterns) {
    let matchCount = 0;
    for (const kw of p.keywords) {
      if (q.includes(kw)) matchCount++;
    }
    const intentScore = matchCount * p.weight;
    if (intentScore > bestScore) {
      bestScore = intentScore;
      bestIntent = p.intent;
    }
    if (matchCount > 0) {
      intents.push({ intent: p.intent, score: intentScore, matched: matchCount });
    }
  }

  return {
    primary: bestIntent,
    all: intents.sort((a, b) => b.score - a.score),
    raw: q
  };
}

module.exports = { recommend, extractKeywords, scoreCapability, analyzeIntent };
