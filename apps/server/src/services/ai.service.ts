import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import axios from 'axios';
import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

function getOpenAI() {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openaiClient;
}

interface Scene {
  keywords: string;
  description: string;
  duration: number;
}

export async function freesoundSearch(query: string) {
  try {
    const apiKey = process.env.FREESOUND_API_KEY;
    if (!apiKey) throw new Error('Freesound API key missing');

    const response = await axios.get(`https://freesound.org/apiv2/search/text/`, {
      params: {
        query,
        token: apiKey,
        fields: 'id,name,previews,duration,description',
        page_size: 15
      }
    });

    return response.data.results.map((s: any) => ({
      id: s.id,
      name: s.name,
      url: s.previews['preview-lq-mp3'],
      duration: s.duration,
      description: s.description
    }));
  } catch (error) {
    console.error('Freesound Search Error:', error);
    return [];
  }
}

export async function giphySearch(query: string, type: 'gifs' | 'stickers' = 'gifs') {
  try {
    const apiKey = process.env.GIPHY_API_KEY;
    if (!apiKey) throw new Error('Giphy API key missing');

    const response = await axios.get(`https://api.giphy.com/v1/${type}/search`, {
      params: {
        api_key: apiKey,
        q: query,
        limit: 20,
        rating: 'g'
      }
    });

    return response.data.data.map((g: any) => ({
      id: g.id,
      title: g.title,
      url: g.images.fixed_height.url,
      preview: g.images.fixed_height_small.url
    }));
  } catch (error) {
    console.error('Giphy Search Error:', error);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  INTELLIGENCE LAYER: OpenAI Prompt Analyzer
//  Converts a vague prompt into specific scene keywords
// ─────────────────────────────────────────────────────────────────────────────
async function analyzePromptForScenes(prompt: string): Promise<Scene[]> {
  try {
    const openai = getOpenAI();
    console.log(`  🧠 AI Analysis for prompt: "${prompt}"...`);
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a cinematic director. Convert the user's video prompt into 3-4 specific visual scenes. 
          For each scene, provide highly specific search keywords for stock video sites.
          Format: JSON array of objects: [{ "keywords": "...", "description": "...", "duration": 3 }]`
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    if (!content) return [];
    const parsed = JSON.parse(content);
    // Handle both { "scenes": [...] } and directly [...]
    return Array.isArray(parsed) ? parsed : (parsed.scenes || []);
  } catch (err: any) {
    console.log(`  ⚠️ AI Analysis failed: ${err.message}. Using fallback keywords.`);
    return [{ keywords: prompt, description: "Main scene", duration: 4 }];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  UTILITY: Broadens a prompt into progressively simpler keywords
// ─────────────────────────────────────────────────────────────────────────────
function buildQueryCandidates(prompt: string): string[] {
  const cleaned = prompt.trim().toLowerCase();
  const words = cleaned.split(/\s+/).filter(w => w.length > 3);

  const stopWords = new Set(['with', 'from', 'that', 'this', 'into', 'over', 'under', 'about', 'have', 'been', 'will', 'your', 'their', 'they', 'what', 'when', 'where', 'which', 'while']);
  const meaningful = words.filter(w => !stopWords.has(w));

  const candidates: string[] = [
    cleaned,                                  // Full prompt
    meaningful.slice(0, 4).join(' '),         // First 4 meaningful words
    meaningful.slice(0, 2).join(' '),         // First 2 meaningful words
    meaningful[0] || 'nature',               // Primary noun
    'cinematic',                              // Generic cinematic
  ];

  // Deduplicate while preserving order
  return [...new Set(candidates)].filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
//  TIER 1: Pollinations.ai – Free, no-key image generation
//  Uses the stable image endpoint with increased timeout + up to 2 retries
// ─────────────────────────────────────────────────────────────────────────────
async function generateImagesWithPollinations(prompt: string, frameCount = 3): Promise<string[]> {
  const imagePaths: string[] = [];
  const seed = Math.floor(Math.random() * 999999);

  const subPrompts = [
    `${prompt}, cinematic wide shot, 8k, photorealistic`,
    `${prompt}, dramatic lighting, golden hour, ultra detailed`,
    `${prompt}, epic establishing shot, anamorphic lens, film grain`,
  ].slice(0, frameCount);

  for (let i = 0; i < subPrompts.length; i++) {
    const encodedPrompt = encodeURIComponent(subPrompts[i]);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1280&height=720&seed=${seed + i}&model=flux&nologo=true`;
    const imagePath = path.resolve(process.cwd(), 'uploads', `frame-${Date.now()}-${i}.jpg`);

    let success = false;
    for (let attempt = 0; attempt < 3 && !success; attempt++) {
      try {
        process.stdout.write(`  🎨 Frame ${i + 1}/${subPrompts.length} (attempt ${attempt + 1})... `);
        const response = await axios({
          method: 'get',
          url,
          responseType: 'arraybuffer',
          timeout: 12000, // 12s — Reduced for speed
        });

        // Validate we actually got an image (not an error HTML page)
        const contentType = response.headers['content-type'] || '';
        if (!contentType.includes('image')) {
          throw new Error(`Non-image response: ${contentType}`);
        }

        fs.writeFileSync(imagePath, Buffer.from(response.data));
        imagePaths.push(imagePath);
        success = true;
        process.stdout.write(`✅\n`);
      } catch (err: any) {
        process.stdout.write(`❌\n`);
        if (attempt < 1) await new Promise(r => setTimeout(r, 1000)); // fast backoff
      }
    }
  }

  return imagePaths;
}
// ─────────────────────────────────────────────────────────────────────────────
//  FREEPIK / MAGNIFIC: High-quality AI Generation
// ─────────────────────────────────────────────────────────────────────────────
async function generateImagesWithFreepik(prompt: string, frameCount = 2): Promise<string[]> {
  const apiKey = process.env.FREEPIK_API_KEY;
  if (!apiKey) return [];

  const imagePaths: string[] = [];
  
  for (let i = 0; i < frameCount; i++) {
    try {
      console.log(`  🎨 [Freepik] Starting frame ${i+1}/${frameCount}...`);
      
      // 1. Submit Task
      const submitRes = await axios.post('https://api.freepik.com/v1/ai/text-to-image/flux-1-dev', {
        prompt: `${prompt}, ultra cinematic, 8k, photorealistic, cinematic lighting`,
        aspect_ratio: 'landscape_16_9',
        num_images: 1
      }, {
        headers: { 'x-freepik-api-key': apiKey, 'Content-Type': 'application/json' },
        timeout: 10000
      });

      const taskId = submitRes.data.data?.[0]?.task_id;
      if (!taskId) continue;

      // 2. Poll for Result (max 30s)
      let imageUrl = null;
      for (let poll = 0; poll < 10; poll++) {
        await new Promise(r => setTimeout(r, 3000));
        const statusRes = await axios.get(`https://api.freepik.com/v1/ai/tasks/${taskId}`, {
          headers: { 'x-freepik-api-key': apiKey }
        });
        
        const status = statusRes.data.data?.status;
        if (status === 'COMPLETED') {
          imageUrl = statusRes.data.data?.results?.[0]?.url;
          break;
        }
        if (status === 'FAILED') break;
      }

      if (imageUrl) {
        const imagePath = path.resolve(process.cwd(), 'uploads', `freepik-${Date.now()}-${i}.jpg`);
        const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(imagePath, Buffer.from(imgRes.data));
        imagePaths.push(imagePath);
        console.log(`  ✅ [Freepik] Frame ${i+1} ready.`);
      }
    } catch (err: any) {
      console.log(`  ⚠️ [Freepik] Error: ${err.message}`);
    }
  }
  return imagePaths;
}

// ─────────────────────────────────────────────────────────────────────────────
//  UNSPLASH: Real-world high-quality photography slideshow
// ─────────────────────────────────────────────────────────────────────────────
async function generateImagesWithUnsplash(prompt: string, frameCount = 3): Promise<string[]> {
  const apiKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!apiKey) return [];

  const queries = buildQueryCandidates(prompt);
  const searchTerms = queries[0] || 'cinematic';
  
  const imagePaths: string[] = [];
  try {
    console.log(`  🔍 [Unsplash] Searching for: "${searchTerms}"`);
    const res = await axios.get('https://api.unsplash.com/search/photos', {
      headers: { Authorization: `Client-ID ${apiKey}` },
      params: { query: searchTerms, per_page: frameCount, orientation: 'landscape' },
      timeout: 8000
    });

    const photos = res.data.results;
    if (photos && photos.length > 0) {
      for (let i = 0; i < photos.length; i++) {
        const url = photos[i].urls.regular;
        const imagePath = path.resolve(process.cwd(), 'uploads', `unsplash-${Date.now()}-${i}.jpg`);
        const imgRes = await axios.get(url, { responseType: 'arraybuffer' });
        fs.writeFileSync(imagePath, Buffer.from(imgRes.data));
        imagePaths.push(imagePath);
      }
      console.log(`  ✅ [Unsplash] ${imagePaths.length} photos ready.`);
    }
  } catch (err: any) {
    console.log(`  ⚠️ [Unsplash] Error: ${err.message}`);
  }
  return imagePaths;
}

// ─────────────────────────────────────────────────────────────────────────────
//  LIBRARY PROVIDERS — Each returns { url, source } or null
//  All three are called in PARALLEL — first match wins.
// ─────────────────────────────────────────────────────────────────────────────

interface VideoResult {
  url: string;
  source: 'pexels' | 'pixabay' | 'coverr' | 'vecteezy' | 'archive' | 'pollinations' | 'freepik' | 'unsplash' | 'smart-reel' | 'fallback';
}

/** PROVIDER 1: Pexels (existing) */
async function searchPexels(queries: string[]): Promise<VideoResult | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) { console.log('  [Pexels] No API key — skipping.'); return null; }

  for (const query of queries) {
    try {
      const res = await axios.get('https://api.pexels.com/videos/search', {
        headers: { Authorization: apiKey },
        params: { query, per_page: 5, orientation: 'landscape' },
        timeout: 8000,
      });
      const videos = res.data.videos;
      if (videos?.length > 0) {
        const hdFile = videos[0].video_files?.find((f: any) => f.quality === 'hd') || videos[0].video_files?.[0];
        if (hdFile?.link) {
          console.log(`  ✅ [Pexels] Hit for: "${query}"`);
          return { url: hdFile.link, source: 'pexels' };
        }
      }
    } catch { /* try next query */ }
  }

  // Fallback to Pexels popular
  try {
    const res = await axios.get('https://api.pexels.com/videos/popular', {
      headers: { Authorization: apiKey },
      params: { per_page: 3 },
      timeout: 8000,
    });
    const videos = res.data.videos;
    if (videos?.length > 0) {
      const pick = videos[Math.floor(Math.random() * videos.length)];
      const file = pick.video_files?.find((f: any) => f.quality === 'hd') || pick.video_files?.[0];
      if (file?.link) {
        console.log('  ✅ [Pexels] Using trending video.');
        return { url: file.link, source: 'pexels' };
      }
    }
  } catch { /* silent */ }

  return null;
}

