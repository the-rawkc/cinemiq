import fs from 'fs';
import path from 'path';
import axios from 'axios';
import OpenAI from 'openai';
import { RenderProject, RenderClip } from '../core/ffmpeg/CommandBuilder';

let openaiClient: OpenAI | null = null;
function getOpenAI() {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openaiClient;
}

interface ScenePlan {
  keywords: string;
  narration: string;
  caption: string;
  duration: number;
}

export class AIOrchestratorService {
  static async generateTimeline(prompt: string): Promise<RenderProject> {
    console.log(`🧠 AI Orchestrator generating timeline for prompt: "${prompt}"`);

    // 1. Script Planning
    let scenes: ScenePlan[] = [];
    const openai = getOpenAI();

    if (openai) {
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `You are an expert video director. Plan a 3-scene video based on the prompt.
              For each scene, output keywords for image/video search, narration speech text, overlay caption, and duration.
              Return ONLY a JSON array matching: [{"keywords": "...", "narration": "...", "caption": "...", "duration": 4}]`
            },
            { role: 'user', content: prompt }
          ]
        });

        const content = response.choices[0].message.content || '[]';
        scenes = JSON.parse(content.trim());
      } catch (err) {
        console.error('LLM timeline planning failed, falling back to mock scenes.', err);
        scenes = this.getMockScenes(prompt);
      }
    } else {
      console.log('OpenAI key missing. Generating timeline with mock scenes.');
      scenes = this.getMockScenes(prompt);
    }

    // Ensure scenes structure is valid
    if (!Array.isArray(scenes) || scenes.length === 0) {
      scenes = this.getMockScenes(prompt);
    }

    const clips: RenderClip[] = [];
    let currentOffset = 0;

    // Create tracks structure
    // Track order: v2 (Text subtitles), v1 (Videos/Images base), a1 (Speech voiceover), a2 (Ambient audio loop)

    // 2. Process each scene
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const keywords = scene.keywords || 'space nebula rocket stars';
      const narration = scene.narration || 'A cinematic vision of creativity.';
      const caption = scene.caption || 'Cinemiq Studio';
      const duration = scene.duration || 4;
      const clipId = `ai-clip-${i}-${Date.now().toString(36)}`;

      // A. Visual Clip Asset generation / stock search
      let sourceUrl = 'http://localhost:5000/uploads/default_fallback.mp4'; // fallback
      let clipType: 'video' | 'image' = 'video';

      try {
        // Retrieve image from Pollinations (Flux model)
        const seed = Math.floor(Math.random() * 99999);
        const encodedPrompt = encodeURIComponent(`${keywords}, cinematic widescreen shot, 8k resolution, photorealistic`);
        const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1280&height=720&seed=${seed}&model=flux&nologo=true`;

        // Pre-fetch/download the file locally to upload dir for rendering stability
        const imageDir = path.resolve(process.cwd(), 'uploads');
        if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });

        const filename = `ai-image-${i}-${Date.now()}.jpg`;
        const localPath = path.join(imageDir, filename);

        const response = await axios.get(pollinationsUrl, {
          responseType: 'arraybuffer',
          timeout: 10000
        });

        fs.writeFileSync(localPath, Buffer.from(response.data));
        sourceUrl = `http://localhost:5000/uploads/${filename}`;
        clipType = 'image';
        console.log(`🎨 Generated and cached image frame for Scene ${i + 1}`);
      } catch (err) {
        console.log(`⚠️ Scene ${i + 1} image generation failed, using sample stock video clip.`);
      }

      clips.push({
        id: clipId,
        type: clipType,
        name: `Scene ${i + 1} - ${keywords.slice(0, 15)}`,
        trackId: 'v1',
        offset: currentOffset,
        duration: duration,
        source: sourceUrl,
        start: 0,
        volume: 1.0,
        speed: 1.0,
        muted: false,
        transform: { x: 0, y: 0, scaleX: 1.0, scaleY: 1.0, rotation: 0, opacity: 1.0 },
        effects: []
      });

      // B. Speech Voiceover Synthesis (TTS)
      let voiceUrl = 'http://localhost:5000/uploads/silent.mp3'; // Fallback
      if (openai) {
        try {
          const ttsResponse = await openai.audio.speech.create({
            model: 'tts-1',
            voice: 'alloy',
            input: narration
          });

          const buffer = Buffer.from(await ttsResponse.arrayBuffer());
          const filename = `ai-tts-${i}-${Date.now()}.mp3`;
          const localPath = path.resolve(process.cwd(), 'uploads', filename);

          fs.writeFileSync(localPath, buffer);
          voiceUrl = `http://localhost:5000/uploads/${filename}`;
          console.log(`🔊 Synthesized speech voiceover for Scene ${i + 1}`);
        } catch (err) {
          console.log(`⚠️ Scene ${i + 1} TTS failed.`);
        }
      }

      clips.push({
        id: `ai-audio-tts-${i}-${Date.now().toString(36)}`,
        type: 'audio',
        name: `Voiceover ${i + 1}`,
        trackId: 'a1',
        offset: currentOffset,
        duration: duration,
        source: voiceUrl,
        start: 0,
        volume: 1.0,
        speed: 1.0,
        muted: false,
        effects: []
      });

      // C. Subtitle overlay caption
      clips.push({
        id: `ai-text-${i}-${Date.now().toString(36)}`,
        type: 'text',
        name: `Caption ${i + 1}`,
        trackId: 'v2',
        offset: currentOffset,
        duration: duration,
        source: '',
        start: 0,
        volume: 0,
        speed: 1.0,
        muted: true,
        textConfig: {
          content: caption,
          fontSize: 24,
          color: '#ffffff',
          fontFamily: 'Outfit',
          bold: true,
          italic: false,
          alignment: 'center' as const,
          x: 50,
          y: 80 // subtitle placement
        },
        effects: []
      });

      currentOffset += duration;
    }

    // Add general ambient music loop spanning the entire duration
    clips.push({
      id: `ambient-loop-${Date.now().toString(36)}`,
      type: 'audio',
      name: 'Ambient Soundtrack Loop.mp3',
      trackId: 'a2',
      offset: 0,
      duration: currentOffset,
      source: 'http://localhost:5000/uploads/music2.mp3',
      start: 0,
      volume: 0.25, // background sound volume
      speed: 1.0,
      muted: false,
      effects: []
    });

    const project: RenderProject = {
      id: `ai-project-${Date.now()}`,
      name: `AI: ${prompt.slice(0, 20)}`,
      resolution: { width: 1280, height: 720 },
      fps: 30,
      tracks: [
        { id: 'v2', type: 'video', name: 'Subtitles Overlay', muted: false, locked: false, order: 2 },
        { id: 'v1', type: 'video', name: 'Video Timeline', muted: false, locked: false, order: 1 },
        { id: 'a1', type: 'audio', name: 'Voiceover Synthesis', muted: false, locked: false, order: 3 },
        { id: 'a2', type: 'audio', name: 'Ambient Soundtrack', muted: false, locked: false, order: 4 }
      ],
      clips
    };

    return project;
  }

  private static getMockScenes(prompt: string): ScenePlan[] {
    return [
      {
        keywords: 'space nebula rocket stars galaxy orbit',
        narration: 'Space, the final frontier of cinematic design.',
        caption: 'Space: The Final Frontier',
        duration: 4
      },
      {
        keywords: 'astronaut floating zero gravity spaceship planet earth',
        narration: 'Floating amidst a universe of silent, editable timelines.',
        caption: 'Editable Multi-Track Workspaces',
        duration: 5
      },
      {
        keywords: 'futuristic dashboard sci-fi warp hyperdrive speed',
        narration: 'Preparing to hyperjump into advanced AI filters rendering.',
        caption: 'Ready for FFmpeg Video Export',
        duration: 4
      }
    ];
  }
}
export default AIOrchestratorService;
