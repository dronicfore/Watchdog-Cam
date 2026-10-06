export interface MotionResult {
  motionScore: number; // 0 to 100
  presenceScore: number; // 0 to 100
  hasMotion: boolean;
  hasPresence: boolean;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
}

export class VisionDetector {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private prevFrameData: Uint8ClampedArray | null = null;
  private width = 96;
  private height = 72;
  private presenceStreak = 0;
  private lastTriggerTime = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  public reset() {
    this.prevFrameData = null;
    this.presenceStreak = 0;
  }

  public analyzeFrame(
    video: HTMLVideoElement,
    threshold: number = 18,
    requiredPresenceFrames: number = 4
  ): MotionResult {
    if (!this.ctx || video.readyState < 2 || video.videoWidth === 0) {
      return {
        motionScore: 0,
        presenceScore: 0,
        hasMotion: false,
        hasPresence: false,
        boundingBox: null,
      };
    }

    // Draw downsampled frame
    this.ctx.drawImage(video, 0, 0, this.width, this.height);
    const imgData = this.ctx.getImageData(0, 0, this.width, this.height);
    const data = imgData.data;

    let changedPixels = 0;
    let skinTonePixels = 0;
    let minX = this.width;
    let minY = this.height;
    let maxX = 0;
    let maxY = 0;

    const totalPixels = this.width * this.height;

    if (this.prevFrameData) {
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const prevR = this.prevFrameData[i];
        const prevG = this.prevFrameData[i + 1];
        const prevB = this.prevFrameData[i + 2];

        // Luminance difference
        const lumDiff = Math.abs((r * 0.299 + g * 0.587 + b * 0.114) - (prevR * 0.299 + prevG * 0.587 + prevB * 0.114));

        if (lumDiff > 24) {
          changedPixels++;
          const pixelIndex = i / 4;
          const px = pixelIndex % this.width;
          const py = Math.floor(pixelIndex / this.width);

          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }

        // Standard biometric skin tone heuristic in RGB
        // R > 95, G > 40, B > 20, max - min > 15, |R - G| > 15, R > G > B
        const maxVal = Math.max(r, g, b);
        const minVal = Math.min(r, g, b);
        if (
          r > 80 &&
          g > 35 &&
          b > 20 &&
          maxVal - minVal > 15 &&
          Math.abs(r - g) > 12 &&
          r > g &&
          g >= b
        ) {
          skinTonePixels++;
        }
      }
    }

    // Clone current frame for next comparison
    this.prevFrameData = new Uint8ClampedArray(data);

    // Calculate motion percentage (0 - 100)
    const rawMotionScore = Math.min(100, Math.round((changedPixels / totalPixels) * 350));
    // Calculate presence score (combination of skin pixels, central occupancy, and persistent motion)
    const skinScore = Math.min(100, Math.round((skinTonePixels / totalPixels) * 450));
    
    // Passing motion detection condition
    const hasMotion = rawMotionScore >= threshold;

    // Presence detection logic: sustained object/face in frame
    let hasPresence = false;
    if (skinScore > 12 || (rawMotionScore > (threshold * 0.5) && changedPixels > 60)) {
      this.presenceStreak++;
    } else {
      this.presenceStreak = Math.max(0, this.presenceStreak - 1);
    }

    const presenceScore = Math.min(100, Math.round((this.presenceStreak / requiredPresenceFrames) * 100));

    if (this.presenceStreak >= requiredPresenceFrames) {
      hasPresence = true;
    }

    let boundingBox = null;
    if (changedPixels > 15 && minX <= maxX && minY <= maxY) {
      boundingBox = {
        x: (minX / this.width) * 100,
        y: (minY / this.height) * 100,
        width: Math.max(8, ((maxX - minX) / this.width) * 100),
        height: Math.max(8, ((maxY - minY) / this.height) * 100),
      };
    }

    return {
      motionScore: rawMotionScore,
      presenceScore,
      hasMotion,
      hasPresence,
      boundingBox,
    };
  }

  public static captureSnapshot(video: HTMLVideoElement, watermarkText?: string): string {
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = video.videoWidth || 640;
    snapCanvas.height = video.videoHeight || 480;
    const ctx = snapCanvas.getContext('2d');
    if (!ctx) return '';

    ctx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);

    // Timestamp & Watchdog Cam banner overlay
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(0, snapCanvas.height - 36, snapCanvas.width, 36);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 13px system-ui, sans-serif';
    const timeStr = new Date().toLocaleTimeString();
    const dateStr = new Date().toLocaleDateString();
    ctx.fillText(`WATCHDOG CAM • ${dateStr} ${timeStr}`, 14, snapCanvas.height - 13);

    if (watermarkText) {
      ctx.fillStyle = '#ef4444';
      ctx.fillText(watermarkText.toUpperCase(), snapCanvas.width - 160, snapCanvas.height - 13);
    }

    return snapCanvas.toDataURL('image/jpeg', 0.82);
  }

  public static getThumbnail(video: HTMLVideoElement, width = 320, height = 240): string {
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = width;
    snapCanvas.height = height;
    const ctx = snapCanvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(video, 0, 0, width, height);
    return snapCanvas.toDataURL('image/jpeg', 0.65);
  }
}