/** PROVIDER 2: Pixabay — Free, 2M+ videos, requires free API key */
async function searchPixabay(queries: string[]): Promise<VideoResult | null> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) { console.log('  [Pixabay] No API key — skipping. Get one free at pixabay.com/api/'); return null; }

  for (const query of queries) {
    try {
      const res = await axios.get('https://pixabay.com/api/videos/', {
        params: { key: apiKey, q: query, per_page: 5, video_type: 'film' },
        timeout: 8000,
      });
      const hits = res.data.hits;
      if (hits?.length > 0) {
        // Prefer medium (720p), fall back to small
        const hit = hits[Math.floor(Math.random() * hits.length)]; // add variety with random pick
        const file = hit.videos?.medium?.url || hit.videos?.small?.url || hit.videos?.large?.url;
        if (file) {
          console.log(`  ✅ [Pixabay] Hit for: "${query}"`);
          return { url: file, source: 'pixabay' };
        }
      }
    } catch { /* try next query */ }
  }
  return null;
}

/** PROVIDER 3: Coverr — 3K+ curated cinematic clips, free */
async function searchCoverr(queries: string[]): Promise<VideoResult | null> {
  const apiKey = process.env.COVERR_API_KEY;
  // Coverr supports unauthenticated public access for basic queries
  const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  for (const query of queries) {
    try {
      const res = await axios.get('https://api.coverr.co/videos', {
        headers,
        params: { keywords: query, page: 1 },
        timeout: 8000,
      });
      const hits = res.data.hits;
      if (hits?.length > 0) {
        const hit = hits[Math.floor(Math.random() * Math.min(hits.length, 5))];
        // Coverr provides mp4 URLs in the "urls" object
        const file = hit?.urls?.mp4_download || hit?.urls?.mp4 || hit?.mp4;
        if (file) {
          console.log(`  ✅ [Coverr] Hit for: "${query}"`);
          return { url: file, source: 'coverr' };
        }
      }
    } catch { /* try next query */ }
  }
  return null;
}

