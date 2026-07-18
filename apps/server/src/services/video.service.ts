import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

export const VideoService = {
  /**
   * Get metadata of a video file
   */
  getMetadata: (filePath: string): Promise<ffmpeg.FfprobeData> => {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata);
      });
    });
  },

  /**
   * Generate a thumbnail from a video
   */
  generateThumbnail: (filePath: string, outputDir: string, fileName: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .screenshots({
          timestamps: ['10%'],
          filename: fileName,
          folder: outputDir,
          size: '640x360'
        })
        .on('end', () => resolve(path.join(outputDir, fileName)))
        .on('error', (err) => reject(err));
    });
  },

  /**
   * Concatenate multiple videos
   */
  mergeVideos: (videoPaths: string[], outputPath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const command = ffmpeg();
      videoPaths.forEach(p => command.input(p));
      
      command
        .on('error', (err) => reject(err))
        .on('end', () => resolve())
        .mergeToFile(outputPath, path.dirname(outputPath));
    });
  },

  /**
   * Export a project based on timeline data
   * (Simplified version: just merges clips for now)
   */
  exportProject: async (clips: { path: string, start: number, end: number }[], outputPath: string) => {
    // This is complex and usually requires a filter_complex string
    // For now, we'll implement a basic sequence merge
    return new Promise((resolve, reject) => {
      let command = ffmpeg();

      clips.forEach((clip, index) => {
        command = command.input(clip.path).seekInput(clip.start).duration(clip.end - clip.start);
      });

      command
        .on('error', (err) => reject(err))
        .on('end', () => resolve(outputPath))
        .mergeToFile(outputPath, path.dirname(outputPath));
    });
  }
};
