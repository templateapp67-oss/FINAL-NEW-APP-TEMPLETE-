/**
 * REFERRAL CANVAS ARTWORK
 *
 * HTML5 Canvas rendering (no image dependencies) for:
 *   - Instagram / social STORY card  — 1080 × 1920 (9:16)
 *   - Shareable POSTER banner        — 1200 × 630 (1.91:1)
 *
 * Both render the salon name, reward details and the dynamic referral code
 * `NX-[WEBSITE_SHORT_NAME]-<YEAR>`. Output is a PNG data URL that callers can
 * preview, `navigator.share()` as a file, or trigger as a download.
 */

export interface ReferralArtworkInput {
  salonName: string;
  code: string;
  link: string;
  /** Reward headline, e.g. "Friends get 10% off — you earn salon credit" */
  rewardLine?: string;
}

const BRAND = {
  primary: '#ac0053',
  primaryDark: '#3f001a',
  glow: '#ff2d8d',
  light: '#ffd9e1',
  white: '#ffffff',
};

type Ctx = CanvasRenderingContext2D;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  return [canvas, ctx];
}

/** Wrap text to a maximum width, returns the lines drawn. */
function wrapText(
  ctx: Ctx,
  text: string,
  maxWidth: number,
): string[] {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Shrink font until `text` fits `maxWidth` (or minSize). */
function fitFont(
  ctx: Ctx,
  text: string,
  family: string,
  weight: string,
  startSize: number,
  minSize: number,
  maxWidth: number,
): number {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

function drawBackground(ctx: Ctx, w: number, h: number): void {
  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, BRAND.primaryDark);
  base.addColorStop(0.55, '#6d0b38');
  base.addColorStop(1, BRAND.primary);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Ambient glows
  const glow1 = ctx.createRadialGradient(w * 0.85, h * 0.12, 0, w * 0.85, h * 0.12, w * 0.5);
  glow1.addColorStop(0, 'rgba(255,217,225,0.28)');
  glow1.addColorStop(1, 'rgba(255,217,225,0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, w, h);

  const glow2 = ctx.createRadialGradient(w * 0.08, h * 0.9, 0, w * 0.08, h * 0.9, w * 0.45);
  glow2.addColorStop(0, 'rgba(255,45,141,0.25)');
  glow2.addColorStop(1, 'rgba(255,45,141,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, w, h);

  // Subtle dot grid
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  const gap = 42;
  for (let x = gap / 2; x < w; x += gap) {
    for (let y = gap / 2; y < h; y += gap) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBrandRow(ctx: Ctx, x: number, y: number, scale: number): void {
  // Gift glyph
  const gs = 26 * scale;
  ctx.font = `${gs}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('🎁', x, y + gs * 0.9);
  ctx.font = `900 ${15 * scale}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillText('NEXORA  •  REFER & EARN', x + gs + 14 * scale, y + gs * 0.68);
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Instagram / social STORY card — 1080 × 1920.
 * Layout: brand row → headline → reward line → code pill → link → CTA strip.
 */
export function generateReferralStoryCard(input: ReferralArtworkInput): string {
  const W = 1080;
  const H = 1920;
  const [canvas, ctx] = makeCanvas(W, H);
  drawBackground(ctx, W, H);

  const M = 84; // side margin

  drawBrandRow(ctx, M, 190, 1.15);

  // Headline
  ctx.textAlign = 'left';
  ctx.fillStyle = BRAND.white;
  fitFont(ctx, 'Invite friends.', 'Inter, system-ui, sans-serif', '900', 118, 64, W - M * 2);
  ctx.fillText('Invite friends.', M, 420);
  const grad = ctx.createLinearGradient(M, 0, W - M, 0);
  grad.addColorStop(0, BRAND.light);
  grad.addColorStop(1, '#ffffff');
  ctx.fillStyle = grad;
  fitFont(ctx, 'You both earn rewards.', 'Inter, system-ui, sans-serif', '900', 104, 56, W - M * 2);
  ctx.fillText('You both earn rewards.', M, 540);

  // Salon name + reward copy
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  const reward =
    input.rewardLine || 'Friends get 10% off their first service — you earn salon credit on every booked visit.';
  fitFont(ctx, input.salonName, 'Inter, system-ui, sans-serif', '700', 40, 26, W - M * 2);
  ctx.fillText(input.salonName, M, 660);
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = `400 30px Inter, system-ui, sans-serif`;
  wrapText(ctx, reward, W - M * 2).slice(0, 4).forEach((line, i) => {
    ctx.fillText(line, M, 730 + i * 44);
  });

  // Code pill
  const codeY = 1180;
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  roundRect(ctx, M, codeY, W - M * 2, 200, 40);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `800 24px Inter, system-ui, sans-serif`;
  ctx.fillText('YOUR REFERRAL CODE', M + 52, codeY + 62);

  ctx.fillStyle = BRAND.white;
  const codeSize = fitFont(ctx, input.code, 'Inter, system-ui, sans-serif', '900', 96, 44, W - M * 2 - 120);
  ctx.font = `900 ${codeSize}px Inter, system-ui, sans-serif`;
  ctx.fillText(input.code, M + 52, codeY + 158);

  // Link
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = `600 28px Inter, system-ui, sans-serif`;
  const link = input.link.length > 46 ? `${input.link.slice(0, 43)}…` : input.link;
  ctx.fillText(link, M, 1500);

  // CTA strip
  ctx.fillStyle = BRAND.white;
  roundRect(ctx, M, 1600, W - M * 2, 130, 30);
  ctx.fill();
  ctx.fillStyle = BRAND.primary;
  ctx.font = `900 34px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('SIGN UP WITH THE CODE — 10% OFF', W / 2, 1684);
  ctx.textAlign = 'left';

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `600 24px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('Powered by Nexora', W / 2, 1830);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png');
}

/**
 * Shareable POSTER banner — 1200 × 630.
 * Layout: brand row → salon name → reward → code → link.
 */
export function generateReferralPoster(input: ReferralArtworkInput): string {
  const W = 1200;
  const H = 630;
  const [canvas, ctx] = makeCanvas(W, H);
  drawBackground(ctx, W, H);

  const M = 72;

  drawBrandRow(ctx, M, 96, 1.0);

  // Salon name
  ctx.textAlign = 'left';
  ctx.fillStyle = BRAND.white;
  const salonSize = fitFont(ctx, input.salonName, 'Inter, system-ui, sans-serif', '900', 72, 36, W - M * 2);
  ctx.fillText(input.salonName, M, 200);

  // Reward line
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  const reward = input.rewardLine || 'Refer friends — they get 10% off, you earn salon credit.';
  ctx.font = `400 27px Inter, system-ui, sans-serif`;
  wrapText(ctx, reward, W - M * 2).slice(0, 2).forEach((line, i) => {
    ctx.fillText(line, M, 258 + i * 38);
  });

  // Code chip (left) + link (right of it)
  const chipY = 400;
  const codeW = 430;
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  roundRect(ctx, M, chipY, codeW, 120, 26);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `800 19px Inter, system-ui, sans-serif`;
  ctx.fillText('REFERRAL CODE', M + 34, chipY + 40);
  ctx.fillStyle = BRAND.white;
  const codeSize = fitFont(ctx, input.code, 'Inter, system-ui, sans-serif', '900', 44, 24, codeW - 68);
  ctx.font = `900 ${codeSize}px Inter, system-ui, sans-serif`;
  ctx.fillText(input.code, M + 34, chipY + 94);

  // Link block
  const linkX = M + codeW + 44;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `800 19px Inter, system-ui, sans-serif`;
  ctx.fillText('SIGN-UP LINK', linkX, chipY + 40);
  ctx.fillStyle = BRAND.white;
  ctx.font = `700 30px Inter, system-ui, sans-serif`;
  const link = input.link.length > 34 ? `${input.link.slice(0, 31)}…` : input.link;
  ctx.fillText(link, linkX, chipY + 92);

  // CTA strip
  ctx.fillStyle = BRAND.white;
  roundRect(ctx, M, 548, W - M * 2, 52, 14);
  ctx.fill();
  ctx.fillStyle = BRAND.primary;
  ctx.font = `900 21px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('10% OFF FIRST SERVICE WITH CODE   •   POWERED BY NEXORA', W / 2, 581);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png');
}

/** Trigger a browser download of a data URL image. */
export function downloadDataUrlImage(dataUrl: string, filename: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}

/**
 * Try native share with the generated image file attached.
 * Resolves true only when the user completed a native share.
 */
export async function shareImageNatively(
  dataUrl: string,
  title: string,
  text: string,
  url?: string,
): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false;
  }
  try {
    const supportsFiles =
      typeof navigator.canShare === 'function' &&
      typeof Blob !== 'undefined';
    if (supportsFiles) {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'nexora-referral.png', { type: blob.type || 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title, text, url });
        return true;
      }
    }
    await navigator.share({ title, text, url });
    return true;
  } catch {
    return false; // aborted or unsupported — caller falls back to download
  }
}