/** PROVIDER 4: Archive.org — Massive public domain library, NO KEY REQUIRED */
async function searchArchiveOrg(queries: string[]): Promise<VideoResult | null> {
  for (const query of queries) {
    try {
      // Search for movies matching the query
      const searchUrl = `https://archive.org/services/search/v1/scrape?q=${encodeURIComponent(query)} AND mediatype:movies&fields=identifier,title&count=5`;
      const searchRes = await axios.get(searchUrl, { timeout: 8000 });
      
      const items = searchRes.data.items;
      if (items && items.length > 0) {
        // Pick a random item from the results
        const item = items[Math.floor(Math.random() * items.length)];
        const identifier = item.identifier;

        // Get metadata for this item to find the MP4 file
        const metadataUrl = `https://archive.org/metadata/${identifier}`;
        const metadataRes = await axios.get(metadataUrl, { timeout: 5000 });
        
        const files = metadataRes.data.files;
        if (files && files.length > 0) {
          // Find the first MP4 file
          const mp4File = files.find((f: any) => f.name.endsWith('.mp4') && f.format === 'MPEG4');
          if (mp4File) {
            const fileUrl = `https://archive.org/download/${identifier}/${mp4File.name}`;
            console.log(`  ✅ [Archive.org] Hit for: "${query}"`);
            return { url: fileUrl, source: 'archive' };
          }
        }
      }
    } catch (err: any) {
      // Continue to next query if one fails
    }
  }
  return null;
}

