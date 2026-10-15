import type { ModelInputLimits } from '@earendil-works/pi-ai';

/**
 * The long edge, in pixels, used for a model whose metadata says nothing about images. Anthropic's vision guide
 * (https://platform.claude.com/docs/en/build-with-claude/vision, checked 2026-10-14) names two native limits: 2576 px for
 * Claude 4.7 and later and 1568 px for the others, and the API downscales anything larger itself, so extra pixels only
 * add upload bytes. It also requires every image to be at most 2000 px once a request holds more than 20 images, and
 * tool results pile up screenshots and fetched pictures. 1568 is under both and safe for every model, so it is the
 * default; a model's own metadata (`inputLimits.images.resize`) replaces it, and nothing here names a model.
 */
const DEFAULT_IMAGE_EDGE = 1568;

/** What an image put in the model's context is resized to: Pi's `resizeImage` options. */
export interface ImageLimits {
  maxWidth: number;
  maxHeight: number;
  /** Largest base64 payload the model accepts, when its metadata says so. */
  maxBytes?: number;
  jpegQuality?: number;
}

/**
 * The image limits of `model`, from its `inputLimits.images.resize` metadata. A side the metadata leaves out takes the
 * other side's value, and with neither it is `DEFAULT_IMAGE_EDGE`; an unknown model gets that square.
 */
export function imageLimits(model?: { inputLimits?: ModelInputLimits } | null): ImageLimits {
  const resize = model?.inputLimits?.images?.resize;
  const edge = resize?.maxWidth ?? resize?.maxHeight ?? DEFAULT_IMAGE_EDGE;
  return {
    maxWidth: resize?.maxWidth ?? edge,
    maxHeight: resize?.maxHeight ?? edge,
    ...(resize?.maxBytes === undefined ? {} : { maxBytes: resize.maxBytes }),
    ...(resize?.jpegQuality === undefined ? {} : { jpegQuality: resize.jpegQuality }),
  };
}

/** The inline image formats the model providers accept and Pi can resize. */
export type InlineImageType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) => signature.every((value, index) => bytes[offset + index] === value);

/** The inline image format `bytes` really are (by their signature, not by what a server called them), or undefined. */
export function sniffImageType(bytes: Uint8Array): InlineImageType | undefined {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return 'image/gif';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return undefined;
}
