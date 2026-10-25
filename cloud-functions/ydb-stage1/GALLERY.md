# Before / after gallery

Admin: **Сайт → Наши работы**. Add a pair, upload Before and After separately,
enter title and description, save the draft. The separate **Опубликовать галерею**
action, with confirmation, replaces the public gallery. Reordering, hiding or
deleting a draft card does not change the site until publication. Price publishing
is independent. Select `visualization` for illustrative/generated images; this is
shown in the public caption. No initial gallery or generated assets are seeded.

One pair of original images is enough: desktop uses two columns, mobile one.
Static JPEG, PNG and WebP files up to 30 MB are accepted by the browser, reduced to
1800 pixels, then validated and re-encoded server-side to WebP (max 2000 pixels).
EXIF and other input metadata are stripped. No image bytes go into GitHub or YDB.

## Cloud storage

Private bucket: `skparket-gallery-b1g5jvictf4s63dq76k4` (1 GB quota).
Only the runtime service account has bucket-scoped `storage.editor` permission.
No anonymous read/list access. Runtime uses Yandex's `context.token.access_token`,
never a persisted key. The Linux x64 sharp and libvips binaries are explicit pinned
dependencies because the Cloud Functions build uses npm 7.

YDB tables `sk_gallery_state` and `sk_gallery_media` hold versioned draft/published
metadata and private media references. Serializable transactions prevent stale
saves or deletion of referenced images. Unused uploads older than 24 hours are
collected one at a time by the existing private minute trigger. Files referenced
by either the draft or published version are retained, including hidden cards.

Admin upload/preview routes require an authenticated session; writes also require
same-origin and CSRF. The public manifest includes only published visible cards.
Public image URLs are served by the private function via API Gateway and are
rechecked against the published manifest, with a five-minute public cache.

## Verification

- `node --test cloud-functions/ydb-stage1/test/*.test.cjs`
- `npm test`
- `node scripts/build-cloud.mjs` and clean generated docs
- Local UI QA at 1440 and 390 px: no horizontal overflow, draft save, publication
  guard, two-column/stacked photos.
- Live synthetic upload of two pictures, authenticated WebP preview, public draft
  URL returns 404, draft never published, test metadata/files removed afterward.

## Mixed examples and actual-work tiles

Admin **Примеры работ**: every card has `mode` (`pair` / `single`) and
`placement` (`carousel` / `grid`). Omitted fields on existing records mean a pair
in the carousel; no migration or re-upload is needed. The **Показывать «До / После»**
checkbox switches off the Before field and labels for a single photo (stored as
`after`). Turning it off preserves the draft Before reference for undo but never
exposes that photo publicly unless referenced by another published pair.
The tile grid accepts single photos only. All cards share draft/save/publication,
visibility and ordering controls. Existing unpublished edits must not be
published incidentally when adding new cards.

Public heading: **Примеры работ**. The carousel has no numeric counter or intro.
Dots navigate slides, arrows are centered over the photo area on desktop/mobile.
A separate **Реальные работы** tile grid follows the carousel, two columns on
desktop / one on phones. Clicking any photo opens that individual photo in a
large viewport; **Масштаб 100%** permits native-size scrolling on small screens.