/** PROVIDER 5: Vecteezy — High-quality videos and vectors */
async function searchVecteezy(queries: string[]): Promise<VideoResult | null> {
  const apiKey = process.env.VECTEEZY_API_KEY;
  if (!apiKey) return null;

  for (const query of queries) {
    try {
      console.log(`  🔍 [Vecteezy] Attempting: "${query}"...`);
      const res = await axios.get('https://api.vecteezy.com/v1/resources/search', {
        headers: { 'v-api-key': apiKey },
        params: { q: query, resource_type: 'video', per_page: 5 },
        timeout: 8000
      });

      const items = res.data.items;
      if (items && items.length > 0) {
        const item = items[Math.floor(Math.random() * items.length)];
        const file = item.video_files?.[0]?.link || item.preview_video_url;
        if (file) {
          console.log(`  ✅ [Vecteezy] Hit for: "${query}"`);
          return { url: file, source: 'vecteezy' };
        }
      }
    } catch { /* next */ }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  PARALLEL LIBRARY SEARCH — Queries all providers simultaneously
//  First provider to return a result wins. Logged clearly for debugging.
// ─────────────────────────────────────────────────────────────────────────────
async function searchAllLibraries(prompt: string): Promise<VideoResult | null> {
  const queries = buildQueryCandidates(prompt);
  console.log(`\n  📚 Searching libraries in parallel for: [${queries.slice(0, 3).join(' → ')}]`);
  console.log('  Providers: Pexels | Pixabay | Coverr | Vecteezy | Archive.org');

  try {
    // Promise.any() — resolves with the FIRST non-null result
    const result = await Promise.any([
      searchPexels(queries).then(r => { if (!r) throw new Error('no result'); return r; }),
      searchPixabay(queries).then(r => { if (!r) throw new Error('no result'); return r; }),
      searchCoverr(queries).then(r => { if (!r) throw new Error('no result'); return r; }),
      searchVecteezy(queries).then(r => { if (!r) throw new Error('no result'); return r; }),
      searchArchiveOrg(queries).then(r => { if (!r) throw new Error('no result'); return r; }),
    ]);
    return result;
  } catch {
    // All providers exhausted
    console.log('  ⚠️ All parallel providers returned no results. Using curated fallback.');
    return null;
  }
}



// ─────────────────────────────────────────────────────────────────────────────
//  FFMPEG: Stitch image frames into an MP4
//  Uses multi-input filter_complex instead of the concat demuxer because
//  the concat demuxer is unreliable with Windows absolute paths (exit code 69).
// ─────────────────────────────────────────────────────────────────────────────
async function stitchFramesToVideo(imagePaths: string[], durationPerFrame = 4): Promise<string> {
  const videoName = `ai-gen-${Date.now()}.mp4`;
  const videoPath = path.resolve(process.cwd(), 'uploads', videoName);

  // Validate each image before stitching — skip zero-byte or tiny files
  const validPaths = imagePaths.filter(p => {
    try {
      const stat = fs.statSync(p);
      if (stat.size < 1024) { // less than 1KB = likely an error page
        console.log(`  ⚠️ Skipping invalid image (${stat.size} bytes): ${path.basename(p)}`);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  });

  if (validPaths.length === 0) {
    throw new Error('No valid image frames to stitch — all downloads were empty or corrupt.');
  }

  console.log(`  🎞️ Stitching ${validPaths.length} valid frames into video...`);

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();

    // Add each image as a looped input with explicit duration
    validPaths.forEach(imgPath => {
      cmd
        .input(imgPath)
        .inputOptions(['-loop 1', `-t ${durationPerFrame}`]);
    });

    // Build filter_complex: scale each input to 1280x720, then concat
    const n = validPaths.length;
    const scaleFilters = validPaths.map((_, i) =>
      `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`
    ).join(';');
    const concatInputs = validPaths.map((_, i) => `[v${i}]`).join('');
    const filterComplex = `${scaleFilters};${concatInputs}concat=n=${n}:v=1:a=0[outv]`;

    cmd
      .complexFilter(filterComplex)
      .outputOptions([
        '-map [outv]',
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-crf 22',
        '-preset fast',
        '-movflags +faststart',
        '-y',
      ])
      .on('start', (cmdLine: string) => {
        console.log(`  ▶ FFmpeg started`);
      })
      .on('error', (err: Error) => {
        console.error(`  ❌ FFmpeg error: ${err.message}`);
        validPaths.forEach(img => { if (fs.existsSync(img)) fs.unlinkSync(img); });
        reject(err);
      })
      .on('end', () => {
        console.log(`  ✅ FFmpeg done → ${videoName}`);
        validPaths.forEach(img => { if (fs.existsSync(img)) fs.unlinkSync(img); });
        resolve(`/uploads/${videoName}`);
      })
      .save(videoPath);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  SMART REEL: Multi-clip Assembly
// ─────────────────────────────────────────────────────────────────────────────
async function assembleMultipleClips(clipUrls: string[]): Promise<string> {
  const videoName = `smart-reel-${Date.now()}.mp4`;
  const videoPath = path.resolve(process.cwd(), 'uploads', videoName);
  
  // We'll download the clips first to have local files for FFmpeg
  const localClips: string[] = [];
  for (let i = 0; i < clipUrls.length; i++) {
    try {
      const clipPath = path.resolve(process.cwd(), 'uploads', `clip-temp-${Date.now()}-${i}.mp4`);
      const res = await axios.get(clipUrls[i], { responseType: 'arraybuffer', timeout: 15000 });
      fs.writeFileSync(clipPath, Buffer.from(res.data));
      localClips.push(clipPath);
    } catch (err) {
      console.log(`  ⚠️ Failed to download clip ${i}: ${clipUrls[i]}`);
    }
  }

  if (localClips.length === 0) throw new Error('No clips could be downloaded for assembly');

  return new Promise((resolve, reject) => {
    let command = ffmpeg();
    localClips.forEach(clip => { command = command.input(clip); });

    command
      .complexFilter([
        // Complex filter to scale and pad all clips to 1280x720 and then concat
        ...localClips.map((_, i) => `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`),
        localClips.map((_, i) => `[v${i}]`).join('') + `concat=n=${localClips.length}:v=1:a=0[outv]`
      ])
      .map('[outv]')
      .videoCodec('libx264')
      .outputOptions(['-pix_fmt yuv420p', '-crf 23', '-preset fast'])
      .on('error', (err) => {
        localClips.forEach(c => { if (fs.existsSync(c)) fs.unlinkSync(c); });
        reject(err);
      })
      .on('end', () => {
        localClips.forEach(c => { if (fs.existsSync(c)) fs.unlinkSync(c); });
        resolve(`/uploads/${videoName}`);
      })
      .save(videoPath);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN SERVICE EXPORT
// ─────────────────────────────────────────────────────────────────────────────

async function generateSmartReel(userPrompt: string): Promise<VideoResult> {
  console.log(`\n${'🚀'.repeat(30)}`);
  console.log(`🎬 SMART REEL PRODUCTION: "${userPrompt}"`);
  console.log(`${'🚀'.repeat(30)}`);

  // 1. Planning Layer
  const scenes = await analyzePromptForScenes(userPrompt);
  console.log(`\n  📋 Director's Script: Found ${scenes.length} scenes.`);

  const clipResults: string[] = [];

  // 2. Scavenger Layer (Sequential to avoid massive bursts, but fast)
  for (const scene of scenes) {
    console.log(`\n  🎬 Searching for Scene: "${scene.description}"...`);
    const queries = buildQueryCandidates(scene.keywords);
    const result = await searchAllLibraries(scene.keywords);
    
    if (result) {
      clipResults.push(result.url);
    } else {
      // HYBRID MODE: If no stock found, generate 1 frame via AI
      console.log(`  ✨ No stock found. Using AI Hybrid for this scene...`);
      const frames = await generateImagesWithPollinations(scene.keywords, 1);
      if (frames.length > 0) {
        const aiVideo = await stitchFramesToVideo(frames, 3);
        clipResults.push(`http://localhost:5000${aiVideo}`);
      }
    }
  }

  if (clipResults.length === 0) {
    throw new Error("Could not find any cinematic clips for this reel.");
  }

  // 3. Assembly Layer
  console.log(`\n  🎞️ Assembling ${clipResults.length} clips into final production...`);
  const finalReelUrl = await assembleMultipleClips(clipResults);

  console.log(`\n✨ SMART REEL COMPLETE: ${finalReelUrl}`);
  return { url: finalReelUrl, source: 'smart-reel' };
}

async function generateVideoFromPrompt(userPrompt: string): Promise<VideoResult[]> {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🎬 MASSIVE MULTI-GEN REQUEST: "${userPrompt}"`);
  console.log(`${'═'.repeat(60)}`);

  const results: VideoResult[] = [];
  const queries = buildQueryCandidates(userPrompt);
  
  // ── MASSIVE PARALLEL EXECUTION ──────────────────────────────
  console.log('\n[PARALLEL] Triggering all cinematic engines simultaneously...');

  const tasks = [
    // 1. Intelligence Layer
    (async () => {
      try {
        const res = await generateSmartReel(userPrompt);
        if (res) console.log('  ✅ [Task] Smart Reel completed.');
        return res;
      } catch (e: any) { 
        console.log(`  ❌ [Task] Smart Reel failed: ${e.message}`); 
        return null; 
      }
    })(),

    // 2. Pro AI Gen
    (async () => {
      try {
        const imagePaths = await generateImagesWithFreepik(userPrompt, 2);
        if (imagePaths.length >= 2) {
          const url = await stitchFramesToVideo(imagePaths, 3);
          console.log('  ✅ [Task] Freepik Gen completed.');
          return { url, source: 'freepik' as const };
        }
        console.log('  ⚠️ [Task] Freepik Gen: No images returned.');
        return null;
      } catch (e: any) { 
        console.log(`  ❌ [Task] Freepik Gen failed: ${e.message}`); 
        return null; 
      }
    })(),

    // 3. Standard AI Gen
    (async () => {
      try {
        const imagePaths = await generateImagesWithPollinations(userPrompt, 2);
        if (imagePaths.length >= 2) {
          const url = await stitchFramesToVideo(imagePaths, 3);
          console.log('  ✅ [Task] Pollinations Std Gen completed.');
          return { url, source: 'pollinations' as const };
        }
        return null;
      } catch (e: any) { return null; }
    })(),

    // 4. Cinematic AI Gen (Pollinations Variant)
    (async () => {
      try {
        const imagePaths = await generateImagesWithPollinations(`${userPrompt}, cinematic, 8k, highly detailed, masterpiece`, 2);
        if (imagePaths.length >= 2) {
          const url = await stitchFramesToVideo(imagePaths, 3);
          console.log('  ✅ [Task] Pollinations Cinematic completed.');
          return { url, source: 'pollinations' as const };
        }
        return null;
      } catch (e: any) { return null; }
    })(),

    // 4. Real World Photos
    (async () => {
      try {
        const imagePaths = await generateImagesWithUnsplash(userPrompt, 3);
        if (imagePaths.length >= 2) {
          const url = await stitchFramesToVideo(imagePaths, 3);
          console.log('  ✅ [Task] Unsplash Gen completed.');
          return { url, source: 'unsplash' as const };
        }
        console.log('  ⚠️ [Task] Unsplash Gen: No images returned.');
        return null;
      } catch (e: any) { 
        console.log(`  ❌ [Task] Unsplash Gen failed: ${e.message}`); 
        return null; 
      }
    })(),

    // 5. Individual Library Searches
    searchPexels(queries).then(r => { if(r) console.log('  ✅ [Task] Pexels match found.'); return r; }),
    searchCoverr(queries).then(r => { if(r) console.log('  ✅ [Task] Coverr match found.'); return r; }),
    searchVecteezy(queries).then(r => { if(r) console.log('  ✅ [Task] Vecteezy match found.'); return r; }),
    searchPixabay(queries).then(r => { if(r) console.log('  ✅ [Task] Pixabay match found.'); return r; }),
    searchArchiveOrg(queries).then(r => { if(r) console.log('  ✅ [Task] Archive.org match found.'); return r; }),

    // 6. Secondary Library Fallback
    (async () => {
      if (queries.length > 1) {
        const r = await searchPexels([queries[1]]);
        if(r) console.log('  ✅ [Task] Pexels Secondary match found.');
        return r;
      }
      return null;
    })(),
  ];

  const settled = await Promise.allSettled(tasks);
  
  settled.forEach(s => {
    if (s.status === 'fulfilled' && s.value) {
      results.push(s.value as VideoResult);
    }
  });

  const uniqueResults = Array.from(new Map(results.map(item => [item.url, item])).values());

  if (uniqueResults.length === 0) {
    uniqueResults.push({
      url: 'https://player.vimeo.com/external/370331493.sd.mp4?s=7b235af32418e907a04f42d22a59d80c3b0606f2&profile_id=139&oauth2_token_id=57447761',
      source: 'fallback'
    });
  }

  console.log(`\n✅ Generated ${uniqueResults.length} unique cinematic choices.`);
  return uniqueResults;
}

async function stitchImages(files: Express.Multer.File[], options: { duration: number; transition: string; aspectRatio?: string; zoom?: boolean; audioFile?: Express.Multer.File; textOverlay?: string; shapeType?: string; shapeColor?: string; audioUrl?: string; durations?: number[]; zooms?: boolean[]; textOverlays?: string[]; filters?: string[]; intensities?: number[] }) {
  if (!files || files.length === 0) throw new Error('No images uploaded');
  const defaultDuration = options.duration || 3;
  const aspectRatio = options.aspectRatio || '16:9';
  const defaultZoom = options.zoom || false;
  const defaultTextOverlay = options.textOverlay || '';
  const shapeType = options.shapeType || 'none';
  const shapeColor = options.shapeColor || '#3b82f6';
  const finalColor = shapeColor.replace('#', '0x');
  const audioUrl = options.audioUrl || '';

  const videoName = `slideshow-${Date.now()}.mp4`;
  const videoPath = path.resolve(process.cwd(), 'uploads', videoName);
  const imagePaths = files.map(f => path.resolve(process.cwd(), f.path));

  // Determine resolution
  let width = 1280, height = 720;
  if (aspectRatio === '9:16') { width = 720; height = 1280; }
  else if (aspectRatio === '1:1') { width = 720; height = 720; }

  // Map individual options
  const n = imagePaths.length;
  const fileDurations = Array.from({ length: n }).map((_, i) => {
    if (options.durations && options.durations[i] !== undefined) {
      return options.durations[i];
    }
    return defaultDuration;
  });

  const fileZooms = Array.from({ length: n }).map((_, i) => {
    if (options.zooms && options.zooms[i] !== undefined) {
      return options.zooms[i];
    }
    return defaultZoom;
  });

  const fileTexts = Array.from({ length: n }).map((_, i) => {
    if (options.textOverlays && options.textOverlays[i] !== undefined) {
      return options.textOverlays[i];
    }
    return i === 0 ? defaultTextOverlay : '';
  });

  const fileFilters = Array.from({ length: n }).map((_, i) => {
    if (options.filters && options.filters[i] !== undefined) return options.filters[i];
    return 'none';
  });

  const fileIntensities = Array.from({ length: n }).map((_, i) => {
    if (options.intensities && options.intensities[i] !== undefined) return options.intensities[i];
    return 70;
  });

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    imagePaths.forEach((imgPath) => {
      cmd.input(imgPath);
    });

    let hasAudio = false;
    let audioInputIndex = -1;
    if (options.audioFile) {
       cmd.input(path.resolve(process.cwd(), options.audioFile.path));
       hasAudio = true;
       audioInputIndex = imagePaths.length;
    } else if (audioUrl) {
       cmd.input(audioUrl);
       hasAudio = true;
       audioInputIndex = imagePaths.length;
    }

    let stickerInputIndex = -1;
    if (shapeType === 'sticker' && defaultTextOverlay) {
       cmd.input(defaultTextOverlay);
       stickerInputIndex = hasAudio ? imagePaths.length + 1 : imagePaths.length;
    }

    const totalDuration = fileDurations.reduce((sum, d) => sum + d, 0);
    
    // Build filters: Scale, Zoom, and Pad
    let filters = imagePaths.map((_, i) => {
      const d = fileDurations[i];
      const z = fileZooms[i];
      const txt = fileTexts[i];
      const imgFilter = fileFilters[i] || 'none';
      const intensity = Math.max(10, Math.min(100, fileIntensities[i] || 70));
      const inten = intensity / 100; // 0.1 - 1.0

      let f = `[${i}:v]`;
      if (z) {
        f += `scale=2048:-2:force_original_aspect_ratio=increase,zoompan=z='min(zoom+0.001,1.5)':d=${d * 25}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}`;
      } else {
        f += `loop=loop=${d * 25 - 1}:size=1:start=0,setpts=N/25/TB,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
      }

      // Apply per-image visual filters
      if (imgFilter === 'bw') {
        f += `,hue=s=0`;
      } else if (imgFilter === 'underwater') {
        // underwater: bluish grade, increased saturation, subtle blur, contrast and caustic-like boost via eq
        const hueShift = Math.floor(15 * inten); // degrees
        const sat = (1 + 0.5 * inten).toFixed(2);
        const contrast = (1 + 0.12 * inten).toFixed(2);
        const bright = (0.02 * inten).toFixed(3);
        f += `,hue=h=${hueShift}:s=${sat},eq=contrast=${contrast}:brightness=${bright},boxblur=1:1`;
      } else if (imgFilter === 'rain') {
        // rain: desaturate slightly, increase contrast, add subtle blur and vignette
        const satR = (1 - 0.25 * inten).toFixed(2);
        const contrastR = (1 + 0.14 * inten).toFixed(2);
        f += `,eq=contrast=${contrastR}:saturation=${satR},boxblur=1:1,vignette=PI/4:eval=once`;
      }

      if (txt) {
        const escaped = txt.replace(/\\/g, '\\\\').replace(/'/g, "'\\''").replace(/:/g, '\\:');
        f += `,drawtext=text='${escaped}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h-40):shadowcolor=black@0.6:shadowx=2:shadowy=2`;
      }

      return `${f},setsar=1[v${i}]`;
    }).join(';');

    const concatInputs = imagePaths.map((_, i) => `[v${i}]`).join('');
    let filterComplex = `${filters};${concatInputs}concat=n=${n}:v=1:a=0[basev]`;

    // Add Graphic & Text Overlays
    let finalVideoTag = '[basev]';
    if (shapeType === 'rect') {
      filterComplex += `;${finalVideoTag}drawbox=x=(iw-w)/2:y=(ih-h)/2:w=iw/1.5:h=ih/3:color=${finalColor}@0.5:t=fill[shapev]`;
      finalVideoTag = '[shapev]';
    } else if (shapeType === 'circle') {
       filterComplex += `;${finalVideoTag}drawbox=x=(iw-w)/2:y=(ih-h)/2:w=iw/3:h=ih/3:color=${finalColor}@0.5:t=fill[shapev]`;
       finalVideoTag = '[shapev]';
    } else if (shapeType === 'sticker' && stickerInputIndex !== -1) {
       filterComplex += `;[${stickerInputIndex}:v]scale=200:-1[sticker];${finalVideoTag}[sticker]overlay=(W-w)/2:(H-h)/2[shapev]`;
       finalVideoTag = '[shapev]';
    }

    filterComplex += `;${finalVideoTag}copy[outv]`;
    finalVideoTag = '[outv]';

    console.log('🎬 FFmpeg Filter Complex:', filterComplex);
    cmd.complexFilter(filterComplex);

    const outputOptions = [
      '-map [outv]',
      '-c:v libx264',
      '-pix_fmt yuv420p',
      '-crf 22',
      '-preset fast',
      '-movflags +faststart',
      '-y',
    ];

    if (hasAudio) {
       outputOptions.push('-map a:0');
       outputOptions.push('-c:a aac');
       outputOptions.push(`-t ${totalDuration}`); // Ensure audio doesn't exceed video
    }

    cmd
      .outputOptions(outputOptions)
      .on('error', (err: Error) => {
        console.error(`❌ Slideshow FFmpeg error: ${err.message}`);
        reject(err);
      })
      .on('end', () => {
        console.log(`✅ Slideshow ready → ${videoName}`);
        resolve({ url: `/uploads/${videoName}` });
      })
      .save(videoPath);
  });
}

export const AIService = {
  generateVideoFromPrompt,
  generateSmartReel,
  stitchImages,
  generateScript: async (prompt: string) => ({ script: 'Processing...' }),
  transcribeVideo: async (filePath: string) => ({ text: 'Offline.' }),
  generateVoiceover: async (text: string) => ({ url: '' }),
  freesoundSearch,
  giphySearch,
};
