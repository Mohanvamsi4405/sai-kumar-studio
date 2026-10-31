import io

import pillow_avif  # noqa: F401 - registers Pillow's AVIF decoder/encoder on import
from PIL import Image, ImageOps

# The per-photo ceiling for every image that reaches this app - an admin's Media
# Library upload and a customer's checkout photo alike. The storefront mirrors it
# in js/shared/product-fields.js's MAX_UPLOAD_BYTES so an oversized file is
# refused at the file picker instead of after a full upload, but this is the one
# that actually enforces it.
MAX_SIZE = 20 * 1024 * 1024
MIN_SIZE = 100
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}

# Product gallery videos. Deliberately a much smaller cap than a video site would
# use: this is a short "see it from every angle" clip shown next to a product's
# photos, and the whole file is read into this process's memory and re-uploaded to
# R2 in one PUT (see services/storage.py) - it is not a chunked/resumable upload.
MAX_VIDEO_SIZE = 25 * 1024 * 1024
MIN_VIDEO_SIZE = 1024

# EBML magic (0x1A45DFA3), the first four bytes of every WebM/Matroska file.
_EBML_MAGIC = bytes((0x1A, 0x45, 0xDF, 0xA3))


_FORMAT_EXT = {
    "JPEG": (".jpg", "image/jpeg"),
    "PNG": (".png", "image/png"),
    "WEBP": (".webp", "image/webp"),
}


def process_image(data: bytes, to_webp: bool = True) -> tuple[bytes, str, str]:
    """Validates an uploaded image and returns it UNCHANGED as (bytes, ext, mime) -
    callers decide where the result is persisted.

    No resize and no re-encode, for admin and customer uploads alike: these are
    photos that get printed and shown large, and every lossy pass (the old WebP
    q88 re-encode, the 4096px cap) cost detail that can't be got back. Keeping the
    original also keeps its colour profile and EXIF orientation, both of which a
    re-encode silently dropped (so a phone photo could come out sideways).

    Validation is unchanged: the bytes must fully decode as one of
    ALLOWED_FORMATS (judged from the decoded data, never the filename or declared
    type), and the stored content-type comes from that decoded format, so nothing
    but a real JPEG/PNG/WebP reaches the public bucket. `to_webp` is accepted for
    existing callers and ignored. Card/listing thumbnails are still small WebPs,
    made separately by make_thumbnail()."""
    if len(data) > MAX_SIZE:
        raise ValueError(f"Image too large (max {MAX_SIZE // (1024 * 1024)}MB)")
    if len(data) < MIN_SIZE:
        raise ValueError("Image too small or empty")

    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Image.DecompressionBombError:
        raise ValueError("Image dimensions are too large")
    except Exception:
        raise ValueError("That file is not a readable image")
    if img.format not in ALLOWED_FORMATS:
        raise ValueError("Unsupported image format — use JPEG, PNG, or WEBP")

    ext, mime = _FORMAT_EXT[img.format]
    return data, ext, mime


def make_thumbnail(data: bytes, width: int = 640, quality: int = 75) -> bytes:
    """Downscales an already-processed image to a small WebP for card/thumbnail
    display - the Pillow equivalent of what images.weserv.nl was doing over the
    network. Only shrinks (never upscales) images narrower than `width`."""
    img = Image.open(io.BytesIO(data))
    img.load()
    # Originals are stored untouched (see process_image), so a phone photo still
    # carries its EXIF rotation - apply it here, or the thumbnail comes out
    # sideways while the full image (which browsers rotate themselves) doesn't.
    img = ImageOps.exif_transpose(img)
    if img.width > width:
        height = round(img.height * width / img.width)
        img = img.resize((width, height), Image.LANCZOS)
    img = img.convert("RGBA") if img.mode in ("RGBA", "LA", "P") else img.convert("RGB")

    buffer = io.BytesIO()
    img.save(buffer, format="WEBP", quality=quality)
    return buffer.getvalue()


def sniff_video(data: bytes) -> tuple[str, str] | None:
    """Identifies an uploaded file as one of the three video containers every
    current browser can play inline, by its magic bytes - returns (ext, mime), or
    None if these bytes aren't one of them.

    Bytes, not the client-declared filename or Content-Type: both of those are
    caller-controlled, and this decides what content-type the object is served
    back out under from a public R2 bucket. Nothing here transcodes (that would
    need ffmpeg, which this app doesn't ship) - a rejected file is rejected, not
    converted, so the admin gets a clear "re-export as MP4" message instead of a
    clip that silently fails to play on half the visitors' browsers."""
    if len(data) < 12:
        return None
    # ISO base media format (MP4 / M4V / QuickTime .mov): a `ftyp` box at offset 4,
    # with the major brand right after it. QuickTime's own brand is "qt  ".
    if data[4:8] == b"ftyp":
        brand = data[8:12]
        if brand == b"qt  ":
            return ".mov", "video/quicktime"
        return ".mp4", "video/mp4"
    # WebM (and Matroska generally) starts with the EBML magic. Only the WebM
    # subset is served as video/webm, identified by the "webm" DocType string
    # that sits in the header - a plain .mkv has no such marker and is rejected,
    # which is right, since no browser plays one inline anyway.
    if data[:4] == _EBML_MAGIC and b"webm" in data[:64]:
        return ".webm", "video/webm"
    return None


def process_video(data: bytes) -> tuple[bytes, str, str]:
    """Validates an uploaded product video and returns (bytes, ext, mime),
    mirroring process_image()'s contract so upload_media() can treat the two the
    same way. The bytes come back unchanged - unlike an image there's no re-encode
    step here, so the magic-byte check in sniff_video() above is the only thing
    standing between caller input and a public R2 object."""
    sniffed = sniff_video(data)
    if sniffed is None:
        raise ValueError("Unsupported video format - use MP4, WebM, or MOV")
    if len(data) > MAX_VIDEO_SIZE:
        raise ValueError(f"Video too large (max {MAX_VIDEO_SIZE // (1024 * 1024)}MB)")
    if len(data) < MIN_VIDEO_SIZE:
        raise ValueError("Video too small or empty")
    ext, mime = sniffed
    return data, ext, mime
